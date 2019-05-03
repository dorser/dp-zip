const ZipEntry = require('./zipEntry');
const Headers = require('./headers');
const Utils = require('./util');
const fs = require('fs');

module.exports = function(input, inputType) {
  let entryList = [];
  let entryTable = {};
  let _comment = new Buffer(0);
  let filename = '';
  let inBuffer = null;
  const mainHeader = new Headers.MainHeader();

  if (inputType === Utils.Constants.FILE) {
    // is a filename
    filename = input;
    inBuffer = fs.readFileSync(filename);
    readMainHeader();
  } else if (inputType === Utils.Constants.BUFFER) {
    // is a memory buffer
    inBuffer = input;
    readMainHeader();
  } else {
    // none. is a new file
  }

  function readEntries() {
    entryTable = {};
    entryList = new Array(mainHeader.diskEntries); // total number of entries
    let index = mainHeader.offset; // offset of first CEN header
    for (let i = 0; i < entryList.length; i++) {
      let tmp = index;
      const entry = new ZipEntry(inBuffer);
      entry.header = inBuffer.slice(tmp, tmp += Utils.Constants.CENHDR);

      entry.entryName = inBuffer.slice(tmp, tmp += entry.header.fileNameLength);

      if (entry.header.extraLength) {
        entry.extra = inBuffer.slice(tmp, tmp += entry.header.extraLength);
      }

      if (entry.header.commentLength) {
        entry.comment = inBuffer.slice(tmp, tmp + entry.header.commentLength);
      }

      index += entry.header.entryHeaderSize;

      entryList[i] = entry;
      entryTable[entry.entryName] = entry;
    }
  }

  function readMainHeader() {
    let i = inBuffer.length - Utils.Constants.ENDHDR; // END header size
    const n = Math.max(0, i - 0xFFFF); // 0xFFFF is the max zip file comment length
    let endOffset = -1; // Start offset of the END header

    for (i; i >= n; i--) {
      if (inBuffer[i] !== 0x50) continue; // quick check that the byte is 'P'
      if (inBuffer.readUInt32LE(i) === Utils.Constants.ENDSIG) { // "PK\005\006"
        endOffset = i;
        break;
      }
    }
    if (!~endOffset) {
      throw Utils.Errors.INVALID_FORMAT;
    }

    mainHeader.loadFromBinary(inBuffer.slice(endOffset, endOffset + Utils.Constants.ENDHDR));
    if (mainHeader.commentLength) {
      _comment = inBuffer.slice(endOffset + Utils.Constants.ENDHDR);
    }
    readEntries();
  }

  return {
    get entries() {
      return entryList;
    },

    /**
     * Archive comment
     * @return {String}
     */
    get comment() {
      return _comment.toString();
    },
    set comment(val) {
      mainHeader.commentLength = val.length;
      _comment = val;
    },

    getEntry: function(entryName) {
      return entryTable[entryName] || null;
    },

    setEntry: function(entry) {
      entryList.push(entry);
      entryTable[entry.entryName] = entry;
      mainHeader.totalEntries = entryList.length;
    },

    deleteEntry: function(entryName) {
      const entry = entryTable[entryName];
      if (entry && entry.isDirectory) {
        const _self = this;
        this.getEntryChildren(entry).forEach(function(child) {
          if (child.entryName !== entryName) {
            _self.deleteEntry(child.entryName);
          }
        });
      }
      entryList.splice(entryList.indexOf(entry), 1);
      delete(entryTable[entryName]);
      mainHeader.totalEntries = entryList.length;
    },

    getEntryChildren: function(entry) {
      if (entry.isDirectory) {
        const list = [];
        const name = entry.entryName;
        const len = name.length;

        entryList.forEach(function(zipEntry) {
          if (zipEntry.entryName.substr(0, len) === name) {
            list.push(zipEntry);
          }
        });
        return list;
      }
      return [];
    },

    compressToBuffer: function() {
      if (entryList.length > 1) {
        entryList.sort(function(a, b) {
          const nameA = a.entryName.toLowerCase();
          const nameB = b.entryName.toLowerCase();
          if (nameA < nameB) {
            return -1;
          }
          if (nameA > nameB) {
            return 1;
          }
          return 0;
        });
      }

      let totalSize = 0;
      const dataBlock = [];
      const entryHeaders = [];
      let dindex = 0;

      mainHeader.size = 0;
      mainHeader.offset = 0;

      entryList.forEach(function(entry) {
        // compress data and set local and entry header accordingly. Reason why is called first
        const compressedData = entry.getCompressedData();
        // data header
        entry.header.offset = dindex;
        const dataHeader = entry.header.dataHeaderToBinary();
        const entryNameLen = entry.rawEntryName.length;
        const extra = entry.extra.toString();
        const postHeader = Buffer.alloc(entryNameLen + extra.length);
        entry.rawEntryName.copy(postHeader, 0);
        postHeader.fill(extra, entryNameLen);

        const dataLength = dataHeader.length + postHeader.length + compressedData.length;

        dindex += dataLength;

        dataBlock.push(dataHeader);
        dataBlock.push(postHeader);
        dataBlock.push(compressedData);

        const entryHeader = entry.packHeader();
        entryHeaders.push(entryHeader);
        mainHeader.size += entryHeader.length;
        totalSize += (dataLength + entryHeader.length);
      });

      totalSize += mainHeader.mainHeaderSize; // also includes zip file comment length
      // point to end of data and beginning of central directory first record
      mainHeader.offset = dindex;

      dindex = 0;
      const outBuffer = Buffer.alloc(totalSize);
      dataBlock.forEach(function(content) {
        content.copy(outBuffer, dindex); // write data blocks
        dindex += content.length;
      });
      entryHeaders.forEach(function(content) {
        content.copy(outBuffer, dindex); // write central directory entries
        dindex += content.length;
      });

      const mh = mainHeader.toBinary();
      if (_comment) {
        _comment.copy(mh, Utils.Constants.ENDHDR); // add zip file comment
      }

      mh.copy(outBuffer, dindex); // write main header

      return outBuffer;
    },

    toAsyncBuffer: function(onSuccess, onFail, onItemStart, onItemEnd) {
      if (entryList.length > 1) {
        entryList.sort(function(a, b) {
          const nameA = a.entryName.toLowerCase();
          const nameB = b.entryName.toLowerCase();
          if (nameA > nameB) {
            return -1;
          }
          if (nameA < nameB) {
            return 1;
          }
          return 0;
        });
      }

      let totalSize = 0;
      const dataBlock = [];
      const entryHeaders = [];
      let dindex = 0;

      mainHeader.size = 0;
      mainHeader.offset = 0;

      const compress = function(entryList) {
        const self = arguments.callee;
        if (entryList.length) {
          const entry = entryList.pop();
          const name = entry.entryName + entry.extra.toString();
          if (onItemStart) onItemStart(name);
          entry.getCompressedDataAsync(function(compressedData) {
            if (onItemEnd) onItemEnd(name);

            entry.header.offset = dindex;
            // data header
            const dataHeader = entry.header.dataHeaderToBinary();
            let postHeader;
            try {
              postHeader = Buffer.alloc(name.length, name); // using alloc will work on node  5.x+
            } catch (e) {
              postHeader = new Buffer(name); // use deprecated method if alloc fails...
            }
            const dataLength = dataHeader.length + postHeader.length + compressedData.length;

            dindex += dataLength;

            dataBlock.push(dataHeader);
            dataBlock.push(postHeader);
            dataBlock.push(compressedData);

            const entryHeader = entry.packHeader();
            entryHeaders.push(entryHeader);
            mainHeader.size += entryHeader.length;
            totalSize += (dataLength + entryHeader.length);

            if (entryList.length) {
              self(entryList);
            } else {
              totalSize += mainHeader.mainHeaderSize; // also includes zip file comment length
              // point to end of data and beginning of central directory first record
              mainHeader.offset = dindex;

              dindex = 0;
              const outBuffer = Buffer.alloc(totalSize);
              dataBlock.forEach(function(content) {
                content.copy(outBuffer, dindex); // write data blocks
                dindex += content.length;
              });
              entryHeaders.forEach(function(content) {
                content.copy(outBuffer, dindex); // write central directory entries
                dindex += content.length;
              });

              const mh = mainHeader.toBinary();
              if (_comment) {
                _comment.copy(mh, Utils.Constants.ENDHDR); // add zip file comment
              }

              mh.copy(outBuffer, dindex); // write main header

              onSuccess(outBuffer);
            }
          });
        }
      };

      compress(entryList);
    },
  };
};

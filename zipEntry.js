const Utils = require('./util');
const Headers = require('./headers');
const Constants = Utils.Constants;
const Methods = require('./methods');

module.exports = function(input) {
  const _entryHeader = new Headers.EntryHeader();
  let _entryName = new Buffer(0);
  let _comment = new Buffer(0);
  let _isDirectory = false;
  let uncompressedData = null;
  let _extra = new Buffer(0);

  function getCompressedDataFromZip() {
    if (!input || !Buffer.isBuffer(input)) {
      return new Buffer(0);
    }
    _entryHeader.loadDataHeaderFromBinary(input);
    return input.slice(_entryHeader.realDataOffset, _entryHeader.realDataOffset + _entryHeader.compressedSize);
  }

  function crc32OK(data) {
    // if bit 3 (0x08) of the general-purpose flags field is set, then the CRC-32 and file sizes are not known when the header is written
    if ((_entryHeader.flags & 0x8) !== 0x8) {
      if (Utils.crc32(data) !== _entryHeader.dataHeader.crc) {
        return false;
      }
    } else {
      // @TODO: load and check data descriptor header
      // The fields in the local header are filled with zero, and the CRC-32 and size are appended in a 12-byte structure
      // (optionally preceded by a 4-byte signature) immediately after the compressed data:
    }
    return true;
  }

  function decompress(async, callback, pass) {
    if (typeof callback === 'undefined' && typeof async === 'string') {
      pass = async;
      async = void 0;
    }
    if (_isDirectory) {
      if (async && callback) {
        callback(new Buffer(0), Utils.Errors.DIRECTORY_CONTENT_ERROR);
      }
      return new Buffer(0);
    }

    const compressedData = getCompressedDataFromZip();

    if (compressedData.length === 0) {
      if (async && callback) {
        callback(compressedData, Utils.Errors.NO_DATA);
      }
      return compressedData;
    }

    const data = new Buffer(_entryHeader.size);

    switch (_entryHeader.method) {
      case Utils.Constants.STORED:
        compressedData.copy(data);
        if (!crc32OK(data)) {
          if (async && callback) {
            callback(data, Utils.Errors.BAD_CRC);
          }
          return Utils.Errors.BAD_CRC;
        } else {
          if (async && callback) callback(data);
          return data;
        }
      case Utils.Constants.DEFLATED:
        const inflater = new Methods.Inflater(compressedData);
        if (!async) {
          const result = inflater.inflate(data);
          result.copy(data, 0);
          if (!crc32OK(data)) {
            console.warn(Utils.Errors.BAD_CRC + ' ' + _entryName.toString());
          }
          return data;
        } else {
          inflater.inflateAsync(function(result) {
            result.copy(data, 0);
            if (!crc32OK(data)) {
              if (callback) {
                callback(data, Utils.Errors.BAD_CRC);
              }
            } else {
              if (callback) callback(data);
            }
          });
        }
        break;
      default:
        if (async && callback) callback(new Buffer(0), Utils.Errors.UNKNOWN_METHOD);
        return Utils.Errors.UNKNOWN_METHOD;
    }
  }

  function compress(async, callback) {
    if ((!uncompressedData || !uncompressedData.length) && Buffer.isBuffer(input)) {
      // no data set or the data wasn't changed to require recompression
      if (async && callback) callback(getCompressedDataFromZip());
      return getCompressedDataFromZip();
    }

    if (uncompressedData.length && !_isDirectory) {
      let compressedData;
      // Local file header
      switch (_entryHeader.method) {
        case Utils.Constants.STORED:
          _entryHeader.compressedSize = _entryHeader.size;

          compressedData = new Buffer(uncompressedData.length);
          uncompressedData.copy(compressedData);

          if (async && callback) callback(compressedData);
          return compressedData;
        default:
        case Utils.Constants.DEFLATED:

          const deflater = new Methods.Deflater(uncompressedData);
          if (!async) {
            const deflated = deflater.deflate();
            _entryHeader.compressedSize = deflated.length;
            return deflated;
          } else {
            deflater.deflateAsync(function(data) {
              compressedData = new Buffer(data.length);
              _entryHeader.compressedSize = data.length;
              data.copy(compressedData);
              callback && callback(compressedData);
            });
          }
          deflater = null;
          break;
      }
    } else {
      if (async && callback) {
        callback(new Buffer(0));
      } else {
        return new Buffer(0);
      }
    }
  }

  function readUInt64LE(buffer, offset) {
    return (buffer.readUInt32LE(offset + 4) << 4) + buffer.readUInt32LE(offset);
  }

  function parseExtra(data) {
    let offset = 0;
    let signature;
    let size;
    let part;
    while (offset < data.length) {
      signature = data.readUInt16LE(offset);
      offset += 2;
      size = data.readUInt16LE(offset);
      offset += 2;
      part = data.slice(offset, offset + size);
      offset += size;
      if (Constants.ID_ZIP64 === signature) {
        parseZip64ExtendedInformation(part);
      }
    }
  }

  // Override header field values with values from the ZIP64 extra field
  function parseZip64ExtendedInformation(data) {
    let size;
    let compressedSize;
    let offset;
    let diskNumStart;

    if (data.length >= Constants.EF_ZIP64_SCOMP) {
      size = readUInt64LE(data, Constants.EF_ZIP64_SUNCOMP);
      if (_entryHeader.size === Constants.EF_ZIP64_OR_32) {
        _entryHeader.size = size;
      }
    }
    if (data.length >= Constants.EF_ZIP64_RHO) {
      compressedSize = readUInt64LE(data, Constants.EF_ZIP64_SCOMP);
      if (_entryHeader.compressedSize === Constants.EF_ZIP64_OR_32) {
        _entryHeader.compressedSize = compressedSize;
      }
    }
    if (data.length >= Constants.EF_ZIP64_DSN) {
      offset = readUInt64LE(data, Constants.EF_ZIP64_RHO);
      if (_entryHeader.offset === Constants.EF_ZIP64_OR_32) {
        _entryHeader.offset = offset;
      }
    }
    if (data.length >= Constants.EF_ZIP64_DSN + 4) {
      diskNumStart = data.readUInt32LE(Constants.EF_ZIP64_DSN);
      if (_entryHeader.diskNumStart === Constants.EF_ZIP64_OR_16) {
        _entryHeader.diskNumStart = diskNumStart;
      }
    }
  }


  return {
    get entryName() {
      return _entryName.toString();
    },
    get rawEntryName() {
      return _entryName;
    },
    set entryName(val) {
      _entryName = Utils.toBuffer(val);
      const lastChar = _entryName[_entryName.length - 1];
      _isDirectory = (lastChar === 47) || (lastChar === 92);
      _entryHeader.fileNameLength = _entryName.length;
    },

    get extra() {
      return _extra;
    },
    set extra(val) {
      _extra = val;
      _entryHeader.extraLength = val.length;
      parseExtra(val);
    },

    get comment() {
      return _comment.toString();
    },
    set comment(val) {
      _comment = Utils.toBuffer(val);
      _entryHeader.commentLength = _comment.length;
    },

    get name() {
      const n = _entryName.toString();
      return _isDirectory ? n.substr(n.length - 1).split('/').pop() : n.split('/').pop();
    },
    get isDirectory() {
      return _isDirectory;
    },

    getCompressedData: function() {
      return compress(false, null);
    },

    getCompressedDataAsync: function(callback) {
      compress(true, callback);
    },

    setData: function(value) {
      uncompressedData = Utils.toBuffer(value);
      if (!_isDirectory && uncompressedData.length) {
        _entryHeader.size = uncompressedData.length;
        _entryHeader.method = Utils.Constants.DEFLATED;
        _entryHeader.crc = Utils.crc32(value);
        _entryHeader.changed = true;
      } else { // folders and blank files should be stored
        _entryHeader.method = Utils.Constants.STORED;
      }
    },

    getData: function(pass) {
      if (_entryHeader.changed) {
        return uncompressedData;
      } else {
        return decompress(false, null, pass);
      }
    },

    getDataAsync: function(callback, pass) {
      if (_entryHeader.changed) {
        callback(uncompressedData);
      } else {
        decompress(true, callback, pass);
      }
    },

    set attr(attr) {
      _entryHeader.attr = attr;
    },
    get attr() {
      return _entryHeader.attr;
    },

    set header(data) {
      _entryHeader.loadFromBinary(data);
    },

    get header() {
      return _entryHeader;
    },

    packHeader: function() {
      const header = _entryHeader.entryHeaderToBinary();
      // add
      _entryName.copy(header, Utils.Constants.CENHDR);
      if (_entryHeader.extraLength) {
        _extra.copy(header, Utils.Constants.CENHDR + _entryName.length);
      }
      if (_entryHeader.commentLength) {
        _comment.copy(header, Utils.Constants.CENHDR + _entryName.length + _entryHeader.extraLength, _comment.length);
      }
      return header;
    },

    toString: function() {
      return '{\n' +
        '\t"entryName" : "' + _entryName.toString() + '\",\n' +
        '\t"name" : "' + (_isDirectory ? _entryName.toString().replace(/\/$/, '').split('/').pop() : _entryName.toString().split('/').pop()) + '\",\n' +
        '\t"comment" : "' + _comment.toString() + '\",\n' +
        '\t"isDirectory" : ' + _isDirectory + ',\n' +
        '\t"header" : ' + _entryHeader.toString().replace(/\t/mg, '\t\t').replace(/}/mg, '\t}') + ',\n' +
        '\t"compressedData" : <' + (input && input.length + ' bytes buffer' || 'null') + '>\n' +
        '\t"data" : <' + (uncompressedData && uncompressedData.length + ' bytes buffer' || 'null') + '>\n' +
        '}';
    },
  };
};

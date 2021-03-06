const Utils = require('../util');
const Constants = Utils.Constants;

/* The entries in the end of central directory */
module.exports = function() {
  let _volumeEntries = 0;
  let _totalEntries = 0;
  let _size = 0;
  let _offset = 0;
  let _commentLength = 0;

  return {
    get diskEntries() {
      return _volumeEntries;
    },
    set diskEntries(val) {
      _volumeEntries = _totalEntries = val;
    },

    get totalEntries() {
      return _totalEntries;
    },
    set totalEntries(val) {
      _totalEntries = _volumeEntries = val;
    },

    get size() {
      return _size;
    },
    set size(val) {
      _size = val;
    },

    get offset() {
      return _offset;
    },
    set offset(val) {
      _offset = val;
    },

    get commentLength() {
      return _commentLength;
    },
    set commentLength(val) {
      _commentLength = val;
    },

    get mainHeaderSize() {
      return Constants.ENDHDR + _commentLength;
    },

    loadFromBinary: function(data) {
      // data should be 22 bytes and start with "PK 05 06"
      if (data.length !== Constants.ENDHDR || data.readUInt32LE(0) !== Constants.ENDSIG) {
        throw Utils.Errors.INVALID_END;
      }

      // number of entries on this volume
      _volumeEntries = data.readUInt16LE(Constants.ENDSUB);
      // total number of entries
      _totalEntries = data.readUInt16LE(Constants.ENDTOT);
      // central directory size in bytes
      _size = data.readUInt32LE(Constants.ENDSIZ);
      // offset of first CEN header
      _offset = data.readUInt32LE(Constants.ENDOFF);
      // zip file comment length
      _commentLength = data.readUInt16LE(Constants.ENDCOM);
    },

    toBinary: function() {
      const b = Buffer.alloc(Constants.ENDHDR + _commentLength);
      // "PK 05 06" signature
      b.writeUInt32LE(Constants.ENDSIG, 0);
      b.writeUInt32LE(0, 4);
      // number of entries on this volume
      b.writeUInt16LE(_volumeEntries, Constants.ENDSUB);
      // total number of entries
      b.writeUInt16LE(_totalEntries, Constants.ENDTOT);
      // central directory size in bytes
      b.writeUInt32LE(_size, Constants.ENDSIZ);
      // offset of first CEN header
      b.writeUInt32LE(_offset, Constants.ENDOFF);
      // zip file comment length
      b.writeUInt16LE(_commentLength, Constants.ENDCOM);
      // fill comment memory with spaces so no garbage is left there
      b.fill(' ', Constants.ENDHDR);

      return b;
    },

    toString: function() {
      return '{\n' +
        '\t"diskEntries" : ' + _volumeEntries + ',\n' +
        '\t"totalEntries" : ' + _totalEntries + ',\n' +
        '\t"size" : ' + _size + ' bytes,\n' +
        '\t"offset" : 0x' + _offset.toString(16).toUpperCase() + ',\n' +
        '\t"commentLength" : 0x' + _commentLength + '\n' +
        '}';
    },
  };
};

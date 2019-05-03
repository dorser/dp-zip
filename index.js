const Utils = require('./util');
const ZipFile = require('./zipFile');

module.exports = function(input) {
  const _zip = new ZipFile(input, Utils.Constants.BUFFER);

  function getEntry(entry) {
    if (entry && _zip) {
      let item;
      // If entry was given as a file name
      if (typeof entry === 'string') {
        item = _zip.getEntry(entry);
      }
      // if entry was given as a ZipEntry object
      if (typeof entry === 'object' && typeof entry.entryName !== 'undefined' && typeof entry.header !== 'undefined') {
        item = _zip.getEntry(entry.entryName);
      }

      if (item) {
        return item;
      }
    }
    return null;
  }

  return {
    readFile: function(entry) {
      const item = getEntry(entry);
      return item && item.getData() || null;
    },

    readFileAsync: function(entry, callback) {
      const item = getEntry(entry);
      if (item) {
        item.getDataAsync(callback);
      } else {
        callback(null, 'getEntry failed for:' + entry);
      }
    },

    getEntries: function() {
      if (_zip) {
        return _zip.entries;
      } else {
        return [];
      }
    },

    getEntry: function(name) {
      return getEntry(name);
    },

    test: function() {
      if (!_zip) {
        return false;
      }

      for (const entry in _zip.entries) {
        if (Object.prototype.hasOwnProperty.call(entry, _zip.entries)) {
          try {
            if (entry.isDirectory) {
              continue;
            }
            const content = _zip.entries[entry].getData();
            if (!content) {
              return false;
            }
          } catch (err) {
            return false;
          }
        }
      }
      return true;
    },
  };
};

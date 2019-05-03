const fs = require('fs');
const pth = require('./path.js');

module.exports = (function() {
  const crcTable = [];
  const Constants = require('./constants');
  const Errors = require('./errors');

  const PATH_SEPARATOR = pth.sep;

  function mkdirSync(path) {
    let resolvedPath = path.split(PATH_SEPARATOR)[0];
    path.split(PATH_SEPARATOR).forEach(function(name) {
      if (!name || name.substr(-1, 1) === ':') return;
      resolvedPath += PATH_SEPARATOR + name;
      let stat;
      try {
        stat = fs.statSync(resolvedPath);
      } catch (e) {
        fs.mkdirSync(resolvedPath);
      }
      if (stat && stat.isFile()) {
        throw Errors.FILE_IN_THE_WAY.replace('%s', resolvedPath);
      }
    });
  }

  function findSync(dir, pattern, recoursive) {
    if (typeof pattern === 'boolean') {
      recoursive = pattern;
      pattern = undefined;
    }
    let files = [];
    fs.readdirSync(dir).forEach(function(file) {
      const path = pth.join(dir, file);

      if (fs.statSync(path).isDirectory() && recoursive) {
        files = files.concat(findSync(path, pattern, recoursive));
      }

      if (!pattern || pattern.test(path)) {
        files.push(pth.normalize(path) + (fs.statSync(path).isDirectory() ? PATH_SEPARATOR : ''));
      }
    });
    return files;
  }

  return {
    makeDir: function(path) {
      mkdirSync(path);
    },

    crc32: function(buf) {
      if (typeof buf === 'string') {
        buf = new Buffer(buf.length, buf);
      }
      const b = new Buffer(4);
      if (!crcTable.length) {
        for (let n = 0; n < 256; n++) {
          let c = n;
          for (let k = 8; --k >= 0;) {
            if ((c & 1) !== 0) {
              c = 0xedb88320 ^ (c >>> 1);
            } else {
              c = c >>> 1;
            }
          } //

          if (c < 0) {
            b.writeInt32LE(c, 0);
            c = b.readUInt32LE(0);
          }
          crcTable[n] = c;
        }
      }
      let crc = 0;
      let off = 0;
      let len = buf.length;
      let c1 = ~crc;
      while (--len >= 0) c1 = crcTable[(c1 ^ buf[off++]) & 0xff] ^ (c1 >>> 8);
      crc = ~c1;
      b.writeInt32LE(crc & 0xffffffff, 0);
      return b.readUInt32LE(0);
    },

    methodToString: function(method) {
      switch (method) {
        case Constants.STORED:
          return 'STORED (' + method + ')';
        case Constants.DEFLATED:
          return 'DEFLATED (' + method + ')';
        default:
          return 'UNSUPPORTED (' + method + ')';
      }
    },

    writeFileTo: function(path, content, overwrite, attr) {
      if (fs.existsSync(path)) {
        if (!overwrite) {
          return false;
        }


        const stat = fs.statSync(path);
        if (stat.isDirectory()) {
          return false;
        }
      }
      const folder = pth.dirname(path);
      if (!fs.existsSync(folder)) {
        mkdirSync(folder);
      }

      let fd;
      try {
        fd = fs.openSync(path, 'w', 438); // 0666
      } catch (e) {
        fs.chmodSync(path, 438);
        fd = fs.openSync(path, 'w', 438);
      }
      if (fd) {
        try {
          fs.writeSync(fd, content, 0, content.length, 0);
        } catch (e) {
          throw e;
        } finally {
          fs.closeSync(fd);
        }
      }
      fs.chmodSync(path, attr || 438);
      return true;
    },

    writeFileToAsync: function(path, content, overwrite, attr, callback) {
      if (typeof attr === 'function') {
        callback = attr;
        attr = undefined;
      }

      fs.exists(path, function(exists) {
        if (exists && !overwrite) {
          return callback(false);
        }


        fs.stat(path, function(err, stat) {
          if (exists && stat.isDirectory()) {
            return callback(false);
          }

          const folder = pth.dirname(path);
          fs.exists(folder, function(exists) {
            if (!exists) {
              mkdirSync(folder);
            }

            fs.open(path, 'w', 438, function(err, fd) {
              if (err) {
                fs.chmod(path, 438, function() {
                  fs.open(path, 'w', 438, function(err, fd) {
                    fs.write(fd, content, 0, content.length, 0, function() {
                      fs.close(fd, function() {
                        fs.chmod(path, attr || 438, function() {
                          callback(true);
                        });
                      });
                    });
                  });
                });
              } else {
                if (fd) {
                  fs.write(fd, content, 0, content.length, 0, function() {
                    fs.close(fd, function() {
                      fs.chmod(path, attr || 438, function() {
                        callback(true);
                      });
                    });
                  });
                } else {
                  fs.chmod(path, attr || 438, function() {
                    callback(true);
                  });
                }
              }
            });
          });
        });
      });
    },

    findFiles: function(path) {
      return findSync(path, true);
    },

    getAttributes: function(path) {

    },

    setAttributes: function(path) {

    },

    toBuffer: function(input) {
      if (Buffer.isBuffer(input)) {
        return input;
      } else {
        if (input.length === 0) {
          return new Buffer(0);
        }
        return Buffer.from(input, 'utf8');
      }
    },

    Constants: Constants,
    Errors: Errors,
  };
})();

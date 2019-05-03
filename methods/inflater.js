module.exports = function(inbuf) {
  const pako = require('../node_modules/pako');

  return {
    inflate: function() {
      const bufObj = pako.inflateRaw(inbuf);
      // var res = Object.keys(bufObj).map(function(key) {
      //     return bufObj[key];
      // });
      const res = new Buffer(bufObj);
      return res;
    },

    inflateAsync: function(callback) {
      const tmp = new pako.Inflate();
      const parts = []; let total = 0;
      tmp.onData('data', function(data) {
        parts.push(data);
        total += data.length;
      });
      tmp.onData('end', function() {
        const buf = Buffer.alloc(total);
        let written = 0;
        buf.fill(0);
        for (let i = 0; i < parts.length; i++) {
          const part = parts[i];
          part.copy(buf, written);
          written += part.length;
        }
        callback && callback(buf);
      });
      tmp.onEnd(inbuf);
    },
  };
};

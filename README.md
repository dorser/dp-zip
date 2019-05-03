# DP-ZIP (DataPower ZIP)

DP-ZIP is a GatewayScript implementation for zip data compression for DataPower.
It is based on [ADM-ZIP](https://github.com/cthackers/adm-zip)

# Installation
Use [DCM](https://github.com/ibm-datapower/datapower-configuration-manager) to upload the files.

## Functionality

* decompress zip files in memory buffers
* compress files in compressed buffers (Not yet implemented)

# Dependencies
This package uses [pako](https://nodeca.github.io/pako/) to deflate/inflate buffers.

# Examples

```javascript

const Zip = require('dp-zip');

// Reading the input context
session.input.readAsBuffer((err, buf) => {
  const zip = new Zip(buf);
  // Listing the files within the zip archive
  const zipEntries = zip.getEntries();
  zipEntries.forEach((zipEntry) => {
    // Uncompress the file from the zip archive
    const zipData = zip.readFile(zipEntry);
    const data = new Buffer(zipData).toString();
    console.log(data);
  });
});

```

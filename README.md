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
Download the [unzip-example.zip](https://gist.githubusercontent.com/dorser/7291249e101a5c2b1fe5794722b0dda1/raw/d37f89e78d1659beecd8fa9a4eb10da29d4c60f8/unzip-example.zip) as an example MPGW you can import to your DataPower.
You can upload test zip files to it directly:
`curl -X POST --data-binary @test.zip http://DP_HOST:1995/unzip`

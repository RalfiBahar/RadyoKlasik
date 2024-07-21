const md5 = require("md5");

function getFileHash(fileContent) {
  return md5(fileContent);
}

module.exports = getFileHash;

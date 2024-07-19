const buildProdLogger = require("./prodLogger");

const logger = buildProdLogger();
/*
if (process.env.NODE_ENV === 'development') {
  logger = buildDevLogger();
} else {
  logger = buildProdLogger();
}
*/

module.exports = logger;

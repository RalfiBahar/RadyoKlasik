const { Sequelize } = require("sequelize");
const { ADMIN_DATABASE_URL, TEST_DB_NAME } = require("./testDb");

// Recreate a clean test database before the suite. Resilient: if Postgres is
// unreachable we just warn — DB-less unit tests still run, and the integration
// suite will fail loudly on its own connection.
module.exports = async () => {
  const admin = new Sequelize(ADMIN_DATABASE_URL, {
    dialect: "postgres",
    logging: false,
  });
  try {
    await admin.authenticate();
    await admin.query(`DROP DATABASE IF EXISTS "${TEST_DB_NAME}" WITH (FORCE)`);
    await admin.query(`CREATE DATABASE "${TEST_DB_NAME}"`);
  } catch (err) {
    console.warn(
      `[globalSetup] could not provision test DB "${TEST_DB_NAME}": ${err.message}`
    );
  } finally {
    await admin.close();
  }
};

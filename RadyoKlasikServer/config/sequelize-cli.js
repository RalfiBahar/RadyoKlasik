require("dotenv").config();

// sequelize-cli reads this. It drives connection from the same DATABASE_URL DSN
// the app uses (config/database.js), so CLI and runtime stay in lockstep.
const url =
  process.env.DATABASE_URL || "postgres://radyo:radyo@localhost:5432/radyoklasik";

const base = {
  url,
  dialect: "postgres",
  dialectOptions:
    process.env.DATABASE_SSL === "true"
      ? { ssl: { require: true, rejectUnauthorized: false } }
      : {},
};

module.exports = {
  development: base,
  test: base,
  production: base,
};

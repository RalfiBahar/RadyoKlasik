const { Sequelize } = require("sequelize");
const dotenv = require("dotenv");

dotenv.config();

// Phase 0: migrated from SQLite to PostgreSQL. Connection comes from a single
// DATABASE_URL DSN (the cross-phase contract in infra/.env.example). A sane
// localhost default keeps non-docker dev working.
const databaseUrl =
  process.env.DATABASE_URL ||
  "postgres://radyo:radyo@localhost:5432/radyoklasik";

const useSsl = process.env.DATABASE_SSL === "true";

const sequelize = new Sequelize(databaseUrl, {
  dialect: "postgres",
  logging: false,
  dialectOptions: useSsl
    ? { ssl: { require: true, rejectUnauthorized: false } }
    : {},
});

module.exports = { sequelize };

const path = require("path");
const { Sequelize } = require("sequelize");
const { Umzug, SequelizeStorage } = require("umzug");
const { sequelize } = require("./database");
const logger = require("../logger");

// Single source of truth for schema changes. Migration files live in
// ../migrations and use the standard sequelize-cli signature
// (`up(queryInterface, Sequelize)`), so they can also be driven by
// `npx sequelize-cli db:migrate`. At app startup we run them programmatically
// via Umzug (tracked in the same `SequelizeMeta` table sequelize-cli uses).
const umzug = new Umzug({
  migrations: {
    glob: ["../migrations/*.js", { cwd: __dirname }],
    resolve: ({ name, path: migrationPath, context }) => {
      const migration = require(migrationPath);
      return {
        name,
        up: async () => migration.up(context.queryInterface, context.Sequelize),
        down: async () =>
          migration.down(context.queryInterface, context.Sequelize),
      };
    },
  },
  context: {
    queryInterface: sequelize.getQueryInterface(),
    Sequelize,
  },
  storage: new SequelizeStorage({ sequelize }),
  logger: undefined, // keep umzug quiet; we log our own summary below
});

async function runMigrations() {
  const pending = await umzug.pending();
  if (pending.length === 0) {
    logger.info("Migrations: schema up to date");
    return [];
  }
  logger.info(`Migrations: applying ${pending.length} pending migration(s)`, {
    pending: pending.map((m) => m.name),
  });
  const executed = await umzug.up();
  logger.info("Migrations: done", { applied: executed.map((m) => m.name) });
  return executed;
}

module.exports = { umzug, runMigrations };

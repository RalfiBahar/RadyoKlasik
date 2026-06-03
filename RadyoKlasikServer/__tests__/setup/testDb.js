// Shared test-DB coordinates. The integration suite runs against a dedicated
// `radyoklasik_test` database on the dockerized Postgres (port published in
// infra/docker-compose.yml). Override with TEST_DATABASE_URL if needed.
const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ||
  "postgres://radyo:dev-postgres-pw@localhost:5432/radyoklasik_test";

const parsed = new URL(TEST_DATABASE_URL);
const TEST_DB_NAME = parsed.pathname.replace(/^\//, "");

const adminParsed = new URL(TEST_DATABASE_URL);
adminParsed.pathname = "/postgres"; // maintenance DB always present
const ADMIN_DATABASE_URL = adminParsed.toString();

module.exports = { TEST_DATABASE_URL, ADMIN_DATABASE_URL, TEST_DB_NAME };

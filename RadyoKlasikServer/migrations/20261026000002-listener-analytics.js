"use strict";

// Phase 6: listener analytics.
//   ListenerSessions  — one row per listening session (from Caddy's stream
//                       access log for proxied listeners, or the Icecast client
//                       list for direct ones). IPs are stored only as a salted
//                       hash (for unique-listener counts); country/device are
//                       derived at ingest.
//   ListenerSnapshots — the Icecast listener count once a minute (concurrency
//                       over time, peak, listening hours).
module.exports = {
  async up(queryInterface, Sequelize) {
    const { UUID, UUIDV4, STRING, INTEGER, BIGINT, DATE } = Sequelize;
    await queryInterface.createTable("ListenerSessions", {
      id: { type: UUID, defaultValue: UUIDV4, primaryKey: true },
      // Dedupe key: Caddy log line hash or "icecast:<client id>:<start>".
      externalId: { type: STRING, allowNull: false, unique: true },
      source: { type: STRING, allowNull: false },
      mount: { type: STRING, allowNull: true },
      ipHash: { type: STRING, allowNull: true },
      country: { type: STRING(2), allowNull: true },
      device: { type: STRING, allowNull: true },
      userAgent: { type: STRING(512), allowNull: true },
      startedAt: { type: DATE, allowNull: false },
      endedAt: { type: DATE, allowNull: true },
      durationSec: { type: INTEGER, allowNull: false, defaultValue: 0 },
      bytes: { type: BIGINT, allowNull: false, defaultValue: 0 },
      createdAt: { type: DATE, allowNull: false },
      updatedAt: { type: DATE, allowNull: false },
    });
    await queryInterface.addIndex("ListenerSessions", ["startedAt"]);
    await queryInterface.addIndex("ListenerSessions", ["endedAt"]);

    await queryInterface.createTable("ListenerSnapshots", {
      at: { type: DATE, primaryKey: true },
      listeners: { type: INTEGER, allowNull: false },
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("ListenerSnapshots");
    await queryInterface.dropTable("ListenerSessions");
  },
};

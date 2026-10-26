"use strict";

// Phase 7: DJ accounts, shows + hosts, the weekly/one-off schedule, and
// persisted station settings (break cadence, autopilot, timezone, ...).
module.exports = {
  async up(queryInterface, Sequelize) {
    const { UUID, UUIDV4, STRING, INTEGER, DATE, DATEONLY, BOOLEAN, JSONB } =
      Sequelize;
    const timestamps = {
      createdAt: { type: DATE, allowNull: false },
      updatedAt: { type: DATE, allowNull: false },
    };

    // --- Users: display name, enable/disable, guest access window ----------
    await queryInterface.addColumn("Users", "displayName", {
      type: STRING,
      allowNull: true,
    });
    await queryInterface.addColumn("Users", "active", {
      type: BOOLEAN,
      allowNull: false,
      defaultValue: true,
    });
    // Guest DJs only: the window their invite link is valid for.
    await queryInterface.addColumn("Users", "accessFrom", {
      type: DATE,
      allowNull: true,
    });
    await queryInterface.addColumn("Users", "accessUntil", {
      type: DATE,
      allowNull: true,
    });

    // --- Shows: automation playlist + calendar colour ----------------------
    await queryInterface.addColumn("Shows", "playlistId", {
      type: UUID,
      allowNull: true,
      references: { model: "Playlists", key: "id" },
      onUpdate: "CASCADE",
      onDelete: "SET NULL",
    });
    await queryInterface.addColumn("Shows", "color", {
      type: STRING,
      allowNull: true,
    });

    await queryInterface.createTable("ShowHosts", {
      showId: {
        type: UUID,
        allowNull: false,
        primaryKey: true,
        references: { model: "Shows", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      userId: {
        type: UUID,
        allowNull: false,
        primaryKey: true,
        references: { model: "Users", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      ...timestamps,
    });

    // --- Schedule ------------------------------------------------------------
    // A slot recurs weekly on `dayOfWeek` (0 = Sunday) unless `date` is set, in
    // which case it is a one-off on that station-local date. Times are minutes
    // from local midnight in the station timezone; a slot may run past midnight.
    await queryInterface.createTable("ScheduleSlots", {
      id: { type: UUID, defaultValue: UUIDV4, primaryKey: true },
      title: { type: STRING, allowNull: true },
      showId: {
        type: UUID,
        allowNull: true,
        references: { model: "Shows", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      playlistId: {
        type: UUID,
        allowNull: true,
        references: { model: "Playlists", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      },
      dayOfWeek: { type: INTEGER, allowNull: true },
      date: { type: DATEONLY, allowNull: true },
      startMinute: { type: INTEGER, allowNull: false },
      durationMinutes: { type: INTEGER, allowNull: false },
      shuffle: { type: BOOLEAN, allowNull: false, defaultValue: true },
      color: { type: STRING, allowNull: true },
      ...timestamps,
    });
    await queryInterface.addIndex("ScheduleSlots", ["dayOfWeek"]);
    await queryInterface.addIndex("ScheduleSlots", ["date"]);

    // --- Station settings (key/value) ---------------------------------------
    await queryInterface.createTable("StationSettings", {
      key: { type: STRING, primaryKey: true },
      value: { type: JSONB, allowNull: true },
      ...timestamps,
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("StationSettings");
    await queryInterface.dropTable("ScheduleSlots");
    await queryInterface.dropTable("ShowHosts");
    await queryInterface.removeColumn("Shows", "color");
    await queryInterface.removeColumn("Shows", "playlistId");
    await queryInterface.removeColumn("Users", "accessUntil");
    await queryInterface.removeColumn("Users", "accessFrom");
    await queryInterface.removeColumn("Users", "active");
    await queryInterface.removeColumn("Users", "displayName");
  },
};

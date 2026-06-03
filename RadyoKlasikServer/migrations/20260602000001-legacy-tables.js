"use strict";

// Moves the previously sync()'d legacy tables (Recordings, NotificationTokens)
// into a migration so the entire schema is managed in one place. Phase 0 left
// these created via per-model sequelize.sync(); Phase 1 removes those calls.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("Recordings", {
      id: { type: Sequelize.STRING, primaryKey: true, allowNull: false },
      filename: { type: Sequelize.STRING, allowNull: false },
      stream: { type: Sequelize.STRING, allowNull: false },
      title: { type: Sequelize.STRING, allowNull: false },
      artist: { type: Sequelize.STRING, allowNull: false },
      album: { type: Sequelize.STRING, allowNull: true },
      artwork: { type: Sequelize.STRING, allowNull: true },
      duration: { type: Sequelize.INTEGER, allowNull: false },
      size: { type: Sequelize.FLOAT, allowNull: false },
      play_count: { type: Sequelize.INTEGER, allowNull: true },
      special: { type: Sequelize.STRING, allowNull: true },
      date: { type: Sequelize.DATE, allowNull: false },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });

    await queryInterface.createTable("NotificationTokens", {
      id: { type: Sequelize.STRING, primaryKey: true, allowNull: false },
      token: { type: Sequelize.STRING, allowNull: false },
      date: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW,
      },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("NotificationTokens");
    await queryInterface.dropTable("Recordings");
  },
};

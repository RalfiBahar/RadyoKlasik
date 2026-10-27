"use strict";

// Where each recording's MP3 lives: "local" (server disk), "pending" (on disk,
// waiting to upload) or "r2" (Cloudflare R2). See infra/R2_RECORDINGS_PLAN.md.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("Recordings", "storage", {
      type: Sequelize.STRING,
      allowNull: false,
      defaultValue: "local",
    });
    await queryInterface.addColumn("Recordings", "storedAt", { type: Sequelize.DATE, allowNull: true });
    await queryInterface.addColumn("Recordings", "storageError", { type: Sequelize.TEXT, allowNull: true });
  },
  async down(queryInterface) {
    for (const col of ["storageError", "storedAt", "storage"]) {
      await queryInterface.removeColumn("Recordings", col);
    }
  },
};

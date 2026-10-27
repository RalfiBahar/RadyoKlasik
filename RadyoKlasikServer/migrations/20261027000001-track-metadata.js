"use strict";

// Richer library metadata (classical needs the composer): edited in the panel
// and written back into the audio files' own tags.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("Tracks", "composer", { type: Sequelize.STRING, allowNull: true });
    await queryInterface.addColumn("Tracks", "year", { type: Sequelize.INTEGER, allowNull: true });
    await queryInterface.addColumn("Tracks", "genre", { type: Sequelize.STRING, allowNull: true });
    await queryInterface.addColumn("Tracks", "comment", { type: Sequelize.TEXT, allowNull: true });
  },
  async down(queryInterface) {
    for (const col of ["comment", "genre", "year", "composer"]) {
      await queryInterface.removeColumn("Tracks", col);
    }
  },
};

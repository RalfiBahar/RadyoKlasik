const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

// Phase 7: Show <-> User (DJ host) join table.
const ShowHost = sequelize.define(
  "ShowHost",
  {
    showId: { type: DataTypes.UUID, allowNull: false, primaryKey: true },
    userId: { type: DataTypes.UUID, allowNull: false, primaryKey: true },
  },
  { timestamps: true }
);

module.exports = ShowHost;

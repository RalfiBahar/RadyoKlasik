const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

// Phase 6: Icecast listener count, sampled once a minute.
const ListenerSnapshot = sequelize.define(
  "ListenerSnapshot",
  {
    at: { type: DataTypes.DATE, primaryKey: true },
    listeners: { type: DataTypes.INTEGER, allowNull: false },
  },
  { timestamps: false }
);

module.exports = ListenerSnapshot;

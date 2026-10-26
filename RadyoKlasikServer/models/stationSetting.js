const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

// Phase 7: persisted station settings (key -> JSON value).
const StationSetting = sequelize.define(
  "StationSetting",
  {
    key: { type: DataTypes.STRING, primaryKey: true },
    value: { type: DataTypes.JSONB, allowNull: true },
  },
  { timestamps: true }
);

module.exports = StationSetting;

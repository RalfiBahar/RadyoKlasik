const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

// Phase 7: one block on the station schedule. Recurs weekly on `dayOfWeek`
// (0 = Sunday) unless `date` is set (a one-off on that station-local date).
// startMinute / durationMinutes are station-local minutes from midnight.
const ScheduleSlot = sequelize.define(
  "ScheduleSlot",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    title: { type: DataTypes.STRING, allowNull: true },
    showId: { type: DataTypes.UUID, allowNull: true },
    playlistId: { type: DataTypes.UUID, allowNull: true },
    dayOfWeek: { type: DataTypes.INTEGER, allowNull: true },
    date: { type: DataTypes.DATEONLY, allowNull: true },
    startMinute: { type: DataTypes.INTEGER, allowNull: false },
    durationMinutes: { type: DataTypes.INTEGER, allowNull: false },
    shuffle: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    color: { type: DataTypes.STRING, allowNull: true },
  },
  { timestamps: true }
);

module.exports = ScheduleSlot;

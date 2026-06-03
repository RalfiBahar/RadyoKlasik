const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

// One row per track change on air. Written by the playout metadata hook in
// Phase 2 and consumed by track-report analytics in Phase 6.
const PlayHistory = sequelize.define(
  "PlayHistory",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    trackId: { type: DataTypes.UUID, allowNull: true },
    startedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    source: {
      type: DataTypes.ENUM("autodj", "live", "request"),
      allowNull: false,
      defaultValue: "autodj",
    },
  },
  {
    timestamps: true,
    indexes: [{ fields: ["trackId"] }, { fields: ["startedAt"] }],
  }
);

module.exports = PlayHistory;

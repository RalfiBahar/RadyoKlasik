const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

// Join table for the Track <-> Tag many-to-many relationship.
const TrackTag = sequelize.define(
  "TrackTag",
  {
    trackId: { type: DataTypes.UUID, allowNull: false },
    tagId: { type: DataTypes.UUID, allowNull: false },
  },
  {
    timestamps: false,
    indexes: [{ unique: true, fields: ["trackId", "tagId"] }],
  }
);

module.exports = TrackTag;

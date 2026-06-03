const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

// Ordered membership of a Track in a Playlist. `position` is a zero-based
// ordinal kept dense by the playlist controller on insert/reorder/remove.
const PlaylistItem = sequelize.define(
  "PlaylistItem",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    playlistId: { type: DataTypes.UUID, allowNull: false },
    trackId: { type: DataTypes.UUID, allowNull: false },
    position: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  },
  {
    timestamps: true,
    indexes: [{ fields: ["playlistId", "position"] }],
  }
);

module.exports = PlaylistItem;

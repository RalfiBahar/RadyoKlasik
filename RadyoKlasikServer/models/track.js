const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

// Core media item. `artist`/`album` are denormalized strings for fast listing
// (matching the Library UI) while `artistId`/`albumId` link to the normalized
// lookup tables. Loudness/replaygain are computed at ingest (Phase 1) and used
// for playout normalization (Phase 2). `waveformJson` powers the studio UI.
const Track = sequelize.define(
  "Track",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    title: { type: DataTypes.STRING, allowNull: false },
    artist: { type: DataTypes.STRING, allowNull: true },
    album: { type: DataTypes.STRING, allowNull: true },
    type: {
      type: DataTypes.ENUM("song", "jingle", "commercial"),
      allowNull: false,
      defaultValue: "song",
    },
    duration: { type: DataTypes.FLOAT, allowNull: true }, // seconds
    filePath: { type: DataTypes.STRING, allowNull: false },
    fileHash: { type: DataTypes.STRING, allowNull: false, unique: true },
    size: { type: DataTypes.BIGINT, allowNull: true }, // bytes
    bitrate: { type: DataTypes.INTEGER, allowNull: true }, // bps
    sampleRate: { type: DataTypes.INTEGER, allowNull: true }, // Hz
    loudnessLufs: { type: DataTypes.FLOAT, allowNull: true }, // integrated LUFS (EBU R128)
    loudnessRange: { type: DataTypes.FLOAT, allowNull: true }, // LRA
    replaygain: { type: DataTypes.FLOAT, allowNull: true }, // dB gain to reach reference loudness
    waveformJson: { type: DataTypes.JSONB, allowNull: true },
    artworkPath: { type: DataTypes.STRING, allowNull: true },
    playCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    artistId: { type: DataTypes.UUID, allowNull: true },
    albumId: { type: DataTypes.UUID, allowNull: true },
  },
  {
    timestamps: true,
    indexes: [
      { fields: ["type"] },
      { fields: ["artistId"] },
      { fields: ["albumId"] },
    ],
  }
);

module.exports = Track;

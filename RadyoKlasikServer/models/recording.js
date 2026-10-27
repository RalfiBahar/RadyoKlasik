const { Sequelize, DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

const Recording = sequelize.define(
  "Recording",
  {
    id: {
      type: DataTypes.STRING,
      primaryKey: true,
      allowNull: false,
    },
    filename: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    stream: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    title: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    artist: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    album: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    artwork: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    duration: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    size: {
      type: DataTypes.FLOAT,
      allowNull: false,
    },
    play_count: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    special: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    date: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    // "local" | "pending" | "r2" — see services/recordingStorage.js
    storage: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "local",
    },
    storedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    storageError: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  },
  {
    timestamps: true,
  }
);

// Schema is managed by migrations (config/migrate.js) — no per-model sync().
module.exports = Recording;

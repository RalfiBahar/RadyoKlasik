const { Sequelize, DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");
const logger = require("../logger");

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
  },
  {
    timestamps: true,
  }
);

sequelize.sync({ alter: true }).then(() => {
  logger.info("Database & tables updated!");
});

module.exports = Recording;

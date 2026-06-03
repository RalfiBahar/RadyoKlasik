const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

const Episode = sequelize.define(
  "Episode",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    showId: { type: DataTypes.UUID, allowNull: false },
    title: { type: DataTypes.STRING, allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: true },
    airedAt: { type: DataTypes.DATE, allowNull: true },
  },
  {
    timestamps: true,
    indexes: [{ fields: ["showId"] }],
  }
);

module.exports = Episode;

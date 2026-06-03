const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

const Album = sequelize.define(
  "Album",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    title: { type: DataTypes.STRING, allowNull: false },
    artistId: { type: DataTypes.UUID, allowNull: true },
  },
  {
    timestamps: true,
    indexes: [{ fields: ["title"] }, { fields: ["artistId"] }],
  }
);

module.exports = Album;

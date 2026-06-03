const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

const Artist = sequelize.define(
  "Artist",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    name: { type: DataTypes.STRING, allowNull: false, unique: true },
  },
  { timestamps: true }
);

module.exports = Artist;

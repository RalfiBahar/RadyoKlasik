const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

const NotificationToken = sequelize.define(
  "NotificationToken",
  {
    id: {
      type: DataTypes.STRING,
      primaryKey: true,
      allowNull: false,
    },
    token: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    date: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = NotificationToken;

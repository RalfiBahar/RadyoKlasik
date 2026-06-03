const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

// Shows + episodes are created here (Phase 1) but their CRUD/scheduling logic
// lands in Phase 7.
const Show = sequelize.define(
  "Show",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    title: { type: DataTypes.STRING, allowNull: false },
    tagline: { type: DataTypes.STRING, allowNull: true },
    logoPath: { type: DataTypes.STRING, allowNull: true },
    coverPath: { type: DataTypes.STRING, allowNull: true },
  },
  { timestamps: true }
);

module.exports = Show;

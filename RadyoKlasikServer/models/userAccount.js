const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

// Multi-user accounts (admin / dj / guest). Defined here in Phase 1 so the
// table exists for later phases (Phase 4 reads micPreferencesJson, Phase 7
// manages roles/access). NOTE: the legacy env-based single admin lives in
// models/user.js (used by authController) and is intentionally left untouched;
// this model owns the database "Users" table.
const User = sequelize.define(
  "User",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    username: { type: DataTypes.STRING, allowNull: false, unique: true },
    email: { type: DataTypes.STRING, allowNull: true, unique: true },
    passwordHash: { type: DataTypes.STRING, allowNull: true },
    role: {
      type: DataTypes.ENUM("admin", "dj", "guest"),
      allowNull: false,
      defaultValue: "dj",
    },
    micPreferencesJson: { type: DataTypes.JSONB, allowNull: true },
  },
  { timestamps: true }
);

module.exports = User;

const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

// Phase 6: one listening session (see the listener-analytics migration).
const ListenerSession = sequelize.define(
  "ListenerSession",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    externalId: { type: DataTypes.STRING, allowNull: false, unique: true },
    source: { type: DataTypes.STRING, allowNull: false },
    mount: { type: DataTypes.STRING, allowNull: true },
    ipHash: { type: DataTypes.STRING, allowNull: true },
    country: { type: DataTypes.STRING(2), allowNull: true },
    device: { type: DataTypes.STRING, allowNull: true },
    userAgent: { type: DataTypes.STRING(512), allowNull: true },
    startedAt: { type: DataTypes.DATE, allowNull: false },
    endedAt: { type: DataTypes.DATE, allowNull: true },
    durationSec: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    bytes: { type: DataTypes.BIGINT, allowNull: false, defaultValue: 0 },
  },
  { timestamps: true }
);

module.exports = ListenerSession;

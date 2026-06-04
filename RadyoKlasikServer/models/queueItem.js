const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

// Phase 3: the operator request queue, mirrored from Liquidsoap's request
// queue. The DB is the source of truth for ORDER (position); Liquidsoap holds
// the live pending queue, rebuilt from these rows on add/remove/reorder.
//
// status lifecycle:
//   pending  -> queued, waiting to air (shown in the studio NEXT panel)
//   playing  -> currently on air (the on_track metadata hook flips it here via
//               the round-tripped queue_item_id)
//   done     -> finished airing (or superseded by the next track)
//   removed  -> dequeued by an operator before it aired
const QueueItem = sequelize.define(
  "QueueItem",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    trackId: { type: DataTypes.UUID, allowNull: false },
    position: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    requestedBy: { type: DataTypes.STRING, allowNull: true },
    status: {
      type: DataTypes.ENUM("pending", "playing", "done", "removed"),
      allowNull: false,
      defaultValue: "pending",
    },
    // The Liquidsoap request id (RID) returned by `requests.push`, when known.
    // Best-effort: cleared on a full rebuild (clear + re-push).
    liqRid: { type: DataTypes.STRING, allowNull: true },
  },
  {
    timestamps: true,
    indexes: [{ fields: ["status"] }, { fields: ["position"] }],
  }
);

module.exports = QueueItem;

"use strict";

// Phase 3: the operator request queue mirrored from Liquidsoap. The DB owns the
// ORDER (position); Liquidsoap holds the live pending queue, rebuilt from these
// rows on add/remove/reorder.
module.exports = {
  async up(queryInterface, Sequelize) {
    const { UUID, UUIDV4, STRING, INTEGER, DATE } = Sequelize;
    await queryInterface.createTable("QueueItems", {
      id: { type: UUID, defaultValue: UUIDV4, primaryKey: true },
      trackId: {
        type: UUID,
        allowNull: false,
        references: { model: "Tracks", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      position: { type: INTEGER, allowNull: false, defaultValue: 0 },
      requestedBy: { type: STRING, allowNull: true },
      status: {
        type: Sequelize.ENUM("pending", "playing", "done", "removed"),
        allowNull: false,
        defaultValue: "pending",
      },
      liqRid: { type: STRING, allowNull: true },
      createdAt: { type: DATE, allowNull: false },
      updatedAt: { type: DATE, allowNull: false },
    });
    await queryInterface.addIndex("QueueItems", ["status"]);
    await queryInterface.addIndex("QueueItems", ["position"]);
  },

  async down(queryInterface) {
    await queryInterface.dropTable("QueueItems");
    const q = queryInterface.sequelize.query.bind(queryInterface.sequelize);
    await q('DROP TYPE IF EXISTS "enum_QueueItems_status";');
  },
};

"use strict";

// Phase 1 media-library schema: artists, albums, tracks, tags (+ join),
// playlists (+ ordered items), user accounts, shows/episodes, and play history.
module.exports = {
  async up(queryInterface, Sequelize) {
    const { UUID, UUIDV4, STRING, TEXT, INTEGER, BIGINT, FLOAT, DATE, JSONB } =
      Sequelize;
    const timestamps = {
      createdAt: { type: DATE, allowNull: false },
      updatedAt: { type: DATE, allowNull: false },
    };

    await queryInterface.createTable("Artists", {
      id: { type: UUID, defaultValue: UUIDV4, primaryKey: true },
      name: { type: STRING, allowNull: false, unique: true },
      ...timestamps,
    });

    await queryInterface.createTable("Albums", {
      id: { type: UUID, defaultValue: UUIDV4, primaryKey: true },
      title: { type: STRING, allowNull: false },
      artistId: {
        type: UUID,
        allowNull: true,
        references: { model: "Artists", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      },
      ...timestamps,
    });

    await queryInterface.createTable("Tracks", {
      id: { type: UUID, defaultValue: UUIDV4, primaryKey: true },
      title: { type: STRING, allowNull: false },
      artist: { type: STRING, allowNull: true },
      album: { type: STRING, allowNull: true },
      type: {
        type: Sequelize.ENUM("song", "jingle", "commercial"),
        allowNull: false,
        defaultValue: "song",
      },
      duration: { type: FLOAT, allowNull: true },
      filePath: { type: STRING, allowNull: false },
      fileHash: { type: STRING, allowNull: false, unique: true },
      size: { type: BIGINT, allowNull: true },
      bitrate: { type: INTEGER, allowNull: true },
      sampleRate: { type: INTEGER, allowNull: true },
      loudnessLufs: { type: FLOAT, allowNull: true },
      loudnessRange: { type: FLOAT, allowNull: true },
      replaygain: { type: FLOAT, allowNull: true },
      waveformJson: { type: JSONB, allowNull: true },
      artworkPath: { type: STRING, allowNull: true },
      playCount: { type: INTEGER, allowNull: false, defaultValue: 0 },
      artistId: {
        type: UUID,
        allowNull: true,
        references: { model: "Artists", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      },
      albumId: {
        type: UUID,
        allowNull: true,
        references: { model: "Albums", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      },
      ...timestamps,
    });
    await queryInterface.addIndex("Tracks", ["type"]);
    await queryInterface.addIndex("Tracks", ["artistId"]);
    await queryInterface.addIndex("Tracks", ["albumId"]);

    await queryInterface.createTable("Tags", {
      id: { type: UUID, defaultValue: UUIDV4, primaryKey: true },
      name: { type: STRING, allowNull: false, unique: true },
      ...timestamps,
    });

    await queryInterface.createTable("TrackTags", {
      trackId: {
        type: UUID,
        allowNull: false,
        references: { model: "Tracks", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      tagId: {
        type: UUID,
        allowNull: false,
        references: { model: "Tags", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
    });
    await queryInterface.addIndex("TrackTags", ["trackId", "tagId"], {
      unique: true,
    });

    await queryInterface.createTable("Playlists", {
      id: { type: UUID, defaultValue: UUIDV4, primaryKey: true },
      name: { type: STRING, allowNull: false },
      description: { type: TEXT, allowNull: true },
      ...timestamps,
    });

    await queryInterface.createTable("PlaylistItems", {
      id: { type: UUID, defaultValue: UUIDV4, primaryKey: true },
      playlistId: {
        type: UUID,
        allowNull: false,
        references: { model: "Playlists", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      trackId: {
        type: UUID,
        allowNull: false,
        references: { model: "Tracks", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      position: { type: INTEGER, allowNull: false, defaultValue: 0 },
      ...timestamps,
    });
    await queryInterface.addIndex("PlaylistItems", ["playlistId", "position"]);

    await queryInterface.createTable("Users", {
      id: { type: UUID, defaultValue: UUIDV4, primaryKey: true },
      username: { type: STRING, allowNull: false, unique: true },
      email: { type: STRING, allowNull: true, unique: true },
      passwordHash: { type: STRING, allowNull: true },
      role: {
        type: Sequelize.ENUM("admin", "dj", "guest"),
        allowNull: false,
        defaultValue: "dj",
      },
      micPreferencesJson: { type: JSONB, allowNull: true },
      ...timestamps,
    });

    await queryInterface.createTable("Shows", {
      id: { type: UUID, defaultValue: UUIDV4, primaryKey: true },
      title: { type: STRING, allowNull: false },
      tagline: { type: STRING, allowNull: true },
      logoPath: { type: STRING, allowNull: true },
      coverPath: { type: STRING, allowNull: true },
      ...timestamps,
    });

    await queryInterface.createTable("Episodes", {
      id: { type: UUID, defaultValue: UUIDV4, primaryKey: true },
      showId: {
        type: UUID,
        allowNull: false,
        references: { model: "Shows", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      title: { type: STRING, allowNull: false },
      description: { type: TEXT, allowNull: true },
      airedAt: { type: DATE, allowNull: true },
      ...timestamps,
    });
    await queryInterface.addIndex("Episodes", ["showId"]);

    await queryInterface.createTable("PlayHistories", {
      id: { type: UUID, defaultValue: UUIDV4, primaryKey: true },
      trackId: {
        type: UUID,
        allowNull: true,
        references: { model: "Tracks", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      },
      startedAt: { type: DATE, allowNull: false, defaultValue: Sequelize.NOW },
      source: {
        type: Sequelize.ENUM("autodj", "live", "request"),
        allowNull: false,
        defaultValue: "autodj",
      },
      ...timestamps,
    });
    await queryInterface.addIndex("PlayHistories", ["trackId"]);
    await queryInterface.addIndex("PlayHistories", ["startedAt"]);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable("PlayHistories");
    await queryInterface.dropTable("Episodes");
    await queryInterface.dropTable("Shows");
    await queryInterface.dropTable("Users");
    await queryInterface.dropTable("PlaylistItems");
    await queryInterface.dropTable("Playlists");
    await queryInterface.dropTable("TrackTags");
    await queryInterface.dropTable("Tags");
    await queryInterface.dropTable("Tracks");
    await queryInterface.dropTable("Albums");
    await queryInterface.dropTable("Artists");

    // Drop the postgres ENUM types created for the tables above.
    const q = queryInterface.sequelize.query.bind(queryInterface.sequelize);
    await q('DROP TYPE IF EXISTS "enum_Tracks_type";');
    await q('DROP TYPE IF EXISTS "enum_Users_role";');
    await q('DROP TYPE IF EXISTS "enum_PlayHistories_source";');
  },
};

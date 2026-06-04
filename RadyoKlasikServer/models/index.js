// Central model registry + associations. Schema itself is owned by the
// migrations (config/migrate.js); these models only declare ORM relationships.
// Requiring this module is the single place to load the full data layer.
const { sequelize } = require("../config/database");

const Track = require("./track");
const Artist = require("./artist");
const Album = require("./album");
const Tag = require("./tag");
const TrackTag = require("./trackTag");
const Playlist = require("./playlist");
const PlaylistItem = require("./playlistItem");
const User = require("./userAccount");
const Show = require("./show");
const Episode = require("./episode");
const PlayHistory = require("./playHistory");
const QueueItem = require("./queueItem");
const Recording = require("./recording");
const NotificationToken = require("./notificationToken");

// --- Artist / Album / Track ------------------------------------------------
Artist.hasMany(Track, { foreignKey: "artistId", as: "tracks" });
Track.belongsTo(Artist, { foreignKey: "artistId", as: "artistRef" });

Artist.hasMany(Album, { foreignKey: "artistId", as: "albums" });
Album.belongsTo(Artist, { foreignKey: "artistId", as: "artistRef" });

Album.hasMany(Track, { foreignKey: "albumId", as: "tracks" });
Track.belongsTo(Album, { foreignKey: "albumId", as: "albumRef" });

// --- Track <-> Tag (many-to-many) ------------------------------------------
Track.belongsToMany(Tag, {
  through: TrackTag,
  foreignKey: "trackId",
  otherKey: "tagId",
  as: "tagList",
});
Tag.belongsToMany(Track, {
  through: TrackTag,
  foreignKey: "tagId",
  otherKey: "trackId",
  as: "tracks",
});

// --- Playlists -------------------------------------------------------------
Playlist.hasMany(PlaylistItem, {
  foreignKey: "playlistId",
  as: "items",
  onDelete: "CASCADE",
});
PlaylistItem.belongsTo(Playlist, { foreignKey: "playlistId", as: "playlist" });
PlaylistItem.belongsTo(Track, { foreignKey: "trackId", as: "track" });
Track.hasMany(PlaylistItem, { foreignKey: "trackId", as: "playlistItems" });

// --- Play history ----------------------------------------------------------
Track.hasMany(PlayHistory, { foreignKey: "trackId", as: "plays" });
PlayHistory.belongsTo(Track, { foreignKey: "trackId", as: "track" });

// --- Queue items (Phase 3) -------------------------------------------------
Track.hasMany(QueueItem, { foreignKey: "trackId", as: "queueItems" });
QueueItem.belongsTo(Track, { foreignKey: "trackId", as: "track" });

// --- Shows / episodes ------------------------------------------------------
Show.hasMany(Episode, { foreignKey: "showId", as: "episodes" });
Episode.belongsTo(Show, { foreignKey: "showId", as: "show" });

module.exports = {
  sequelize,
  Track,
  Artist,
  Album,
  Tag,
  TrackTag,
  Playlist,
  PlaylistItem,
  User,
  Show,
  Episode,
  PlayHistory,
  QueueItem,
  Recording,
  NotificationToken,
};

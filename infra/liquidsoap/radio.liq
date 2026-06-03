# Radyo Klasik playout engine — Phase 0 scaffolding.
#
# This is intentionally minimal: it plays a bundled royalty-free test
# playlist on a loop to the Icecast `/stream` mount so the whole stack has
# something streamable end to end. AutoDJ rotation, crossfades, jingles,
# failover, live takeover and the metadata hook all land in Phase 2 / Phase 4.

# --- Settings -------------------------------------------------------------
# Command server (telnet). Bound to 0.0.0.0 so the `api` container can reach
# it over the private compose network. It is NOT published to the host, so it
# stays reachable from the api container only (per the Phase 0 spec).
settings.server.telnet := true
settings.server.telnet.bind_addr := "0.0.0.0"
settings.server.telnet.port := 1234

settings.log.stdout := true
settings.log.level := 3

# Read a value from the environment, falling back to a default if unset/empty.
def env_or(key, default) =
  v = environment.get(key)
  if v == "" then default else v end
end

icecast_host = env_or("ICECAST_HOST", "icecast")
icecast_port = int_of_string(env_or("ICECAST_PORT", "8000"))
source_password = env_or("ICECAST_SOURCE_PASSWORD", "hackme")
media_dir = env_or("TEST_MEDIA_DIR", "/srv/test-media")

# --- Source ---------------------------------------------------------------
# Loop the bundled test media. `mksafe` guarantees there is never dead air:
# if the playlist is empty/unavailable it falls back to silence.
radio = playlist(mode="randomize", reload_mode="watch", media_dir)
radio = mksafe(radio)

# --- Output ---------------------------------------------------------------
output.icecast(
  %mp3(bitrate=128),
  host=icecast_host,
  port=icecast_port,
  password=source_password,
  mount="/stream",
  name="Radyo Klasik",
  description="Radyo Klasik — self-hosted AutoDJ (Phase 0 test loop)",
  genre="Classical",
  radio
)

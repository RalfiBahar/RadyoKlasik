# Radyo Klasik playout engine — Phase 2: DB-driven AutoDJ + now-playing.
#
# - Rotation is driven by the control-plane DB: request.dynamic fetches each
#   next track from GET /api/v1/playout/next (which returns an `annotate:` URI).
# - Loudness is normalized per-track using the ReplayGain computed at ingest
#   (Phase 1), carried in the `liq_amplify` annotation.
# - Tracks crossfade into each other.
# - A fallback chain guarantees there is never dead air: if the API rotation
#   can't produce audio, a bundled emergency playlist takes over, and mksafe
#   streams blank as a last resort.
# - On each new track, on_track POSTs metadata to /api/v1/playout/metadata so
#   the API caches now-playing and writes PlayHistory.
# - The telnet command server lets the API push requests / skip / probe.

# --- Settings -------------------------------------------------------------
# Command server (telnet). Bound to 0.0.0.0 so the `api` container can reach it
# over the private compose network. NOT published to the host (api-only).
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
api_base = env_or("API_BASE", "http://api:8001")
internal_secret = env_or("INTERNAL_API_SECRET", "dev-internal")
emergency_dir = env_or("EMERGENCY_MEDIA_DIR", "/srv/test-media")
crossfade_dur = float_of_string(env_or("CROSSFADE_DURATION", "3.0"))

next_url = "#{api_base}/api/v1/playout/next"
meta_url = "#{api_base}/api/v1/playout/metadata"

# --- AutoDJ: DB-driven rotation ------------------------------------------
# request.dynamic calls the API for each next track. The API returns an
# `annotate:` URI carrying title/artist/album/track_id/source/liq_amplify and
# the absolute file path under the shared media volume.
def fetch_next() =
  response = http.get(next_url, headers=[("X-Internal-Secret", internal_secret)])
  code = response.status_code
  body = string.trim("#{response}")
  if code == 200 and body != "" then
    log(level=4, "playout/next -> #{body}")
    request.create(body)
  else
    log(level=2, "playout/next unavailable (HTTP #{code})")
    null()
  end
end

# --- Now-playing metadata hook -------------------------------------------
# POST track metadata to the API (cache now-playing + write PlayHistory). The
# annotate fields arrive here as metadata keys. The POST runs in its own thread
# (thread.run) so a slow/hung request can never block the streaming callback
# queue, and `data` is a one-shot getter that yields the body once then "" to
# correctly signal end-of-body. Attached to the AutoDJ source *before*
# crossfade, where each request produces a clean track boundary.
def on_track_meta(m) =
  title = m["title"]
  src = m["source"]
  payload =
    json.stringify(
      {
        title = title,
        artist = m["artist"],
        album = m["album"],
        track_id = m["track_id"],
        source = if src == "" then "autodj" else src end
      }
    )
  def task() =
    sent = ref(false)
    def body() =
      if sent() then "" else sent := true; payload end
    end
    response =
      http.post(
        meta_url,
        headers=
          [
            ("Content-Type", "application/json"),
            ("X-Internal-Secret", internal_secret)
          ],
        data=body
      )
    code = response.status_code
    log(level=3, "playout/metadata POST -> HTTP #{code} (#{title})")
  end
  thread.run(task)
end

autodj = request.dynamic(id="autodj", retry_delay=3., fetch_next)

# Per-track loudness normalization from Phase 1 ReplayGain (annotate
# `liq_amplify`, a linear factor). amplify reads it via its default override.
autodj = amplify(id="normalize", 1., override="liq_amplify", autodj)

# Report now-playing at each AutoDJ track change (pre-crossfade boundary).
autodj.on_track(on_track_meta)

# Smooth crossfades between consecutive tracks.
autodj =
  crossfade(
    id="autodj_xfade",
    duration=crossfade_dur,
    fade_in=crossfade_dur,
    fade_out=crossfade_dur,
    autodj
  )

# --- Emergency / dead-air failover ---------------------------------------
# If the DB rotation can't produce audio (API down, empty library, network
# blip) we fall back to a bundled playlist, then to mksafe blank — never dead
# air. mksafe makes the emergency source infallible.
emergency =
  playlist(
    id="emergency",
    mode="randomize",
    reload_mode="watch",
    emergency_dir
  )
emergency = mksafe(emergency)

# Failover chain. Live/request sources slot in ahead of autodj in later phases;
# today it is [autodj, emergency]. track_sensitive=false returns to a
# higher-priority source as soon as it is available again (immediate failover).
radio = fallback(id="radio", track_sensitive=false, [autodj, emergency])
radio = mksafe(radio)

# --- Output ---------------------------------------------------------------
output.icecast(
  %mp3(bitrate=128),
  host=icecast_host,
  port=icecast_port,
  password=source_password,
  mount="/stream",
  name="Radyo Klasik",
  description="Radyo Klasik — self-hosted AutoDJ",
  genre="Classical",
  radio
)

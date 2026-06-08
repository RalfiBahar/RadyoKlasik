# Radyo Klasik playout engine — Phase 2 (AutoDJ) + Phase 3 (request queue).
#
# - Rotation is driven by the control-plane DB: request.dynamic fetches each
#   next track from GET /api/v1/playout/next (which returns an `annotate:` URI).
#   When autopilot is OFF the API returns 404, so AutoDJ produces nothing.
# - Phase 3: an editable request queue (request.equeue, id="requests") is
#   spliced AHEAD of AutoDJ in the fallback chain, so operator-queued items play
#   before rotation resumes. The API pushes / removes / lists queued items over
#   the telnet command server and keeps a DB mirror (QueueItem) in sync.
# - Loudness is normalized per-track using the ReplayGain computed at ingest
#   (Phase 1), carried in the `liq_amplify` annotation.
# - Tracks crossfade into each other.
# - A fallback chain guarantees there is never dead air: if neither queued nor
#   AutoDJ audio is available (e.g. autopilot off + empty queue, API down) a
#   bundled emergency playlist takes over, and mksafe streams blank as a last
#   resort.
# - On each new track, on_track POSTs metadata to /api/v1/playout/metadata so
#   the API caches now-playing and writes PlayHistory (source "request" for
#   queued items, carrying queue_item_id so the API can mark it as aired).
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

# --- Phase 4: live DJ harbor ---------------------------------------------
# The studio browser mic is bridged into Liquidsoap as an Icecast SOURCE on an
# input.harbor mount inside this container (Node runs ffmpeg: browser -> WS Opus
# -> ffmpeg -> icecast://.../live). The port lives on the private compose
# network only (NOT published to the host).
live_harbor_port = int_of_string(env_or("LIVE_HARBOR_PORT", "8005"))
live_harbor_user = env_or("LIVE_HARBOR_USER", "source")
live_harbor_password = env_or("LIVE_HARBOR_PASSWORD", "hackme-live")
# Seconds the harbor tolerates silence/stalls before declaring the source dead
# and failing back to AutoDJ (the configurable failback window).
live_harbor_timeout = float_of_string(env_or("LIVE_HARBOR_TIMEOUT", "10.0"))
# Harbor prebuffer (seconds). This is the dominant mic-to-air latency knob: the
# DJ's voice is delayed by roughly this much before it reaches the mixer. Phase
# A lowered it from 2.0 to 0.5 for tight, *consistent* live talk-over timing.
# Lower = tighter timing but less tolerant of network jitter (risk of dropouts);
# raise it again if the live mic stutters on a poor connection.
live_harbor_buffer = float_of_string(env_or("LIVE_HARBOR_BUFFER", "0.5"))
# Default voice-over duck level (portion of music amplitude kept under voice);
# overridden per-DJ at connect via the telnet interactive var.
live_duck_level = float_of_string(env_or("LIVE_DUCK_LEVEL", "0.25"))
# Cross/fade duration for the live mic fading in/out over the music.
live_fade = float_of_string(env_or("LIVE_FADE_DURATION", "0.8"))

next_url = "#{api_base}/api/v1/playout/next"
meta_url = "#{api_base}/api/v1/playout/metadata"
harbor_url = "#{api_base}/api/v1/playout/harbor"
airstate_url = "#{api_base}/api/v1/playout/airstate"

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
# Build an on_track handler that posts metadata with a fixed `source`. The
# `source` annotation key is NOT relied upon to round-trip through Liquidsoap
# (it does not), so the playout source is fixed per hook: "autodj" for rotation
# and "request" for the queue. queue_item_id (a custom annotate key) does
# round-trip, letting the API mark the matching QueueItem as aired.
def make_on_track(default_source) =
  def on_track_meta(m) =
    title = m["title"]
    payload =
      json.stringify(
        {
          title = title,
          artist = m["artist"],
          album = m["album"],
          track_id = m["track_id"],
          queue_item_id = m["queue_item_id"],
          source = default_source
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
  on_track_meta
end

autodj = request.dynamic(id="autodj", retry_delay=3., fetch_next)

# Per-track loudness normalization from Phase 1 ReplayGain (annotate
# `liq_amplify`, a linear factor). amplify reads it via its default override.
autodj = amplify(id="normalize", 1., override="liq_amplify", autodj)

# Report now-playing at each AutoDJ track change (pre-crossfade boundary).
autodj.on_track(make_on_track("autodj"))

# --- Request queue (Phase 3) ---------------------------------------------
# A request queue the API drives over telnet:
#   requests.push <uri>   -> enqueue (returns a request id / RID)
#   requests.queue        -> list pending RIDs (order)
#   requests.clear        -> drop all pending items (registered below)
# request.queue has no per-item removal over telnet, so the API treats its DB
# QueueItem table as the source of truth for order and rebuilds the Liquidsoap
# pending queue (clear + re-push in order) on remove/reorder. Items are pushed
# as `annotate:` URIs carrying source="request" and a queue_item_id, so the
# metadata hook reports them as requests and the API can mark the matching
# QueueItem as aired. Empty => fallible => AutoDJ resumes.
requests = request.queue(id="requests")

# Expose a clear command (request.queue only registers push/queue/skip). Uses
# the source's set_queue method to empty the user (secondary) queue so the API
# can rebuild it from its DB mirror.
def clear_requests(_) =
  requests.set_queue([])
  "Done."
end
server.register(
  namespace="requests",
  description="Clear all pending queued requests.",
  usage="clear",
  "clear",
  clear_requests
)

# Normalize queued items with the same ReplayGain override as rotation.
requests = amplify(id="req_normalize", 1., override="liq_amplify", requests)

# Report now-playing for queued items too (pre-crossfade boundary).
requests.on_track(make_on_track("request"))

# Queued items play ahead of rotation; when the queue empties, AutoDJ resumes.
# track_sensitive=false so a freshly-queued item takes over promptly.
program =
  fallback(id="program", track_sensitive=false, [requests, autodj])

# Smooth crossfades between consecutive tracks / source transitions. Applied
# above the per-source on_track hooks (which need clean pre-crossfade
# boundaries) but below the emergency failover.
program =
  crossfade(
    id="program_xfade",
    duration=crossfade_dur,
    fade_in=crossfade_dur,
    fade_out=crossfade_dur,
    program
  )

# --- Emergency / dead-air failover ---------------------------------------
# The emergency playlist is an AUTOMATION safety net: it covers AutoDJ gaps
# (API down, empty library) WHILE autopilot is on. When the operator turns
# autopilot OFF they want genuine off-air silence rather than the emergency
# bed, so emergency is gated by `autopilot_on` — an interactive bool the API
# mirrors over telnet (`var.set autopilot_on = true|false`) whenever autopilot
# toggles. With autopilot OFF and nothing queued/live, the chain falls through
# to mksafe blank (silence) instead of the emergency playlist.
autopilot_on = interactive.bool("autopilot_on", true)

emergency =
  playlist(
    id="emergency",
    mode="randomize",
    reload_mode="watch",
    emergency_dir
  )
# A single (predicate, source) switch is FALLIBLE when the predicate is false,
# so when autopilot is off the music fallback below skips emergency and reaches
# mksafe blank (silence). track_sensitive=false so flipping autopilot off drops
# the emergency bed promptly rather than waiting for the current clip to end.
emergency =
  switch(
    id="emergency_gate",
    track_sensitive=false,
    [({autopilot_on()}, emergency)]
  )

# Music failover chain: [program (requests -> autodj), emergency]. With
# autopilot on, emergency keeps the music bed alive (never dead air); with
# autopilot off + empty queue, the chain is fallible and mksafe streams blank
# (intentional off-air silence).
music = fallback(id="music", track_sensitive=false, [program, emergency])
music = mksafe(music)

# --- Dead-air detection (clears the studio deck) -------------------------
# When the music bed is genuinely silent (autopilot off + empty queue + no
# live), the now-playing cache would otherwise stay frozen on the last track,
# leaving a stale song on the studio deck. blank.detect watches the bed and
# tells the API to clear (on_blank) / restore (on_noise) now-playing so the UI
# deck empties on real off-air silence. Detection runs on the PRE-gain bed (the
# `music_gain` full-takeover cut is applied later) so muting music for a live
# takeover is NOT mistaken for dead air. threshold=-60 dB only ever trips on the
# mksafe blank (true silence ≈ -91 dB); real audio after ReplayGain never sits
# below it for max_blank seconds, so quiet passages won't falsely blank it.
def notify_air(silent) =
  payload = json.stringify({ silent = silent })
  def task() =
    sent = ref(false)
    def body() =
      if sent() then "" else sent := true; payload end
    end
    response =
      http.post(
        airstate_url,
        headers=
          [
            ("Content-Type", "application/json"),
            ("X-Internal-Secret", internal_secret)
          ],
        data=body
      )
    log(level=3, "playout/airstate silent=#{silent} -> HTTP #{response.status_code}")
  end
  thread.run(task)
end

music =
  blank.detect(
    id="dead_air",
    max_blank=2.5,
    min_noise=0.3,
    threshold=-60.,
    track_sensitive=false,
    on_noise=fun() -> notify_air(false),
    fun() -> notify_air(true),
    music
  )

# --- Phase 4: live DJ mix + voice-over ducking ---------------------------
# Two interactive (telnet-settable) controls drive the live behavior so the API
# can switch modes per session / per DJ without reloading the script:
#   live_music_gain  master music gain. 1.0 for voice-over/idle; the API sets
#                    it to 0.0 for FULL TAKEOVER (mic replaces music). The
#                    harbor on_disconnect handler resets it to 1.0 so AutoDJ
#                    resumes instantly on a dropped studio connection.
#   live_duck        smooth_add `p` = portion of music amplitude kept while the
#                    mic is talking (the per-DJ voice-over duck level). The API
#                    sets it from User.micPreferencesJson at connect.
music_gain = interactive.float(min=0., max=1., "live_music_gain", 1.)
live_duck = interactive.float(min=0., max=1., "live_duck", live_duck_level)
# Per-DJ input gain applied to the mic (from User.micPreferencesJson).
mic_gain = interactive.float(min=0., max=4., "live_mic_gain", 1.)

# Notify the API when the live SOURCE actually connects/disconnects (the
# authoritative "audio is flowing" signal, independent of the WS). Runs in a
# thread with a one-shot body getter (same gotcha-avoidance as the metadata
# hook: a constant `data` string hangs the callback queue).
def notify_harbor(event) =
  payload = json.stringify({ event = event })
  def task() =
    sent = ref(false)
    def body() =
      if sent() then "" else sent := true; payload end
    end
    response =
      http.post(
        harbor_url,
        headers=
          [
            ("Content-Type", "application/json"),
            ("X-Internal-Secret", internal_secret)
          ],
        data=body
      )
    log(level=3, "playout/harbor #{event} -> HTTP #{response.status_code}")
  end
  thread.run(task)
end

# The DJ mic, received as an Icecast SOURCE on the harbor mount "/live".
live =
  input.harbor(
    id="live",
    port=live_harbor_port,
    user=live_harbor_user,
    password=live_harbor_password,
      timeout=live_harbor_timeout,
      buffer=live_harbor_buffer,
    on_connect=
      fun(_) ->
        begin
          log(level=3, "live harbor: source connected")
          notify_harbor("connect")
        end,
    on_disconnect=
      fun() ->
        begin
          # Restore music instantly so a dropped studio never leaves dead air,
          # even mid full-takeover (music_gain was 0).
          music_gain.set(1.)
          log(level=3, "live harbor: source disconnected")
          notify_harbor("disconnect")
        end,
    "live"
  )

# Per-DJ input gain on the mic (override=null() so it is never clobbered by
# track metadata — the harbor stream carries none anyway).
live = amplify(id="mic_gain", override=null(), {mic_gain()}, live)

# Expose the live mic RMS (0..1) over telnet for studio:state level metering.
live = rms(id="live_rms", live)
def live_level(_) =
  lvl = live.rms()
  "#{lvl}"
end
server.register(
  namespace="studio",
  description="Current live mic RMS level (0..1).",
  usage="level",
  "level",
  live_level
)

# Master music gain (full-takeover cut). override=null so per-track liq_amplify
# normalization (already applied upstream) does NOT clobber this master gain.
music = amplify(id="music_gain", override=null(), {music_gain()}, music)

# Live mix: when the mic (special) has audio, music (normal) fades down to the
# duck level `p`; when the mic is silent, music returns to full. With
# music_gain=0 (full takeover) only the mic is heard. When the harbor is not
# connected, smooth_add simply streams the music bed (no dead air).
radio =
  smooth_add(
    duration=live_fade,
    p={live_duck()},
    normal=music,
    special=live
  )
radio = mksafe(radio)

# --- Output ---------------------------------------------------------------
# Explicit id so the API can `radio_out.skip` the current track regardless of
# which underlying source (live / requests / autodj / emergency) is on air.
output.icecast(
  id="radio_out",
  %mp3(bitrate=128),
  host=icecast_host,
  port=icecast_port,
  password=source_password,
  mount="/stream",
  name="Radyo Klasik",
  description="Radyo Klasik — self-hosted AutoDJ + Live",
  genre="Classical",
  radio
)

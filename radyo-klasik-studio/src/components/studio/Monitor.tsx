"use client";

import { useEffect, useRef, useState } from "react";
import { getStreamUrls, trackAudioUrl, type StreamUrls } from "@/lib/api";
import type { NowPlaying } from "@/lib/types";
import { Toggle } from "./TransportControls";

// Where the public stream lives. Dev sets NEXT_PUBLIC_STREAM_URL (Icecast on
// :8000); on the real server the API answers with stream.<domain>.
function envStreams(): StreamUrls | null {
  const mp3 = process.env.NEXT_PUBLIC_STREAM_URL;
  if (!mp3) return null;
  const base = mp3.replace(/\/stream$/, "");
  return { mp3, hd: `${base}/stream-hd`, low: `${base}/stream-low`, hls: `${base}/hls/live.m3u8` };
}

const QUALITIES: { key: "mp3" | "hd" | "low"; label: string }[] = [
  { key: "mp3", label: "MP3 128k" },
  { key: "hd", label: "HD (AAC 192k)" },
  { key: "low", label: "Low (64k)" },
];

// Two ways to listen in the studio:
//   LISTEN   — the public broadcast exactly as listeners hear it (incl. the
//              DJ's voice). It's buffered, so it runs several seconds late.
//   DECK OUT — the track on the deck, played from its file and kept in sync
//              with the deck position: near-zero delay, music only. Use this
//              to time talk-over. (One at a time, or you'd hear an echo.)
export default function Monitor({ nowPlaying }: { nowPlaying: NowPlaying | null }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [mode, setMode] = useState<"off" | "listen" | "deck">("off");
  const [quality, setQuality] = useState<"mp3" | "hd" | "low">("mp3");
  const [streams, setStreams] = useState<StreamUrls | null>(envStreams());
  const [volume, setVolume] = useState(0.8);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (streams) return;
    getStreamUrls()
      .then(setStreams)
      .catch(() => setError("Couldn't find the stream address"));
  }, [streams]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
  }, [volume]);

  const stop = () => {
    const el = audioRef.current;
    if (el) {
      el.pause();
      el.removeAttribute("src");
      el.load();
    }
    setMode("off");
  };

  const play = async (src: string, next: "listen" | "deck", seekTo?: number) => {
    const el = audioRef.current;
    if (!el) return;
    setError(null);
    el.src = src;
    el.volume = volume;
    if (seekTo != null) {
      el.addEventListener("loadedmetadata", () => (el.currentTime = Math.max(0, seekTo)), { once: true });
    }
    try {
      await el.play();
      setMode(next);
    } catch (err) {
      setMode("off");
      setError(
        next === "listen"
          ? `Can't play the broadcast (${streams?.[quality] ?? "no stream"}). Is the stream online?`
          : "Can't play the deck track."
      );
    }
  };

  const deckOffset = () =>
    nowPlaying?.startedAt ? (Date.now() - new Date(nowPlaying.startedAt).getTime()) / 1000 : 0;

  const toggleListen = () => {
    if (mode === "listen") return stop();
    if (!streams) return setError("Couldn't find the stream address");
    // Cache-bust so we always join the live point.
    play(`${streams[quality]}?t=${Date.now()}`, "listen");
  };

  const toggleDeck = () => {
    if (mode === "deck") return stop();
    if (!nowPlaying?.trackId) {
      setError("Nothing from the library is on the deck right now.");
      return;
    }
    play(trackAudioUrl(nowPlaying.trackId), "deck", deckOffset());
  };

  // Deck follows the deck: new track -> load it; drift -> re-seek.
  const trackId = nowPlaying?.trackId ?? null;
  useEffect(() => {
    if (mode !== "deck") return;
    if (!trackId) {
      stop();
      return;
    }
    play(trackAudioUrl(trackId), "deck", deckOffset());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackId, nowPlaying?.startedAt]);

  useEffect(() => {
    if (mode !== "deck") return;
    const id = setInterval(() => {
      const el = audioRef.current;
      const target = deckOffset();
      if (el && !el.paused && Math.abs(el.currentTime - target) > 1.5) el.currentTime = target;
    }, 5000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, nowPlaying?.startedAt]);

  // Changing quality while listening switches streams.
  useEffect(() => {
    if (mode === "listen" && streams) play(`${streams[quality]}?t=${Date.now()}`, "listen");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quality]);

  return (
    <div className="card space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-slate-100">Monitor</span>
        <button
          onClick={toggleListen}
          aria-pressed={mode === "listen"}
          aria-label="Listen monitor"
          className={`btn ${mode === "listen" ? "bg-emerald-600 text-white" : "btn-ghost"}`}
        >
          {mode === "listen" ? "◉ LISTEN ON" : "○ LISTEN"}
        </button>
      </div>
      <p className="text-[11px] leading-snug text-slate-500">
        LISTEN = the broadcast as listeners hear it (several seconds late). DECK OUT = the track on
        the deck with almost no delay (music only) — use it to time talk-over.
      </p>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Toggle label="Deck Out" on={mode === "deck"} onClick={toggleDeck} />
        <select
          className="input w-auto py-1 text-xs"
          value={quality}
          onChange={(e) => setQuality(e.target.value as typeof quality)}
          aria-label="Broadcast quality"
          disabled={mode === "deck"}
        >
          {QUALITIES.map((q) => (
            <option key={q.key} value={q.key}>
              {q.label}
            </option>
          ))}
        </select>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs text-slate-500">Vol</span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={volume}
          onChange={(e) => setVolume(Number(e.target.value))}
          className="w-full accent-brand"
          aria-label="Monitor volume"
        />
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <audio ref={audioRef} preload="none" onError={() => mode !== "off" && setError("Playback stopped: the audio couldn't be loaded.")} />
    </div>
  );
}

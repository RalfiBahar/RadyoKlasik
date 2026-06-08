"use client";

import { useEffect, useRef, useState } from "react";
import { Toggle } from "./TransportControls";

const STREAM_URL =
  process.env.NEXT_PUBLIC_STREAM_URL || "http://localhost:8000/stream";

// LISTEN monitor: plays the live air feed so the operator can hear what's going
// out. Deck Out mutes the monitor; volume controls local playback only.
export default function Monitor() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [listening, setListening] = useState(false);
  const [deckOut, setDeckOut] = useState(false);
  const [volume, setVolume] = useState(0.8);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    el.volume = deckOut ? 0 : volume;
  }, [volume, deckOut]);

  const toggleListen = async () => {
    const el = audioRef.current;
    if (!el) return;
    if (listening) {
      el.pause();
      setListening(false);
    } else {
      // Cache-bust so we always join the live point.
      el.src = `${STREAM_URL}?t=${Date.now()}`;
      try {
        await el.play();
        setListening(true);
      } catch {
        setListening(false);
      }
    }
  };

  return (
    <div className="card space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-slate-100">Monitor</span>
        <button
          onClick={toggleListen}
          aria-pressed={listening}
          aria-label="Listen monitor"
          className={`btn ${listening ? "bg-emerald-600 text-white" : "btn-ghost"}`}
        >
          {listening ? "◉ LISTEN ON" : "○ LISTEN"}
        </button>
      </div>
      <p className="text-[11px] leading-snug text-slate-500">
        Confidence check of the public broadcast — delayed several seconds. Do
        NOT use it to time talk-over; use the cue marker on the deck instead.
      </p>
      <div className="flex items-center justify-between">
        <Toggle label="Deck Out" on={deckOut} onClick={() => setDeckOut((d) => !d)} />
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">Vol</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={volume}
            onChange={(e) => setVolume(Number(e.target.value))}
            className="w-28 accent-brand"
            aria-label="Monitor volume"
          />
        </div>
      </div>
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <audio ref={audioRef} preload="none" />
    </div>
  );
}

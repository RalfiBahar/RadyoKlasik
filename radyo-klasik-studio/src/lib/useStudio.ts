"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  getPlayoutStatus,
  getQueue,
  getStudioState,
} from "./api";
import { subscribeStudio } from "./ws";
import { useAuth } from "./auth";
import type { PlayoutStatus, QueueState, StudioState } from "./types";

// Combines the studio's live data sources:
//   - GET /api/v1/queue + WS queue:update -> queue panel + now-playing
//   - GET /api/v1/studio/session + WS studio:state -> ON AIR / mode / levels
//   - poll GET /api/v1/playout/status -> listeners / autopilot / source
export function useStudioRealtime() {
  const { token } = useAuth();
  const [queue, setQueue] = useState<QueueState | null>(null);
  const [studio, setStudio] = useState<StudioState | null>(null);
  const [status, setStatus] = useState<PlayoutStatus | null>(null);
  const [connected, setConnected] = useState(false);
  const tokenRef = useRef(token);
  tokenRef.current = token;

  const refreshQueue = useCallback(async () => {
    try {
      setQueue(await getQueue());
    } catch {
      // best-effort
    }
  }, []);

  const refreshStudio = useCallback(async () => {
    try {
      setStudio(await getStudioState());
    } catch {
      // best-effort
    }
  }, []);

  const refreshStatus = useCallback(async () => {
    try {
      setStatus(await getPlayoutStatus());
    } catch {
      // best-effort
    }
  }, []);

  useEffect(() => {
    refreshQueue();
    refreshStudio();
    refreshStatus();
    const statusTimer = setInterval(refreshStatus, 5000);

    const dispose = subscribeStudio(
      (msg) => {
        if (msg.event === "queue:update") {
          setQueue(msg.data as QueueState);
        } else if (msg.event === "studio:state") {
          setStudio(msg.data as StudioState);
        }
      },
      {
        token: tokenRef.current,
        onOpen: () => setConnected(true),
        onClose: () => setConnected(false),
      }
    );

    return () => {
      clearInterval(statusTimer);
      dispose();
    };
  }, [refreshQueue, refreshStudio, refreshStatus]);

  return {
    queue,
    studio,
    status,
    connected,
    refreshQueue,
    refreshStudio,
    refreshStatus,
  };
}

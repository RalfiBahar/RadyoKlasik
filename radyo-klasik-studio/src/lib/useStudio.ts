"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  getLiveAccess,
  getPlayoutStatus,
  getQueue,
  getScheduleNow,
  getStudioState,
} from "./api";
import { subscribeStudio } from "./ws";
import { useAuth } from "./auth";
import type {
  LiveAccess,
  PlayoutStatus,
  QueueState,
  ScheduleNow,
  StudioState,
} from "./types";

// Combines the studio's live data sources:
//   - GET /api/v1/queue + WS queue:update -> queue panel + now-playing
//   - GET /api/v1/studio/session + WS studio:state -> ON AIR / mode / levels
//   - poll GET /api/v1/playout/status -> listeners / autopilot / source
//   - GET /api/v1/schedule/now + WS schedule:now -> current show (Phase 7),
//     re-checking whether this user may go live when it changes
export function useStudioRealtime() {
  const { token } = useAuth();
  const [queue, setQueue] = useState<QueueState | null>(null);
  const [studio, setStudio] = useState<StudioState | null>(null);
  const [status, setStatus] = useState<PlayoutStatus | null>(null);
  const [connected, setConnected] = useState(false);
  const [schedule, setSchedule] = useState<ScheduleNow | null>(null);
  const [access, setAccess] = useState<LiveAccess | null>(null);
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

  const refreshAccess = useCallback(async () => {
    try {
      setAccess(await getLiveAccess());
    } catch {
      // best-effort
    }
  }, []);

  useEffect(() => {
    refreshQueue();
    refreshStudio();
    refreshStatus();
    refreshAccess();
    getScheduleNow()
      .then(setSchedule)
      .catch(() => {});
    const statusTimer = setInterval(refreshStatus, 5000);

    const dispose = subscribeStudio(
      (msg) => {
        if (msg.event === "queue:update") {
          setQueue(msg.data as QueueState);
        } else if (msg.event === "studio:state") {
          setStudio(msg.data as StudioState);
        } else if (msg.event === "schedule:now") {
          setSchedule(msg.data as ScheduleNow);
          refreshAccess();
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
  }, [refreshQueue, refreshStudio, refreshStatus, refreshAccess]);

  return {
    queue,
    studio,
    status,
    connected,
    schedule,
    access,
    refreshQueue,
    refreshStudio,
    refreshStatus,
  };
}

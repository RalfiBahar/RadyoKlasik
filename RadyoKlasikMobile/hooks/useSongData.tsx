import { useState, useEffect, useCallback } from "react";
import { SongData } from "../types";

const useSongData = (apiUrl: string, intervalTime: number = 5000) => {
  const [songData, setSongData] = useState<SongData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState<boolean>(false);

  const fetchSongData = async () => {
    try {
      const response = await fetch(apiUrl);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      setSongData({
        id: "1",
        title: data.title,
        artist: data.artist,
        thumb: data.thumb,
        duration: parseInt(data.duration),
      });
    } catch (err) {
      console.error("Failed to fetch song data", err);
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("An unknown error occurred");
      }
    }
  };

  const triggerRetry = useCallback(() => {
    setRetry((prev) => !prev);
  }, []);

  useEffect(() => {
    fetchSongData();
    const interval = setInterval(fetchSongData, intervalTime);
    return () => clearInterval(interval);
  }, [apiUrl, retry, intervalTime]);

  return { songData, error, triggerRetry };
};

export default useSongData;

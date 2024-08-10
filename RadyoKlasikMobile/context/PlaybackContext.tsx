import React, {
  createContext,
  useState,
  useContext,
  ReactNode,
  useEffect,
} from "react";
import TrackPlayer, {
  Capability,
  Event,
  State,
  usePlaybackState,
} from "react-native-track-player";
import { SongData } from "../types";
import { getRedirectedUrl } from "../helpers/getRedirectedUrl";
import { EXPO_PUBLIC_API_URL } from "@env";

interface PlaybackContextProps {
  isPlaying: boolean;
  setIsPlaying: (isPlaying: boolean) => void;
  isPlayerSetup: boolean;
  setIsPlayerSetup: (isPlaying: boolean) => void;
  isFinished: boolean;
  setIsFinished: (isFinished: boolean) => void;
  resetTrack: () => Promise<void>;
  setupPlayer: () => Promise<void>;
  playAudio: (
    audioUrl: string,
    songData: SongData,
    isRecording: boolean
  ) => Promise<void>;
  isLoading: boolean;
}

const PlaybackContext = createContext<PlaybackContextProps | undefined>(
  undefined
);

export const usePlayback = () => {
  const context = useContext(PlaybackContext);
  if (!context) {
    throw new Error("usePlayback must be used within a PlaybackProvider");
  }
  return context;
};

interface PlaybackProviderProps {
  children: ReactNode;
}

export const PlaybackProvider = ({ children }: PlaybackProviderProps) => {
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isFinished, setIsFinished] = useState<boolean>(false);
  const [isPlayerSetup, setIsPlayerSetup] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const playbackState = usePlaybackState();

  const setupPlayer = async () => {
    try {
      await TrackPlayer.setupPlayer();
      await TrackPlayer.updateOptions({
        capabilities: [Capability.Play, Capability.Pause, Capability.Stop],
        notificationCapabilities: [
          Capability.Play,
          Capability.Pause,
          Capability.Stop,
        ],
      });
      console.log("Setting Up");
      setIsPlayerSetup(true);
    } catch (error) {
      console.log(error);
    }
  };

  const resetTrack = async () => {
    try {
      await TrackPlayer.reset();
      setIsPlaying(false);
      setIsFinished(true);
    } catch (error) {
      console.log(error);
    }
  };

  const playAudio = async (
    audioUrl: string,
    songData: SongData,
    isRecording: boolean
  ) => {
    setIsLoading(true);
    try {
      const activeTrack = await TrackPlayer.getActiveTrack();
      const activeTrackId = activeTrack?.id;
      const trackId = songData.id;

      let redirectedUrl = `${EXPO_PUBLIC_API_URL}/${audioUrl}`;
      console.log("REEEED", redirectedUrl);
      if (!isRecording) {
        redirectedUrl = await getRedirectedUrl(audioUrl);
      }

      if (activeTrackId === trackId) {
        // Same track is already playing
        if (playbackState.state === State.Playing) {
          if (isRecording) {
            await TrackPlayer.pause();
          } else {
            await TrackPlayer.stop();
          }
          setIsPlaying(false);
        } else {
          if (isFinished) {
            await TrackPlayer.reset();
            await TrackPlayer.add({
              id: trackId,
              url: redirectedUrl,
              title: songData.title,
              artist: songData.artist,
              duration: songData.duration,
              artwork: songData.thumb,
              isLiveStream: !isRecording,
            });
          }
          await TrackPlayer.play();
          setIsPlaying(true);
        }
      } else {
        // New track, reset and play
        await TrackPlayer.reset();
        await TrackPlayer.add({
          id: trackId,
          url: redirectedUrl,
          title: songData.title,
          artist: songData.artist,
          duration: songData.duration,
          artwork: songData.thumb,
          isLiveStream: !isRecording,
        });
        await TrackPlayer.play();
        setIsPlaying(true);
      }
    } catch (error) {
      console.error("Error playing audio:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePlaybackEnd = () => {
    setIsPlaying(false);

    TrackPlayer.addEventListener(Event.PlaybackQueueEnded, () => {
      setIsPlaying(false);
      setIsFinished(true);
    });

    TrackPlayer.addEventListener(
      Event.PlaybackTrackChanged,
      async ({ nextTrack }) => {
        if (nextTrack === null) {
          setIsPlaying(false);
          setIsFinished(true);
        }
      }
    );
  };

  useEffect(() => {
    if (!isPlayerSetup) {
      setupPlayer();
    }
    const listener = TrackPlayer.addEventListener(
      Event.PlaybackQueueEnded,
      handlePlaybackEnd
    );
    return () => {
      listener.remove();
    };
  }, []);

  return (
    <PlaybackContext.Provider
      value={{
        isPlaying,
        setIsPlaying,
        isFinished,
        setIsFinished,
        isPlayerSetup,
        setIsPlayerSetup,
        resetTrack,
        setupPlayer,
        playAudio,
        isLoading,
      }}
    >
      {children}
    </PlaybackContext.Provider>
  );
};

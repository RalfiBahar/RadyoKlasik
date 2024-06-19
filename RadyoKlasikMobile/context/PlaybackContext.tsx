import React, { createContext, useState, useContext, ReactNode } from "react";
import TrackPlayer from "react-native-track-player";

interface PlaybackContextProps {
  isPlaying: boolean;
  setIsPlaying: (isPlaying: boolean) => void;
  isPlayerSetup: boolean;
  setIsPlayerSetup: (isPlaying: boolean) => void;
  isFinished: boolean;
  setIsFinished: (isPlaying: boolean) => void;
  resetTrack: () => Promise<void>;
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

  const resetTrack = async () => {
    try {
      await TrackPlayer.reset();
      setIsPlaying(false);
      setIsFinished(true);
    } catch (error) {
      console.log(error);
    }
  };

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
      }}
    >
      {children}
    </PlaybackContext.Provider>
  );
};

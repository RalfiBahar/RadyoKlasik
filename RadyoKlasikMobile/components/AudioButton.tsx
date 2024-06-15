import React, { useEffect, useState } from "react";
import {
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Text,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import TrackPlayer, {
  usePlaybackState,
  State,
  Capability,
  useProgress,
} from "react-native-track-player";
import { SongData } from "../types";
import { getRedirectedUrl } from "../helpers/getRedirectedUrl";

const BLUE = "#4A8EDB";

interface AudioButtonProps {
  audioUrl: string;
  songData: SongData;
}

const AudioButton = ({ audioUrl, songData }: AudioButtonProps) => {
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
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
      console.log("here");
    } catch (error) {
      console.log(error);
    }
  };

  const playAudio = async () => {
    setIsLoading(true);
    try {
      if (playbackState.state == State.Playing) {
        await TrackPlayer.stop();
        setIsPlaying(false);
      } else if (
        playbackState.state === State.Paused ||
        playbackState.state === State.Stopped
      ) {
        await TrackPlayer.play();
        setIsPlaying(true);
      } else {
        await TrackPlayer.reset();
        const redirectedUrl = await getRedirectedUrl(audioUrl);
        await TrackPlayer.add({
          id: "0",
          url: redirectedUrl,
          title: songData.title,
          artist: songData.artist,
          duration: songData.duration,
          artwork: songData.thumb,
          isLiveStream: true,
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

  useEffect(() => {
    setupPlayer();
  }, []);

  return (
    <TouchableOpacity style={styles.button} onPress={playAudio}>
      {isLoading ? (
        <ActivityIndicator size="large" color="#6b7280" />
      ) : (
        <Feather
          name={isPlaying ? "stop-circle" : "play-circle"}
          size={80}
          color={BLUE}
        />
      )}
    </TouchableOpacity>
  );
};

export default AudioButton;

const styles = StyleSheet.create({
  button: {
    height: 100,
    width: 100,
    borderRadius: 50,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "transparent",
    borderWidth: 4,
    borderColor: "#e5e7eb",
    marginHorizontal: 5,
  },
});

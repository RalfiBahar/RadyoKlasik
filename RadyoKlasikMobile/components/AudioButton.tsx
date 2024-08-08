import React, { useEffect, useState } from "react";
import {
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import TrackPlayer, {
  usePlaybackState,
  State,
  Capability,
  useProgress,
  Event,
} from "react-native-track-player";
import { SongData } from "../types";
import { getRedirectedUrl } from "../helpers/getRedirectedUrl";
import { EXPO_PUBLIC_API_URL } from "@env";
import { usePlayback } from "../context/PlaybackContext";
import ProgressBar from "./ProgressBar";
import theme from "../styles/theme";

interface AudioButtonProps {
  audioUrl: string;
  songData: SongData;
  isRecording: boolean;
}

const AudioButton = ({ audioUrl, songData, isRecording }: AudioButtonProps) => {
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const playbackState = usePlaybackState();
  const { width, height } = useWindowDimensions();
  const {
    isPlaying,
    setIsPlaying,
    isFinished,
    setIsFinished,
    isPlayerSetup,
    setIsPlayerSetup,
  } = usePlayback();

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

  const playAudio = async () => {
    setIsLoading(true);
    try {
      const activeTrack = await TrackPlayer.getActiveTrack();
      const activeTrackId = activeTrack?.id;
      const trackId = songData.id;

      //console.log(progress.position / progress.duration);
      //console.log(activeTrack?.url, "cu");

      let redirectedUrl = `${EXPO_PUBLIC_API_URL}/${audioUrl}`;
      console.log("REEEED", redirectedUrl);
      if (!isRecording) {
        redirectedUrl = await getRedirectedUrl(audioUrl);
      }
      //console.log(isFinished);
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
    <View style={[styles.container, { width: width * 0.8 }]}>
      <TouchableOpacity style={styles.button} onPress={playAudio}>
        {isLoading ? (
          <ActivityIndicator size="large" color="#6b7280" />
        ) : (
          <Feather
            name={isPlaying ? "stop-circle" : "play-circle"}
            size={80}
            color={theme.colors.BLUE}
          />
        )}
      </TouchableOpacity>
      {isRecording && <ProgressBar />}
    </View>
  );
};

export default AudioButton;

const styles = StyleSheet.create({
  container: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
  },
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

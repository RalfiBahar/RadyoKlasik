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
} from "react-native-track-player";
import { SongData } from "../types";
import { getRedirectedUrl } from "../helpers/getRedirectedUrl";
import { API_URL } from "@env";

const BLUE = "#4A8EDB";

interface AudioButtonProps {
  audioUrl: string;
  songData: SongData;
  isRecording: boolean;
}

const AudioButton = ({ audioUrl, songData, isRecording }: AudioButtonProps) => {
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const playbackState = usePlaybackState();
  let progress = useProgress();
  const { width, height } = useWindowDimensions();

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
      const activeTrack = await TrackPlayer.getActiveTrack();
      const currentTrackUrl = activeTrack?.url;
      //console.log(progress.position / progress.duration);

      //console.log(currentTrackUrl, "cu");

      let redirectedUrl = `${API_URL}${audioUrl}`;
      if (!isRecording) {
        redirectedUrl = await getRedirectedUrl(audioUrl);
      }

      if (currentTrackUrl === redirectedUrl) {
        // Same track is already playing
        if (playbackState.state === State.Playing) {
          if (isRecording) {
            await TrackPlayer.pause();
          } else {
            await TrackPlayer.stop();
          }
          setIsPlaying(false);
        } else {
          await TrackPlayer.play();
          setIsPlaying(true);
        }
      } else {
        // New track, reset and play
        await TrackPlayer.reset();
        await TrackPlayer.add({
          id: "0",
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

  //TODO: Check if recording is done and upadte button state
  //TODO: Create duration bar
  //TODO: Style

  const renderProgressBar = () => {
    const progressWidth = progress.duration
      ? (progress.position / progress.duration) * 100
      : 100;
    //console.log(`Progress: ${progress.position}/${progress.duration}`);
    return (
      <View style={styles.progressBarContainer}>
        <View
          style={[
            styles.progressBar,
            {
              width: `${progressWidth}%`,
            },
          ]}
        />
      </View>
    );
  };

  useEffect(() => {
    setupPlayer();
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
            color={BLUE}
          />
        )}
      </TouchableOpacity>
      {isRecording && renderProgressBar()}
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
  progressBarContainer: {
    display: "flex",
    height: 10,
    width: "80%",
    backgroundColor: "#e0e0e0",
    borderRadius: 5,
    marginTop: 10,
  },
  progressBar: {
    height: "100%",
    backgroundColor: BLUE,
    borderRadius: 5,
  },
});

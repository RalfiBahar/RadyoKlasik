import React from "react";
import {
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  View,
  useWindowDimensions,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { usePlayback } from "../context/PlaybackContext";
import { SongData } from "../types";
import ProgressBar from "./ProgressBar";
import theme from "../styles/theme";

interface AudioButtonProps {
  audioUrl: string;
  songData: SongData;
  isRecording: boolean;
}

const AudioButton = ({ audioUrl, songData, isRecording }: AudioButtonProps) => {
  const { width } = useWindowDimensions();
  const { isPlaying, playAudio, isPlayerSetup, isLoading } = usePlayback();

  const handlePress = () => {
    if (isPlayerSetup) {
      playAudio(audioUrl, songData, isRecording);
    }
  };

  return (
    <View style={[styles.container, { width: width * 0.8 }]}>
      <TouchableOpacity style={styles.button} onPress={handlePress}>
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

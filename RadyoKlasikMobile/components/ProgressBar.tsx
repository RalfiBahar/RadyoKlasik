import React from "react";
import { StyleSheet, View, Text } from "react-native";
import Slider from "@react-native-community/slider";
import { formatTime } from "../helpers/formatTime";
import TrackPlayer, { useProgress } from "react-native-track-player";
import theme from "../styles/theme";

interface ProgressBarProps {
  initialDuration: string;
}

const ProgressBar: React.FC<ProgressBarProps> = ({ initialDuration }) => {
  let progress = useProgress();

  return (
    <View style={styles.progressBarContainer}>
      <Text style={{ fontSize: 20, textAlign: "left" }}>
        {formatTime(progress.position)}
      </Text>
      <Slider
        style={{ width: "100%", height: 40 }}
        minimumValue={0}
        maximumValue={progress.duration}
        value={progress.position}
        minimumTrackTintColor={theme.colors.BLUE}
        maximumTrackTintColor="#000000"
        onSlidingComplete={(value) => TrackPlayer.seekTo(value)}
        thumbTintColor={theme.colors.BLUE}
      />
      <Text style={{ fontSize: 20, textAlign: "right" }}>
        {progress.duration ? formatTime(progress.duration) : initialDuration}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  progressBarContainer: {
    display: "flex",
    height: 60,
    width: "90%",
    borderRadius: 5,
    marginTop: 10,
  },
  progressBar: {
    height: "50%",
    backgroundColor: theme.colors.BLUE,
    borderRadius: 5,
  },
});

export default ProgressBar;

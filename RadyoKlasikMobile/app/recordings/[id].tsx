import React from "react";
import { View, Text, Image, StyleSheet, TouchableOpacity } from "react-native";
import { Link, useLocalSearchParams } from "expo-router";
import { API_URL } from "@env";
import AudioButton from "../../components/AudioButton";
import { useRecordings } from "../../context/RecordingsContext";
import { usePlayback } from "../../context/PlaybackContext";
import { BackgroundImage } from "../../components";
import { Feather } from "@expo/vector-icons";

const Recording = () => {
  const { id } = useLocalSearchParams();
  const { recordings } = useRecordings();
  const { resetTrack } = usePlayback();

  const recording = recordings.find((r) => r.id === id);

  if (!recording) {
    return (
      <View style={styles.loader}>
        <Text>Loading...</Text>
      </View>
    );
  }

  const songData = {
    id: recording.id,
    title: recording.title,
    artist: recording.artist,
    duration: recording.duration,
    thumb: `${API_URL}/${recording.artwork}`,
  };

  return (
    <View style={styles.container}>
      <BackgroundImage />
      <Link style={styles.backButton} href="/recordings" onPress={resetTrack}>
        <Feather name="arrow-left" size={24} color="black" />
        <Text style={styles.backButtonText}>Back</Text>
      </Link>
      <Image
        source={{ uri: `${API_URL}/${recording.artwork}` }}
        style={styles.artwork}
      />
      <View style={styles.details}>
        <Text style={styles.title}>{recording.title}</Text>
        <Text style={styles.artist}>{recording.artist}</Text>
        <Text style={styles.date}>
          {new Date(recording.date).toLocaleDateString()}
        </Text>
        <AudioButton
          audioUrl={recording.stream}
          songData={songData}
          isRecording={true}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  loader: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    height: "100%",
  },
  artwork: {
    width: 200,
    height: 200,
    borderRadius: 10,
    marginBottom: 20,
  },
  details: {
    alignItems: "center",
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 10,
  },
  artist: {
    fontSize: 18,
    color: "#666",
    marginBottom: 10,
  },
  date: {
    fontSize: 16,
    color: "#aaa",
    marginBottom: 20,
  },
  backButton: {
    position: "absolute",
    top: 40,
    left: 20,
    flexDirection: "row",
    alignItems: "center",
  },
  backButtonText: {
    fontSize: 18,
    marginLeft: 5,
  },
});

export default Recording;

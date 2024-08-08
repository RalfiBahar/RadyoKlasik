import React, { useEffect, useState } from "react";
import { View, Text, Image, StyleSheet, StatusBar } from "react-native";
import { Link, useLocalSearchParams } from "expo-router";
import { EXPO_PUBLIC_API_URL } from "@env";
import AudioButton from "../../components/AudioButton";
import { useRecordings } from "../../context/RecordingsContext";
import { usePlayback } from "../../context/PlaybackContext";
import { BackgroundImage } from "../../components";
import { Feather } from "@expo/vector-icons";
import { useBackButtonHandler } from "../../hooks/useBackButtonHandler";
import theme from "../../styles/theme";
import AsyncStorage from "@react-native-async-storage/async-storage";

const Recording = () => {
  const { id } = useLocalSearchParams();
  const { recordings } = useRecordings();
  const { resetTrack } = usePlayback();
  const [token, setToken] = useState<string | null>(null);
  useBackButtonHandler();

  const recording = recordings.find((r) => r.id === id);

  useEffect(() => {
    const getToken = async () => {
      try {
        const storedToken = await AsyncStorage.getItem("token");
        setToken(storedToken);
      } catch (error) {
        console.error("Failed to fetch token", error);
      }
    };
    getToken();
  }, []);

  if (!recording || !token) {
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
    thumb: `${EXPO_PUBLIC_API_URL}/${recording.artwork}`,
  };

  const streamWithToken = `${recording.stream}?token=${token}`;
  console.log(streamWithToken);
  return (
    <View style={styles.container}>
      <BackgroundImage />
      <Link style={styles.backButton} href="/recordings" onPress={resetTrack}>
        <Feather name="arrow-left" size={24} color="black" />
        <Text style={styles.backButtonText}>Back</Text>
      </Link>
      <Image source={{ uri: songData.thumb }} style={styles.artwork} />
      <View style={styles.details}>
        <Text style={styles.title}>{recording.title}</Text>
        <Text style={styles.artist}>{recording.artist}</Text>
        {/*<Text style={styles.date}>
          {new Date(recording.date).toLocaleDateString()}
  </Text>*/}
        <AudioButton
          audioUrl={streamWithToken}
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
    color: theme.colors.TEXT_BLACK,
  },
  artist: {
    fontSize: 18,
    color: theme.colors.SUBTITLE_GRAY, //"#666",
    marginBottom: 10,
  },
  date: {
    fontSize: 16,
    color: "#aaa",
    marginBottom: 20,
  },
  backButton: {
    position: "absolute",
    top: (StatusBar.currentHeight || 20) + 20,
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

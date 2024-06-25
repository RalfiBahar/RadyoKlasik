// app/recordings/index.tsx
import React, { useEffect, useState } from "react";
import {
  StyleSheet,
  View,
  FlatList,
  ActivityIndicator,
  SafeAreaView,
  Text,
} from "react-native";
import { Link } from "expo-router";
import RecordingItem from "../../components/RecordingItem";
import { API_URL } from "@env";
import { useRecordings } from "../../context/RecordingsContext";
import { usePlayback } from "../../context/PlaybackContext";
import { BackgroundImage } from "../../components";
import { Feather } from "@expo/vector-icons";
import { fetchWithAuth } from "../../helpers/token";

const RecordingList = () => {
  const { recordings, setRecordings } = useRecordings();
  const { resetTrack } = usePlayback();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchWithAuth(`${API_URL}/recording/recordings`)
      .then((response) => response.json())
      .then((data) => {
        setRecordings(data.recordings);
        setLoading(false);
      })
      .catch((error) => {
        console.error(error);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator size="large" color="#0000ff" />
      </View>
    );
  }

  return (
    <SafeAreaView>
      <BackgroundImage />
      <Link style={styles.backButton} href="/" onPress={() => resetTrack}>
        <Feather name="arrow-left" size={24} color="black" />
        <Text style={styles.backButtonText}>Live</Text>
      </Link>
      <Text style={styles.title}>Past Programs</Text>
      <FlatList
        data={recordings}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <Link href={`/recordings/${item.id}`} style={styles.link}>
            <RecordingItem recording={item} />
          </Link>
        )}
        contentContainerStyle={styles.list}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  loader: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  list: {
    padding: 10,
    display: "flex",
  },
  link: {
    flex: 1,
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
  title: {
    fontSize: 24,
    textAlign: "center",
    fontWeight: "bold",
  },
});

export default RecordingList;

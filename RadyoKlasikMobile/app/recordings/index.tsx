// app/recordings/index.tsx
import React, { useEffect, useState } from "react";
import {
  StyleSheet,
  View,
  FlatList,
  ActivityIndicator,
  SafeAreaView,
  Text,
  StatusBar,
} from "react-native";
import { Link } from "expo-router";
import RecordingItem from "../../components/RecordingItem";
import { EXPO_PUBLIC_API_URL } from "@env";
import { useRecordings } from "../../context/RecordingsContext";
import { usePlayback } from "../../context/PlaybackContext";
import { BackgroundImage, BackButton } from "../../components";
import { Feather } from "@expo/vector-icons";
import { fetchWithAuth } from "../../helpers/token";
import theme from "../../styles/theme";

const RecordingList = () => {
  const { recordingsLoaded, recordings, fetchRecordings } = useRecordings();
  const { resetTrack } = usePlayback();

  useEffect(() => {
    fetchRecordings();
  }, []);

  if (!recordingsLoaded) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator size="large" color="#0000ff" />
      </View>
    );
  }

  return (
    <SafeAreaView style={theme.globalStyles.AndroidSafeArea}>
      <BackButton href="/" text="Live" onPress={() => resetTrack} />
      <Text style={styles.title}>Past Programs</Text>
      <FlatList
        data={recordings}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <RecordingItem recording={item} />}
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
  title: {
    fontSize: 24,
    textAlign: "center",
    fontWeight: "bold",
  },
});

export default RecordingList;

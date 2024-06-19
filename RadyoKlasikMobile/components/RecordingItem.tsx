import React from "react";
import { StyleSheet, View, Text, Image } from "react-native";
import { API_URL } from "@env";

interface RecordingItemProps {
  recording: {
    album: string;
    artist: string;
    artwork: string;
    date: string;
    duration: number;
    filename: string;
    id: string;
    play_count: number;
    size: number;
    stream: string;
    title: string;
  };
}

const RecordingItem: React.FC<RecordingItemProps> = ({ recording }) => {
  return (
    <View style={styles.container}>
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
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: "100%",
    flexDirection: "row",
    marginBottom: 10,
    backgroundColor: "#fff",
    padding: 10,
    borderRadius: 5,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  artwork: {
    width: 50,
    height: 50,
    borderRadius: 10,
    marginRight: 10,
  },
  details: {
    flex: 1,
    justifyContent: "center",
  },
  title: {
    fontSize: 16,
    fontWeight: "bold",
  },
  artist: {
    fontSize: 14,
    color: "#666",
  },
  date: {
    fontSize: 12,
    color: "#aaa",
  },
});

export default RecordingItem;
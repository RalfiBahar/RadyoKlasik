import React, { useEffect, useState } from "react";
import {
  StyleSheet,
  View,
  SafeAreaView,
  Text,
  StatusBar,
  Image,
  Alert,
  useWindowDimensions,
  Button,
} from "react-native";
import {
  AudioButton,
  BackgroundImage,
  AlbumImage,
  LowerContainer,
  TextComponent,
  Gradient,
  LogoImage,
} from "../components";
import useSongData from "../hooks/useSongData";
import { Link } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { usePlayback } from "../context/PlaybackContext";
import "expo-asset";

export default function App() {
  const [reloadKey, setReloadKey] = useState<number>(0);
  const { songData, error } = useSongData(
    "https://www.radiojar.com/api/stations/bw66d94ksg8uv/now_playing/",
    reloadKey
  );
  const { width, height } = useWindowDimensions();
  const { resetTrack } = usePlayback();

  const reloadPage = () => {
    setReloadKey((prevKey) => prevKey + 1);
    console.log(reloadKey);
  };

  if (error) {
    return (
      <SafeAreaView style={styles.container}>
        <BackgroundImage />
        <LogoImage />

        <View
          style={{
            width: width * 0.8,
            height: height * 0.3,
            backgroundColor: "white",
            borderRadius: 20,
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          {/* do not show {error}*/}
          <Text style={styles.errorText}>
            Error: {error ? error + "," : ""} please try again later.
          </Text>
          <Button onPress={reloadPage} title="Reload" />
        </View>
      </SafeAreaView>
    );
  }

  if (!songData) {
    return (
      <SafeAreaView style={styles.container}>
        <BackgroundImage />
        <LogoImage />
        <Text style={styles.loadingText}>Loading...</Text>
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.container}>
      <BackgroundImage />
      <Gradient />
      <LogoImage />
      <AlbumImage imgAddress={songData.thumb} />

      <View style={styles.content}>
        <LowerContainer>
          <TextComponent variant="title">{songData.title}</TextComponent>
          <TextComponent variant="subtitle">{songData.artist}</TextComponent>
          <View style={styles.iconsContainer}>
            <AudioButton
              audioUrl="http://stream.radiojar.com/bw66d94ksg8uv"
              songData={songData}
              isRecording={false}
            />
          </View>
          <Link
            style={styles.recButton}
            href="/recordings"
            onPress={resetTrack}
          >
            <View style={styles.recView}>
              <Feather name="folder" size={24} color="black" />
              <Text>Archive</Text>
            </View>
          </Link>
        </LowerContainer>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    flexDirection: "column",
  },
  content: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 1,
  },
  loadingText: {
    fontSize: 22,
    color: "black",
  },
  errorText: {
    fontSize: 24,
    color: "black",
    fontWeight: "900",
  },
  iconsContainer: {
    display: "flex",
    flexDirection: "row",
    justifyContent: "center",
    padding: 10,
    marginTop: 30,
  },
  recButton: {
    position: "absolute",
    bottom: 40,
    left: 30,
    flexDirection: "row",
    alignItems: "center",
  },
  recView: {
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    alignItems: "center",
  },
});

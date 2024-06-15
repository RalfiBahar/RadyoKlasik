import React, { useEffect } from "react";
import {
  StyleSheet,
  View,
  SafeAreaView,
  Text,
  StatusBar,
  Image,
  Alert,
  useWindowDimensions,
} from "react-native";
import {
  AudioButton,
  BackgroundImage,
  AlbumImage,
  LowerContainer,
  TextComponent,
  Gradient,
  LogoImage,
} from "./components";
import useSongData from "./hooks/useSongData";

export default function App() {
  const { songData, error } = useSongData(
    "https://www.radiojar.com/api/stations/bw66d94ksg8uv/now_playing/"
  );
  const { width, height } = useWindowDimensions();

  /*
  useEffect(
    () => Alert.alert("The first time loading might take a while..."),
    []
  );
  */

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
          <Text style={styles.errorText}>Error: {error}, Try again later</Text>
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
            />
          </View>
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
    fontSize: 18,
    color: "gray",
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
});

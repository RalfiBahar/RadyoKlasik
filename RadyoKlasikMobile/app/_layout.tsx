// app/_layout.tsx
import React, { useEffect } from "react";
import { View } from "react-native";
import { Slot } from "expo-router";
import { RecordingsProvider } from "../context/RecordingsContext";
import { PlaybackProvider } from "../context/PlaybackContext";
import TrackPlayer from "react-native-track-player";
import { initializeToken } from "../helpers/token";

TrackPlayer.registerPlaybackService(() => require("../service"));

const Layout = () => {
  useEffect(() => {
    const init = async () => {
      await initializeToken();
    };
    console.log("running");

    init();
  }, []);
  return (
    <RecordingsProvider>
      <PlaybackProvider>
        <View style={{ flex: 1 }}>
          <Slot />
        </View>
      </PlaybackProvider>
    </RecordingsProvider>
  );
};

export default Layout;

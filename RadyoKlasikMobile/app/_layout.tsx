// app/_layout.tsx
import React, { useEffect } from "react";
import { View } from "react-native";
import { Slot } from "expo-router";
import { RecordingsProvider } from "../context/RecordingsContext";
import { PlaybackProvider } from "../context/PlaybackContext";
import TrackPlayer from "react-native-track-player";
import { initializeToken } from "../helpers/token";
import { vexo } from "vexo-analytics";

TrackPlayer.registerPlaybackService(() => require("../service"));

const Layout = () => {
  useEffect(() => {
    const init = async () => {
      await initializeToken();
      if (!__DEV__) {
        vexo("f5f002c3-5df4-4a9a-8f1f-e987e2c88727");
      }
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

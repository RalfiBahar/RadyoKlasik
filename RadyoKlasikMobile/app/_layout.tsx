import React, { useEffect } from "react";
import { View } from "react-native";
import { Slot } from "expo-router";
import { RecordingsProvider } from "../context/RecordingsContext";
import { PlaybackProvider } from "../context/PlaybackContext";
import TrackPlayer from "react-native-track-player";
import { initializeToken } from "../helpers/token";
import { EXPO_PUBLIC_VEXO_KEY } from "@env";
import { usePushNotifications } from "../hooks/usePushNotifications";
import { useNetworkStatus } from "../hooks/useNetworkStatus";
import { OfflinePlaceholder } from "../components";
import { vexo } from "vexo-analytics";
vexo(EXPO_PUBLIC_VEXO_KEY);

TrackPlayer.registerPlaybackService(() => require("../service"));

const Layout = () => {
  const { pushToken, notification } = usePushNotifications();
  const isConnected = useNetworkStatus();

  useEffect(() => {
    const init = async () => {
      await initializeToken();
    };
    console.log("running");

    init();
  }, []);

  if (!isConnected) {
    return <OfflinePlaceholder />;
  }

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

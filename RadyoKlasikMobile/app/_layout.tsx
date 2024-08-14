import React, { useEffect, useState } from "react";
import { View } from "react-native";
import { Slot } from "expo-router";
import { RecordingsProvider } from "../context/RecordingsContext";
import { PlaybackProvider, usePlayback } from "../context/PlaybackContext";
import TrackPlayer from "react-native-track-player";
import { initializeToken } from "../helpers/token";
import { EXPO_PUBLIC_VEXO_KEY } from "@env";
import { usePushNotifications } from "../hooks/usePushNotifications";
import { useNetworkStatus } from "../hooks/useNetworkStatus";
import { OfflinePlaceholder, BackgroundImage } from "../components";
import * as Linking from "expo-linking";
import { router } from "expo-router";
import { vexo } from "vexo-analytics";
import { LoadingScreen } from "../components";
vexo(EXPO_PUBLIC_VEXO_KEY);

TrackPlayer.registerPlaybackService(() => require("../service"));

const Layout = () => {
  const { pushToken, notification } = usePushNotifications();
  const isConnected = useNetworkStatus();
  const [tokenInitialized, setTokenInitialized] = useState(false);

  useEffect(() => {
    const init = async () => {
      await initializeToken();
      setTokenInitialized(true);
    };

    // console.log("running");

    init();
  }, []);

  if (!tokenInitialized) {
    return <LoadingScreen />;
  }

  if (!isConnected) {
    return <OfflinePlaceholder />;
  }

  return (
    <RecordingsProvider>
      <PlaybackProvider>
        <View style={{ flex: 1 }}>
          <Handlers />
          <BackgroundImage />
          <Slot />
        </View>
      </PlaybackProvider>
    </RecordingsProvider>
  );
};

const Handlers = () => {
  const { currentTrack, resetTrack } = usePlayback();

  useEffect(() => {
    const deepLinkHandler = (data: { url: string }) => {
      const parsedUrl = Linking.parse(data.url);

      if (
        parsedUrl.scheme === "trackplayer" &&
        parsedUrl.hostname === "notification.click"
      ) {
        const recordingId = currentTrack?.id;

        if (recordingId && recordingId != "1") {
          const recordingPageUrl = `/recordings/${recordingId}`;
          router.replace(recordingPageUrl);
        } else {
          router.replace("/");
        }
      }
    };

    const listener = Linking.addEventListener("url", deepLinkHandler);

    Linking.getInitialURL().then((url) => {
      if (url) {
        deepLinkHandler({ url });
      }
    });

    return () => {
      listener.remove();
    };
  }, [currentTrack]);

  return null;
};

export default Layout;

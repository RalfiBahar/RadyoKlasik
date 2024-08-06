import React, { useEffect, useState, useRef } from "react";
import { Platform } from "react-native";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { EXPO_PUBLIC_API_URL } from "@env";
import { fetchWithAuth } from "../helpers/token";
import AsyncStorage from "@react-native-async-storage/async-storage";

export interface PushNotificationState {
  pushToken?: Notifications.ExpoPushToken;
  notification?: Notifications.Notification;
}

const INITIALIZATION_KEY = "PUSH_NOTIFICATIONS_INITIALIZED";

export const usePushNotifications = (): PushNotificationState => {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: true,
      shouldShowAlert: true,
      shouldSetBadge: false,
    }),
  });

  const [pushToken, setPushToken] = useState<
    Notifications.ExpoPushToken | undefined
  >();
  const [notification, setNotification] = useState<
    Notifications.Notification | undefined
  >();

  const notificationListener = useRef<Notifications.Subscription>();
  const responseListener = useRef<Notifications.Subscription>();

  // TASK: Use async storage to make this run only once
  async function registerPushNotifications() {
    let token;
    if (Device.isDevice) {
      const { status: existingStatus } =
        await Notifications.getPermissionsAsync();

      let finalStatus = existingStatus;

      if (existingStatus !== "granted") {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
      if (finalStatus !== "granted") {
        alert("Failed to get push token for push notification");
        return;
      }
      token = await Notifications.getExpoPushTokenAsync({
        projectId: Constants.expoConfig?.extra?.eas.projectId,
      });

      if (token) {
        const tokenSaveRoute = `${EXPO_PUBLIC_API_URL}/notification/save_notification_token`;
        console.log(tokenSaveRoute);
        await fetchWithAuth(tokenSaveRoute, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ notification_token: token.data }),
        })
          .then((response) => {
            if (!response.ok) {
              throw new Error("Failed to save notification token");
            }
          })
          .catch((error) => {
            console.error("Error saving notification token:", error);
          });
      }
    } else {
      alert("Must be using a physical device for Push notifications");
    }

    if (Platform.OS === "android") {
      Notifications.setNotificationChannelAsync("default", {
        name: "default",
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: "#FF231F7C",
        lockscreenVisibility:
          Notifications.AndroidNotificationVisibility.PUBLIC,
        showBadge: true,
      });
    }

    return token;
  }

  useEffect(() => {
    const initialize = async () => {
      const isInitialized = await AsyncStorage.getItem(INITIALIZATION_KEY);

      if (!isInitialized) {
        const token = await registerPushNotifications();
        setPushToken(token);
        console.log("PushToken: ", token);
        await AsyncStorage.setItem(INITIALIZATION_KEY, "true");
      }

      notificationListener.current =
        Notifications.addNotificationReceivedListener((notification) => {
          setNotification(notification);
        });

      responseListener.current =
        Notifications.addNotificationResponseReceivedListener((response) => {
          console.log(response);
        });
    };

    initialize();

    return () => {
      if (notificationListener.current) {
        Notifications.removeNotificationSubscription(
          notificationListener.current
        );
      }

      if (responseListener.current) {
        Notifications.removeNotificationSubscription(responseListener.current);
      }
    };
  }, []);

  return {
    pushToken,
    notification,
  };
};

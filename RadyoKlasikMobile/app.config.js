export default {
  expo: {
    scheme: "radyoklasik",
    name: "Radyo Klasik",
    slug: "Radyo-Klasik",
    version: "1.0.0",
    orientation: "portrait",
    icon: "./assets/icon.png",
    userInterfaceStyle: "light",
    splash: {
      image: "./assets/splash.png",
      resizeMode: "contain",
      backgroundColor: "#ffffff",
    },
    updates: {
      fallbackToCacheTimeout: 0,
    },
    assetBundlePatterns: ["**/*"],
    ios: {
      supportsTablet: true,
      bundleIdentifier: "com.baharralfi.radyoklasik",
      buildNumber: "1.0.0",
      infoPlist: {
        UIBackgroundModes: ["audio"],
      },
    },
    android: {
      adaptiveIcon: {
        foregroundImage: "./assets/adaptive_icon.png",
        backgroundColor: "#FFFFFF",
      },
      package: "com.baharralfi.radyoklasik",
      versionCode: 1,
      permissions: ["WAKE_LOCK", "RECEIVE_BOOT_COMPLETED"],
      googleServicesFile: process.env.GOOGLE_SERVICES_JSON,
      useNextNotificationsApi: true,
    },
    notification: {
      icon: "./assets/notif_icon.png",
      iosDisplayInForeground: true,
    },
    web: {
      favicon: "./assets/favicon.png",
    },
    plugins: [
      "expo-router",
      [
        "expo-asset",
        {
          assets: [
            "./assets/adaptive_icon.png",
            "./assets/bg.png",
            "./assets/favicon.png",
            "./assets/icon.png",
            "./assets/logo.png",
            "./assets/splash.png",
            "./assets/notif_icon.png",
          ],
        },
      ],
    ],
    extra: {
      router: {
        origin: false,
      },
      eas: {
        projectId: "024de01d-c2fb-42c7-9a64-fe67eef6e173",
      },
    },
  },
};

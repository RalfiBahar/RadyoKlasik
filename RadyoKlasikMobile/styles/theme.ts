import { StyleSheet, Platform, StatusBar } from "react-native";

const colors = {
  BLUE: "#4A8EDB",
  TEXT_BLACK: "BLACK",
  SUBTITLE_GRAY: "#6a787a",
};

const spacing = {};

const fontSizes = {};

const globalStyles = StyleSheet.create({
  AndroidSafeArea: {
    paddingTop:
      Platform.OS === "android" ? (StatusBar.currentHeight || 0) + 20 : 0,
  },
});

export default {
  colors,
  spacing,
  fontSizes,
  globalStyles,
};

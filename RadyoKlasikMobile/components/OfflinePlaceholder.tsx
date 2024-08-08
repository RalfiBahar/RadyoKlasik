import React from "react";
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  useWindowDimensions,
} from "react-native";
import BackgroundImage from "./BackgroundImage";
import LogoImage from "./LogoImage";

interface OfflinePlaceholderProps {}

const OfflinePlaceholder: React.FC<OfflinePlaceholderProps> = () => {
  const { width, height } = useWindowDimensions();

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
        <Text style={styles.errorText}>No internet connection</Text>
      </View>
    </SafeAreaView>
  );
};

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

export default OfflinePlaceholder;

import React from "react";
import {
  SafeAreaView,
  Text,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import LogoImage from "./LogoImage";
import BackgroundImage from "./BackgroundImage";

interface LoadingScreenProps {}

const LoadingScreen: React.FC<LoadingScreenProps> = ({}) => {
  return (
    <SafeAreaView style={styles.container}>
      <BackgroundImage />
      <LogoImage />
      <ActivityIndicator size="large" color="#0000ff" />
      <Text style={styles.loadingText}>Loading...</Text>
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
});

export default LoadingScreen;

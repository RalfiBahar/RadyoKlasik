import React from "react";
import { StyleSheet, Text, StatusBar } from "react-native";
import { Feather } from "@expo/vector-icons";
import { Link } from "expo-router";

interface BackButtonProps {
  href: string;
  text: string;
  onPress(): void;
}

// Change this component to IconButton if needed for more general use case

const BackButton: React.FC<BackButtonProps> = ({ href, text, onPress }) => {
  return (
    <Link style={styles.backButton} href={href} onPress={onPress}>
      <Feather name="arrow-left" size={24} color="black" />
      <Text style={styles.backButtonText}>{text}</Text>
    </Link>
  );
};

const styles = StyleSheet.create({
  backButton: {
    position: "absolute",
    top: (StatusBar.currentHeight || 20) + 30,
    left: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1,
  },
  backButtonText: {
    fontSize: 18,
    marginLeft: 5,
    textAlign: "center",
  },
});

export default BackButton;

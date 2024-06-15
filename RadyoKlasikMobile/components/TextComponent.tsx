import React from "react";
import { Text, StyleSheet } from "react-native";
import { normalize } from "../helpers/normalize";

interface TextComponentProps {
  variant?: "title" | "subtitle";
  children: React.ReactNode;
}

const TextComponent: React.FC<TextComponentProps> = ({
  variant = "title",
  children,
}) => {
  const styles = variant === "title" ? textStyles.title : textStyles.subtitle;

  return <Text style={styles}>{children}</Text>;
};

const textStyles = StyleSheet.create({
  title: {
    textAlign: "left",
    backgroundColor: "transparent",
    fontSize: normalize(20),
    padding: 10,
    color: "black",
    fontWeight: "bold",
  },
  subtitle: {
    textAlign: "left",
    backgroundColor: "transparent",
    fontSize: normalize(18),
    padding: 10,
    color: "#6a787a",
    fontWeight: "700",
  },
});

export default TextComponent;

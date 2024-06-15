import React from "react";
import { StyleSheet, Dimensions } from "react-native";
import { LinearGradient } from "expo-linear-gradient";

const WIDTH = Dimensions.get("screen").width;
const HEIGHT = Dimensions.get("screen").height;

const Gradient: React.FC = () => {
  return (
    <>
      <LinearGradient colors={["white", "white"]} style={styles.gradient} />
    </>
  );
};

const styles = StyleSheet.create({
  gradient: {
    position: "absolute",
    width: WIDTH,
    height: HEIGHT * 0.4,
    bottom: 0,
    borderTopLeftRadius: 40,
    borderTopRightRadius: 40,
  },
});

export default Gradient;

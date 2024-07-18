import React from "react";
import { Dimensions, Image, StyleSheet } from "react-native";

const WIDTH = Dimensions.get("screen").width;
const HEIGHT = Dimensions.get("screen").height;

const BackgroundImage = () => {
  return (
    <Image
      style={styles.backgroundImage}
      source={require("../assets/bg.png")}
    />
  );
};

const styles = StyleSheet.create({
  backgroundImage: {
    height: HEIGHT,
    width: WIDTH,
    position: "absolute",
    zIndex: -1,
    resizeMode: "cover",
  },
});

export default BackgroundImage;

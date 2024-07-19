import React from "react";
import { StyleSheet, Dimensions, Image } from "react-native";

const WIDTH = Dimensions.get("screen").width;
const HEIGHT = Dimensions.get("screen").height;

const LogoImage: React.FC = () => {
  return (
    <Image
      style={{
        width: WIDTH * 0.6,
        height: WIDTH * 0.4,
        resizeMode: "contain",
        marginTop: HEIGHT * 0.05,
      }}
      source={require("../assets/logo.png")}
    />
  );
};

const styles = StyleSheet.create({});

export default LogoImage;

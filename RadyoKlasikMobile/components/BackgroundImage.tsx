import React, { useState, useEffect } from "react";
import { Dimensions, Image, StyleSheet } from "react-native";
import { Asset } from "expo-asset";

const WIDTH = Dimensions.get("screen").width;
const HEIGHT = Dimensions.get("screen").height;

const BackgroundImage = () => {
  const [backgroundImage, setBackgroundImage] = useState<string | null>(null);

  useEffect(() => {
    const loadAsset = async () => {
      const [image] = await Asset.loadAsync(require("../assets/bg.png"));
      setBackgroundImage(image.localUri || image.uri);
    };

    loadAsset();
  }, []);

  return (
    backgroundImage && (
      <Image style={styles.backgroundImage} source={{ uri: backgroundImage }} />
    )
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

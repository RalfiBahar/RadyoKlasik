import React from "react";
import { Image, StyleSheet, View, Dimensions } from "react-native";

const HEIGHT = Dimensions.get("screen").height;

interface AlbumImageProps {
  imgAddress: string;
}

const AlbumImage: React.FC<AlbumImageProps> = ({ imgAddress }) => {
  return (
    <View style={styles.imageContainer}>
      <Image style={styles.image} source={{ uri: imgAddress }} />
    </View>
  );
};

const styles = StyleSheet.create({
  imageContainer: {},
  image: {
    width: 200,
    height: 200,
    resizeMode: "contain",
    borderRadius: 10,
  },
});

export default AlbumImage;

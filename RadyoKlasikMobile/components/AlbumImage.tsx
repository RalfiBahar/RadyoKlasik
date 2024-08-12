import React from "react";
import { StyleSheet, View, Dimensions } from "react-native";
import { Image } from "expo-image";

const HEIGHT = Dimensions.get("screen").height;

interface AlbumImageProps {
  imgAddress: string;
}

const AlbumImage: React.FC<AlbumImageProps> = ({ imgAddress }) => {
  return (
    <View style={styles.imageContainer}>
      <Image
        style={styles.image}
        source={{ uri: imgAddress }}
        contentFit="contain"
      />
    </View>
  );
};

const styles = StyleSheet.create({
  imageContainer: {},
  image: {
    width: 200,
    height: 200,
    borderRadius: 10,
  },
});

export default AlbumImage;

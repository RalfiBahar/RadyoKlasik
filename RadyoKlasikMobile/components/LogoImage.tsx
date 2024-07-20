import React, { useState, useEffect } from "react";
import { StyleSheet, Dimensions, Image } from "react-native";
import { Asset } from "expo-asset";

const WIDTH = Dimensions.get("screen").width;
const HEIGHT = Dimensions.get("screen").height;

const LogoImage: React.FC = () => {
  const [logoUri, setLogoUri] = useState<string | null>(null);

  useEffect(() => {
    const loadAsset = async () => {
      const [logo] = await Asset.loadAsync(require("../assets/logo.png"));
      setLogoUri(logo.localUri || logo.uri);
    };

    loadAsset();
  }, []);

  return (
    logoUri && <Image style={styles.logoImage} source={{ uri: logoUri }} />
  );
};

const styles = StyleSheet.create({
  logoImage: {
    width: WIDTH * 0.6,
    height: WIDTH * 0.4,
    resizeMode: "contain",
    marginTop: HEIGHT * 0.05,
  },
});

export default LogoImage;

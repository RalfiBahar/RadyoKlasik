import React from "react";
import { View, Dimensions, StyleSheet } from "react-native";

const WIDTH = Dimensions.get("screen").width;
const HEIGHT = Dimensions.get("screen").height;

interface LowerContainerProps {
  children: React.ReactNode;
}

const LowerContainer: React.FC<LowerContainerProps> = ({ children }) => {
  return (
    <View style={styles.container}>
      <View style={styles.innerContainer}>{children}</View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    width: WIDTH,
    height: HEIGHT * 0.4,
    bottom: 0,
    zIndex: 20,
  },
  innerContainer: {
    flex: 1,
    position: "relative",
    padding: 20,
  },
});

export default LowerContainer;

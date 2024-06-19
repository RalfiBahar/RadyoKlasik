// app/_layout.tsx
import React from "react";
import { View } from "react-native";
import { Slot } from "expo-router";
import { RecordingsProvider } from "../context/RecordingsContext";

const Layout = () => {
  return (
    <RecordingsProvider>
      <View style={{ flex: 1 }}>
        <Slot />
      </View>
    </RecordingsProvider>
  );
};

export default Layout;

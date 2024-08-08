import { useState, useEffect } from "react";
import { View, Text } from "react-native";
import NetInfo from "@react-native-community/netinfo";

export const useNetworkStatus = () => {
  const [isConnected, setIsConnected] = useState(true);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      setIsConnected(state.isConnected !== null ? state.isConnected : true);
    });

    return () => unsubscribe();
  }, []);

  return isConnected;
};

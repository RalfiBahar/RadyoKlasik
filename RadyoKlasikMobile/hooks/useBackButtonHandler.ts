import { useEffect } from "react";
import { BackHandler } from "react-native";
import { usePlayback } from "../context/PlaybackContext";

export const useBackButtonHandler = () => {
  const { resetTrack } = usePlayback();

  useEffect(() => {
    const backAction = () => {
      resetTrack();
      return false;
    };

    const backHandler = BackHandler.addEventListener(
      "hardwareBackPress",
      backAction
    );

    return () => backHandler.remove();
  }, [resetTrack]);
};

import React, { createContext, useContext, useState, ReactNode } from "react";
import { EXPO_PUBLIC_API_URL } from "@env";
import { fetchWithAuth } from "../helpers/token";
import { Recording } from "../types";

interface RecordingsContextType {
  recordings: Recording[];
  setRecordings: React.Dispatch<React.SetStateAction<Recording[]>>;
  recordingsLoaded: boolean;
  setRecordingsLoaded: React.Dispatch<React.SetStateAction<boolean>>;
  fetchRecordings: () => Promise<void>;
}

const RecordingsContext = createContext<RecordingsContextType | undefined>(
  undefined
);

export const RecordingsProvider = ({ children }: { children: ReactNode }) => {
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [recordingsLoaded, setRecordingsLoaded] = useState<boolean>(false);

  const fetchRecordings = async () => {
    console.log("Fetching recordings...");
    try {
      setRecordingsLoaded(false);
      const apiRoute = `${EXPO_PUBLIC_API_URL}/recording/recordings?limit=5`;
      const response = await fetchWithAuth(apiRoute);
      const data = await response.json();

      if (!areRecordingsIdentical(recordings, data.recordings)) {
        console.log("different recordings");
        setRecordings(data.recordings);
      }

      setRecordingsLoaded(true);
    } catch (error) {
      console.error("Failed to fetch recordings:", error);
      setRecordingsLoaded(false);
    }
  };

  const areRecordingsIdentical = (
    existingRecordings: string | any[],
    newRecordings: string | any[]
  ) => {
    if (existingRecordings.length !== newRecordings.length) {
      return false;
    }

    for (let i = 0; i < existingRecordings.length; i++) {
      if (
        JSON.stringify(existingRecordings[i]) !==
        JSON.stringify(newRecordings[i])
      ) {
        return false;
      }
    }

    return true;
  };

  return (
    <RecordingsContext.Provider
      value={{
        recordings,
        setRecordings,
        fetchRecordings,
        recordingsLoaded,
        setRecordingsLoaded,
      }}
    >
      {children}
    </RecordingsContext.Provider>
  );
};

export const useRecordings = () => {
  const context = useContext(RecordingsContext);
  if (!context) {
    throw new Error("useRecordings must be used within a RecordingsProvider");
  }
  return context;
};

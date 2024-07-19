import React, { createContext, useContext, useState, ReactNode } from "react";
import { Recording } from "../types";

interface RecordingsContextType {
  recordings: Recording[];
  setRecordings: React.Dispatch<React.SetStateAction<Recording[]>>;
}

const RecordingsContext = createContext<RecordingsContextType | undefined>(
  undefined
);

export const RecordingsProvider = ({ children }: { children: ReactNode }) => {
  const [recordings, setRecordings] = useState<Recording[]>([]);
  return (
    <RecordingsContext.Provider value={{ recordings, setRecordings }}>
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

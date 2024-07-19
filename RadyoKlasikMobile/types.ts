export interface SongData {
  id: string;
  title: string;
  artist: string;
  thumb: string;
  duration: number | undefined;
}

export interface Recording {
  album: string;
  artist: string;
  artwork: string;
  date: string;
  duration: number;
  filename: string;
  id: string;
  play_count: number;
  size: number;
  stream: string;
  title: string;
}

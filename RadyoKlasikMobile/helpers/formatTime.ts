export function formatTime(seconds: number | undefined): string {
  if (seconds === undefined) {
    return "00:00";
  }

  const minutes = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);

  const minutesString = minutes < 10 ? `0${minutes}` : minutes.toString();
  const secondsString = secs < 10 ? `0${secs}` : secs.toString();

  return `${minutesString}:${secondsString}`;
}

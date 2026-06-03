module.exports = {
  testEnvironment: "node",
  globalSetup: "<rootDir>/__tests__/setup/globalSetup.js",
  // Only *.test.js files are suites; setup/ and helpers/ are support modules.
  testMatch: ["**/__tests__/**/*.test.js"],
  // ffprobe/ffmpeg analysis + DB round-trips need headroom.
  testTimeout: 60000,
};

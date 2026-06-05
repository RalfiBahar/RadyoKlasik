import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        // RadioJar-ish operator palette.
        brand: {
          DEFAULT: "#f4632e",
          50: "#fff3ee",
          100: "#ffe2d6",
          500: "#f4632e",
          600: "#e14f1c",
          700: "#bb3f16",
        },
        ink: {
          900: "#15181d",
          800: "#1c2026",
          700: "#272c34",
          600: "#3a414c",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;

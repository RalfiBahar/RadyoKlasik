import type { Config } from "tailwindcss";

// The panel wears the listener website's look (radyoklasik.online): mint-green
// page with the organic background shapes, white bars and cards, black type
// and black buttons, Questrial.
//
// Components were written against semantic tokens on a dark theme (`ink-*`
// surfaces, `slate-*` text from light to dim, `brand` accent), so the theme is
// swapped here rather than in every component:
//   ink-*   surfaces, light: 800 = white cards/bars, 900 = wells/inputs,
//           700/600 = borders and hovers
//   slate-* text, inverted: 100 = primary (near-black) ... 600 = faint
//   brand   black (the site's outlined boxes / bold type); mint = site green
//   red/emerald/amber/sky 300–400 darkened so status text stays readable on
//           white (they were light shades for a dark background).
const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "#111111",
          50: "#f2f2f2",
          100: "#e5e5e5",
          500: "#111111",
          600: "#2e2e2e",
          700: "#000000",
        },
        mint: {
          DEFAULT: "#68EAAC",
          bright: "#00EDA6",
          deep: "#55E09D",
        },
        ink: {
          900: "#F5FAF7",
          800: "#FFFFFF",
          700: "#E3EEE8",
          600: "#C8DBD0",
        },
        slate: {
          100: "#0F1512",
          200: "#1E2823",
          300: "#36443D",
          400: "#56645D",
          500: "#72807A",
          600: "#A2B0A9",
        },
        red: { 300: "#B42318", 400: "#B42318" },
        emerald: { 300: "#067647", 400: "#067647" },
        amber: { 300: "#93370D", 400: "#B54708" },
        sky: { 300: "#175CD3" },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;

import type { Config } from "tailwindcss";

export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          950: "#070b14",
          900: "#0a0f1c",
          850: "#0e1524",
          800: "#131c30",
          700: "#1c2942",
          600: "#2a3a5c",
        },
      },
      boxShadow: {
        glow: "0 0 40px -12px rgba(16, 185, 129, 0.35)",
      },
      animation: {
        "pulse-slow": "pulse 2.4s cubic-bezier(0.4, 0, 0.6, 1) infinite",
      },
    },
  },
  plugins: [],
} satisfies Config;

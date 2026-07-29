import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "#0A0E17",
        surface: "#121824",
        "surface-hover": "#1A2234",
        primary: {
          DEFAULT: "#DC2626", // F1 Racing Red
          hover: "#B91C1C",
          glow: "rgba(220, 38, 38, 0.25)",
        },
        secondary: {
          DEFAULT: "#00F0FF", // Electric Cyan
          hover: "#00D8E6",
          glow: "rgba(0, 240, 255, 0.25)",
        },
        accent: {
          DEFAULT: "#8B5CF6", // Neon Violet
          hover: "#7C3AED",
        },
        podium: {
          gold: "#F59E0B",
          silver: "#CBD5E1",
          bronze: "#D97706",
        },
        sprint: {
          DEFAULT: "#FF9900", // Sprint Orange
        },
        muted: "#94A3B8",
        border: "#1E293B",
        "border-hover": "#334155",
      },
      fontFamily: {
        display: ["var(--font-orbitron)", "sans-serif"],
        header: ["var(--font-rajdhani)", "sans-serif"],
        sans: ["var(--font-outfit)", "sans-serif"],
        mono: ["var(--font-space-mono)", "monospace"],
      },
      boxShadow: {
        glass: "0 8px 32px 0 rgba(0, 0, 0, 0.45)",
        "glass-primary": "0 8px 32px 0 rgba(220, 38, 38, 0.2)",
        "glass-secondary": "0 8px 32px 0 rgba(0, 240, 255, 0.2)",
        "glass-gold": "0 8px 32px 0 rgba(245, 158, 11, 0.2)",
        "neon-red": "0 0 15px rgba(220, 38, 38, 0.6)",
        "neon-cyan": "0 0 15px rgba(0, 240, 255, 0.6)",
      },
      backgroundImage: {
        "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
        "gradient-conic": "conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))",
        "f1-radial": "radial-gradient(circle at top, #1E0E14 0%, #0A0E17 75%)",
      },
    },
  },
  plugins: [],
};

export default config;


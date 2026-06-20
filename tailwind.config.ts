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
        background: "#08080c",
        surface: "#12121a",
        "surface-hover": "#1a1a26",
        primary: {
          DEFAULT: "#e10600", // F1 Brand Red
          hover: "#c00500",
        },
        secondary: {
          DEFAULT: "#00f0ff", // Neon Cyan
          hover: "#00c8d6",
        },
        accent: {
          DEFAULT: "#bd00ff", // Neon Purple
          hover: "#9d00d6",
        },
        sprint: {
          DEFAULT: "#ff9900", // Sprint Orange
        },
        muted: "#8a8a9d",
        border: "#1f1f2e",
        "border-hover": "#2f2f45",
      },
      fontFamily: {
        sans: ["var(--font-outfit)", "sans-serif"],
        mono: ["var(--font-space-mono)", "monospace"],
      },
      boxShadow: {
        glass: "0 8px 32px 0 rgba(0, 0, 0, 0.37)",
        "glass-primary": "0 8px 32px 0 rgba(225, 6, 0, 0.15)",
        "glass-secondary": "0 8px 32px 0 rgba(0, 240, 255, 0.15)",
      },
      backgroundImage: {
        "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
        "gradient-conic": "conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))",
        "f1-radial": "radial-gradient(circle at top, #1e090c 0%, #08080c 60%)",
      },
    },
  },
  plugins: [],
};

export default config;

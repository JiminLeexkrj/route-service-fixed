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
        ink: "#111827",
        brand: {
          50: "#effcf7",
          100: "#d8f8e9",
          500: "#12b981",
          600: "#07976a",
          700: "#087857",
        },
      },
      boxShadow: {
        card: "0 18px 50px rgba(15, 23, 42, 0.08)",
        soft: "0 8px 28px rgba(15, 23, 42, 0.07)",
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "soft-pulse": {
          "0%, 100%": { opacity: "1", transform: "scale(1)" },
          "50%": { opacity: "0.55", transform: "scale(1.18)" },
        },
      },
      animation: {
        "fade-up": "fade-up 450ms ease-out both",
        "soft-pulse": "soft-pulse 1.8s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;


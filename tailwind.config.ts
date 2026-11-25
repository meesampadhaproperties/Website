import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        display: ['var(--font-display)', 'system-ui', 'sans-serif'],
        body: ['var(--font-body)', 'system-ui', 'sans-serif'],
      },
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        // User brand accent (Settings → Branding). Set at runtime via --crm-accent-rgb ("r g b").
        brand: "rgb(var(--crm-accent-rgb) / <alpha-value>)",
        // Public website palette, sampled from public/brand/logo.png
        site: {
          ink: "#07090a",      // near-black page chrome (logo's white roof + mint "MEE" need a dark ground)
          panel: "#0f1412",
          gold: "#f5b040",     // house roof
          green: "#50ff00",    // "SAMPADHA" wordmark
          mint: "#a8f5e0",     // "MEE"
          pink: "#ff69b4",     // roof accent line
        },
      },
    },
  },
  plugins: [],
};
export default config;

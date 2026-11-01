import type { Config } from "tailwindcss";

// Los valores viven como variables CSS en globals.css (:root); aquí se exponen como utilidades.
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        glass: "var(--glass-bg)",
        "glass-strong": "var(--glass-bg-strong)",
        "glass-border": "var(--glass-border-color)",
        accent: "#4F8CFF",
        "ink-2": "rgba(255,255,255,0.78)",
        "ink-3": "rgba(255,255,255,0.62)",
        status: {
          working: "#34D399",
          waiting: "#FBBF24",
          paused: "#9CA3AF",
          error: "#F87171",
        },
        dept: {
          ventas: "#3B82F6",
          atencion: "#14B8A6",
          marketing: "#F59E0B",
          operaciones: "#8B5CF6",
          direccion: "#4B5563",
        },
      },
      borderRadius: {
        panel: "28px",
        card: "20px",
        pill: "999px",
      },
      boxShadow: {
        glass: "var(--glass-shadow)",
      },
      fontSize: {
        h1: ["28px", { lineHeight: "1.2", fontWeight: "600" }],
        h2: ["20px", { lineHeight: "1.3", fontWeight: "600" }],
        body: ["15px", { lineHeight: "1.5" }],
        small: ["13px", { lineHeight: "1.4" }],
        tiny: ["11px", { lineHeight: "1.3" }],
      },
    },
  },
};

export default config;

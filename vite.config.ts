import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

const isReplit = process.env.REPL_ID !== undefined;
const isProd = process.env.NODE_ENV === "production";

export default defineConfig(async () => ({
  plugins: [
    react(),
    // Only include Replit runtime overlay in dev
    ...(!isProd ? [runtimeErrorOverlay()] : []),
    // Only include Cartographer plugin if running inside Replit (not Vercel)
    ...(!isProd && isReplit
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer()
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  root: path.resolve(import.meta.dirname, "client"),
  build: {
    // ✅ Use plain "dist" for Vercel (not dist/public)
    outDir: isProd
      ? path.resolve(import.meta.dirname, "dist")
      : path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
}));

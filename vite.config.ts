import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// Web builds are served from GitHub Pages. Android builds bundle the same
// assets inside Capacitor and therefore need relative asset URLs.
export default defineConfig(({ mode }) => {
  const isAndroid = mode === "android";

  return {
    base: isAndroid ? "./" : "/LukManage/",
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes("node_modules")) return undefined;
            if (id.includes("recharts") || id.includes("d3-")) return "charts";
            if (id.includes("idb")) return "storage";
            return undefined;
          },
        },
      },
    },
    plugins: [
      react(),
      !isAndroid && VitePWA({
        registerType: "autoUpdate",
        includeAssets: ["icons/apple-touch-icon.png"],
        manifest: {
          name: "LukManage",
          short_name: "LukManage",
          description: "Local-first personal finance for savings, debts, reports, and future cash flow.",
          theme_color: "#171721",
          background_color: "#171721",
          display: "standalone",
          orientation: "portrait",
          start_url: ".",
          scope: ".",
          icons: [
            { src: "icons/icon-192.png", sizes: "192x192", type: "image/png" },
            { src: "icons/icon-512.png", sizes: "512x512", type: "image/png" },
            { src: "icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
          ],
        },
      }),
    ].filter(Boolean),
  };
});

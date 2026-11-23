import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import { defaultClientConditions, defaultServerConditions } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";

export default defineConfig({
  main: {
    resolve: { conditions: ["sage-source", ...defaultServerConditions] },
    ssr: { resolve: { conditions: ["sage-source", ...defaultServerConditions], externalConditions: ["sage-source", ...defaultServerConditions] } },
    plugins: [externalizeDepsPlugin({ exclude: [
      "@sage/contracts",
      "electron-log"
    ] })],
    build: {
      rollupOptions: {
        external: ["zod"]
      }
    }
  },
  preload: {
    resolve: { conditions: ["sage-source", ...defaultServerConditions] },
    ssr: { resolve: { conditions: ["sage-source", ...defaultServerConditions], externalConditions: ["sage-source", ...defaultServerConditions] } },
    plugins: [externalizeDepsPlugin({ exclude: ["@sage/contracts"] })],
    build: {
      rollupOptions: {
        output: {
          format: "cjs",
          entryFileNames: "[name].cjs"
        }
      }
    }
  },
  renderer: {
    resolve: { conditions: ["sage-source", ...defaultClientConditions], alias: { "@renderer": fileURLToPath(new URL("./src/renderer", import.meta.url)) } },
    plugins: [react(), tailwindcss()],
    esbuild: { minifyIdentifiers: false },
    build: { minify: "esbuild" }
  }
});

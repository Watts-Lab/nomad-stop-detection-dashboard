import path from "node:path"
import { fileURLToPath } from "node:url"
import { defineConfig } from "vite"

const recordingRoot = path.dirname(fileURLToPath(import.meta.url))
const dashboardRoot = path.resolve(recordingRoot, "../..")

export default defineConfig({
  root: recordingRoot,
  publicDir: path.join(dashboardRoot, "public"),
  define: {
    "process.env.NEXT_PUBLIC_BASE_PATH": JSON.stringify(""),
  },
  resolve: {
    alias: {
      "@": dashboardRoot,
    },
  },
  server: {
    fs: {
      allow: [dashboardRoot],
    },
  },
})

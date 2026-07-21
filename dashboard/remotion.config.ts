import path from "node:path"
import { Config } from "@remotion/cli/config"
import { enableTailwind } from "@remotion/tailwind-v4"

const dashboardRoot = process.cwd()

Config.setPublicDir("public")
Config.overrideWebpackConfig((currentConfiguration) => enableTailwind({
  ...currentConfiguration,
  resolve: {
    ...currentConfiguration.resolve,
    alias: {
      ...currentConfiguration.resolve?.alias,
      "@": dashboardRoot,
      "./public-path$": path.join(dashboardRoot, "recording/remotion-public-path.ts"),
    },
  },
}))

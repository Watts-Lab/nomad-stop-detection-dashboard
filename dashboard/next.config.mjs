import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const basePath = process.env.PAGES_BASE_PATH ?? ""

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export",
  basePath,
  trailingSlash: true,
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath,
  },
  turbopack: {
    root: __dirname,
  },
  images: {
    unoptimized: true,
  },
  devIndicators: false,
  allowedDevOrigins: ["10.123.3.226", "10.103.113.171"],
}

export default nextConfig

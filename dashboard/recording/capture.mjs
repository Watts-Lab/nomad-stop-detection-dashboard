import path from "node:path"
import { spawn } from "node:child_process"
import { once } from "node:events"
import { copyFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import ffmpegPath from "ffmpeg-static"
import { chromium } from "playwright"
import { createServer } from "vite"

const FPS = 30
const HOLD_FRAMES = FPS * 2
const MAX_FRAMES = FPS * 30
const LOAD_TIME = "2024-01-01T00:00:00Z"
const RECORDING_TIME = "2024-01-01T00:01:00Z"
const recordingRoot = path.dirname(fileURLToPath(import.meta.url))
const outputPath = path.join(recordingRoot, "home-stop-preview.mp4")
const publicOutputPath = path.resolve(recordingRoot, "../public/videos/home-stop-preview.mp4")

const server = await createServer({
  configFile: path.join(recordingRoot, "vite.config.ts"),
  server: {
    host: "127.0.0.1",
    port: 4173,
    strictPort: true,
  },
  logLevel: "warn",
})

let browser
let encoder

try {
  await server.listen()
  browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    viewport: { width: 640, height: 360 },
    deviceScaleFactor: 3,
  })
  const page = await context.newPage()

  await page.clock.install({ time: LOAD_TIME })
  await page.goto("http://127.0.0.1:4173", { waitUntil: "networkidle" })
  await page.waitForFunction(() => document.querySelector("#recording-root")?.dataset.state !== "loading")

  const root = page.locator("#recording-root")
  const initialState = await root.getAttribute("data-state")
  if (initialState === "error") throw new Error(await root.getAttribute("data-error"))

  await page.evaluate(() => document.fonts.ready)
  await page.clock.pauseAt(RECORDING_TIME)
  await page.locator("#recording-start").evaluate((button) => button.click())
  await root.locator("canvas").first().waitFor({ state: "visible" })
  await page.waitForFunction(() => document.querySelector("#recording-root")?.dataset.state === "recording")

  encoder = spawn(ffmpegPath, [
    "-y",
    "-f", "image2pipe",
    "-framerate", String(FPS),
    "-vcodec", "png",
    "-i", "pipe:0",
    "-an",
    "-c:v", "libx264",
    "-preset", "medium",
    "-crf", "18",
    "-pix_fmt", "yuv420p",
    "-movflags", "+faststart",
    outputPath,
  ], { stdio: ["pipe", "ignore", "pipe"] })

  let encoderError = ""
  encoder.stderr.on("data", (chunk) => {
    encoderError += chunk
  })

  let completedAt = null
  let elapsedMs = 0

  for (let frame = 0; frame < MAX_FRAMES; frame += 1) {
    const image = await page.screenshot({ type: "png", scale: "device" })
    if (!encoder.stdin.write(image)) await once(encoder.stdin, "drain")
    if ((frame + 1) % FPS === 0) console.log(`${(frame + 1) / FPS}s rendered`)

    if (await root.getAttribute("data-state") === "complete" && completedAt === null) {
      completedAt = frame
    }
    if (completedAt !== null && frame - completedAt >= HOLD_FRAMES) break

    const nextElapsedMs = Math.round((frame + 1) * 1000 / FPS)
    await page.clock.runFor(nextElapsedMs - elapsedMs)
    elapsedMs = nextElapsedMs
  }

  if (completedAt === null) throw new Error("Preview did not complete within 30 seconds")

  encoder.stdin.end()
  const [exitCode] = await once(encoder, "close")
  if (exitCode !== 0) throw new Error(encoderError)

  await copyFile(outputPath, publicOutputPath)
  console.log(outputPath)
  console.log(publicOutputPath)
} finally {
  if (encoder && !encoder.killed && encoder.exitCode === null) encoder.kill()
  await browser?.close()
  await server.close()
}

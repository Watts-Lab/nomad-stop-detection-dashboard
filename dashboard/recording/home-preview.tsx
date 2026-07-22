import { useEffect, useState } from "react"
import { AbsoluteFill, useCurrentFrame, useDelayRender, useVideoConfig } from "remotion"
import { StopRunPreview } from "../app/_components/compare-animation-panel"
import { loadCompareData } from "../app/_lib/static-cache"
import type { ComparePanelResponse } from "../app/_lib/types"

const PREVIEW_RUNS: Array<{
  label: string
  algo: string
  params: Record<string, number>
}> = [
  { label: "DBSTOP · dist_thresh 10", algo: "dbstop", params: { dist_thresh: 10, time_thresh: 60, min_pts: 3, dur_min: 5 } },
  { label: "Lachesis · delta_roam 25", algo: "lachesis", params: { dt_max: 60, delta_roam: 25, dur_min: 5 } },
  { label: "SeqScan · dist_thresh 20", algo: "seqscan", params: { dist_thresh: 20, time_thresh: 60, min_pts: 2, dur_min: 5 } },
  { label: "ST-DBSCAN · eps 15", algo: "dbscan", params: { eps_spatial: 15, T_max: 60, minPts: 3 } },
  { label: "Grid-based · cell 100", algo: "gridbased", params: { cell_size: 100, min_time: 5 } },
]
const ACTIVE_RUNS = PREVIEW_RUNS.slice(0, 1)

const FPS = 30
const INITIAL_DELAY_MS = 1150
const FRAME_DELAY_MS = 30
const HOLD_MS = 2000
const POINT_REVEAL_MS = 120
const SCENE_STEP_SECONDS = 30
const ignoreTimeChange = () => {}

function timingFor(start: number, end: number, fps: number) {
  const steps = Math.ceil((end - start) / SCENE_STEP_SECONDS)
  const initialFrames = Math.ceil(INITIAL_DELAY_MS * fps / 1000)
  const playbackFrames = Math.ceil(steps * FRAME_DELAY_MS * fps / 1000)
  const holdFrames = Math.ceil(HOLD_MS * fps / 1000)
  return { steps, initialFrames, playbackFrames, holdFrames, runFrames: initialFrames + playbackFrames + holdFrames }
}

async function loadPanels() {
  return Promise.all(ACTIVE_RUNS.map(async (run) => {
    const data = await loadCompareData({
      seed: 1,
      mode: "single",
      left: { algo: run.algo, params: run.params },
    })
    return data.left
  }))
}

export async function calculateHomePreviewMetadata() {
  const data = await loadCompareData({
    seed: 1,
    mode: "single",
    left: { algo: ACTIVE_RUNS[0].algo, params: ACTIVE_RUNS[0].params },
  })
  const pings = data.left.scene?.pings
  if (!pings?.length) throw new Error("Home preview scene has no pings")
  const timing = timingFor(pings[0].timestamp, pings[pings.length - 1].timestamp, FPS)
  return { durationInFrames: timing.runFrames * ACTIVE_RUNS.length }
}

export function HomePreview() {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const { delayRender, continueRender, cancelRender } = useDelayRender()
  const [handle] = useState(() => delayRender("Loading home preview data"))
  const [panels, setPanels] = useState<ComparePanelResponse[] | null>(null)

  useEffect(() => {
    let cancelled = false
    loadPanels()
      .then((result) => {
        if (!cancelled) setPanels(result)
      })
      .catch(cancelRender)
    return () => {
      cancelled = true
    }
  }, [cancelRender])

  useEffect(() => {
    if (panels) continueRender(handle)
  }, [continueRender, handle, panels])

  if (!panels?.[0].scene) return <AbsoluteFill className="bg-white" />

  const scene = panels[0].scene
  const start = scene.pings[0].timestamp
  const end = scene.pings[scene.pings.length - 1].timestamp
  const timing = timingFor(start, end, fps)
  const runIndex = Math.min(Math.floor(frame / timing.runFrames), ACTIVE_RUNS.length - 1)
  const runFrame = frame % timing.runFrames
  const playbackFrame = Math.max(0, runFrame - timing.initialFrames)
  const step = Math.min(
    Math.floor(playbackFrame * 1000 / fps / FRAME_DELAY_MS) + 1,
    timing.steps,
  )
  const currentTime = runFrame < timing.initialFrames
    ? start
    : Math.min(start + step * SCENE_STEP_SECONDS, end)
  const pointRevealProgress = (timestamp: number) => {
    if (timestamp <= start) return 1
    const revealStep = Math.ceil((timestamp - start) / SCENE_STEP_SECONDS)
    const revealFrame = timing.initialFrames + Math.ceil((revealStep - 1) * fps * FRAME_DELAY_MS / 1000)
    const transitionFrames = Math.ceil(POINT_REVEAL_MS * fps / 1000)
    return Math.min(1, Math.max(0, (runFrame - revealFrame + 1) / transitionFrames))
  }

  return (
    <AbsoluteFill className="bg-white">
      <StopRunPreview
        key={ACTIVE_RUNS[runIndex].algo}
        panel={panels[runIndex]}
        currentTime={currentTime}
        onTimeChange={ignoreTimeChange}
        playback="external"
        pulsePhase={(frame % (fps * 4)) / (fps * 4)}
        pointRevealProgress={pointRevealProgress}
      />
      <span className="pointer-events-none absolute left-3 top-3 z-10 rounded-md border border-[#d7dbd2] bg-white/90 px-2.5 py-1 text-xs font-semibold text-[#202124] shadow-sm">
        {ACTIVE_RUNS[runIndex].label}
      </span>
    </AbsoluteFill>
  )
}

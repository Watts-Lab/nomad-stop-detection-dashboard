import { useCallback, useEffect, useState } from "react"
import { StopRunPreview } from "../app/_components/compare-animation-panel"
import { loadCompareData } from "../app/_lib/static-cache"
import type { ComparePanelResponse } from "../app/_lib/types"

const DBSTOP_PARAMS = {
  dist_thresh: 10,
  time_thresh: 60,
  min_pts: 3,
  dur_min: 5,
}

export function HomePreviewRecording() {
  const [panel, setPanel] = useState<ComparePanelResponse | null>(null)
  const [currentTime, setCurrentTime] = useState<number | null>(null)
  const [started, setStarted] = useState(false)
  const [complete, setComplete] = useState(false)
  const [error, setError] = useState("")
  const endTime = panel?.scene?.pings.at(-1)?.timestamp
  const handleTimeChange: (timestamp: number) => void = useCallback((timestamp) => {
    setCurrentTime(timestamp)
    if (timestamp === endTime) setComplete(true)
  }, [endTime])

  useEffect(() => {
    loadCompareData({
      seed: 1,
      mode: "single",
      left: { algo: "dbstop", params: DBSTOP_PARAMS },
    })
      .then((data) => setPanel(data.left))
      .catch((loadError) => setError(String(loadError)))
  }, [])

  const state = error
    ? "error"
    : !panel
      ? "loading"
      : !started
        ? "ready"
        : complete
          ? "complete"
          : currentTime === null
            ? "mounting"
            : "recording"

  return (
    <main
      id="recording-root"
      data-state={state}
      data-error={error}
      data-current-time={currentTime}
      data-end-time={endTime}
      className="relative h-[360px] w-[640px] overflow-hidden bg-white"
    >
      <button id="recording-start" type="button" hidden onClick={() => setStarted(true)} />
      {started && panel && (
        <StopRunPreview
          panel={panel}
          currentTime={currentTime}
          onTimeChange={handleTimeChange}
        />
      )}
      <span className="pointer-events-none absolute left-3 top-3 z-10 rounded-md border border-[#d7dbd2] bg-white/90 px-2.5 py-1 text-xs font-semibold text-[#202124] shadow-sm">
        DBSTOP · dist_thresh 10
      </span>
    </main>
  )
}

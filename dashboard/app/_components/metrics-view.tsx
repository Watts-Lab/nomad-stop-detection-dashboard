"use client"

import { useEffect, useRef, useState } from "react"
import { Columns2, HelpCircle, Square } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { DEMO_TRAJECTORY_OPTIONS } from "../_lib/dashboard-data"
import { parameterDisplayName, revealClass } from "../_lib/dashboard-utils"
import { METRICS_TOUR_FOCUS_EVENT } from "@/hooks/use-product-tour"
import { publicPath } from "../_lib/public-path"

type MetricsAlgorithm = {
  dashboard_id: string
  display_name: string
  sweep_parameters: string[]
  defaults: Record<string, string | number | boolean>
}

type MetricsScenario = {
  id: string
  label: string
  users: number
  algorithms: Record<string, { path: string }>
}

type MetricsManifest = {
  algorithms: Record<string, MetricsAlgorithm>
  defaults: { left_algorithm: string; right_algorithm: string }
  scenarios: MetricsScenario[]
}

export type MetricsPoint = {
  algoId: string
  userId: string
  param: string
  value: number
  recall: number
  fixed: Record<string, string>
  scenario: string
}

type PinnedAgent = Omit<MetricsPoint, "scenario">

function PinnedAgentCard({
  pinned,
  openDemo,
}: {
  pinned: PinnedAgent | null
  openDemo: (pinned: PinnedAgent) => void
}) {
  return (
    <div className="space-y-2">
      <h4 className="text-sm font-medium text-muted-foreground">Selected agent</h4>
      {pinned ? (
        <div className="space-y-2 rounded-md border border-[#2ca02c]/60 bg-[#2ca02c]/5 px-3 py-2">
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-muted-foreground">Agent</span>
            <span className="truncate text-xs font-mono text-foreground">{pinned.userId}</span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-muted-foreground">Best {parameterDisplayName(pinned.param)}</span>
            <span className="text-xs font-mono text-foreground">{pinned.value}</span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-muted-foreground">Accuracy</span>
            <span className="text-xs font-mono text-foreground">{pinned.recall.toFixed(3)}</span>
          </div>
          <Button size="sm" onClick={() => openDemo(pinned)} className="nomad-action w-full">
            Open in Demo
          </Button>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">No agent selected.</p>
      )}
      <p className="rounded-md border border-dashed border-border/70 px-3 py-2 text-xs text-muted-foreground">
        Click a red circle to select an agent; click the selected red circle again to unselect it.
      </p>
    </div>
  )
}

function MetricsParameterRows({ algorithm, parameter }: { algorithm: MetricsAlgorithm; parameter: string }) {
  const rows = Object.entries(algorithm.defaults)
    .filter(([name]) => name !== parameter)
    .map(([name, value]) => [name, String(value)])

  return (
    <div className="space-y-2">
      <h4 className="text-sm font-medium text-muted-foreground">Parameters</h4>
      {rows.map(([name, value]) => (
        <div key={`${algorithm.display_name}-${name}-${value}`} className="rounded-md border border-border/70 bg-muted/20 px-3 py-2">
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs font-mono text-muted-foreground">{name}</span>
            <span className="text-xs font-mono text-foreground">{value}</span>
          </div>
        </div>
      ))}
    </div>
  )
}

function MetricsFrame({
  src,
  title,
  label,
  showTourTargets = false,
}: {
  src: string
  title: string
  label?: string
  showTourTargets?: boolean
}) {
  const [loading, setLoading] = useState(true)
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const tourFocusRef = useRef<string | null>(null)

  useEffect(() => {
    setLoading(true)
    // The iframe's src is present in the server-rendered HTML, so the browser can finish
    // loading it before React hydrates and attaches the onLoad handler below, silently
    // missing that event. Poll contentDocument.readyState as a fallback for that race.
    let cancelled = false
    const checkLoaded = () => {
      if (cancelled) return
      try {
        if (iframeRef.current?.contentDocument?.readyState === "complete") {
          setLoading(false)
          return
        }
      } catch {
        return
      }
      requestAnimationFrame(checkLoaded)
    }
    checkLoaded()
    return () => {
      cancelled = true
    }
  }, [src])

  useEffect(() => {
    if (!showTourTargets) return

    const postTourFocus = (mode: string | null) => {
      tourFocusRef.current = mode
      iframeRef.current?.contentWindow?.postMessage({ type: "nomad-metrics-tour-focus", mode }, window.location.origin)
    }
    const handleTourFocus = (event: Event) => {
      postTourFocus(event instanceof CustomEvent ? event.detail : null)
    }

    window.addEventListener(METRICS_TOUR_FOCUS_EVENT, handleTourFocus)
    return () => window.removeEventListener(METRICS_TOUR_FOCUS_EVENT, handleTourFocus)
  }, [showTourTargets])

  return (
    <div className="relative h-full min-h-0 overflow-hidden rounded-md border border-border bg-muted/30" data-tour={showTourTargets ? "metrics-chart" : undefined}>
      {label && (
        <div className="absolute left-[12px] top-[12px] z-20 max-w-[40%] truncate rounded-sm bg-muted/80 px-2 py-0.5 text-xs font-semibold text-foreground">
          {label}
        </div>
      )}
      {loading && (
        <div className="absolute inset-0 z-10 grid gap-3 bg-[#111625] p-4">
          <Skeleton className="h-7 w-1/3 bg-[#202738]" />
          <Skeleton className="h-full bg-[#202738]" />
          <Skeleton className="h-5 w-2/3 bg-[#202738]" />
        </div>
      )}
      <iframe
        ref={iframeRef}
        key={src}
        src={src}
        title={title}
        onLoad={() => {
          setLoading(false)
          if (showTourTargets) {
            iframeRef.current?.contentWindow?.postMessage({ type: "nomad-metrics-tour-focus", mode: tourFocusRef.current }, window.location.origin)
          }
        }}
        className="h-full w-full border-0"
      />
    </div>
  )
}

export function MetricsView({
  metricsCompareMode,
  metricsLeftAlgorithm,
  metricsRightAlgorithm,
  metricsLeftParameter,
  metricsRightParameter,
  selectedUserId,
  trajectory,
  setMetricsCompareMode,
  setMetricsLeftAlgorithm,
  setMetricsRightAlgorithm,
  setMetricsLeftParameter,
  setMetricsRightParameter,
  setTrajectory,
  openPinnedAgent,
  startTour,
}: {
  metricsCompareMode: boolean
  metricsLeftAlgorithm: string
  metricsRightAlgorithm: string
  metricsLeftParameter: string
  metricsRightParameter: string
  selectedUserId?: string
  trajectory: string
  setMetricsCompareMode: (value: boolean) => void
  setMetricsLeftAlgorithm: (algorithm: string) => void
  setMetricsRightAlgorithm: (algorithm: string) => void
  setMetricsLeftParameter: (parameter: string) => void
  setMetricsRightParameter: (parameter: string) => void
  setTrajectory: (trajectory: string) => void
  openPinnedAgent: (pinned: MetricsPoint) => void
  startTour: () => void
}) {
  const [manifest, setManifest] = useState<MetricsManifest | null>(null)
  const [metricsError, setMetricsError] = useState<string | null>(null)
  const [pinnedLeftAgent, setPinnedLeftAgent] = useState<PinnedAgent | null>(null)
  const [pinnedRightAgent, setPinnedRightAgent] = useState<PinnedAgent | null>(null)
  const algorithms = manifest ? Object.values(manifest.algorithms) : []
  const leftAlgorithm = algorithms.find((algorithm) => algorithm.display_name === metricsLeftAlgorithm)
  const rightAlgorithm = algorithms.find((algorithm) => algorithm.display_name === metricsRightAlgorithm)
  const scenario = manifest?.scenarios.find((item) => item.id === trajectory)

  useEffect(() => {
    const loadManifest = async () => {
      try {
        const response = await fetch(publicPath("/cached-results/aggregated-metrics/manifest.json"))
        if (!response.ok) throw new Error("Failed to load aggregated metrics manifest")
        setManifest(await response.json() as MetricsManifest)
      } catch (err) {
        setMetricsError(err instanceof Error ? err.message : "Failed to load aggregated metrics manifest")
      }
    }
    void loadManifest()
  }, [])

  useEffect(() => {
    if (!manifest) return
    if (!leftAlgorithm) setMetricsLeftAlgorithm(manifest.algorithms[manifest.defaults.left_algorithm].display_name)
    if (!rightAlgorithm) setMetricsRightAlgorithm(manifest.algorithms[manifest.defaults.right_algorithm].display_name)
  }, [leftAlgorithm, manifest, rightAlgorithm, setMetricsLeftAlgorithm, setMetricsRightAlgorithm])

  useEffect(() => {
    if (leftAlgorithm && !leftAlgorithm.sweep_parameters.includes(metricsLeftParameter)) setMetricsLeftParameter(leftAlgorithm.sweep_parameters[0])
    if (rightAlgorithm && !rightAlgorithm.sweep_parameters.includes(metricsRightParameter)) setMetricsRightParameter(rightAlgorithm.sweep_parameters[0])
  }, [leftAlgorithm, metricsLeftParameter, metricsRightParameter, rightAlgorithm, setMetricsLeftParameter, setMetricsRightParameter])

  const chartSrc = (algorithm: MetricsAlgorithm | undefined, parameter: string, frame: string, legend = "") => {
    if (!algorithm || !scenario) return ""
    const algorithmKey = Object.entries(manifest?.algorithms ?? {}).find(([, item]) => item.display_name === algorithm.display_name)?.[0]
    const file = algorithmKey ? scenario.algorithms[algorithmKey] : null
    if (!file) return ""
    const params = new URLSearchParams({ x: parameter, field: parameter, data: publicPath("/cached-results/aggregated-metrics/") + file.path, algo: algorithm.dashboard_id, frame })
    Object.entries(algorithm.defaults)
      .filter(([name]) => name !== parameter)
      .forEach(([name, value]) => params.append("fixed", `${name}=${value}`))
    if (selectedUserId) params.set("user", selectedUserId)
    if (legend) params.set("legend", legend)
    return publicPath("/echarts-prototype/index.html") + "?" + params.toString()
  }
  const leftMetricsPrototypeSrc = chartSrc(leftAlgorithm, metricsLeftParameter, "left", metricsCompareMode ? "space" : "")
  const rightMetricsPrototypeSrc = chartSrc(rightAlgorithm, metricsRightParameter, "right")

  useEffect(() => {
    const handlePinChange = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return
      if (event.data?.type !== "nomad-metrics-pin-change") return
      const { frame, algoId, userId, param, value, recall, fixed } = event.data
      const setPinned = frame === "right" ? setPinnedRightAgent : setPinnedLeftAgent
      setPinned(
        typeof userId === "string" && Number.isFinite(value) && Number.isFinite(recall)
          ? { algoId: String(algoId), userId, param: String(param), value: Number(value), recall: Number(recall), fixed }
          : null,
      )
    }
    window.addEventListener("message", handlePinChange)
    return () => window.removeEventListener("message", handlePinChange)
  }, [])

  // Each chart reloads (and drops its pin) whenever its src changes.
  useEffect(() => setPinnedLeftAgent(null), [leftMetricsPrototypeSrc])
  useEffect(() => setPinnedRightAgent(null), [rightMetricsPrototypeSrc, metricsCompareMode])

  if (!manifest || !leftAlgorithm || !rightAlgorithm || !scenario) {
    return (
      <div className="nomad-page-frame flex min-h-0 flex-1 flex-col gap-3 overflow-hidden py-3">
        <div className={`${revealClass()} shrink-0 space-y-1`}>
          <div className="flex items-center gap-2">
            <h2 className="text-2xl font-bold">{metricsCompareMode ? "Compare Metrics" : "Aggregated Metrics"}</h2>
            <Button variant="outline" size="icon" onClick={startTour} title="Take Tour" aria-label="Take Tour" className="h-8 w-8">
              <HelpCircle className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">Loading cached metrics...</p>
        </div>
        <div className={`${revealClass("panel", 2)} grid flex-1 min-h-0 lg:grid-cols-[minmax(0,1fr)_330px] gap-3 items-stretch overflow-hidden`}>
          <Card className="h-full min-h-0" />
          <Card className="min-h-0 overflow-hidden py-0">
            <CardHeader className="shrink-0 px-5 py-3"><CardTitle className="text-lg font-semibold">Aggregated Metrics</CardTitle></CardHeader>
            <CardContent>{metricsError && <p className="text-xs text-red-500">{metricsError}</p>}</CardContent>
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div className="nomad-page-frame flex min-h-0 flex-1 flex-col gap-3 overflow-hidden py-3">
      <div className={`${revealClass()} flex shrink-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between`}>
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h2 className="text-2xl font-bold">{metricsCompareMode ? "Compare Metrics" : "Aggregated Metrics"}</h2>
            <Button variant="outline" size="icon" onClick={startTour} title="Take Tour" aria-label="Take Tour" className="h-8 w-8">
              <HelpCircle className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">
            Sweep one scale parameter for the selected algorithm{metricsCompareMode ? "s" : ""}; fixed notebook parameters are shown in the control panel.
          </p>
        </div>
      </div>

      <div className={`${revealClass("panel", 2)} grid flex-1 min-h-0 lg:grid-cols-[minmax(0,1fr)_330px] gap-3 items-stretch overflow-hidden`}>
        <Card className="h-full min-h-0 overflow-hidden py-0 flex flex-col">
          {!metricsCompareMode && (
            <CardHeader className="shrink-0 py-2 px-3 bg-muted/30">
              <CardTitle className="text-sm font-semibold">
                {metricsLeftAlgorithm}
              </CardTitle>
            </CardHeader>
          )}
          <CardContent className="min-h-0 flex-1 overflow-hidden p-2">
            <div className={`grid min-h-0 gap-2 ${metricsCompareMode ? "h-full grid-rows-[minmax(0,1fr)_minmax(0,1fr)]" : "h-full"}`}>
              <MetricsFrame src={leftMetricsPrototypeSrc} title={`${metricsLeftAlgorithm} aggregated metrics prototype`} label={metricsCompareMode ? metricsLeftAlgorithm : undefined} showTourTargets />

              {metricsCompareMode && (
                <MetricsFrame src={rightMetricsPrototypeSrc} title={`${metricsRightAlgorithm} aggregated metrics prototype`} label={metricsRightAlgorithm} />
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="min-h-0 overflow-hidden py-0" data-tour="metrics-controls">
          <CardHeader className="shrink-0 px-5 py-3">
            <CardTitle className="text-lg font-semibold">
              {metricsCompareMode ? `${metricsLeftAlgorithm} vs ${metricsRightAlgorithm}` : metricsLeftAlgorithm}
            </CardTitle>
          </CardHeader>
          <CardContent className="min-h-0 flex-1 space-y-2 overflow-y-auto px-5 pb-4">
            <div className="space-y-1">
              <label className="text-sm font-medium text-muted-foreground">Trajectory</label>
              <Select value={trajectory} onValueChange={setTrajectory}>
                <SelectTrigger className="h-10 w-full text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {manifest.scenarios.map((item) => <SelectItem key={item.id} value={item.id}>{DEMO_TRAJECTORY_OPTIONS.find((trajectory) => trajectory.id === item.id)?.name ?? item.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Button
              variant={metricsCompareMode ? "default" : "outline"}
              size="sm"
              onClick={() => setMetricsCompareMode(!metricsCompareMode)}
              className="gap-2"
            >
              {metricsCompareMode ? <><Square className="h-4 w-4" /> Single</> : <><Columns2 className="h-4 w-4" /> Compare</>}
            </Button>
            <div className="space-y-1">
              <label className="text-sm font-medium text-muted-foreground">
                {metricsCompareMode ? "Left" : "Algorithm"}
              </label>
              <Select
                value={metricsLeftAlgorithm}
                onValueChange={(algorithm) => {
                  setMetricsLeftAlgorithm(algorithm)
                  setMetricsLeftParameter(algorithms.find((item) => item.display_name === algorithm)?.sweep_parameters[0] ?? "dist_thresh")
                }}
              >
                <SelectTrigger className="h-10 text-base"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {algorithms.map((algorithm) => <SelectItem key={algorithm.display_name} value={algorithm.display_name}>{algorithm.display_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {leftAlgorithm && <MetricsParameterRows algorithm={leftAlgorithm} parameter={metricsLeftParameter} />}
            <PinnedAgentCard pinned={pinnedLeftAgent} openDemo={(pinned) => openPinnedAgent({ ...pinned, scenario: trajectory })} />

            {metricsCompareMode && (
              <>
                <div className="space-y-1">
                  <label className="text-sm font-medium text-muted-foreground">Right</label>
                  <Select
                    value={metricsRightAlgorithm}
                    onValueChange={(algorithm) => {
                      setMetricsRightAlgorithm(algorithm)
                      setMetricsRightParameter(algorithms.find((item) => item.display_name === algorithm)?.sweep_parameters[0] ?? "dist_thresh")
                    }}
                  >
                    <SelectTrigger className="h-10 text-base"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {algorithms.map((algorithm) => <SelectItem key={algorithm.display_name} value={algorithm.display_name}>{algorithm.display_name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                {rightAlgorithm && <MetricsParameterRows algorithm={rightAlgorithm} parameter={metricsRightParameter} />}
                <PinnedAgentCard pinned={pinnedRightAgent} openDemo={(pinned) => openPinnedAgent({ ...pinned, scenario: trajectory })} />
              </>
            )}

            {metricsError && <p className="text-xs text-red-500">{metricsError}</p>}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

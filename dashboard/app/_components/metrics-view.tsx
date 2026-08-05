"use client"

import { useEffect, useRef, useState } from "react"
import { Columns2, HelpCircle, Square } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { DEMO_ID_BY_METRICS_ALGORITHM, METRICS_SWEEP_PARAMETERS } from "../_lib/dashboard-data"
import { parameterDisplayName, prototypeChartSrc, revealClass } from "../_lib/dashboard-utils"
import { METRICS_TOUR_FOCUS_EVENT } from "@/hooks/use-product-tour"
import type { MetricsParameterNote } from "../_lib/types"

type PinnedAgent = {
  algoId: string
  userId: string
  param: string
  value: number
  recall: number
  fixed: Record<string, string>
}

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
        <p className="rounded-md border border-dashed border-border/70 px-3 py-2 text-xs text-muted-foreground">
          Click a red circle to keep that agent&apos;s trajectory on the chart; click it again to release.
        </p>
      )}
    </div>
  )
}

function MetricsParameterRows({
  algorithm,
  note,
}: {
  algorithm: string
  note: MetricsParameterNote | undefined
}) {
  const rows = [
    ...(note?.fixed_parameters ?? []).map((param) => {
      const [name, ...valueParts] = param.split("=")
      return [name, valueParts.join("=") || "fixed"]
    }),
  ]

  return (
    <div className="space-y-2">
      <h4 className="text-sm font-medium text-muted-foreground">Parameters</h4>
      {rows.map(([name, value]) => (
        <div key={`${algorithm}-${name}-${value}`} className="rounded-md border border-border/70 bg-muted/20 px-3 py-2">
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
  metricsAlgorithms,
  metricsLeftAlgorithm,
  metricsRightAlgorithm,
  metricsLeftParameter,
  metricsRightParameter,
  selectedUserId,
  leftParameterNote,
  rightParameterNote,
  metricsError,
  setMetricsCompareMode,
  setMetricsLeftAlgorithm,
  setMetricsRightAlgorithm,
  setMetricsLeftParameter,
  setMetricsRightParameter,
  openPinnedAgent,
  startTour,
}: {
  metricsCompareMode: boolean
  metricsAlgorithms: string[]
  metricsLeftAlgorithm: string
  metricsRightAlgorithm: string
  metricsLeftParameter: string
  metricsRightParameter: string
  selectedUserId?: string
  leftParameterNote: MetricsParameterNote | undefined
  rightParameterNote: MetricsParameterNote | undefined
  metricsError: string | null
  setMetricsCompareMode: (value: boolean) => void
  setMetricsLeftAlgorithm: (algorithm: string) => void
  setMetricsRightAlgorithm: (algorithm: string) => void
  setMetricsLeftParameter: (parameter: string) => void
  setMetricsRightParameter: (parameter: string) => void
  openPinnedAgent: (pinned: PinnedAgent) => void
  startTour: () => void
}) {
  const [pinnedLeftAgent, setPinnedLeftAgent] = useState<PinnedAgent | null>(null)
  const [pinnedRightAgent, setPinnedRightAgent] = useState<PinnedAgent | null>(null)

  const leftFixedParameters = leftParameterNote?.fixed_parameters.map((parameter) => `fixed=${encodeURIComponent(parameter)}`).join("&") ?? ""
  const rightFixedParameters = rightParameterNote?.fixed_parameters.map((parameter) => `fixed=${encodeURIComponent(parameter)}`).join("&") ?? ""
  const selectedUserParameter = selectedUserId ? `&user=${encodeURIComponent(selectedUserId)}` : ""
  const leftMetricsPrototypeSrc = `${prototypeChartSrc(metricsLeftAlgorithm, metricsLeftParameter, DEMO_ID_BY_METRICS_ALGORITHM[metricsLeftAlgorithm])}&frame=left&${leftFixedParameters}${selectedUserParameter}${metricsCompareMode ? "&legend=space" : ""}`
  const rightMetricsPrototypeSrc = `${prototypeChartSrc(metricsRightAlgorithm, metricsRightParameter, DEMO_ID_BY_METRICS_ALGORITHM[metricsRightAlgorithm])}&frame=right&${rightFixedParameters}${selectedUserParameter}`

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
                  setMetricsLeftParameter(METRICS_SWEEP_PARAMETERS[algorithm]?.[0]?.value ?? "dist_thresh")
                }}
              >
                <SelectTrigger className="h-10 text-base"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {metricsAlgorithms.map((algo) => <SelectItem key={algo} value={algo}>{algo}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <MetricsParameterRows algorithm={metricsLeftAlgorithm} note={leftParameterNote} />
            <PinnedAgentCard pinned={pinnedLeftAgent} openDemo={openPinnedAgent} />

            {metricsCompareMode && (
              <>
                <div className="space-y-1">
                  <label className="text-sm font-medium text-muted-foreground">Right</label>
                  <Select
                    value={metricsRightAlgorithm}
                    onValueChange={(algorithm) => {
                      setMetricsRightAlgorithm(algorithm)
                      setMetricsRightParameter(METRICS_SWEEP_PARAMETERS[algorithm]?.[0]?.value ?? "dist_thresh")
                    }}
                  >
                    <SelectTrigger className="h-10 text-base"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {metricsAlgorithms.map((algo) => <SelectItem key={algo} value={algo}>{algo}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <MetricsParameterRows algorithm={metricsRightAlgorithm} note={rightParameterNote} />
                <PinnedAgentCard pinned={pinnedRightAgent} openDemo={openPinnedAgent} />
              </>
            )}

            {metricsError && <p className="text-xs text-red-500">{metricsError}</p>}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

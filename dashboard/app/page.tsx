"use client"

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { DemoView } from "./_components/demo-view"
import { HomeView } from "./_components/home-view"
import { LearnView } from "./_components/learn-view"
import { MetricsView } from "./_components/metrics-view"
import {
  DASHBOARD_VIEWS,
  DEMO_ALGORITHM_IDS,
  FALLBACK_PARAMETER_NOTES,
  METRICS_ALGORITHM_BY_DEMO_ID,
  METRICS_SWEEP_PARAMETERS,
  algorithms,
} from "./_lib/dashboard-data"
import { validateAlgorithmParams } from "./_lib/dashboard-utils"
import type {
  CompareApiResponse,
  DashboardView,
  DemoMode,
  MetricsOptionsResponse,
  MetricsParameterNote,
} from "./_lib/types"
import { NomadNav } from "@/components/nomad-nav"

function NomadDashboard() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [activeView, setActiveView] = useState<DashboardView>("home")
  const [expandedAlgorithm, setExpandedAlgorithm] = useState<string | null>(null)
  const [compareMode, setCompareMode] = useState(false)
  const [leftAlgorithm, setLeftAlgorithm] = useState("dbstop")
  const [rightAlgorithm, setRightAlgorithm] = useState("seqscan")
  const [leftParams, setLeftParams] = useState<Record<string, string>>({})
  const [rightParams, setRightParams] = useState<Record<string, string>>({})
  const [leftParamErrors, setLeftParamErrors] = useState<Record<string, string>>({})
  const [rightParamErrors, setRightParamErrors] = useState<Record<string, string>>({})
  const [compareApiData, setCompareApiData] = useState<CompareApiResponse | null>(null)
  const [compareLoading, setCompareLoading] = useState(false)
  const [compareError, setCompareError] = useState<string | null>(null)
  const [compareSeed, setCompareSeed] = useState(1)
  const [demoTime, setDemoTime] = useState<number | null>(null)
  const compareRequestIdRef = useRef(0)
  const [metricsOptions, setMetricsOptions] = useState<MetricsOptionsResponse | null>(null)
  const [metricsCompareMode, setMetricsCompareMode] = useState(false)
  const [metricsLeftAlgorithm, setMetricsLeftAlgorithm] = useState("Lachesis")
  const [metricsRightAlgorithm, setMetricsRightAlgorithm] = useState("Sequential")
  const [metricsLeftParameter, setMetricsLeftParameter] = useState("delta_roam")
  const [metricsRightParameter, setMetricsRightParameter] = useState("delta_roam")
  const [metricsError, setMetricsError] = useState<string | null>(null)

  const syncUrl = useCallback((view: DashboardView, algoId: string | null = null, demoMode?: DemoMode) => {
    const params = new URLSearchParams(searchParams.toString())
    if (view === "home") {
      params.delete("view")
      params.delete("algo")
      params.delete("mode")
    } else {
      params.set("view", view)
      if (view === "learn" && algoId) {
        params.set("algo", algoId)
      } else {
        params.delete("algo")
      }
      if (view === "demo") {
        params.set("mode", demoMode ?? (compareMode ? "compare" : "single"))
      } else {
        params.delete("mode")
      }
    }
    const qs = params.toString()
    router.push(qs ? `${pathname}?${qs}` : pathname)
  }, [compareMode, pathname, router, searchParams])

  const runCompareVisualization = useCallback(async (seed: number) => {
    const leftAlgo = algorithms.find((a) => a.id === leftAlgorithm)
    const rightAlgo = algorithms.find((a) => a.id === rightAlgorithm)
    if (!leftAlgo || !rightAlgo) return
    const requestId = ++compareRequestIdRef.current

    const parseParams = (algoId: string, normalized: Record<string, number>) => {
      const out: Record<string, number> = { ...normalized }
      if (algoId === "dbscan") {
        out.dist_thresh = out.eps_spatial ?? 10
        out.time_thresh = out.T_max ?? 60
        out.min_pts = out.minPts ?? 3
      }
      if (algoId === "dbstop" || algoId === "seqscan" || algoId === "hdbscan") {
        out.dist_thresh = out.dist_thresh ?? 10
        out.time_thresh = out.time_thresh ?? 60
        out.min_pts = out.min_pts ?? 3
        out.dur_min = out.dur_min ?? 5
      }
      if (algoId === "gridbased") {
        out.cell_size = out.cell_size ?? 100
        out.min_time = out.min_time ?? 5
      }
      if (algoId === "lachesis" || algoId === "sequential-centroid" || algoId === "sequential-first") {
        out.dt_max = out.dt_max ?? 60
        out.delta_roam = out.delta_roam ?? 25
        out.dur_min = out.dur_min ?? 5
      }
      return out
    }

    const leftValidation = validateAlgorithmParams(leftAlgorithm, leftAlgo, leftParams)
    const rightValidation = validateAlgorithmParams(rightAlgorithm, rightAlgo, rightParams)
    setLeftParamErrors(leftValidation.errors)
    setRightParamErrors(compareMode ? rightValidation.errors : {})
    if (Object.keys(leftValidation.errors).length > 0 || (compareMode && Object.keys(rightValidation.errors).length > 0)) {
      setCompareError("Fix highlighted parameter values before running.")
      return
    }

    setCompareLoading(true)
    setCompareError(null)
    setCompareApiData(null)
    setDemoTime(null)
    try {
      const res = await fetch("/api/algorithm-compare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          seed,
          mode: compareMode ? "compare" : "single",
          left: {
            algo: leftAlgorithm === "dbscan" ? "tadbscan" : leftAlgorithm,
            params: parseParams(leftAlgorithm, leftValidation.normalized),
            cmap: "PiYG",
          },
          right: {
            algo: rightAlgorithm === "dbscan" ? "tadbscan" : rightAlgorithm,
            params: parseParams(rightAlgorithm, rightValidation.normalized),
            cmap: "PiYG",
          },
        }),
      })
      if (!res.ok) {
        const msg = await res.text()
        throw new Error(msg || "Algorithm compare request failed")
      }
      const data = (await res.json()) as CompareApiResponse
      if (requestId !== compareRequestIdRef.current) return
      setDemoTime(null)
      setCompareApiData(data)
    } catch (err) {
      if (requestId !== compareRequestIdRef.current) return
      setCompareError(err instanceof Error ? err.message : "Unexpected compare error")
    } finally {
      if (requestId !== compareRequestIdRef.current) return
      setCompareLoading(false)
    }
  }, [leftAlgorithm, rightAlgorithm, leftParams, rightParams, compareMode])

  const handleVisualize = useCallback(() => {
    void runCompareVisualization(compareSeed)
  }, [runCompareVisualization, compareSeed])

  const handleNewTrajectory = useCallback(() => {
    const nextSeed = compareSeed + 1
    setCompareSeed(nextSeed)
    void runCompareVisualization(nextSeed)
  }, [compareSeed, runCompareVisualization])

  const loadMetricsOptions = useCallback(async () => {
    try {
      setMetricsError(null)
      const res = await fetch("/api/algorithm-metrics", { method: "GET" })
      if (!res.ok) {
        const msg = await res.text()
        throw new Error(msg || "Failed to load aggregated metrics options")
      }
      const data = (await res.json()) as MetricsOptionsResponse
      setMetricsOptions(data)
      setMetricsLeftAlgorithm(data.defaults.left_algorithm ?? "Lachesis")
      setMetricsRightAlgorithm(data.defaults.right_algorithm ?? "Sequential")
    } catch (err) {
      setMetricsError(err instanceof Error ? err.message : "Failed to load metrics options")
    }
  }, [])

  const handleLeftAlgorithmChange = useCallback((algorithmId: string) => {
    setLeftAlgorithm(algorithmId)
    setLeftParams({})
    setLeftParamErrors({})
  }, [])

  const handleRightAlgorithmChange = useCallback((algorithmId: string) => {
    setRightAlgorithm(algorithmId)
    setRightParams({})
    setRightParamErrors({})
  }, [])

  const openMetricsFromDemo = useCallback(() => {
    const leftMetricsAlgorithm = METRICS_ALGORITHM_BY_DEMO_ID[leftAlgorithm]
    const rightMetricsAlgorithm = METRICS_ALGORITHM_BY_DEMO_ID[rightAlgorithm]

    if (leftMetricsAlgorithm) {
      setMetricsLeftAlgorithm(leftMetricsAlgorithm)
      setMetricsLeftParameter(METRICS_SWEEP_PARAMETERS[leftMetricsAlgorithm]?.[0]?.value ?? "dist_thresh")
    }
    if (rightMetricsAlgorithm) {
      setMetricsRightAlgorithm(rightMetricsAlgorithm)
      setMetricsRightParameter(METRICS_SWEEP_PARAMETERS[rightMetricsAlgorithm]?.[0]?.value ?? "dist_thresh")
    }
    setMetricsCompareMode(compareMode && Boolean(rightMetricsAlgorithm))
    setActiveView("metrics")
    syncUrl("metrics")
  }, [compareMode, leftAlgorithm, rightAlgorithm, syncUrl])

  const handleCompareModeToggle = useCallback(() => {
    const nextMode: DemoMode = compareMode ? "single" : "compare"
    setCompareMode(nextMode === "compare")
    syncUrl("demo", null, nextMode)
  }, [compareMode, syncUrl])

  const navigateTo = (view: DashboardView) => {
    setActiveView(view)
    syncUrl(view)
  }

  const openLearnAlgorithm = useCallback((algorithmId: string) => {
    setExpandedAlgorithm(algorithmId)
    setActiveView("learn")
    syncUrl("learn", algorithmId)
  }, [syncUrl])

  const openLearnDemo = useCallback((algorithmId: string) => {
    setLeftAlgorithm(algorithmId)
    setLeftParams({})
    setLeftParamErrors({})
    setCompareMode(false)
    setActiveView("demo")
    syncUrl("demo", null, "single")
  }, [syncUrl])

  const openLearnDocumentation = useCallback((algorithmId: string) => {
    document.getElementById(`learn-documentation-${algorithmId}`)?.scrollIntoView({ behavior: "smooth", block: "nearest" })
  }, [])

  const handleDemoTimeChange = useCallback((timestamp: number) => {
    setDemoTime(timestamp)
  }, [])

  const leftAlgo = algorithms.find((a) => a.id === leftAlgorithm)
  const rightAlgo = algorithms.find((a) => a.id === rightAlgorithm)
  const demoAlgorithms = algorithms.filter((a) => DEMO_ALGORITHM_IDS.has(a.id))
  const metricsAlgorithms = metricsOptions?.algorithms ?? ["Lachesis", "Sequential"]
  const parameterNotes: Record<string, MetricsParameterNote> = metricsOptions?.parameter_notes ?? FALLBACK_PARAMETER_NOTES
  const leftParameterNote = parameterNotes[metricsLeftAlgorithm]
  const rightParameterNote = parameterNotes[metricsRightAlgorithm]
  const leftSweepParameters = useMemo(() => METRICS_SWEEP_PARAMETERS[metricsLeftAlgorithm] ?? [], [metricsLeftAlgorithm])
  const rightSweepParameters = useMemo(() => METRICS_SWEEP_PARAMETERS[metricsRightAlgorithm] ?? [], [metricsRightAlgorithm])

  useEffect(() => {
    const rawView = searchParams.get("view")
    const nextView: DashboardView = rawView && DASHBOARD_VIEWS.has(rawView as DashboardView)
      ? (rawView as DashboardView)
      : "home"
    const rawAlgo = searchParams.get("algo")
    const hasAlgo = Boolean(rawAlgo && algorithms.some((a) => a.id === rawAlgo))
    const nextExpanded = nextView === "learn" && hasAlgo ? rawAlgo : null
    const rawMode = searchParams.get("mode")
    const nextCompareMode = nextView === "demo" && rawMode === "compare"

    setActiveView(nextView)
    setExpandedAlgorithm(nextExpanded)
    setCompareMode(nextCompareMode)
  }, [searchParams])

  useEffect(() => {
    if (activeView === "demo") {
      if (!DEMO_ALGORITHM_IDS.has(leftAlgorithm)) {
        setLeftAlgorithm("dbstop")
        return
      }
      if (!DEMO_ALGORITHM_IDS.has(rightAlgorithm)) {
        setRightAlgorithm("seqscan")
        return
      }
      void runCompareVisualization(compareSeed)
    }
  }, [activeView, compareSeed, runCompareVisualization, leftAlgorithm, rightAlgorithm])

  useEffect(() => {
    void loadMetricsOptions()
  }, [loadMetricsOptions])

  useEffect(() => {
    if (!leftSweepParameters.some((param) => param.value === metricsLeftParameter)) {
      setMetricsLeftParameter(leftSweepParameters[0]?.value ?? "dist_thresh")
    }
  }, [leftSweepParameters, metricsLeftParameter])

  useEffect(() => {
    if (!rightSweepParameters.some((param) => param.value === metricsRightParameter)) {
      setMetricsRightParameter(rightSweepParameters[0]?.value ?? "dist_thresh")
    }
  }, [rightSweepParameters, metricsRightParameter])

  return (
    <div className="h-screen overflow-hidden bg-background flex flex-col nomad-shell">
      <NomadNav />

      {activeView === "home" && (
        <HomeView navigateTo={navigateTo} />
      )}

      {activeView === "learn" && (
        <LearnView
          expandedAlgorithm={expandedAlgorithm}
          setExpandedAlgorithm={setExpandedAlgorithm}
          syncUrl={syncUrl}
          openLearnAlgorithm={openLearnAlgorithm}
          openLearnDemo={openLearnDemo}
          openLearnDocumentation={openLearnDocumentation}
        />
      )}

      {activeView === "demo" && (
        <DemoView
          compareMode={compareMode}
          leftAlgo={leftAlgo}
          rightAlgo={rightAlgo}
          demoAlgorithms={demoAlgorithms}
          leftAlgorithm={leftAlgorithm}
          rightAlgorithm={rightAlgorithm}
          leftParams={leftParams}
          rightParams={rightParams}
          leftParamErrors={leftParamErrors}
          rightParamErrors={rightParamErrors}
          compareApiData={compareApiData}
          compareLoading={compareLoading}
          compareError={compareError}
          demoTime={demoTime}
          setDemoTime={handleDemoTimeChange}
          setLeftParams={setLeftParams}
          setRightParams={setRightParams}
          setLeftParamErrors={setLeftParamErrors}
          setRightParamErrors={setRightParamErrors}
          handleCompareModeToggle={handleCompareModeToggle}
          handleLeftAlgorithmChange={handleLeftAlgorithmChange}
          handleRightAlgorithmChange={handleRightAlgorithmChange}
          handleNewTrajectory={handleNewTrajectory}
          handleVisualize={handleVisualize}
          openMetricsFromDemo={openMetricsFromDemo}
        />
      )}

      {activeView === "metrics" && (
        <MetricsView
          metricsCompareMode={metricsCompareMode}
          metricsAlgorithms={metricsAlgorithms}
          metricsLeftAlgorithm={metricsLeftAlgorithm}
          metricsRightAlgorithm={metricsRightAlgorithm}
          metricsLeftParameter={metricsLeftParameter}
          metricsRightParameter={metricsRightParameter}
          leftParameterNote={leftParameterNote}
          rightParameterNote={rightParameterNote}
          metricsError={metricsError}
          setMetricsCompareMode={setMetricsCompareMode}
          setMetricsLeftAlgorithm={setMetricsLeftAlgorithm}
          setMetricsRightAlgorithm={setMetricsRightAlgorithm}
          setMetricsLeftParameter={setMetricsLeftParameter}
          setMetricsRightParameter={setMetricsRightParameter}
        />
      )}
    </div>
  )
}

export default function Page() {
  return (
    <Suspense fallback={<div className="h-screen bg-background" />}>
      <NomadDashboard />
    </Suspense>
  )
}

"use client"

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { DemoView } from "./_components/demo-view"
import { HomeView } from "./_components/home-view"
import { LearnView } from "./_components/learn-view"
import { MetricsView } from "./_components/metrics-view"
import {
  DEMO_ALGORITHM_IDS,
  FALLBACK_PARAMETER_NOTES,
  METRICS_ALGORITHM_BY_DEMO_ID,
  METRICS_SWEEP_PARAMETERS,
  algorithms,
} from "./_lib/dashboard-data"
import { dashboardRouteState, validateAlgorithmParams } from "./_lib/dashboard-utils"
import { publicPath } from "./_lib/public-path"
import { loadCompareData } from "./_lib/static-cache"
import { METRICS_TOUR_STEPS, METRICS_TOUR_STORAGE_KEY, useProductTour } from "@/hooks/use-product-tour"
import type {
  CompareApiResponse,
  DashboardView,
  DemoMode,
  MetricsOptionsResponse,
  MetricsParameterNote,
} from "./_lib/types"
import { NomadNav } from "@/components/nomad-nav"

// Own dashboard's shared state & coordinate navigation, demo data
// metrics configuration, and guided tours, pass state & action handlers
// to individual view components
function NomadDashboard() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const searchParamString = searchParams.toString()
  const initialRoute = dashboardRouteState(searchParamString)
  const [activeView, setActiveView] = useState<DashboardView>(initialRoute.activeView)
  const [expandedAlgorithm, setExpandedAlgorithm] = useState<string | null>(initialRoute.expandedAlgorithm)
  const [compareMode, setCompareMode] = useState(initialRoute.compareMode)
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
  const [requestedUserId, setRequestedUserId] = useState<string | null>(null)
  const [demoTrajectory, setDemoTrajectory] = useState("two-stop")
  const [demoTime, setDemoTime] = useState<number | null>(null)
  const [showGroundTruth, setShowGroundTruth] = useState(true)
  const [showStops, setShowStops] = useState(true)
  const [showXray, setShowXray] = useState(true)
  const compareRequestIdRef = useRef(0)
  const [metricsOptions, setMetricsOptions] = useState<MetricsOptionsResponse | null>(null)
  const [metricsCompareMode, setMetricsCompareMode] = useState(false)
  const [metricsLeftAlgorithm, setMetricsLeftAlgorithm] = useState("Lachesis")
  const [metricsRightAlgorithm, setMetricsRightAlgorithm] = useState("Sequential (Centroid)")
  const [metricsLeftParameter, setMetricsLeftParameter] = useState("delta_roam")
  const [metricsRightParameter, setMetricsRightParameter] = useState("delta_roam")
  const [metricsTrajectory, setMetricsTrajectory] = useState("two-stop")
  const [metricsError, setMetricsError] = useState<string | null>(null)

  // Update browser URL to reflect the selected view
  // Include the algorithm for Learn & the single/compare mode for Demo
  // Remove those parameters where they no longer apply
  // Preserve unrelated query parameters and add a browser history entry
  const syncUrl = useCallback((view: DashboardView, algoId: string | null = null, demoMode?: DemoMode) => {
    const params = new URLSearchParams(searchParamString)
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
  }, [compareMode, pathname, router, searchParamString])
  // Validate the selected algorithms' parameters and load Demo visualization data.
  // Block loading when an active panel has validation errors.
  // Clear the previous loading error, then store returned data or the failure.
  // Use a request ID so an older request cannot overwrite newer state.
  const runCompareVisualization = useCallback(async (seed: number) => {
    const leftAlgo = algorithms.find((a) => a.id === leftAlgorithm)
    const rightAlgo = algorithms.find((a) => a.id === rightAlgorithm)
    if (!leftAlgo || !rightAlgo) return
    const requestId = ++compareRequestIdRef.current

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
    try {
      const data = await loadCompareData({
        seed,
        userId: requestedUserId ?? undefined,
        trajectory: demoTrajectory,
        mode: compareMode ? "compare" : "single",
        left: {
          algo: leftAlgorithm,
          params: leftValidation.normalized,
        },
        right: {
          algo: rightAlgorithm,
          params: rightValidation.normalized,
        },
      })
      if (requestId !== compareRequestIdRef.current) return
      setCompareApiData(data)
    } catch (err) {
      if (requestId !== compareRequestIdRef.current) return
      setCompareError(err instanceof Error ? err.message : "Unexpected compare error")
    } finally {
      if (requestId !== compareRequestIdRef.current) return
      setCompareLoading(false)
    }
  }, [leftAlgorithm, rightAlgorithm, leftParams, rightParams, compareMode, requestedUserId, demoTrajectory])

  // Handle New Agent buttom by clearing explicitly requested agent
  // incrementing seed & requesting visualization data with new seed
  // Updating the seed triggers the Demo-loading effect below
  const handleNewTrajectory = useCallback(() => {
    setRequestedUserId(null)
    setCompareSeed((seed) => seed + 1)
  }, [])

  // Load the cached Metrics configuration, including available algorithms
  // parameter notes and default left/right algorithms
  // Clear any previous Metrics error and report a filure if loading fails
  const loadMetricsOptions = useCallback(async () => {
    try {
      setMetricsError(null)
      const res = await fetch(publicPath("/cached-results/algorithm-metrics/options.json"))
      if (!res.ok) {
        const msg = await res.text()
        throw new Error(msg || "Failed to load aggregated metrics options")
      }
      const data = (await res.json()) as MetricsOptionsResponse
      setMetricsOptions(data)
      setMetricsLeftAlgorithm(data.defaults.left_algorithm ?? "Lachesis")
      setMetricsRightAlgorithm(data.defaults.right_algorithm ?? "Sequential (Centroid)")
    } catch (err) {
      setMetricsError(err instanceof Error ? err.message : "Failed to load metrics options")
    }
  }, [])

  // Change the left/single Demo algorithm & clear its parameter overrides
  // and validation errors so the new algorithm stats with its defaults
  // The demo-loading effect responds to the updated state
  const handleLeftAlgorithmChange = useCallback((algorithmId: string) => {
    setLeftAlgorithm(algorithmId)
    setLeftParams({})
    setLeftParamErrors({})
  }, [])

  // Change the right Demo algorithm and clear its parameter overrides
  // and validation errors so the new algorithm starts with its defaults.
  // The Demo-loading effect responds to the updated state.
  const handleRightAlgorithmChange = useCallback((algorithmId: string) => {
    setRightAlgorithm(algorithmId)
    setRightParams({})
    setRightParamErrors({})
  }, [])

  // Open Aggregated Metrics using the Metrics equivalents of the Demo algorithms.
  // For each available mapping, select its initial sweep parameter.
  // Enable Metrics comparison when Demo comparison is active and the right
  // algorithm has a Metrics mapping, then update the active view and URL.
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
    setMetricsTrajectory(demoTrajectory)
    setActiveView("metrics")
    syncUrl("metrics")
  }, [compareMode, demoTrajectory, leftAlgorithm, rightAlgorithm, syncUrl])

  // Open a metrics-selected agent in single-algorithm Demo mode.
  // Check that  payload includes a known algorithm, agent, parameter,
  // and finite value. Translate Metrics parameter names into Demo names,
  // combining fixed settings with the selected sweep value.
  // Apply the algorithm, parameters, and requested agent; clear previous
  // left-panel validation errors; then switch the view and update the URL.
  // Used by both individual chart-point clicks and the Open in Demo button.
  const handleMetricsPointSelect = useCallback((payload: {
    algoId?: string
    param?: string
    value?: number
    userId?: string
    fixed?: Record<string, string>
  }) => {
    const algoDef = algorithms.find((a) => a.id === payload.algoId)
    if (!algoDef || !payload.userId || !payload.param || !Number.isFinite(payload.value)) return

    const nextParams: Record<string, string> = {}
    for (const [name, value] of Object.entries(payload.fixed ?? {})) {
      nextParams[name] = value
    }
    nextParams[payload.param] = String(payload.value)

    setLeftAlgorithm(algoDef.id)
    setLeftParams(nextParams)
    setLeftParamErrors({})
    setRequestedUserId(payload.userId)
    setDemoTrajectory(metricsTrajectory)
    setCompareMode(false)
    setActiveView("demo")
    syncUrl("demo", null, "single")
  }, [metricsTrajectory, syncUrl])

  useEffect(() => {

    // Accept individual-point selection messages from the same origin
    // and forward their payload to the Metrics-to-Demo navigation handler.
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return
      if (event.data?.type !== "nomad-metrics-point-select") return
      handleMetricsPointSelect(event.data)
    }
    window.addEventListener("message", handleMessage)
    return () => window.removeEventListener("message", handleMessage)
  }, [handleMetricsPointSelect])

  // Toggle Demo between single-algorithm and comparison mode.
  // Update both the shared mode state and the browser URL;
  // the Demo-loading effect reloads data for the selected mode.
  const handleCompareModeToggle = useCallback(() => {
    const nextMode: DemoMode = compareMode ? "single" : "compare"
    setCompareMode(nextMode === "compare")
    syncUrl("demo", null, nextMode)
  }, [compareMode, syncUrl])

  // Switch to the requested dashboard view and update the browser URL.
  const navigateTo = (view: DashboardView) => {
    setActiveView(view)
    syncUrl(view)
  }

  // Open Learn with the requested algorithm expanded,
  // and include that algorithm in the browser URL.
  const openLearnAlgorithm = useCallback((algorithmId: string) => {
    setExpandedAlgorithm(algorithmId)
    setActiveView("learn")
    syncUrl("learn", algorithmId)
  }, [syncUrl])

  // Open an algorithm from Learn in single-algorithm Demo mode.
  // Clear its parameter overrides and validation errors,
  // then update the active view and browser URL.
  const openLearnDemo = useCallback((algorithmId: string) => {
    setLeftAlgorithm(algorithmId)
    setLeftParams({})
    setLeftParamErrors({})
    setCompareMode(false)
    setActiveView("demo")
    syncUrl("demo", null, "single")
  }, [syncUrl])

  // Smoothly scroll the requested algorithm's documentation section into view,
  // if its element is present on the page.
  const openLearnDocumentation = useCallback((algorithmId: string) => {
    document.getElementById(`learn-documentation-${algorithmId}`)?.scrollIntoView({ behavior: "smooth", block: "nearest" })
  }, [])

  // Store the playback timestamp reported by a Demo animation panel
  // so the panels can use the shared time.
  const handleDemoTimeChange = useCallback((timestamp: number) => {
    setDemoTime(timestamp)
  }, [])

  const leftAlgo = algorithms.find((a) => a.id === leftAlgorithm)
  const rightAlgo = algorithms.find((a) => a.id === rightAlgorithm)
  const demoAlgorithms = algorithms.filter((a) => DEMO_ALGORITHM_IDS.has(a.id))
  const metricsAlgorithms = metricsOptions?.algorithms ?? ["Lachesis", "Sequential (Centroid)"]
  const parameterNotes: Record<string, MetricsParameterNote> = metricsOptions?.parameter_notes ?? FALLBACK_PARAMETER_NOTES
  const leftParameterNote = parameterNotes[metricsLeftAlgorithm]
  const rightParameterNote = parameterNotes[metricsRightAlgorithm]
  const leftSweepParameters = useMemo(() => METRICS_SWEEP_PARAMETERS[metricsLeftAlgorithm] ?? [], [metricsLeftAlgorithm])
  const rightSweepParameters = useMemo(() => METRICS_SWEEP_PARAMETERS[metricsRightAlgorithm] ?? [], [metricsRightAlgorithm])
  const tourReady = activeView === "demo" && !compareMode && !compareLoading && Boolean(compareApiData?.left?.scene)
  const metricsTourReady = activeView === "metrics"

  // Prepare Demo for the guided tour by showing ground truth and detected stops.
  // If scene data is available, move the shared time to the final ping.
  const prepareTour = useCallback(() => {
    setShowGroundTruth(true)
    setShowStops(true)
    setShowXray(true)
    const lastPing = compareApiData?.left?.scene?.pings.slice(-1)[0]
    if (lastPing) setDemoTime(lastPing.timestamp)
  }, [compareApiData])
  const { startTour } = useProductTour(tourReady, prepareTour)
  const { startTour: startMetricsTour } = useProductTour(
    metricsTourReady,
    undefined,
    METRICS_TOUR_STEPS,
    METRICS_TOUR_STORAGE_KEY,
  )

  useEffect(() => {

    // Synchronize the active view, expanded Learn algorithm, and
    // demo mode with URL changes, including browser navigation
    const nextRoute = dashboardRouteState(searchParamString)
    setActiveView(nextRoute.activeView)
    setExpandedAlgorithm(nextRoute.expandedAlgorithm)
    setCompareMode(nextRoute.compareMode)
  }, [searchParamString])

  useEffect(() => {

    // While demo is active, replace unsupported algorithms with defaults
    // and reload visualization data when the selected algorithms, parameters
    // agent, trajectory, mode, or seed change
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
  // Load the cached metrics options when the dahsboard mounts
  useEffect(() => {
    const pings = compareApiData?.left.scene.pings
    if (!pings?.length) return
    setDemoTime((current) => (
      current !== null && pings.some((ping) => ping.timestamp === current)
        ? current
        : pings[pings.length - 1].timestamp
    ))
  }, [compareApiData])
  // Load the cached metrics options when the dahsboard mounts
  useEffect(() => {
    void loadMetricsOptions()
  }, [loadMetricsOptions])

  useEffect(() => {

    // Keep the left Metrics sweep parameter valid for its algorithm, 
    // selecting the first available option or a fallback when needed
    if (!leftSweepParameters.some((param) => param.value === metricsLeftParameter)) {
      setMetricsLeftParameter(leftSweepParameters[0]?.value ?? "dist_thresh")
    }
  }, [leftSweepParameters, metricsLeftParameter])

  useEffect(() => {

    // Keep the right metrics sweep parameter valid for its algorithm, 
    // selecting the first available option or a fallback when needed 
    if (!rightSweepParameters.some((param) => param.value === metricsRightParameter)) {
      setMetricsRightParameter(rightSweepParameters[0]?.value ?? "dist_thresh")
    }
  }, [rightSweepParameters, metricsRightParameter])

  return (
    <div className="min-h-screen bg-background flex flex-col nomad-shell">
      <NomadNav currentView={activeView} />

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
          showGroundTruth={showGroundTruth}
          showStops={showStops}
          showXray={showXray}
          leftAlgo={leftAlgo}
          rightAlgo={rightAlgo}
          demoAlgorithms={demoAlgorithms}
          leftAlgorithm={leftAlgorithm}
          rightAlgorithm={rightAlgorithm}
          leftParams={leftParams}
          rightParams={rightParams}
          leftParamErrors={leftParamErrors}
          rightParamErrors={rightParamErrors}
          demoTrajectory={demoTrajectory}
          compareApiData={compareApiData}
          compareError={compareError}
          demoTime={demoTime}
          setDemoTime={handleDemoTimeChange}
          setShowGroundTruth={setShowGroundTruth}
          setShowStops={setShowStops}
          setShowXray={setShowXray}
          setLeftParams={setLeftParams}
          setRightParams={setRightParams}
          setLeftParamErrors={setLeftParamErrors}
          setRightParamErrors={setRightParamErrors}
          setDemoTrajectory={setDemoTrajectory}
          handleCompareModeToggle={handleCompareModeToggle}
          handleLeftAlgorithmChange={handleLeftAlgorithmChange}
          handleRightAlgorithmChange={handleRightAlgorithmChange}
          handleNewTrajectory={handleNewTrajectory}
          openMetricsFromDemo={openMetricsFromDemo}
          startTour={startTour}
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
          metricsTrajectory={metricsTrajectory}
          selectedUserId={compareApiData?.left.scene?.user_id}
          leftParameterNote={leftParameterNote}
          rightParameterNote={rightParameterNote}
          metricsError={metricsError}
          setMetricsCompareMode={setMetricsCompareMode}
          setMetricsLeftAlgorithm={setMetricsLeftAlgorithm}
          setMetricsRightAlgorithm={setMetricsRightAlgorithm}
          setMetricsLeftParameter={setMetricsLeftParameter}
          setMetricsRightParameter={setMetricsRightParameter}
          setMetricsTrajectory={setMetricsTrajectory}
          openPinnedAgent={handleMetricsPointSelect}
          startTour={startMetricsTour}
        />
      )}
    </div>
  )
}

// Render the dashboard inside a Suspense boundary, providing a blank
// full-height fallback while the dashboard's initial render is suspended.
export default function Page() {
  return (
    <Suspense fallback={<div className="h-screen bg-background" />}>
      <NomadDashboard />
    </Suspense>
  )
}

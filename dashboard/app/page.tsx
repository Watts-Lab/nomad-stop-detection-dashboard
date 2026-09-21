"use client"

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { DemoView } from "./_components/demo-view"
import { HomeView } from "./_components/home-view"
import { LearnView } from "./_components/learn-view"
import { MetricsView } from "./_components/metrics-view"
import {
  DEMO_ALGORITHM_IDS,
  DEMO_PARAM_ALIASES,
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
  const compareRequestIdRef = useRef(0)
  const [metricsOptions, setMetricsOptions] = useState<MetricsOptionsResponse | null>(null)
  const [metricsCompareMode, setMetricsCompareMode] = useState(false)
  const [metricsLeftAlgorithm, setMetricsLeftAlgorithm] = useState("Lachesis")
  const [metricsRightAlgorithm, setMetricsRightAlgorithm] = useState("Sequential (Centroid)")
  const [metricsLeftParameter, setMetricsLeftParameter] = useState("delta_roam")
  const [metricsRightParameter, setMetricsRightParameter] = useState("delta_roam")
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
// Block loading if the left or right panels have errors while comparison mode active
// Normalize parameter names/defaults before loading.
// Clear  previous visualization & playback time, store returned data or error
// Use request ID so old request cannot overwrite result or loading state of new one
  const runCompareVisualization = useCallback(async (seed: number) => {
    const leftAlgo = algorithms.find((a) => a.id === leftAlgorithm)
    const rightAlgo = algorithms.find((a) => a.id === rightAlgorithm)
    if (!leftAlgo || !rightAlgo) return
    const requestId = ++compareRequestIdRef.current

    // Convert validated parameters into the names expected by the data loader
    // Supply missing algorithm-specific defaults
    // For DBSCAN, map eps_spatial, T_max, and minPts to the loader's field names
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
      const data = await loadCompareData({
        seed,
        userId: requestedUserId ?? undefined,
        trajectory: demoTrajectory,
        mode: compareMode ? "compare" : "single",
        left: {
          algo: leftAlgorithm === "dbscan" ? "tadbscan" : leftAlgorithm,
          params: parseParams(leftAlgorithm, leftValidation.normalized),
        },
        right: {
          algo: rightAlgorithm === "dbscan" ? "tadbscan" : rightAlgorithm,
          params: parseParams(rightAlgorithm, rightValidation.normalized),
        },
      })
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
  }, [leftAlgorithm, rightAlgorithm, leftParams, rightParams, compareMode, requestedUserId, demoTrajectory])

  // Handle New Agent buttom by clearing explicitly requested agent
  // incrementing seed & requesting visualization data with new seed
  // Updating the seed triggers the Demo-loading effect below
  const handleNewTrajectory = useCallback(() => {
    setRequestedUserId(null)
    const nextSeed = compareSeed + 1
    setCompareSeed(nextSeed)
    void runCompareVisualization(nextSeed)
  }, [compareSeed, runCompareVisualization])

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
    setActiveView("metrics")
    syncUrl("metrics")
  }, [compareMode, leftAlgorithm, rightAlgorithm, syncUrl])

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

    const aliasMap = DEMO_PARAM_ALIASES[payload.algoId as string] ?? {}
    const nextParams: Record<string, string> = {}
    for (const [name, value] of Object.entries(payload.fixed ?? {})) {
      nextParams[aliasMap[name] ?? name] = value
    }
    nextParams[aliasMap[payload.param] ?? payload.param] = String(payload.value)

    setLeftAlgorithm(algoDef.id)
    setLeftParams(nextParams)
    setLeftParamErrors({})
    setRequestedUserId(payload.userId)
    setCompareMode(false)
    setActiveView("demo")
    syncUrl("demo", null, "single")
  }, [syncUrl])

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

  useEffect(() => {
    
    // Load the cached metrics options when the dahsboard mounts
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
    <div className="h-screen overflow-hidden bg-background flex flex-col nomad-shell">
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
          selectedUserId={compareApiData?.left.scene?.user_id}
          leftParameterNote={leftParameterNote}
          rightParameterNote={rightParameterNote}
          metricsError={metricsError}
          setMetricsCompareMode={setMetricsCompareMode}
          setMetricsLeftAlgorithm={setMetricsLeftAlgorithm}
          setMetricsRightAlgorithm={setMetricsRightAlgorithm}
          setMetricsLeftParameter={setMetricsLeftParameter}
          setMetricsRightParameter={setMetricsRightParameter}
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




//--------------------------------------------------------------------------------------------
// MODULARIZE page.tsx into three separate files
//--------------------------------------------------------------------------------------------

/*
SIMULATED MODULARIZATION — REVIEW 

1. app/page.tsx
   Keeps shared selections and settings, navigation between views, URL
   synchronization, guided-tour setup, Metrics sweep-parameter validity
   checks, all rendered views, and the Page Suspense wrapper.
   Calls the two hooks below to obtain data and loading/error state.

2. hooks/use-demo-visualization.ts
   Handles Demo parameter validation, data loading, loading/error state,
   playback resets during loading, and outdated-request protection.
   Keeps parseParams as a private helper above the hook to prepare
   validated parameters for the existing loadCompareData function.

3. hooks/use-metrics-options.ts
   Loads the Metrics configuration, stores its results and errors,
   and applies the configured default left/right algorithms through
   setters supplied by page.tsx.

Existing shared code:
- dashboardRouteState and validateAlgorithmParams remain in
  app/_lib/dashboard-utils.ts and are reused.
- loadCompareData remains in app/_lib/static-cache.ts and is reused.
- Algorithm definitions and settings remain in app/_lib/dashboard-data.ts.
- No separate parameter-normalization file or new hooks folder is needed.
*/


/*
==============================================================================
FILE 1 OF 3: app/page.tsx
==============================================================================

"use client"

import { Suspense, useCallback, useEffect, useMemo, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { DemoView } from "./_components/demo-view"
import { HomeView } from "./_components/home-view"
import { LearnView } from "./_components/learn-view"
import { MetricsView } from "./_components/metrics-view"
import {
  DEMO_ALGORITHM_IDS,
  DEMO_PARAM_ALIASES,
  FALLBACK_PARAMETER_NOTES,
  METRICS_ALGORITHM_BY_DEMO_ID,
  METRICS_SWEEP_PARAMETERS,
  algorithms,
} from "./_lib/dashboard-data"
import { dashboardRouteState } from "./_lib/dashboard-utils"
import { METRICS_TOUR_STEPS, METRICS_TOUR_STORAGE_KEY, useProductTour } from "@/hooks/use-product-tour"
import type {
  DashboardView,
  DemoMode,
  MetricsParameterNote,
} from "./_lib/types"
import { useDemoVisualization } from "./_hooks/use-demo-visualization"
import { useMetricsOptions } from "./_hooks/use-metrics-options"
import { NomadNav } from "@/components/nomad-nav"

// Own dashboard's shared state & coordinate navigation, demo data
// metrics configuration, and guided tours, pass state & action handlers
// to individual view components
function NomadDashboard() {
  // --------------------------------------------------------------------------
  // 1. Shared state and routing inputs
  // --------------------------------------------------------------------------
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
  const [compareSeed, setCompareSeed] = useState(1)
  const [requestedUserId, setRequestedUserId] = useState<string | null>(null)
  const [demoTrajectory, setDemoTrajectory] = useState("two-stop")
  const [demoTime, setDemoTime] = useState<number | null>(null)
  const [showGroundTruth, setShowGroundTruth] = useState(true)
  const [showStops, setShowStops] = useState(true)
  const [metricsCompareMode, setMetricsCompareMode] = useState(false)
  const [metricsLeftAlgorithm, setMetricsLeftAlgorithm] = useState("Lachesis")
  const [metricsRightAlgorithm, setMetricsRightAlgorithm] = useState("Sequential (Centroid)")
  const [metricsLeftParameter, setMetricsLeftParameter] = useState("delta_roam")
  const [metricsRightParameter, setMetricsRightParameter] = useState("delta_roam")

  // --------------------------------------------------------------------------
  // 2. Feature data loading
  // --------------------------------------------------------------------------
  // Feature hooks own fetched results and loading details. Shared selections,
  // parameter errors, and playback time remain here for cross-view coordination.
  const { compareApiData, compareLoading, compareError, runCompareVisualization } = useDemoVisualization({
    activeView, compareSeed, leftAlgorithm, rightAlgorithm, leftParams, rightParams,
    compareMode, requestedUserId, demoTrajectory, setLeftAlgorithm, setRightAlgorithm,
    setLeftParamErrors, setRightParamErrors, setDemoTime,
  })
  const { metricsOptions, metricsError } = useMetricsOptions({
    setMetricsLeftAlgorithm, setMetricsRightAlgorithm,
  })

  // --------------------------------------------------------------------------
  // 3. URL updates
  // --------------------------------------------------------------------------
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

  // --------------------------------------------------------------------------
  // 4. Demo actions and cross-view navigation
  // --------------------------------------------------------------------------
  // Handle New Agent buttom by clearing explicitly requested agent
  // incrementing seed & requesting visualization data with new seed
  // Updating the seed triggers the Demo-loading effect below
  const handleNewTrajectory = useCallback(() => {
    setRequestedUserId(null)
    const nextSeed = compareSeed + 1
    setCompareSeed(nextSeed)
    void runCompareVisualization(nextSeed)
  }, [compareSeed, runCompareVisualization])

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
    setActiveView("metrics")
    syncUrl("metrics")
  }, [compareMode, leftAlgorithm, rightAlgorithm, syncUrl])

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

    const aliasMap = DEMO_PARAM_ALIASES[payload.algoId as string] ?? {}
    const nextParams: Record<string, string> = {}
    for (const [name, value] of Object.entries(payload.fixed ?? {})) {
      nextParams[aliasMap[name] ?? name] = value
    }
    nextParams[aliasMap[payload.param] ?? payload.param] = String(payload.value)

    setLeftAlgorithm(algoDef.id)
    setLeftParams(nextParams)
    setLeftParamErrors({})
    setRequestedUserId(payload.userId)
    setCompareMode(false)
    setActiveView("demo")
    syncUrl("demo", null, "single")
  }, [syncUrl])

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

  // --------------------------------------------------------------------------
  // 5. Derived settings and tour readiness
  // --------------------------------------------------------------------------
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

  // --------------------------------------------------------------------------
  // 6. Guided tours
  // --------------------------------------------------------------------------
  // Prepare Demo for the guided tour by showing ground truth and detected stops.
  // If scene data is available, move the shared time to the final ping.
  const prepareTour = useCallback(() => {
    setShowGroundTruth(true)
    setShowStops(true)
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

  // --------------------------------------------------------------------------
  // 7. Browser navigation and Metrics sweep validity
  // --------------------------------------------------------------------------
  useEffect(() => {

    // Synchronize the active view, expanded Learn algorithm, and
    // demo mode with URL changes, including browser navigation
    const nextRoute = dashboardRouteState(searchParamString)
    setActiveView(nextRoute.activeView)
    setExpandedAlgorithm(nextRoute.expandedAlgorithm)
    setCompareMode(nextRoute.compareMode)
  }, [searchParamString])

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

  // --------------------------------------------------------------------------
  // 8. Render the active view
  // --------------------------------------------------------------------------
  return (
    <div className="h-screen overflow-hidden bg-background flex flex-col nomad-shell">
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
          selectedUserId={compareApiData?.left.scene?.user_id}
          leftParameterNote={leftParameterNote}
          rightParameterNote={rightParameterNote}
          metricsError={metricsError}
          setMetricsCompareMode={setMetricsCompareMode}
          setMetricsLeftAlgorithm={setMetricsLeftAlgorithm}
          setMetricsRightAlgorithm={setMetricsRightAlgorithm}
          setMetricsLeftParameter={setMetricsLeftParameter}
          setMetricsRightParameter={setMetricsRightParameter}
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




==============================================================================
FILE 2 OF 3: app/_hooks/use-demo-visualization.ts
==============================================================================

import { useCallback, useEffect, useRef, useState } from "react"
import type { Dispatch, SetStateAction } from "react"
import { algorithms, DEMO_ALGORITHM_IDS } from "../_lib/dashboard-data"
import { validateAlgorithmParams } from "../_lib/dashboard-utils"
import { loadCompareData } from "../_lib/static-cache"
import { parseParams } from "../_lib/demo-loader-params"
import type { CompareApiResponse, DashboardView } from "../_lib/types"

// Inputs describe the current Demo configuration. Setters update state owned
// by page.tsx because navigation and tours also read or change that state.
type DemoVisualizationInputs = {
  activeView: DashboardView
  compareSeed: number
  leftAlgorithm: string
  rightAlgorithm: string
  leftParams: Record<string, string>
  rightParams: Record<string, string>
  compareMode: boolean
  requestedUserId: string | null
  demoTrajectory: string
  setLeftAlgorithm: Dispatch<SetStateAction<string>>
  setRightAlgorithm: Dispatch<SetStateAction<string>>
  setLeftParamErrors: Dispatch<SetStateAction<Record<string, string>>>
  setRightParamErrors: Dispatch<SetStateAction<Record<string, string>>>
  setDemoTime: Dispatch<SetStateAction<number | null>>
}

// Convert validated parameters into the names expected by the data loader
// Supply missing algorithm-specific defaults
// For DBSCAN, map eps_spatial, T_max, and minPts to the loader's field names
export const parseParams = (algoId: string, normalized: Record<string, number>) => {
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

export function useDemoVisualization({
  activeView, compareSeed, leftAlgorithm, rightAlgorithm, leftParams, rightParams,
  compareMode, requestedUserId, demoTrajectory, setLeftAlgorithm, setRightAlgorithm,
  setLeftParamErrors, setRightParamErrors, setDemoTime,
}: DemoVisualizationInputs) {
  // 1. Request results, loading status, error, and stale-request protection.
  const [compareApiData, setCompareApiData] = useState<CompareApiResponse | null>(null)
  const [compareLoading, setCompareLoading] = useState(false)
  const [compareError, setCompareError] = useState<string | null>(null)
  const compareRequestIdRef = useRef(0)

  // 2. Validate settings, normalize loader inputs, and load the requested scene.
// Validate the selected algorithms' parameters and load Demo visualization data.
// Block loading if the left or right panels have errors while comparison mode active
// Normalize parameter names/defaults before loading.
// Clear  previous visualization & playback time, store returned data or error
// Use request ID so old request cannot overwrite result or loading state of new one
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
    setCompareApiData(null)
    setDemoTime(null)
    try {
      const data = await loadCompareData({
        seed,
        userId: requestedUserId ?? undefined,
        trajectory: demoTrajectory,
        mode: compareMode ? "compare" : "single",
        left: {
          algo: leftAlgorithm === "dbscan" ? "tadbscan" : leftAlgorithm,
          params: parseParams(leftAlgorithm, leftValidation.normalized),
        },
        right: {
          algo: rightAlgorithm === "dbscan" ? "tadbscan" : rightAlgorithm,
          params: parseParams(rightAlgorithm, rightValidation.normalized),
        },
      })
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
  }, [leftAlgorithm, rightAlgorithm, leftParams, rightParams, compareMode, requestedUserId, demoTrajectory, setLeftParamErrors, setRightParamErrors, setDemoTime])


  // 3. Reload while Demo is active and restore unsupported algorithm selections.
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
  }, [activeView, compareSeed, runCompareVisualization, leftAlgorithm, rightAlgorithm, setLeftAlgorithm, setRightAlgorithm])

  // The page uses readiness for tours and the same runner for New Agent.
  return { compareApiData, compareLoading, compareError, runCompareVisualization }
}




==============================================================================
FILE 3 OF 3: app/_hooks/use-metrics-options.ts
==============================================================================

import { useCallback, useEffect, useState } from "react"
import type { Dispatch, SetStateAction } from "react"
import { publicPath } from "../_lib/public-path"
import type { MetricsOptionsResponse } from "../_lib/types"

type MetricsOptionsInputs = {
  setMetricsLeftAlgorithm: Dispatch<SetStateAction<string>>
  setMetricsRightAlgorithm: Dispatch<SetStateAction<string>>
}

// Load configuration once on mount. Algorithm selections stay in page.tsx
// because Demo-to-Metrics navigation also updates them. This does not load
// the chart's Parquet data; that responsibility stays in the public chart.
export function useMetricsOptions({
  setMetricsLeftAlgorithm, setMetricsRightAlgorithm,
}: MetricsOptionsInputs) {
  const [metricsOptions, setMetricsOptions] = useState<MetricsOptionsResponse | null>(null)
  const [metricsError, setMetricsError] = useState<string | null>(null)

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
  }, [setMetricsLeftAlgorithm, setMetricsRightAlgorithm])

  useEffect(() => {
    
    // Load the cached metrics options when the dahsboard mounts
    void loadMetricsOptions()
  }, [loadMetricsOptions])

  return { metricsOptions, metricsError }
}

*/

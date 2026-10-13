"use client"

import Link from "next/link"
import { useEffect, useMemo, useRef, useState } from "react"
import * as echarts from "echarts"
import type { TooltipComponentPositionCallback } from "echarts"
import { Activity, HelpCircle, MapPin, MapPinOff, Merge, Pause, Play, Radio, RotateCcw, Split, StepBack, StepForward, Target } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { parameterDisplayName } from "../_lib/dashboard-utils"
import type { ComparePanelResponse, EChartsApi } from "../_lib/types"
import { prepareDemoSceneData } from "../_lib/demo-scene-data"
import { prepareDemoResultData } from "../_lib/demo-result-data"
import {
  groundTruthAt, pastTruthStopData, currentTruthStopData, nextTruthStopData,
  groundTruthBuildingsSeriesData, groundTruthBuildingGlowData, groundTruthRouteLength,
  groundTruthRouteMarkerAt, groundTruthRouteGlowPoints
} from "./demo-viz/overlays/demo-ground-truth"
import { xrayAnchorFramesAt } from "./demo-viz/overlays/demo-xray"
import { detectedCountFor } from "./demo-viz/overlays/demo-detected-stops"
import { selectedPingLineData } from "./demo-viz/demo-interactions"
import {
  sequenceIndexAt, latestPingIndexAt, activePlaybackTimestamp, playbackStateFor,
  nextSequenceIndex, isPlaybackComplete, timelineValueToTimestamp,
  scrubPlaybackTimestamp, wheelDeltaPixels, wheelScrubSeconds, adjacentPingTimestamp
} from "./demo-viz/demo-playback"
import { createDemoMapChartOptions } from "./demo-viz/charts/demo-map-chart"
import { createDemoTimelineChartOptions } from "./demo-viz/charts/demo-timeline-chart"
import { boxIntersectsPoint, boxIntersectsSelection, tooltipPositions } from "./demo-viz/demo-tooltip-layout"
import { partialPath, routeProgressAt } from "./demo-viz/demo-route-animation"
import { buildDemoMapSeries, resolveHoverPingIndexes, currentPingData } from "./demo-viz/demo-scene-render"

const CURRENT_PING_COLOR = "#d83832"
// Hue of CURRENT_PING_COLOR, and the half-width of the arc around it kept free of cluster colors
const CURRENT_PING_HUE = 2
const CURRENT_PING_HUE_GUARD = 30
// Cluster hues occupy the rest of the wheel, phased so the first stop lands on the yellow
// the hand-picked palette used to start with
const CLUSTER_HUE_START = CURRENT_PING_HUE + CURRENT_PING_HUE_GUARD
const CLUSTER_HUE_SPAN = 360 - 2 * CURRENT_PING_HUE_GUARD
const CLUSTER_HUE_PHASE = (49 - CLUSTER_HUE_START) / CLUSTER_HUE_SPAN
const CLUSTER_HUE_PEAK = 55
const GROUND_TRUTH_COLOR = "#0f766e"
const FUTURE_GROUND_TRUTH_COLOR = "#4b918d"
const MAP_FOCUS_FADE_OPACITY = 0.2
type PlaybackState = "playing" | "paused" | "complete"

// Format elapsed seconds as minutes and seconds for the ping-comparison tooltip
const elapsedTimeLabel = (seconds: number) => {
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  return minutes ? `${minutes}m ${remainingSeconds}s` : `${remainingSeconds}s`
}

// Render and control the interactive map and timeline, 
// including hover, selection, playback, and panel synchronization
export function DemoSceneRenderer({
  panel,
  mode,
  currentTime,
  onTimeChange,
  syncMaster,
  showGroundTruth,
  showStops,
  showXray,
  variant = "full",
  onPreviewComplete,
  previewRunId = 0,
  onReplayStart,
  sharedPlaybackState = "complete",
  onPlaybackStateChange,
}: {
  panel: ComparePanelResponse
  mode: "single" | "compare"
  currentTime: number | null
  onTimeChange: (timestamp: number) => void
  syncMaster: boolean
  showGroundTruth: boolean
  showStops: boolean
  showXray: boolean
  variant?: "full" | "preview" | "destination-preview"
  onPreviewComplete?: () => void
  previewRunId?: number
  onReplayStart?: () => void
  sharedPlaybackState?: PlaybackState
  onPlaybackStateChange?: (state: PlaybackState) => void
}) {
  const scene = panel.scene
  const destinationPreview = variant === "destination-preview"
  const mapRef = useRef<HTMLDivElement | null>(null)
  const timelineRef = useRef<HTMLDivElement | null>(null)
  const comparisonTooltipRef = useRef<HTMLDivElement | null>(null)
  const toggleRef = useRef<() => void>(() => { })
  const replayRef = useRef<() => void>(() => { })
  const stepToPingRef = useRef<(direction: number) => void>(() => { })
  const previewRef = useRef<() => void>(() => { })
  const clearSelectionRef = useRef<() => void>(() => { })
  const onReplayStartRef = useRef(onReplayStart)
  const sharedPlaybackStateRef = useRef(sharedPlaybackState)
  const onPlaybackStateChangeRef = useRef(onPlaybackStateChange)
  const layerStateRef = useRef({ showGroundTruth, showStops, showXray })
  const selectedTimestampRef = useRef<number | null>(null)
  const wheelStartsAtEndRef = useRef(true)
  const selectedPingIndexesRef = useRef<number[]>([])
  const renderSceneRef = useRef<((timestampSeconds: number) => void) | null>(null)
  const [playbackState, setPlaybackState] = useState<"playing" | "paused" | "complete">("complete")
  const [selectedPingIndexes, setSelectedPingIndexes] = useState<number[]>([])
  const [comparisonTooltipPosition, setComparisonTooltipPosition] = useState({ left: 12, top: 12, visibility: "hidden" as "hidden" | "visible" })

  // Prepare scene-derived map and timeline data shared across algorithm and config results.
  const sceneData = useMemo(
    () => prepareDemoSceneData(scene),
    [
      scene.buildings,
      scene.destinationDiary,
      scene.pings,
      scene.routes,
      scene.truth,
    ],
  )

  const resultData = useMemo(
    () => sceneData ? prepareDemoResultData(panel, sceneData) : null,
    [panel.algo, panel.params, panel.result, scene.pings, sceneData],
  )

  const resultDataRef = useRef(resultData)
  const updateResultRef = useRef<(data: NonNullable<typeof resultData>) => void>(() => { })

  useEffect(() => {
    resultDataRef.current = resultData
    if (resultData) updateResultRef.current(resultData)
  }, [resultData])

  useEffect(() => {
    const initialChartData = resultDataRef.current
    if (!initialChartData || !mapRef.current || !timelineRef.current) return

    let chartData: NonNullable<typeof resultData> = initialChartData

    const mapEl = mapRef.current
    const timelineEl = timelineRef.current
    const previousTouchAction = mapEl.style.touchAction
    const previousTimelineTouchAction = timelineEl.style.touchAction
    mapEl.style.touchAction = "none"
    timelineEl.style.touchAction = "none"
    const mapChart = echarts.getInstanceByDom(mapEl) ?? echarts.init(mapEl, null, { renderer: "canvas" })
    const timelineChart = echarts.getInstanceByDom(timelineEl) ?? echarts.init(timelineEl, null, { renderer: "canvas" })
    if (mode === "compare") {
      mapChart.group = "compare-map"
      echarts.connect(mapChart.group)
    }
    const focusBounds = destinationPreview ? chartData.destinationBounds : chartData.focusBounds
    const minX = focusBounds.minX
    const minY = focusBounds.minY
    const maxX = focusBounds.maxX
    const maxY = focusBounds.maxY
    const xSpan = maxX - minX
    const ySpan = maxY - minY
    const xPad = Math.max(28, xSpan * 0.14)
    const yPad = Math.max(28, ySpan * 0.14)
    const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)
    const expandToRatio = (bounds: { minX: number, minY: number, maxX: number, maxY: number }, ratio: number) => {
      const width = bounds.maxX - bounds.minX
      const height = bounds.maxY - bounds.minY
      const centerX = (bounds.minX + bounds.maxX) / 2
      const centerY = (bounds.minY + bounds.maxY) / 2
      const expandedWidth = width / height < ratio ? height * ratio : width
      const expandedHeight = width / height < ratio ? height : width / ratio
      return {
        minX: centerX - expandedWidth / 2,
        maxX: centerX + expandedWidth / 2,
        minY: centerY - expandedHeight / 2,
        maxY: centerY + expandedHeight / 2,
      }
    }
    const mapBounds = () => {
      const plotRatio = Math.max(1, mapEl.clientWidth - 24) / Math.max(1, mapEl.clientHeight - 24)
      if (destinationPreview) {
        const mapZoom = 1.45
        const baseX = xSpan + xPad * 2
        const baseY = ySpan + yPad * 2
        const xRange = (baseX / baseY < plotRatio ? baseY * plotRatio : baseX) / mapZoom
        const yRange = (baseX / baseY < plotRatio ? baseY : baseX / plotRatio) / mapZoom
        const xCenter = (minX + maxX) / 2
        const yCenter = (minY + maxY) / 2
        const view = {
          minX: xCenter - xRange / 2,
          maxX: xCenter + xRange / 2,
          minY: yCenter - yRange / 2,
          maxY: yCenter + yRange / 2,
        }
        return { axis: view, view }
      }

      const world = expandToRatio(chartData.cityBounds, plotRatio)
      const snug = expandToRatio(focusBounds, plotRatio)
      const width = (snug.maxX - snug.minX) * 1.4
      const height = (snug.maxY - snug.minY) * 1.4
      const cityWidth = chartData.cityBounds.maxX - chartData.cityBounds.minX
      const cityHeight = chartData.cityBounds.maxY - chartData.cityBounds.minY
      const limits = width > cityWidth || height > cityHeight ? world : chartData.cityBounds
      const centerX = (focusBounds.minX + focusBounds.maxX) / 2
      const centerY = (focusBounds.minY + focusBounds.maxY) / 2
      const viewMinX = clamp(centerX - width / 2, limits.minX, limits.maxX - width)
      const viewMinY = clamp(centerY - height / 2, limits.minY, limits.maxY - height)
      return {
        axis: world,
        view: {
          minX: viewMinX,
          maxX: viewMinX + width,
          minY: viewMinY,
          maxY: viewMinY + height,
        },
      }
    }
    const applyMapBounds = () => {
      const bounds = mapBounds()
      mapChart.setOption({
        xAxis: { min: bounds.axis.minX, max: bounds.axis.maxX },
        yAxis: { min: bounds.axis.minY, max: bounds.axis.maxY },
        ...(!destinationPreview && {
          dataZoom: [
            { id: "map-x-zoom", startValue: bounds.view.minX, endValue: bounds.view.maxX },
            { id: "map-y-zoom", startValue: bounds.view.minY, endValue: bounds.view.maxY },
          ],
        }),
      })
    }
    const timeMin = destinationPreview ? 0 : scene.pings[0].timestamp * 1000
    const timeMax = destinationPreview ? chartData.destinationDuration : scene.pings[scene.pings.length - 1].timestamp * 1000
    const preparedSegments = chartData.segments.map((segment) => {
      let length = 0
      const cumulative = [0]
      for (let index = 1; index < segment.points.length; index += 1) {
        length += Math.hypot(
          segment.points[index][0] - segment.points[index - 1][0],
          segment.points[index][1] - segment.points[index - 1][1],
        )
        cumulative.push(length)
      }
      return { ...segment, cumulative, length }
    })
    let sequenceIndex = 0
    let paused = true
    let timer = 0
    let routeGlowFrame = 0
    let routeGlowStartedAt = 0
    let nextPathFrame = 0
    let nextPathStartedAt = 0
    let nextPathStopIndex = -1
    let nextPathVisible = false
    let pulsePhase = 0
    let pulseStrength = 0
    let pingFloatPhase = 0
    let pingFloatOffset = 0
    let previewing = false
    let hoverPingIndex: number | null = null
    let hoverEdgeEndpoints: [number, number] | null = null
    let hoverPingIndexes: Set<number> | null = null
    let mapMousePosition: number[] | null = null
    let mapPointerDown: number[] | null = null
    let mapPingClickHandled = false
    let backgroundClearFrame = 0
    let pingTooltipElement: HTMLDivElement | null = null
    let hoverBuildingId = ""
    let tourActionActive = false
    const frameDelay = variant === "preview" ? 30 : 60
    const startDelay = variant === "preview" ? 150 : 300
    const initialDelay = variant === "preview" ? 1000 : 300
    const toggleDelay = variant === "preview" ? 80 : 160

    // Derive playing, paused, or complete state and report it to React and the parent callback
    const syncPlaybackState = () => {
      const nextState = playbackStateFor(paused, sequenceIndex, chartData.timeSequence.length)
      setPlaybackState(nextState)
      onPlaybackStateChangeRef.current?.(nextState)
    }

    // Spread cluster colors across a hue range that avoids the current ping's red.
    const clusterColor = (cluster: number) => {
      if (cluster < 0) return "#1f2326"
      const hue =
        CLUSTER_HUE_START +
        ((cluster * 0.618034 + CLUSTER_HUE_PHASE) % 1) * CLUSTER_HUE_SPAN
      const warmth = Math.cos((hue - CLUSTER_HUE_PEAK) * Math.PI / 180)
      return `hsl(${hue}, ${73 + warmth * 18}%, ${51 + warmth * 11}%)`
    }

    const isDensityAlgorithm = chartData.result.kind === "density"
    const distThreshold = Number(panel.params?.dist_thresh ?? panel.params?.eps_spatial ?? 0)
    const paramsValue = (params: { data?: unknown; value?: unknown }) => (params.value ?? (params.data as { value?: number[] }).value ?? params.data) as number[]
    const pingCircle = (api: EChartsApi, scale = 1) => {
      const center = api.coord([api.value(0), api.value(1)])
      const edge = api.coord([api.value(0) + chartData.blockSide / 8 * scale, api.value(1)])
      return { center, radius: Math.abs(edge[0] - center[0]) }
    }

    // Cancel the route-glow animation and clear its chart series
    const stopRouteGlow = () => {
      if (routeGlowFrame) window.cancelAnimationFrame(routeGlowFrame)
      routeGlowFrame = 0
      mapChart.setOption({ series: [{ id: "route-glow", data: [] }] }, { lazyUpdate: true })
    }

    // Allow route glow when ground truth is visible and panel's playback conditions permit it
    const routeGlowAllowed = () =>
      layerStateRef.current.showGroundTruth && paused && (syncMaster || (mode === "compare" && sharedPlaybackStateRef.current !== "playing"))
    // Animate a repeating marker along the revealed route while route glow is allowed
    const startRouteGlow = () => {
      if (routeGlowFrame || !routeGlowAllowed()) return
      routeGlowStartedAt = performance.now()
      const cycleSeconds = 10
      const routeGlowStartDelay = 1
      const routeGlowFadeInSeconds = 0.5
      const routeGlowTravelSeconds = 2
      const routeGlowEndHoldSeconds = 1
      const routeGlowFadeOutSeconds = 0.5
      const step = (now: number) => {
        if (!routeGlowAllowed()) {
          stopRouteGlow()
          return
        }
        const timestampSeconds = selectedTimestampRef.current ?? chartData.timeSequence[sequenceIndex] ?? chartData.timeSequence[0]
        const points = groundTruthRouteGlowPoints(routeProgressAt(timestampSeconds, preparedSegments))
        const length = groundTruthRouteLength(points)
        const endHoldStarts = routeGlowStartDelay + routeGlowTravelSeconds
        const fadeOutStarts = endHoldStarts + routeGlowEndHoldSeconds
        const fadeOutEnds = fadeOutStarts + routeGlowFadeOutSeconds
        const cycleElapsed = ((now - routeGlowStartedAt) / 1000) % cycleSeconds
        const distance = Math.min(length, Math.max(0, cycleElapsed - routeGlowStartDelay) / routeGlowTravelSeconds * length)
        const marker = length > 0 ? groundTruthRouteMarkerAt(points, distance) : null
        const opacity = cycleElapsed < routeGlowFadeInSeconds
          ? cycleElapsed / routeGlowFadeInSeconds * 0.98
          : cycleElapsed <= fadeOutStarts
            ? 0.98
            : cycleElapsed < fadeOutEnds
              ? (fadeOutEnds - cycleElapsed) / routeGlowFadeOutSeconds * 0.98
              : 0
        mapChart.setOption({ series: [{ id: "route-glow", data: marker ? [[...marker, opacity]] : [] }] }, { lazyUpdate: true })
        routeGlowFrame = window.requestAnimationFrame(step)
      }
      routeGlowFrame = window.requestAnimationFrame(step)
    }

    // Start or stop route glow to match the current playback and visibility conditions
    const syncRouteGlow = () => {
      if (routeGlowAllowed()) startRouteGlow()
      else stopRouteGlow()
    }

    // Cancel the upcoming-path animation and clear its chart series
    const stopNextPathFlow = () => {
      if (nextPathFrame) window.cancelAnimationFrame(nextPathFrame)
      nextPathFrame = 0
      nextPathStopIndex = -1
      mapChart.setOption({ series: [{ id: "next-path", data: [] }] }, { lazyUpdate: true })
    }

    // Repeatedly reveal route to next destination while that path remains visible
    const startNextPathFlow = () => {
      if (nextPathFrame || !nextPathVisible) return
      nextPathStartedAt = performance.now()
      const step = (now: number) => {
        const timestampSeconds = selectedTimestampRef.current ?? chartData.timeSequence[sequenceIndex] ?? chartData.timeSequence[0]
        const next = routeProgressAt(timestampSeconds, preparedSegments).next
        if (!layerStateRef.current.showGroundTruth || !next) {
          stopNextPathFlow()
          return
        }
        if (next.stopIndex !== nextPathStopIndex) {
          nextPathStartedAt = now
          nextPathStopIndex = next.stopIndex
        }
        const travelSeconds = Math.max(0.4, next.length / 90)
        const cycleElapsed = (now - nextPathStartedAt) / 1000 % (travelSeconds + 0.5)
        const progress = Math.min(1, cycleElapsed / travelSeconds)
        mapChart.setOption({
          series: [{ id: "next-path", data: [{ coords: partialPath(next, progress) }] }],
        }, { lazyUpdate: true })
        nextPathFrame = window.requestAnimationFrame(step)
      }
      nextPathFrame = window.requestAnimationFrame(step)
    }

    // Start or stop upcoming-path animation according to its visibility
    const syncNextPathFlow = () => {
      if (nextPathVisible) startNextPathFlow()
      else stopNextPathFlow()
    }

    // Redraw map and timeline layers for the active time, visibility settings, hover, and selection
    // Synchronize route animations
    const renderScene = (timestampSeconds: number) => {
      if (destinationPreview) {
        mapChart.setOption({
          series: [
            {
              id: "buildings",
              data: [
                ...chartData.buildings.map((_, index) => [index, 0, 0, -1, 1]),
                ...chartData.destinationBuildings.map(([index, color, scale]) => [index, 0, 0, color, scale]),
              ],
            },
          ],
        })
        timelineChart.setOption({
          series: [{ id: "stop-bars", data: chartData.destinationStops }],
        })
        return
      }
      previewing = false
      const latestPingIndex = latestPingIndexAt(timestampSeconds, scene.pings)
      const route = routeProgressAt(timestampSeconds, preparedSegments)
      const detectedStopCount = detectedCountFor(timestampSeconds, chartData)
      const anchorFrames = xrayAnchorFramesAt(timestampSeconds, chartData)
      nextPathVisible = layerStateRef.current.showGroundTruth && Boolean(groundTruthAt(timestampSeconds, chartData).current && route.next)
      const anchorEdges = anchorFrames.flatMap((frame) => frame.edges)
      const promotionEdges = chartData.densityPromotionEdges.filter((edge) => edge.value[3] <= timestampSeconds)
      hoverPingIndexes = resolveHoverPingIndexes({
        timestampSeconds,
        chartData,
        selectedPingIndexes: selectedPingIndexesRef.current,
        hoverPingIndex,
        hoverEdgeEndpoints,
        anchorEdges
      })
      mapChart.setOption({
        series: buildDemoMapSeries({
          timestampSeconds,
          chartData,
          route,
          latestPingIndex,
          anchorFrames,
          anchorEdges,
          promotionEdges,
          hoverPingIndexes,
          hoverPingIndex,
          hoverBuildingId,
          selectedPingIndexes: selectedPingIndexesRef.current,
          showGroundTruth: layerStateRef.current.showGroundTruth,
          showStops: layerStateRef.current.showStops,
          showXray: layerStateRef.current.showXray,
          nextPathVisible,
          pulseStrength,
          pingFloatOffset,
          isDensityAlgorithm,
          clusterColor
        })
      }, { lazyUpdate: true })
      syncRouteGlow()
      syncNextPathFlow()

      timelineChart.setOption({
        series: [
          { id: "ping-ticks", data: chartData.pingData.map((_, index) => [index]) },
          { id: "core-point-ticks", data: layerStateRef.current.showXray ? chartData.coreTimelineData : [] },
          { id: "past-truth-stops", data: layerStateRef.current.showGroundTruth ? pastTruthStopData(timestampSeconds, chartData) : [] },
          { id: "next-truth-stop", data: layerStateRef.current.showGroundTruth ? nextTruthStopData(timestampSeconds, chartData) : [] },
          { id: "current-truth-stop", data: layerStateRef.current.showGroundTruth ? currentTruthStopData(timestampSeconds, chartData, pulseStrength) : [] },
          { id: "stop-bars", data: layerStateRef.current.showStops ? chartData.stopBars.slice(0, detectedStopCount) : [] },
          { id: "cursor", data: [[timestampSeconds * 1000]] }
        ]
      }, { lazyUpdate: true })
    }

    // Reveal the requested number of pings 
    // Temporarily hiding algorithm results and playback layers
    const renderTrajectoryPreview = (pingCount: number) => {
      const previewPings = chartData.pingData.slice(0, pingCount)
      nextPathVisible = false
      stopNextPathFlow()
      mapChart.setOption({
        series: [
          { id: "completed-paths", data: [] },
          { id: "completed-fallback-paths", data: [] },
          { id: "active-path", data: [] },
          { id: "active-fallback-path", data: [] },
          { id: "next-path", data: [] },
          { id: "route-glow", data: [] },
          { id: "ghost-pings", data: previewPings },
          { id: "noise-pings", data: [] },
          { id: "cluster-pings", data: [] },
          { id: "promotion-edges", data: [] },
          { id: "promotion-edges-hit-area", data: [] },
          { id: "core-points", data: [] },
          { id: "anchor-edges", data: [] },
          { id: "anchor-edges-hit-area", data: [] },
          { id: "anchor-points", data: [] },
          { id: "current-ping", data: [] },
          { id: "distance-circles", data: [] },
          { id: "selected-ping-line", data: selectedPingLineData(selectedPingIndexesRef.current, chartData) },
        ],
      }, { lazyUpdate: true })
      timelineChart.setOption({
        series: [
          { id: "ping-ticks", data: previewPings.map((_, index) => [index]) },
          { id: "core-point-ticks", data: [] },
          { id: "past-truth-stops", data: [] },
          { id: "next-truth-stop", data: [] },
          { id: "current-truth-stop", data: [] },
          { id: "stop-bars", data: [] },
          { id: "cursor", data: [] },
        ],
      }, { lazyUpdate: true })
    }

    // Animate the ping reveal in timed steps
    // Invoke the supplied completion callback
    const playTrajectoryPreview = (onComplete: () => void) => {
      previewing = true
      const frames = 18
      let frame = 0
      const step = () => {
        frame += 1
        renderTrajectoryPreview(Math.ceil((chartData.pingData.length * frame) / frames))
        if (frame < frames) {
          timer = window.setTimeout(step, 22)
        } else {
          timer = window.setTimeout(onComplete, 120)
        }
      }
      renderTrajectoryPreview(0)
      timer = window.setTimeout(step, 20)
    }
    const activeTimestamp = () => activePlaybackTimestamp(selectedTimestampRef.current, sequenceIndex, chartData.timeSequence)

    // Update the hovered ping and its ground-truth building, 
    // Redraw highlights and reposition tooltips
    const setHoveredPing = (pingIndex: number | null) => {
      const ping = pingIndex === null ? null : chartData.pings[pingIndex]
      const buildingId = ping ? groundTruthAt(ping.t, chartData).current?.location ?? "" : ""
      if (hoverPingIndex === pingIndex && hoverBuildingId === buildingId && hoverEdgeEndpoints === null) return
      hoverPingIndex = pingIndex
      hoverEdgeEndpoints = null
      hoverBuildingId = buildingId
      renderScene(activeTimestamp())
      refreshTooltipLayout()
    }

    // Update the hovered edge, clear ping/building hover
    // Redraw the connected-ping highligh
    const setHoveredEdge = (endpoints: [number, number] | null) => {
      const same = hoverEdgeEndpoints !== null && endpoints !== null &&
        hoverEdgeEndpoints[0] === endpoints[0] && hoverEdgeEndpoints[1] === endpoints[1]
      const alreadyClear = hoverEdgeEndpoints === null && endpoints === null
      if ((same || alreadyClear) && hoverPingIndex === null && hoverBuildingId === "") return
      hoverEdgeEndpoints = endpoints
      hoverPingIndex = null
      hoverBuildingId = ""
      renderScene(activeTimestamp())
      refreshTooltipLayout()
    }

    // Highlight a building while clearing ping and edge hover
    const setHoveredBuilding = (buildingId: string) => {
      if (hoverPingIndex === null && hoverEdgeEndpoints === null && hoverBuildingId === buildingId) return
      hoverPingIndex = null
      hoverEdgeEndpoints = null
      hoverBuildingId = buildingId
      renderScene(activeTimestamp())
      refreshTooltipLayout()
    }

    // Calculate selection coordinates and candidate tooltip positions,
    // checking for overlap with points, selection lines, and other tooltips.
    const selectedPingPixels = () => selectedPingIndexesRef.current.map((pingIndex) => {
      const ping = chartData.pings[pingIndex]
      return mapChart.convertToPixel({ gridIndex: 0 }, [ping.x, ping.y]) as number[]
    })

    const boxOverlapsElement: (position: number[], width: number, height: number, element: HTMLDivElement | null, gap: number) => boolean = ([left, top], width, height, element, gap) => {
      if (!element || element.style.visibility === "hidden") return false
      return !(
        left + width + gap <= element.offsetLeft ||
        left >= element.offsetLeft + element.offsetWidth + gap ||
        top + height + gap <= element.offsetTop ||
        top >= element.offsetTop + element.offsetHeight + gap
      )
    }

    // Position the selection tooltip without covering selected pings, their connecting line, 
    // the pointer, or the hover tooltip; hide it if no position fits
    const positionComparisonTooltip = () => {
      const selected = selectedPingIndexesRef.current
      const tooltip = comparisonTooltipRef.current
      if (!selected.length || !tooltip) return
      const points = selectedPingPixels()
      const hoveredPoint = hoverPingIndex === null ? null : (() => {
        const ping = chartData.pings[hoverPingIndex]
        return mapChart.convertToPixel({ gridIndex: 0 }, [ping.x, ping.y]) as number[]
      })()
      const padding = 12
      const gap = 16
      const tooltipWidth = tooltip.offsetWidth
      const tooltipHeight = tooltip.offsetHeight
      const position = tooltipPositions(tooltipWidth, tooltipHeight, padding, gap, points, mapEl.clientWidth, mapEl.clientHeight)
        .find((candidate) =>
          !boxIntersectsSelection(candidate, tooltipWidth, tooltipHeight, points) &&
          (!hoveredPoint || !boxIntersectsPoint(candidate, tooltipWidth, tooltipHeight, hoveredPoint)) &&
          (!mapMousePosition || !boxIntersectsPoint(candidate, tooltipWidth, tooltipHeight, mapMousePosition)) &&
          !boxOverlapsElement(candidate, tooltipWidth, tooltipHeight, pingTooltipElement, 10)
        )
      tooltip.style.visibility = position ? "visible" : "hidden"
      if (position) {
        tooltip.style.left = `${position[0]}px`
        tooltip.style.top = `${position[1]}px`
      }
      setComparisonTooltipPosition((current) => {
        if (!position) return current.visibility === "hidden" ? current : { ...current, visibility: "hidden" }
        if (current.left === position[0] && current.top === position[1] && current.visibility === "visible") return current
        return { left: position[0], top: position[1], visibility: "visible" }
      })
    }

    // Hide and reposition tooltips after chart or interaction changes
    // Restore the hovered ping's tooltip
    const refreshTooltipLayout = () => {
      mapChart.dispatchAction({ type: "hideTip" })
      if (comparisonTooltipRef.current) comparisonTooltipRef.current.style.visibility = "hidden"
      window.requestAnimationFrame(() => {
        positionComparisonTooltip()
        window.requestAnimationFrame(() => {
          if (hoverPingIndex !== null) showMapPingTip(hoverPingIndex)
        })
      })
    }

    // Toggle ping selection; allow two selected pings
    // Start a new selection when a third is clicked
    const selectPing = (pingIndex: number) => {
      const selected = selectedPingIndexesRef.current
      const next = selected.includes(pingIndex)
        ? selected.filter((selectedPingIndex) => selectedPingIndex !== pingIndex)
        : selected.length === 2 ? [pingIndex] : [...selected, pingIndex]
      selectedPingIndexesRef.current = next
      setSelectedPingIndexes(next)
      renderScene(activeTimestamp())
      refreshTooltipLayout()
    }

    // Clear selected pings and redraw the scene without selection highlighting
    const clearSelectedPings = () => {
      selectedPingIndexesRef.current = []
      setSelectedPingIndexes([])
      renderScene(activeTimestamp())
    }
    const tourCorePingIndexes = new Set(chartData.coreTimelineData.map((point) => point[2]))
    const tourTimelinePingIndex = chartData.pings.find((ping) => !tourCorePingIndexes.has(ping.i))?.i ?? 0
    const tourAnchorPingIndex = chartData.anchorFrames[0]?.point[3] ?? chartData.densityCorePointData[0]?.[3] ?? tourTimelinePingIndex
    // Apply or clear guided-tour highlights for example pings, anchors, 
    // and ground-truth buildings in single mode
    const onTourAction: EventListener = (event) => {
      if (mode !== "single") return
      const action = (event as CustomEvent).detail
      if (action === "clear") {
        tourActionActive = false
        setHoveredPing(null)
        return
      }
      tourActionActive = true
      if (action === "timeline-ping") setHoveredPing(tourTimelinePingIndex)
      if (action === "anchor-point") setHoveredPing(tourAnchorPingIndex)
      if (action === "ground-truth") setHoveredBuilding(chartData.truthStops[0]?.location ?? "")
    }

    // Route map hover events to the matching ping, anchor, or connection-edge highlight
    const onMapMouseOver = (params: echarts.ECElementEvent) => {
      if (params.seriesId === "anchor-edges-hit-area" || params.seriesId === "promotion-edges-hit-area") {
        const value = paramsValue(params)
        setHoveredEdge([Number(value[1]), Number(value[2])])
        return
      }
      if (
        params.seriesId === "ghost-pings" ||
        params.seriesId === "cluster-pings" ||
        params.seriesId === "noise-pings" ||
        params.seriesId === "current-ping" ||
        params.seriesId === "core-points" ||
        params.seriesId === "anchor-points" ||
        params.seriesId === "ping-hit-area"
      ) {
        setHoveredPing(paramsValue(params)[3])
      }
    }

    // Track the pointer position and move the comparison tooltip out of its way
    const onMapPointerMove: (event: { offsetX: number; offsetY: number }) => void = (event) => {
      mapMousePosition = [event.offsetX, event.offsetY]
      if (selectedPingIndexesRef.current.length) positionComparisonTooltip()
    }

    // Record where the pointer press begins so background clicks can be distinguished from drags
    const onMapSelectionPointerDown: (event: PointerEvent) => void = (event) => {
      if (backgroundClearFrame) window.cancelAnimationFrame(backgroundClearFrame)
      mapPingClickHandled = false
      const rect = mapEl.getBoundingClientRect()
      mapPointerDown = [event.clientX - rect.left, event.clientY - rect.top]
    }

    // Clear selection after a short background click inside the map, 
    // preserving selection after drags or ping clicks
    const onMapSelectionPointerUp: (event: PointerEvent) => void = (event) => {
      if (!mapPointerDown) return
      const start = mapPointerDown
      mapPointerDown = null
      const rect = mapEl.getBoundingClientRect()
      const point = [event.clientX - rect.left, event.clientY - rect.top]
      if (Math.hypot(point[0] - start[0], point[1] - start[1]) > 5) return
      if (point[0] < 0 || point[0] > rect.width || point[1] < 0 || point[1] > rect.height) return
      backgroundClearFrame = window.requestAnimationFrame(() => {
        if (!mapPingClickHandled && selectedPingIndexesRef.current.length) clearSelectedPings()
        mapPingClickHandled = false
        backgroundClearFrame = 0
      })
    }

    // Reset background-click tracking when the pointer interaction is cancelled
    const onMapSelectionPointerCancel = () => {
      mapPointerDown = null
      mapPingClickHandled = false
    }

    // Clear map hover when leaving an item or the chart, unless a tour highlight is active
    const onMapMouseOut = () => {
      mapMousePosition = null
      if (!tourActionActive) setHoveredEdge(null)
      else positionComparisonTooltip()
    }

    // Select a clicked map ping or anchor and prevent the click from being treated as a background click
    const onMapClick = (params: echarts.ECElementEvent) => {
      if (
        params.seriesId === "ghost-pings" ||
        params.seriesId === "cluster-pings" ||
        params.seriesId === "noise-pings" ||
        params.seriesId === "current-ping" ||
        params.seriesId === "core-points" ||
        params.seriesId === "anchor-points" ||
        params.seriesId === "ping-hit-area"
      ) {
        mapPingClickHandled = true
        selectPing(Number(paramsValue(params)[3]))
      }
    }

    // Ask ECharts to show the tooltip for the specified ping's hit area
    const showMapPingTip = (pingIndex: number) => {
      if (pingHitAreaSeriesIndex < 0) return
      mapChart.dispatchAction({ type: "showTip", seriesIndex: pingHitAreaSeriesIndex, dataIndex: pingIndex })
    }

    // Link timeline hover to the corresponding map ping, core point, or ground-truth building
    const onTimelineMouseOver = (params: echarts.ECElementEvent) => {
      mapMousePosition = null
      const value = paramsValue(params)
      if (params.seriesId === "ping-ticks") {
        const pingIndex = Number(value[0])
        setHoveredPing(pingIndex)
      }
      if (params.seriesId === "core-point-ticks") {
        const pingIndex = Number(value[2])
        setHoveredPing(pingIndex)
      }
      if (params.seriesId === "past-truth-stops") setHoveredBuilding(chartData.truthStops[Number(value[2])].location)
      if (params.seriesId === "current-truth-stop") setHoveredBuilding(chartData.truthStops[Number(value[3])].location)
      if (params.seriesId === "next-truth-stop") setHoveredBuilding(chartData.truthStops[Number(value[2])].location)
    }

    // Clear timeline-driven hover and hide the ping tooltip unless a tour highlight is active
    const onTimelineMouseOut = () => {
      if (!tourActionActive) {
        setHoveredPing(null)
        mapChart.dispatchAction({ type: "hideTip" })
      }
    }

    // Select the ping represented by a clicked timeline tick or core-point tick
    const onTimelineClick = (params: echarts.ECElementEvent) => {
      const value = paramsValue(params)
      if (params.seriesId === "ping-ticks") selectPing(Number(value[0]))
      if (params.seriesId === "core-point-ticks") selectPing(Number(value[2]))
    }

    // Pause and seek to the previous or next ping, staying put at either end
    const stepToPing = (direction: number) => {
      const pingTimestamp = adjacentPingTimestamp(activeTimestamp(), scene.pings, direction)
      if (pingTimestamp === undefined) return
      window.clearTimeout(timer)
      paused = true
      seekTo(pingTimestamp)
      setPlaybackState("paused")
      onPlaybackStateChangeRef.current?.("paused")
    }

    // Use Space for playback/replay, Escape to clear selected pings, and arrow keys
    // to step between pings, or to move the second selected ping when two are selected
    // Ignore keys that interactive controls handle themselves: Space on buttons and links,
    // and any key on form fields and sliders
    const onKeyDown: (event: KeyboardEvent) => void = (event) => {
      const target = event.target instanceof Element ? event.target : null
      if (target?.closest("input, select, textarea, [role='slider']")) return
      if (event.key === "Escape") {
        if (selectedPingIndexesRef.current.length) clearSelectedPings()
        return
      }
      if (event.key === " ") {
        if (target?.closest("button, a") || !syncMaster || variant !== "full" || event.repeat) return
        event.preventDefault()
        if (paused && isPlaybackComplete(sequenceIndex, chartData.timeSequence.length)
        ) {
          replayRef.current()
        }
        else toggleRef.current()
        return
      }
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return
      const selected = selectedPingIndexesRef.current
      const direction = event.key === "ArrowRight" ? 1 : -1
      if (selected.length !== 2) {
        if (!syncMaster || variant !== "full") return
        event.preventDefault()
        stepToPing(direction)
        return
      }
      let nextPingIndex = selected[1] + direction
      if (nextPingIndex === selected[0]) nextPingIndex += direction
      if (nextPingIndex < 0 || nextPingIndex >= chartData.pings.length) return
      event.preventDefault()
      const next = [selected[0], nextPingIndex]
      selectedPingIndexesRef.current = next
      setSelectedPingIndexes(next)
      renderScene(activeTimestamp())
      refreshTooltipLayout()
    }

    // Align the playback sequence index with the supplied timestamp
    const syncSequenceIndex = (timestampSeconds: number) => {
      sequenceIndex = sequenceIndexAt(timestampSeconds, chartData.timeSequence)
    }

    // Convert a timeline pointer position into a timestamp clamped to the scene's time range
    const timestampFromOffset = (offsetX: number, offsetY: number) => {
      const point = timelineChart.convertFromPixel({ gridIndex: 0 }, [offsetX, offsetY])
      const timeMs = Array.isArray(point) ? point[0] : point
      return timelineValueToTimestamp(timeMs, chartData.timeSequence)
    }

    // Update the local timestamp and sequence index, then report the new time to the parent
    const seekTo = (timestampSeconds: number) => {
      selectedTimestampRef.current = timestampSeconds
      syncSequenceIndex(timestampSeconds)
      onTimeChange(timestampSeconds)
    }
    let dragging = false

    // Seek continuously as the pointer drags across the timeline
    const onPointerMove = (event: PointerEvent) => {
      if (!dragging || !timelineRef.current) return
      const rect = timelineRef.current.getBoundingClientRect()
      seekTo(timestampFromOffset(event.clientX - rect.left, event.clientY - rect.top))
    }

    // End timeline dragging and remove its temporary pointer listeners
    const onPointerUp = () => {
      dragging = false
      window.removeEventListener("pointermove", onPointerMove)
      window.removeEventListener("pointerup", onPointerUp)
      window.removeEventListener("pointercancel", onPointerUp)
    }

    // Pause playback, seek to the pressed timeline position, and attach drag listeners
    // Grabbing the cursor itself keeps the current time until the pointer moves
    const onTimelinePointerDown = (event: { offsetX: number; offsetY: number; event?: MouseEvent; target?: { name?: string } }) => {
      event.event?.preventDefault()
      window.clearTimeout(timer)
      paused = true
      dragging = true
      if (event.target?.name !== "cursor-grab") seekTo(timestampFromOffset(event.offsetX, event.offsetY))
      setPlaybackState("paused")
      onPlaybackStateChangeRef.current?.("paused")
      window.addEventListener("pointermove", onPointerMove)
      window.addEventListener("pointerup", onPointerUp)
      window.addEventListener("pointercancel", onPointerUp)
    }
    // Show a drag cursor over the time cursor, which echarts would render with a pointer cursor
    const onTimelineHover = (event: { target?: { name?: string } }) => {
      if (event.target?.name === "cursor-grab") timelineChart.getZr().setCursorStyle("ew-resize")
    }
    let wheelGesturePixels = 0
    let wheelDirection = 0
    let lastWheelTime = 0

    // Pause and scrub time by scrolling
    // First scroll from the initial end view returns to the start, continued scrolling accelerates
    const onTimelineWheel = (event: WheelEvent) => {
      if (event.ctrlKey || event.shiftKey) return
      event.preventDefault()
      window.clearTimeout(timer)
      paused = true
      const activeTime = activePlaybackTimestamp(selectedTimestampRef.current, sequenceIndex, chartData.timeSequence)
      const minTime = chartData.timeSequence[0]
      const maxTime = chartData.timeSequence[chartData.timeSequence.length - 1]
      const initializedAtEnd = wheelStartsAtEndRef.current && activeTime === maxTime
      wheelStartsAtEndRef.current = false
      if (initializedAtEnd) {
        wheelGesturePixels = 0
        wheelDirection = 0
        lastWheelTime = 0
        seekTo(minTime)
      } else {
        const deltaPixels = wheelDeltaPixels(event)
        const direction = Math.sign(deltaPixels)
        const wheelTime = event.timeStamp
        if (direction !== wheelDirection || wheelTime - lastWheelTime > 200) wheelGesturePixels = 0
        const deltaSeconds = wheelScrubSeconds(deltaPixels, wheelGesturePixels, chartData.timeSequence)
        wheelGesturePixels += Math.abs(deltaPixels)
        wheelDirection = direction
        lastWheelTime = wheelTime
        seekTo(scrubPlaybackTimestamp(activeTime, deltaSeconds, chartData.timeSequence))
      }
      setPlaybackState("paused")
      onPlaybackStateChangeRef.current?.("paused")
    }

    // Advance playback on the controlling panel, report shared time, and stop at the end
    // Notify preview completion when applicable
    const advance = () => {
      if (paused || !syncMaster) return
      sequenceIndex = nextSequenceIndex(sequenceIndex, chartData.timeSequence.length)
      const timestampSeconds = chartData.timeSequence[sequenceIndex]
      onTimeChange(timestampSeconds)
      if (isPlaybackComplete(sequenceIndex, chartData.timeSequence.length)
      ) {
        paused = true
        syncPlaybackState()
        renderScene(timestampSeconds)
        if (variant === "preview") onPreviewComplete?.()
        return
      }
      timer = window.setTimeout(advance, frameDelay)
    }

    // Restart with a trajectory reveal, notify the other panel
    // Begin playback from the first timestamp
    const replay = () => {
      window.clearTimeout(timer)
      paused = false
      stopRouteGlow()
      stopNextPathFlow()
      sequenceIndex = 0
      setPlaybackState("playing")
      onPlaybackStateChangeRef.current?.("playing")
      onReplayStartRef.current?.()
      playTrajectoryPreview(() => {
        onTimeChange(chartData.timeSequence[0])
        if (syncMaster) timer = window.setTimeout(advance, startDelay)
      })
    }

    // Run the following panel's trajectory reveal
    // Restore the scene at the shared time
    const playLocalPreview = () => {
      window.clearTimeout(timer)
      stopRouteGlow()
      stopNextPathFlow()
      playTrajectoryPreview(() => {
        paused = true
        syncPlaybackState()
        renderScene(activeTimestamp())
      })
    }

    // Toggle paused/playing state and schedule playback advancement on the controlling panel
    const toggle = () => {
      paused = !paused
      syncPlaybackState()
      renderScene(activeTimestamp())
      if (!paused && syncMaster) timer = window.setTimeout(advance, toggleDelay)
    }

    const syncMapLineStyles = () => {
      const ping = chartData.pings[0]
      const origin = mapChart.convertToPixel({ gridIndex: 0 }, [ping.x, ping.y]) as number[]
      const edge = mapChart.convertToPixel({ gridIndex: 0 }, [ping.x + 1, ping.y]) as number[]
      const scale = Math.abs(edge[0] - origin[0]) / baseMapPixelsPerUnit
      mapChart.setOption({ series: [
        { id: "completed-paths", lineStyle: { width: 2.4 * scale } },
        { id: "completed-fallback-paths", lineStyle: { width: 2.4 * scale } },
        { id: "next-path", lineStyle: { width: 3 * scale } },
        { id: "active-path", lineStyle: { width: 4 * scale, shadowBlur: 10 * scale } },
        { id: "active-fallback-path", lineStyle: { width: 4 * scale, shadowBlur: 10 * scale } },
        { id: "promotion-edges", lineStyle: { width: 1.8 * scale } },
        { id: "promotion-edges-hit-area", lineStyle: { width: 16 * scale } },
        { id: "anchor-edges", lineStyle: { width: 1.8 * scale } },
        { id: "anchor-edges-hit-area", lineStyle: { width: 16 * scale } },
        { id: "selected-ping-line", lineStyle: { width: 3 * scale } },
      ] }, { lazyUpdate: true })
    }

    // Preserve the map camera while matching its bounds to the resized plot.
    const resize = () => {
      const dataZoom = mapChart.getOption().dataZoom
      const [xZoom, yZoom] = Array.isArray(dataZoom) ? dataZoom : []
      mapChart.resize()
      if (!destinationPreview && xZoom && yZoom) {
        const bounds = mapBounds()
        const minX = Number(xZoom.startValue)
        const maxX = Number(xZoom.endValue)
        const minY = Number(yZoom.startValue)
        const maxY = Number(yZoom.endValue)
        const centerX = (minX + maxX) / 2
        const centerY = (minY + maxY) / 2
        const area = (maxX - minX) * (maxY - minY)
        const ratio = Math.max(1, mapEl.clientWidth - 24) / Math.max(1, mapEl.clientHeight - 24)
        const height = Math.sqrt(area / ratio)
        const width = height * ratio
        mapChart.setOption({
          xAxis: { min: bounds.axis.minX, max: bounds.axis.maxX },
          yAxis: { min: bounds.axis.minY, max: bounds.axis.maxY },
          dataZoom: [
            { id: "map-x-zoom", startValue: centerX - width / 2, endValue: centerX + width / 2 },
            { id: "map-y-zoom", startValue: centerY - height / 2, endValue: centerY + height / 2 },
          ],
        })
      } else {
        applyMapBounds()
      }
      const defaultBounds = mapBounds()
      baseMapPixelsPerUnit = Math.max(1, mapEl.clientWidth - 16) /
        (defaultBounds.view.maxX - defaultBounds.view.minX)
      syncMapLineStyles()
      timelineChart.resize()
      refreshTooltipLayout()
    }

    // Position the hover tooltip within the chart while avoiding the hovered point, 
    // selection, and comparison tooltip
    const pingTooltipPosition: TooltipComponentPositionCallback = (point, _params, element, _rect, size) => {
      const padding = 8
      const gap = 16
      const tooltipWidth = size.contentSize[0]
      const tooltipHeight = size.contentSize[1]
      const points = selectedPingPixels()
      const maxLeft = Math.max(padding, size.viewSize[0] - tooltipWidth - padding)
      const maxTop = Math.max(padding, size.viewSize[1] - tooltipHeight - padding)
      const clamp: (position: number[]) => number[] = ([left, top]) => [
        Math.max(padding, Math.min(left, maxLeft)),
        Math.max(padding, Math.min(top, maxTop)),
      ]
      const positions = [gap, gap + 24, gap + 48].flatMap((offset) => [
        [point[0] + offset, point[1] - tooltipHeight / 2],
        [point[0] - offset - tooltipWidth, point[1] - tooltipHeight / 2],
        [point[0] - tooltipWidth / 2, point[1] + offset],
        [point[0] - tooltipWidth / 2, point[1] - offset - tooltipHeight],
        [point[0] + offset, point[1] + offset],
        [point[0] - offset - tooltipWidth, point[1] + offset],
        [point[0] + offset, point[1] - offset - tooltipHeight],
        [point[0] - offset - tooltipWidth, point[1] - offset - tooltipHeight],
      ]).map(clamp)
      const comparisonTooltip = comparisonTooltipRef.current
      const overlapsComparison: (position: number[]) => boolean = ([left, top]) => {
        if (!comparisonTooltip || comparisonTooltip.style.visibility === "hidden") return false
        return !(
          left + tooltipWidth + gap <= comparisonTooltip.offsetLeft ||
          left >= comparisonTooltip.offsetLeft + comparisonTooltip.offsetWidth + gap ||
          top + tooltipHeight + gap <= comparisonTooltip.offsetTop ||
          top >= comparisonTooltip.offsetTop + comparisonTooltip.offsetHeight + gap
        )
      }
      const position = positions.find((candidate) =>
        !boxIntersectsPoint(candidate, tooltipWidth, tooltipHeight, point) &&
        !boxIntersectsSelection(candidate, tooltipWidth, tooltipHeight, points) &&
        !overlapsComparison(candidate)
      )
      if (element instanceof HTMLDivElement) {
        pingTooltipElement = element
        element.style.visibility = position ? "visible" : "hidden"
      }
      return position ?? positions[0]
    }

    const bounds = mapBounds()
    let baseMapPixelsPerUnit = Math.max(1, mapEl.clientWidth - 16) /
      (bounds.view.maxX - bounds.view.minX)

    mapChart.setOption(
      createDemoMapChartOptions({
        getChartData: () => chartData,
        bounds,
        getHoverBuildingId: () => hoverBuildingId,
        getHoverPingIndexes: () => hoverPingIndexes,
        pingTooltipPosition,
        algorithm: panel.algo,
        getShowXray: () => layerStateRef.current.showXray,
        getShowStops: () => layerStateRef.current.showStops,
        getActiveTimestamp: activeTimestamp,
        getBaseMapPixelsPerUnit: () => baseMapPixelsPerUnit,
        destinationPreview,
        clusterColor
      })
    )
    const pingHitAreaSeriesIndex = (mapChart.getOption().series as Array<{ id?: string }>)
      .findIndex((series) => series.id === "ping-hit-area")

    timelineChart.setOption(
      createDemoTimelineChartOptions({
        getChartData: () => chartData,
        timeMin,
        timeMax,
        getHoverPingIndex: () => hoverPingIndex,
        getSelectedPingIndexes: () => selectedPingIndexesRef.current,
        destinationPreview,
        clusterColor
      })
    )

    toggleRef.current = toggle
    replayRef.current = replay
    stepToPingRef.current = stepToPing
    previewRef.current = playLocalPreview
    clearSelectionRef.current = clearSelectedPings
    renderSceneRef.current = (timestampSeconds) => {
      syncSequenceIndex(timestampSeconds)
      renderScene(timestampSeconds)
    }
    updateResultRef.current = (data) => {
      chartData = data
      renderSceneRef.current?.(
        selectedTimestampRef.current ?? data.timeSequence[data.timeSequence.length - 1],
      )
    }
    const initialTimestamp = destinationPreview
      ? 0
      : variant === "preview"
        ? chartData.timeSequence[0]
        : selectedTimestampRef.current ?? chartData.timeSequence[chartData.timeSequence.length - 1]
    sequenceIndex = chartData.timeSequence.findIndex((timestamp) => timestamp >= initialTimestamp)
    if (sequenceIndex < 0) sequenceIndex = chartData.timeSequence.length - 1
    paused = true
    syncPlaybackState()
    renderSceneRef.current(initialTimestamp)
    window.addEventListener("resize", resize)
    if (destinationPreview) {
      return () => {
        window.removeEventListener("resize", resize)
        updateResultRef.current = () => { }
        renderSceneRef.current = null
        mapEl.style.touchAction = previousTouchAction
        timelineEl.style.touchAction = previousTimelineTouchAction
      }
    }
    window.addEventListener("nomad-tour-action", onTourAction)
    window.addEventListener("keydown", onKeyDown)
    window.addEventListener("pointerup", onMapSelectionPointerUp)
    window.addEventListener("pointercancel", onMapSelectionPointerCancel)
    mapEl.addEventListener("pointerdown", onMapSelectionPointerDown)
    timelineEl.style.cursor = "ew-resize"
    mapChart.on("mouseover", onMapMouseOver)
    mapChart.on("mouseout", onMapMouseOut)
    mapChart.on("globalout", onMapMouseOut)
    mapChart.on("click", onMapClick)
    const onMapZoom = () => {
      syncMapLineStyles()
      refreshTooltipLayout()
    }
    mapChart.on("dataZoom", onMapZoom)
    mapChart.getZr().on("mousemove", onMapPointerMove)
    timelineChart.on("mouseover", onTimelineMouseOver)
    timelineChart.on("globalout", onTimelineMouseOut)
    timelineChart.on("click", onTimelineClick)
    timelineChart.getZr().on("mousedown", onTimelinePointerDown)
    timelineChart.getZr().on("mousemove", onTimelineHover)
    mapEl.addEventListener("wheel", onTimelineWheel, { passive: false, capture: true })
    timelineEl.addEventListener("wheel", onTimelineWheel, { passive: false, capture: true })
    if (variant === "preview") timer = window.setTimeout(replay, initialDelay)
    const pulseTimer = window.setInterval(() => {
      if (previewing) return
      const timestampSeconds = selectedTimestampRef.current ?? chartData.timeSequence[sequenceIndex]
      const ended = timestampSeconds >= chartData.timeSequence[chartData.timeSequence.length - 1]
      pingFloatPhase += 0.350
      pingFloatOffset = -3 + Math.sin(pingFloatPhase) * 3
      pulsePhase = ended ? 0 : pulsePhase + 0.24
      pulseStrength = ended ? 0 : (Math.sin(pulsePhase) + 1) / 2
      mapChart.setOption({
        series: [
          ...(ended ? [] : [
            { id: "streets", data: chartData.streets.map((_, index) => index) },
            { id: "street-lanes", data: chartData.streetLanes.map((_, index) => index) },
            {
              id: "buildings",
              data: groundTruthBuildingsSeriesData(
                timestampSeconds,
                chartData,
                layerStateRef.current.showGroundTruth,
                pulseStrength,
                hoverBuildingId,
              ),
            },
            {
              id: "building-glow",
              data: groundTruthBuildingGlowData(
                timestampSeconds,
                chartData,
                layerStateRef.current.showGroundTruth,
                pulseStrength,
                hoverBuildingId,
              ),
            },
          ]),
          {
            id: "current-ping",
            data: currentPingData(
              timestampSeconds,
              chartData,
              latestPingIndexAt(timestampSeconds, scene.pings),
              layerStateRef.current.showStops,
              hoverPingIndexes,
              pingFloatOffset,
            ),
          },
        ],
      })
      if (!ended) {
        timelineChart.setOption({
          series: [{
            id: "current-truth-stop",
            data: layerStateRef.current.showGroundTruth
              ? currentTruthStopData(timestampSeconds, chartData, pulseStrength)
              : [],
          }],
        })
      }
    }, 80)

    return () => {
      window.clearTimeout(timer)
      window.clearInterval(pulseTimer)
      if (backgroundClearFrame) window.cancelAnimationFrame(backgroundClearFrame)
      if (routeGlowFrame) window.cancelAnimationFrame(routeGlowFrame)
      if (nextPathFrame) window.cancelAnimationFrame(nextPathFrame)
      window.removeEventListener("resize", resize)
      window.removeEventListener("nomad-tour-action", onTourAction)
      window.removeEventListener("keydown", onKeyDown)
      window.removeEventListener("pointerup", onMapSelectionPointerUp)
      window.removeEventListener("pointercancel", onMapSelectionPointerCancel)
      mapEl.removeEventListener("pointerdown", onMapSelectionPointerDown)
      window.removeEventListener("pointermove", onPointerMove)
      window.removeEventListener("pointerup", onPointerUp)
      window.removeEventListener("pointercancel", onPointerUp)
      toggleRef.current = () => { }
      replayRef.current = () => { }
      stepToPingRef.current = () => { }
      previewRef.current = () => { }
      clearSelectionRef.current = () => { }
      updateResultRef.current = () => { }
      mapChart.off("mouseover", onMapMouseOver)
      mapChart.off("mouseout", onMapMouseOut)
      mapChart.off("globalout", onMapMouseOut)
      mapChart.off("click", onMapClick)
      mapChart.off("dataZoom", onMapZoom)
      mapChart.getZr().off("mousemove", onMapPointerMove)
      timelineChart.off("mouseover", onTimelineMouseOver)
      timelineChart.off("globalout", onTimelineMouseOut)
      timelineChart.off("click", onTimelineClick)
      timelineChart.getZr().off("mousedown", onTimelinePointerDown)
      timelineChart.getZr().off("mousemove", onTimelineHover)
      mapEl.removeEventListener("wheel", onTimelineWheel, true)
      timelineEl.removeEventListener("wheel", onTimelineWheel, true)
      renderSceneRef.current = null
      mapEl.style.touchAction = previousTouchAction
      timelineEl.style.touchAction = previousTimelineTouchAction
    }
  }, [destinationPreview, mode, onPreviewComplete, onTimeChange, panel.algo, scene.pings, syncMaster, variant])

  useEffect(() => {
    layerStateRef.current = { showGroundTruth, showStops, showXray }
    const timestamp = selectedTimestampRef.current ?? resultDataRef.current?.timeSequence.at(-1)
    if (timestamp !== undefined) renderSceneRef.current?.(timestamp)
  }, [showGroundTruth, showStops, showXray])

  useEffect(() => {
    const mapEl = mapRef.current
    const timelineEl = timelineRef.current
    return () => {
      if (mapEl) echarts.getInstanceByDom(mapEl)?.dispose()
      if (timelineEl) echarts.getInstanceByDom(timelineEl)?.dispose()
    }
  }, [])

  useEffect(() => {
    onReplayStartRef.current = onReplayStart
  }, [onReplayStart])

  useEffect(() => {
    onPlaybackStateChangeRef.current = onPlaybackStateChange
  }, [onPlaybackStateChange])

  useEffect(() => {
    sharedPlaybackStateRef.current = sharedPlaybackState
    if (!syncMaster && selectedTimestampRef.current !== null) {
      renderSceneRef.current?.(selectedTimestampRef.current)
    }
  }, [sharedPlaybackState, syncMaster])

  useEffect(() => {
    if (!previewRunId || syncMaster) return
    previewRef.current()
  }, [previewRunId, syncMaster])

  useEffect(() => {
    if (destinationPreview) return
    if (!resultData || currentTime !== null) return
    onTimeChange(variant === "preview" ? resultData.timeSequence[0] : resultData.timeSequence[resultData.timeSequence.length - 1])
  }, [currentTime, destinationPreview, onTimeChange, resultData, variant])

  useEffect(() => {
    const data = resultDataRef.current
    if (!data || currentTime === null) return
    if (currentTime !== data.timeSequence[data.timeSequence.length - 1]) wheelStartsAtEndRef.current = false
    selectedTimestampRef.current = currentTime
    renderSceneRef.current?.(currentTime)
  }, [currentTime])

  const selectedPings = selectedPingIndexes.length === 2 && resultData
    ? selectedPingIndexes.map((pingIndex) => resultData.pings[pingIndex])
    : null
  const selectedPing = selectedPingIndexes.length === 1 && resultData ? resultData.pings[selectedPingIndexes[0]] : null
  const selectedPingDistance = selectedPings
    ? Math.hypot(selectedPings[1].x - selectedPings[0].x, selectedPings[1].y - selectedPings[0].y)
    : 0
  const selectedPingElapsed = selectedPings ? Math.abs(selectedPings[1].t - selectedPings[0].t) : 0
  // Derived from the shared time so the end state holds however it was reached
  const atLastPing = currentTime !== null && adjacentPingTimestamp(currentTime, scene.pings, 1) === undefined

  return (
    <div className={`relative flex h-full w-full flex-col overflow-hidden rounded-md border border-[#d7dbd2] bg-[#f8f9fc] text-[#202124] shadow-[0_16px_45px_rgba(32,33,36,0.08)] ${destinationPreview ? "pointer-events-none" : ""}`}>
      {(selectedPings || selectedPing) && (
        <div ref={comparisonTooltipRef} style={comparisonTooltipPosition} className="pointer-events-none absolute z-10 rounded-sm bg-[rgba(32,33,36,0.92)] px-2 py-1.5 text-sm text-white shadow-md">
          {selectedPings ? <>
            <div>Ping comparison</div>
            <div>Ping {selectedPings[0].i + 1}: {selectedPings[0].time}</div>
            <div>Ping {selectedPings[1].i + 1}: {selectedPings[1].time}</div>
            <div>Distance: {selectedPingDistance.toFixed(1)} m</div>
            <div>Time between: {elapsedTimeLabel(selectedPingElapsed)}</div>
          </> : <div>Ping {selectedPing!.i + 1} selected</div>}
        </div>
      )}
      {syncMaster && variant === "full" && (
        <div className="pointer-events-none absolute right-3 top-3 z-10 flex gap-2">
          <TooltipProvider delayDuration={300}>
            <div className="pointer-events-auto flex items-center gap-1 rounded-md border border-[#d7dbd2] bg-[#f8f9fc] px-1 py-1 shadow-sm">
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => stepToPingRef.current(-1)}
                    aria-label="Previous ping"
                    className="flex h-8 w-8 items-center justify-center rounded-md border border-[#bfc6bb] bg-[#f8f9fc] text-[#3b1370] hover:bg-white hover:border-[#7629db]"
                  >
                    <StepBack className="h-4 w-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Previous ping</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => toggleRef.current()}
                    disabled={atLastPing && playbackState !== "playing"}
                    aria-label={playbackState === "playing" ? "Pause" : "Play"}
                    className="flex h-8 w-8 items-center justify-center rounded-md border border-[#bfc6bb] bg-[#f8f9fc] text-[#3b1370] hover:bg-white hover:border-[#7629db] disabled:pointer-events-none disabled:opacity-40"
                  >
                    {playbackState === "playing" ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 fill-current" />}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom">{playbackState === "playing" ? "Pause" : "Play"}</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => stepToPingRef.current(1)}
                    disabled={atLastPing}
                    aria-label="Next ping"
                    className="flex h-8 w-8 items-center justify-center rounded-md border border-[#bfc6bb] bg-[#f8f9fc] text-[#3b1370] hover:bg-white hover:border-[#7629db] disabled:pointer-events-none disabled:opacity-40"
                  >
                    <StepForward className="h-4 w-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Next ping</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => replayRef.current()}
                    aria-label="Replay"
                    className="flex h-8 w-8 items-center justify-center rounded-md border border-[#bfc6bb] bg-[#f8f9fc] text-[#3b1370] hover:bg-white hover:border-[#7629db]"
                  >
                    <RotateCcw className="h-4 w-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Replay</TooltipContent>
              </Tooltip>
            </div>
          </TooltipProvider>
        </div>
      )}
      <div ref={mapRef} className="min-h-0 flex-1 border-b border-[#d7dbd2]" data-tour={mode === "single" && !destinationPreview ? "tour-map" : undefined} />
      <div className={`flex shrink-0 flex-col bg-[#f8f9fc] ${destinationPreview ? "h-6 justify-center px-1.5" : variant === "preview" ? "h-20" : mode === "single" ? "h-28" : "h-24"}`} data-tour={mode === "single" && !destinationPreview ? "tour-timeline" : undefined}>
        <div ref={timelineRef} className={destinationPreview ? "h-3 shrink-0 overflow-hidden border border-[#f8f9fc]" : "min-h-0 flex-1"} />
        {!destinationPreview && <div className="flex shrink-0 items-center justify-center gap-3 border-t border-[#d7dbd2] bg-[#f8f9fc] px-3 py-1 text-[11px] font-bold uppercase tracking-[0.08em] text-[#3b1370]">
          <span>Timeline</span>
          <span className="font-mono tracking-normal text-[#202124]">
            {currentTime ? new Date(currentTime * 1000).toISOString().slice(11, 19) : "--:--:--"}
          </span>
          {selectedPingIndexes.length > 0 && (
            <button type="button" onClick={() => clearSelectionRef.current()} className="rounded border border-[#bfc6bb] bg-[#f8f9fc] px-2 py-0.5 text-[10px] text-[#3b1370] hover:bg-white hover:border-[#7629db]">Clear selection</button>
          )}
        </div>}
      </div>
    </div>
  )
}

// Display one run statistic as a labeled cell of the panel's stat strip, with an
// optional explanation behind a help icon, tinted green when it beats the other
// compare panel. The cell draws its own left and top divider so the lines stay
// correct when the strip wraps.
function PanelStat({ icon: Icon, label, help, value, better = false }: { icon: LucideIcon; label: string; help?: string; value: string; better?: boolean }) {
  return (
    <div className={`relative flex min-w-0 flex-col justify-between gap-0.5 py-1 pl-2 shadow-[-1px_-1px_0_0_#d1d5db] ${help ? "pr-4" : "pr-1.5"} ${better ? "bg-[#e7f6ec]" : ""}`}>
      <span className="text-[10px] font-semibold uppercase leading-tight tracking-[0.02em] text-[#3b1370]/80">{label}</span>
      {help && (
        <Tooltip>
          <TooltipTrigger asChild>
            <button type="button" aria-label={`About ${label}`} className="absolute right-1 top-1 text-[#3b1370]/60 hover:text-[#3b1370]">
              <HelpCircle className="h-3 w-3" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-56">{help}</TooltipContent>
        </Tooltip>
      )}
      <span className={`flex items-center gap-1 text-sm font-bold tabular-nums ${better ? "text-[#15803d]" : "text-[#3b1370]"}`}>
        <Icon className={`h-3.5 w-3.5 shrink-0 ${better ? "text-[#15803d]" : "text-[#7629db]"}`} aria-hidden="true" />
        {value}
        {better && <span className="sr-only">(better than the other algorithm)</span>}
      </span>
    </div>
  )
}

// Wrap the scene renderer with the algorithm title, 
// Learn link, run statistics, and loading placeholders
export function CompareAnimationPanel({
  panel,
  mode = "compare",
  currentTime,
  onTimeChange,
  syncMaster = true,
  showGroundTruth,
  showStops,
  showXray,
  previewRunId,
  onReplayStart,
  sharedPlaybackState,
  onPlaybackStateChange,
  otherMetrics,
}: {
  panel: ComparePanelResponse | null | undefined
  mode?: "single" | "compare"
  currentTime: number | null
  onTimeChange: (timestamp: number) => void
  syncMaster?: boolean
  showGroundTruth: boolean
  showStops: boolean
  showXray: boolean
  previewRunId?: number
  onReplayStart?: () => void
  sharedPlaybackState?: PlaybackState
  onPlaybackStateChange?: (state: PlaybackState) => void
  otherMetrics?: ComparePanelResponse["metrics"]
}) {
  const learnAlgorithmId = panel?.algo
  const pings = panel?.scene.pings
  const percent = (value: number) => `${Math.round(value * 100)}%`
  // Whether this panel wins a metric against the other compare panel, judged on the
  // displayed percentages so equal-looking values are never marked as better
  const beats = (metric: keyof NonNullable<ComparePanelResponse["metrics"]>, higherIsBetter: boolean) => {
    if (!panel?.metrics || !otherMetrics) return false
    const own = Math.round(panel.metrics[metric] * 100)
    const other = Math.round(otherMetrics[metric] * 100)
    return higherIsBetter ? own > other : own < other
  }

  return (
    <Card className="h-full min-h-0 gap-0 overflow-hidden bg-[#f8f9fc] py-0">
      <CardHeader className="shrink-0 px-3 pt-2 pb-1">
        <CardTitle className="flex items-center gap-2 text-base font-semibold text-[#3b1370]">
          {panel?.title ?? <><Spinner className="text-[#8acac8]" /> Loading visualization</>}
          {learnAlgorithmId && (
            <Button asChild variant="outline" size="icon" title="Learn about this algorithm" aria-label={`Learn about ${panel?.title}`} className="h-8 w-8">
              <Link href={`/?view=learn&algo=${learnAlgorithmId}`} prefetch={false}>
                <HelpCircle className="h-4 w-4" />
              </Link>
            </Button>
          )}
          {panel && !learnAlgorithmId && (
            <Button type="button" variant="outline" size="icon" disabled aria-label="Select an algorithm to learn more" className="h-8 w-8">
              <HelpCircle className="h-4 w-4" />
            </Button>
          )}
        </CardTitle>
      </CardHeader>
      {/* In compare mode the map and timeline get the height a 4:5 panel leaves below the
          2.75rem title row, so the stats strip below lengthens the card instead of shrinking the map */}
      <CardContent className={`flex min-h-0 flex-col px-2 pb-2 pt-0 ${mode === "compare" ? "h-[calc(125cqw-2.75rem)] flex-none" : "flex-1"}`}>
        {panel ? (
          <div className="min-h-0 w-full flex-1">
            <DemoSceneRenderer
              key={`${panel.algo}:${panel.scene.source}:${panel.scene.user_id}`}
              panel={panel}
              mode={mode}
              currentTime={currentTime}
              onTimeChange={onTimeChange}
              syncMaster={syncMaster}
              showGroundTruth={showGroundTruth}
              showStops={showStops}
              showXray={showXray}
              previewRunId={previewRunId}
              onReplayStart={onReplayStart}
              sharedPlaybackState={sharedPlaybackState}
              onPlaybackStateChange={onPlaybackStateChange}
            />
          </div>
        ) : (
          <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden rounded-md border border-[#d7dbd2] bg-[#f8f9fc]">
            <Skeleton className="flex-1 rounded-none bg-[#e6e3eb]" />
            <div className="h-24 border-t border-[#d7dbd2] bg-[#f8f9fc] p-4">
              <Skeleton className="h-4 w-full bg-[#e6e3eb]" />
              <Skeleton className="mt-4 h-4 w-2/3 bg-[#e6e3eb]" />
            </div>
          </div>
        )}
      </CardContent>
      {panel?.metrics && pings && (
        <div className="shrink-0 px-2 pb-2">
          <TooltipProvider delayDuration={200}>
            {/* Compare panels are too narrow for one row: the four accuracy stats
                fill the first row and the three trajectory stats the second */}
            <div className={`grid w-full overflow-hidden rounded-md border border-[#d1d5db] bg-white ${mode === "compare" ? "grid-cols-12 [&>*:nth-child(-n+4)]:col-span-3 [&>*:nth-child(n+5)]:col-span-4" : "grid-cols-[repeat(7,minmax(min-content,1fr))]"}`}>
              <PanelStat icon={Target} label="min-by-min recall" value={percent(panel.metrics.recall)} better={beats("recall", true)} />
              <PanelStat
                icon={Split}
                label="stops split"
                help="Share of true stops detected as more than one stop at the correct location."
                value={percent(panel.metrics.split_fraction)}
                better={beats("split_fraction", false)}
              />
              <PanelStat
                icon={MapPinOff}
                label="stops missing"
                help="Share of true stops not overlapped by any detected stop."
                value={percent(panel.metrics.missed_fraction)}
                better={beats("missed_fraction", false)}
              />
              <PanelStat
                icon={Merge}
                label="stops merged"
                help="Share of detected true stops that also overlap a detected stop at a different location."
                value={percent(panel.metrics.merged_fraction)}
                better={beats("merged_fraction", false)}
              />
              <PanelStat icon={Radio} label="number of pings" value={String(pings.length)} />
              <PanelStat
                icon={Activity}
                label="frequency"
                value={`${(pings.length / ((pings[pings.length - 1].timestamp - pings[0].timestamp) / 3600)).toFixed(1)}/hr`}
              />
              <PanelStat
                icon={MapPin}
                label="stops detected"
                value={String(new Set(panel.result.cluster.filter((label) => label >= 0)).size)}
              />
            </div>
          </TooltipProvider>
        </div>
      )}
    </Card>
  )
}

// Reuse the scene renderer for automatic preview playback 
// and forward its completion callback
export function StopRunPreview({
  panel,
  currentTime,
  onTimeChange,
  onComplete,
}: {
  panel: ComparePanelResponse | null | undefined
  currentTime: number | null
  onTimeChange: (timestamp: number) => void
  onComplete?: () => void
}) {
  if (!panel) {
    return (
      <div className="flex h-full w-full flex-col overflow-hidden rounded-md border border-[#d7dbd2] bg-[#f8f9fc]">
        <Skeleton className="flex-1 rounded-none bg-[#e6e3eb]" />
        <Skeleton className="m-4 h-4 bg-[#e6e3eb]" />
      </div>
    )
  }

  return (
    <DemoSceneRenderer
      key={`${panel.algo}:${panel.scene.source}:${panel.scene.user_id}`}
      panel={panel}
      mode="single"
      currentTime={currentTime}
      onTimeChange={onTimeChange}
      syncMaster
      showGroundTruth
      showStops
      showXray
      variant="preview"
      onPreviewComplete={onComplete}
    />
  )
}

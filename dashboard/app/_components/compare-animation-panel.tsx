"use client"

import Link from "next/link"
import { useEffect, useMemo, useRef, useState } from "react"
import * as echarts from "echarts"
import type { TooltipComponentPositionCallback } from "echarts"
import { HelpCircle, Pause, Play, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { stopsFromLabels } from "@/lib/stop-detection"
import type {
  ComparePanelResponse,
  EChartsApi,
  EChartsParams,
} from "../_lib/types"

const DEMO_CLUSTER_COLORS = [
  "#f6d746", "#f89540", "#dc5039", "#a11b63", "#5d126e", "#1f4f99", "#149a8f", "#00a8cc", "#72b01d", "#8c6d31",
  "#e377c2", "#9467bd", "#2ca02c", "#d62728", "#17becf", "#bcbd22", "#8c564b", "#ff6f91", "#6b8e23", "#00b894",
  "#0984e3", "#6c5ce7", "#e17055", "#d63031", "#008080", "#c44569", "#4a69bd", "#f19066", "#b33771", "#218c74",
]
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
function DemoSceneRenderer({
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
  variant?: "full" | "preview"
  onPreviewComplete?: () => void
  previewRunId?: number
  onReplayStart?: () => void
  sharedPlaybackState?: PlaybackState
  onPlaybackStateChange?: (state: PlaybackState) => void
}) {
  const scene = panel.scene
  const mapRef = useRef<HTMLDivElement | null>(null)
  const timelineRef = useRef<HTMLDivElement | null>(null)
  const comparisonTooltipRef = useRef<HTMLDivElement | null>(null)
  const toggleRef = useRef<() => void>(() => {})
  const replayRef = useRef<() => void>(() => {})
  const previewRef = useRef<() => void>(() => {})
  const clearSelectionRef = useRef<() => void>(() => {})
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
  const sceneData = useMemo(() => {
    // Timeline generation below reads the first and last ping.
    if (scene.pings.length === 0) return null
    const pings = scene.pings.map((ping, index) => ({
      i: index,
      x: ping.x,
      y: ping.y,
      t: ping.timestamp,
      time: new Date(ping.timestamp * 1000).toISOString().slice(11, 19),
    }))
    const buildings = scene.buildings.flatMap((building) =>
      building.rings.map((ring) => {
        const xs = ring.map(([x]) => x)
        const ys = ring.map(([, y]) => y)
        const minX = Math.min(...xs)
        const maxX = Math.max(...xs)
        const minY = Math.min(...ys)
        const maxY = Math.max(...ys)
        return {
          id: building.id,
          type: building.type,
          coords: ring,
          center: [(minX + maxX) / 2, (minY + maxY) / 2],
          minX,
          maxX,
          minY,
          maxY,
        }
      }),
    )
    const buildingById = new Map(buildings.map((building) => [building.id, building]))
    const blockSide = Math.min(...buildings.flatMap((building) => [
      building.maxX - building.minX,
      building.maxY - building.minY,
    ]).filter((span) => span > 0))
    const routeBetween = (start: number[], end: number[]) => [
      start,
      [(start[0] + end[0]) / 2, start[1]],
      [(start[0] + end[0]) / 2, end[1]],
      end,
    ].filter((point, index, route) => index === 0 || point[0] !== route[index - 1][0] || point[1] !== route[index - 1][1])
    const routeByPair = new Map(scene.routes?.routes.map((route) => [`${route.from}->${route.to}`, route.path]) ?? [])
    const truthStops = scene.truth.flatMap((row) => {
      const building = row.location ? buildingById.get(row.location) : null
      return building ? [{ ...row, location: building.id, destination: { id: building.id, center: building.center } }] : []
    })
    const segments = truthStops.slice(1).map((current, index) => {
      const previous = truthStops[index]
      const cached = previous.destination.id && current.destination.id
        ? routeByPair.get(`${previous.destination.id}->${current.destination.id}`)
        : null
      return {
        stopIndex: index,
        cluster: index,
        start: previous.timestamp + previous.duration * 60,
        end: current.timestamp,
        points: cached ?? routeBetween(previous.destination.center, current.destination.center),
        isFallback: !cached,
      }
    }).filter((segment) => segment.end > segment.start && segment.points.length > 1)
    const streets = scene.routes?.streets ?? []
    const streetIds = new Set(streets.map((street) => street.id))
    const streetLaneSegments = streets.flatMap((street) => {
      const [, xPart, yPart] = street.id.split("-")
      const gridX = Number(xPart.slice(1))
      const gridY = Number(yPart.slice(1))
      const xs = street.coords.map(([x]) => x)
      const ys = street.coords.map(([, y]) => y)
      const minStreetX = Math.min(...xs)
      const maxStreetX = Math.max(...xs)
      const minStreetY = Math.min(...ys)
      const maxStreetY = Math.max(...ys)
      const centerX = (minStreetX + maxStreetX) / 2
      const centerY = (minStreetY + maxStreetY) / 2
      const left = streetIds.has(`s-x${gridX - 1}-y${gridY}`)
      const right = streetIds.has(`s-x${gridX + 1}-y${gridY}`)
      const down = streetIds.has(`s-x${gridX}-y${gridY - 1}`)
      const up = streetIds.has(`s-x${gridX}-y${gridY + 1}`)
      return [
        ...(left || right ? [[[left ? minStreetX : centerX, centerY], [right ? maxStreetX : centerX, centerY]]] : []),
        ...(down || up ? [[[centerX, down ? minStreetY : centerY], [centerX, up ? maxStreetY : centerY]]] : []),
      ]
    })
    // Merge each contiguous run of same-street cells into one continuous line so the dash pattern
    // carries through the whole block instead of restarting (and visually doubling up) at every grid seam.
    const mergeAxisRuns = (spans: [number, number][]): [number, number][] => {
      const sorted = [...spans].sort((a, b) => a[0] - b[0])
      const merged: [number, number][] = []
      for (const [start, end] of sorted) {
        const last = merged[merged.length - 1]
        if (last && start <= last[1] + 0.01) last[1] = Math.max(last[1], end)
        else merged.push([start, end])
      }
      return merged
    }
    const horizontalRunsByY = new Map<number, [number, number][]>()
    const verticalRunsByX = new Map<number, [number, number][]>()
    streetLaneSegments.forEach(([[x1, y1], [x2, y2]]) => {
      if (y1 === y2) {
        const spans = horizontalRunsByY.get(y1) ?? []
        spans.push([Math.min(x1, x2), Math.max(x1, x2)])
        horizontalRunsByY.set(y1, spans)
      } else {
        const spans = verticalRunsByX.get(x1) ?? []
        spans.push([Math.min(y1, y2), Math.max(y1, y2)])
        verticalRunsByX.set(x1, spans)
      }
    })
    const streetLanes: number[][][] = []
    horizontalRunsByY.forEach((spans, y) => {
      mergeAxisRuns(spans).forEach(([minX, maxX]) => streetLanes.push([[minX, y], [maxX, y]]))
    })
    verticalRunsByX.forEach((spans, x) => {
      mergeAxisRuns(spans).forEach(([minY, maxY]) => streetLanes.push([[x, minY], [x, maxY]]))
    })
    const start = scene.pings[0].timestamp
    const end = scene.pings[scene.pings.length - 1].timestamp
    const times = new Set([start, end])
    for (let timestamp = start; timestamp <= end; timestamp += 30) times.add(timestamp)

    return {
      pings,
      pingIndexByTimestamp: new Map(pings.map((ping) => [ping.t, ping.i])),
      buildings,
      buildingById,
      blockSide,
      truthStops,
      segments,
      streets,
      streetLanes,
      timeSequence: Array.from(times).sort((a, b) => a - b),
    }
  }, [scene.buildings, scene.pings, scene.routes, scene.truth])
  // Combine the scene with the selected algorithm result to build chart-ready stops,
  // cluster assignments, anchors, density metadata, and focus bounds.
  const resultData = useMemo(() => {
    if (!sceneData) return null
    const result = panel.result

    const pings = sceneData.pings.map((ping, index) => ({
      ...ping,
      cluster: result.cluster[index],
    }))
    const pingData = pings.map((ping) => [ping.x, ping.y, ping.cluster, ping.i, ping.t])
    const clusterMembers = new Map<number, number[]>()
    pings.forEach((ping) => {
      if (ping.cluster < 0) return
      const members = clusterMembers.get(ping.cluster)
      if (members) members.push(ping.i)
      else clusterMembers.set(ping.cluster, [ping.i])
    })
    const destinationFor = (x: number, y: number) => {
      const containing = sceneData.buildings.find((building) =>
        x >= building.minX && x <= building.maxX && y >= building.minY && y <= building.maxY
      )
      const destination = containing ?? sceneData.buildings.reduce((best, building) =>
        Math.hypot(x - building.center[0], y - building.center[1]) < Math.hypot(x - best.center[0], y - best.center[1])
          ? building
          : best
      )
      return {
        id: destination.type === "building" ? null : destination.id,
        center: destination.center,
      }
    }
    const stops = stopsFromLabels(scene.pings, result.cluster).map((stop) => ({
      ...stop,
      destination: destinationFor(stop.x, stop.y),
      radius: Math.max(
        stop.diameter / 2,
        Number(panel.params.delta_roam ?? panel.params.dist_thresh ?? 0),
      ),
      label: `Stop ${stop.cluster}`,
      startTime: new Date(stop.start * 1000).toISOString().slice(11, 16),
      endTime: new Date(stop.end * 1000).toISOString().slice(11, 16),
    }))
    const sequentialGroups = panel.algo.startsWith("sequential_")
      ? stops.map((stop) => (clusterMembers.get(stop.cluster) ?? []).map((pingIndex) => pings[pingIndex]))
      : []
    const anchorFrames = panel.algo === "sequential_first" ? sequentialGroups.flatMap((members) => {
      const anchor = members[0]
      return members.map((ping) => ({
        cluster: ping.cluster,
        t: ping.t,
        point: [anchor.x, anchor.y, ping.cluster, anchor.i, ping.t],
        edges: anchor.i === ping.i ? [] : [{
          coords: [[anchor.x, anchor.y], [ping.x, ping.y]],
          value: [ping.cluster, anchor.i, ping.i, ping.t],
        }],
      }))
    }) : panel.algo === "sequential_centroid" ? sequentialGroups.flatMap((members) => {
      let sumX = 0
      let sumY = 0
      return members.map((ping, index) => {
        sumX += ping.x
        sumY += ping.y
        const centroid = [sumX / (index + 1), sumY / (index + 1)]
        return {
          cluster: ping.cluster,
          t: ping.t,
          point: [centroid[0], centroid[1], ping.cluster, ping.i, ping.t],
          edges: index === 0 ? [] : [{
            coords: [centroid, [ping.x, ping.y]],
            value: [ping.cluster, ping.i, ping.i, ping.t],
          }],
        }
      })
    }) : panel.algo === "lachesis" && result.kind === "anchor" ? pings.flatMap((ping) => {
      const auxTime = result.aux_time[ping.i]
      if (ping.cluster < 0 || auxTime == null) return []
      const anchorIndex = sceneData.pingIndexByTimestamp.get(auxTime)
      if (anchorIndex === undefined) return []
      const anchor = pings[anchorIndex]
      if (anchor.cluster !== ping.cluster) return []
      return [{
        cluster: ping.cluster,
        t: ping.t,
        point: [anchor.x, anchor.y, ping.cluster, anchor.i, ping.t],
        edges: anchor.i === ping.i ? [] : [{
          coords: [[anchor.x, anchor.y], [ping.x, ping.y]],
          value: [ping.cluster, anchor.i, ping.i, ping.t],
        }],
      }]
    }) : []
    const densityCorePointData = result.kind === "density" ? pings.flatMap((ping) => (
      ping.cluster >= 0 && result.core[ping.i] >= 0
        ? [[ping.x, ping.y, ping.cluster, ping.i, Math.max(ping.t, result.aux_time[ping.i] ?? ping.t)]]
        : []
    )) : []
    const densityPromotionEdges = result.kind === "density" ? pings.flatMap((ping) => {
      const auxTime = result.aux_time[ping.i]
      if (ping.cluster < 0 || auxTime == null) return []
      const sourceIndex = sceneData.pingIndexByTimestamp.get(auxTime)
      if (sourceIndex === undefined || sourceIndex === ping.i) return []
      const source = pings[sourceIndex]
      if (source.cluster !== ping.cluster || result.core[sourceIndex] < 0) return []
      return [{
        coords: [[source.x, source.y], [ping.x, ping.y]],
        value: [ping.cluster, source.i, ping.i, Math.max(ping.t, auxTime)],
      }]
    }) : []
    const coreTimelineData = densityCorePointData.map((point) => [point[4] * 1000, point[2], point[3]])
    const focusBuildings = [
      ...sceneData.truthStops.flatMap((stop) => stop.location ? sceneData.buildingById.get(stop.location) ?? [] : []),
      ...stops.flatMap((stop) => stop.destination.id ? sceneData.buildingById.get(stop.destination.id) ?? [] : []),
    ]
    const focusPoints = [
      ...pings.map((ping) => [ping.x, ping.y]),
      ...sceneData.segments.flatMap((segment) => segment.points),
    ]
    const focusXs = [
      ...focusPoints.map(([x]) => x),
      ...focusBuildings.flatMap((building) => [building.minX, building.maxX]),
    ]
    const focusYs = [
      ...focusPoints.map(([, y]) => y),
      ...focusBuildings.flatMap((building) => [building.minY, building.maxY]),
    ]
    return {
      streets: sceneData.streets,
      streetLanes: sceneData.streetLanes,
      buildings: sceneData.buildings,
      blockSide: sceneData.blockSide,
      pings,
      pingData,
      result,
      clusterMembers,
      stops,
      densityCorePointData,
      densityPromotionEdges,
      anchorFrames,
      coreTimelineData,
      truthStops: sceneData.truthStops,
      segments: sceneData.segments,
      focusBounds: {
        minX: Math.min(...focusXs),
        minY: Math.min(...focusYs),
        maxX: Math.max(...focusXs),
        maxY: Math.max(...focusYs),
      },
      stopBars: stops.map((stop) => [stop.start * 1000, stop.end * 1000, stop.cluster, stop.index]),
      stopEndTimes: stops.map((stop) => stop.end),
      distanceThreshold: Number(panel.params.delta_roam ?? panel.params.dist_thresh ?? 0),
      timeSequence: sceneData.timeSequence,
    }
  }, [panel.algo, panel.params, panel.result, scene.pings, sceneData])

  const resultDataRef = useRef(resultData)
  const updateResultRef = useRef<(data: NonNullable<typeof resultData>) => void>(() => {})

  useEffect(() => {
    resultDataRef.current = resultData
    if (resultData) updateResultRef.current(resultData)
  }, [resultData])

  useEffect(() => {
    let chartData = resultDataRef.current
    if (!chartData || !mapRef.current || !timelineRef.current) return

    const mapEl = mapRef.current
    const timelineEl = timelineRef.current
    const previousTouchAction = mapEl.style.touchAction
    const previousTimelineTouchAction = timelineEl.style.touchAction
    mapEl.style.touchAction = "none"
    timelineEl.style.touchAction = "none"
    const mapChart = echarts.getInstanceByDom(mapEl) ?? echarts.init(mapEl, null, { renderer: "canvas" })
    const timelineChart = echarts.getInstanceByDom(timelineEl) ?? echarts.init(timelineEl, null, { renderer: "canvas" })
    const minX = chartData.focusBounds.minX
    const minY = chartData.focusBounds.minY
    const maxX = chartData.focusBounds.maxX
    const maxY = chartData.focusBounds.maxY
    const xSpan = maxX - minX
    const ySpan = maxY - minY
    const xPad = Math.max(28, xSpan * 0.14)
    const yPad = Math.max(28, ySpan * 0.14)
    const mapBounds = () => {
      const mapZoom = 1.45
      const baseX = xSpan + xPad * 2
      const baseY = ySpan + yPad * 2
      const plotRatio = Math.max(1, mapEl.clientWidth - 24) / Math.max(1, mapEl.clientHeight - 24)
      const xRange = (baseX / baseY < plotRatio ? baseY * plotRatio : baseX) / mapZoom
      const yRange = (baseX / baseY < plotRatio ? baseY : baseX / plotRatio) / mapZoom
      const xCenter = (minX + maxX) / 2
      const yCenter = (minY + maxY) / 2
      return {
        xMin: xCenter - xRange / 2,
        xMax: xCenter + xRange / 2,
        yMin: yCenter - yRange / 2,
        yMax: yCenter + yRange / 2,
      }
    }
    const applyMapBounds = () => {
      const bounds = mapBounds()
      mapChart.setOption({
        xAxis: { min: bounds.xMin, max: bounds.xMax },
        yAxis: { min: bounds.yMin, max: bounds.yMax },
      })
    }
    const timeMin = scene.pings[0].timestamp * 1000
    const timeMax = scene.pings[scene.pings.length - 1].timestamp * 1000
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
      const atEnd = sequenceIndex >= chartData.timeSequence.length - 1
      const nextState = atEnd && paused ? "complete" : paused ? "paused" : "playing"
      setPlaybackState(nextState)
      onPlaybackStateChangeRef.current?.(nextState)
    }

    const clusterColor = (cluster: number) => cluster < 0 ? "#1f2326" : DEMO_CLUSTER_COLORS[cluster % DEMO_CLUSTER_COLORS.length]
    const isDensityAlgorithm = chartData.result.kind === "density"
    const distThreshold = Number(panel.params?.dist_thresh ?? panel.params?.eps_spatial ?? 0)
    const paramsValue = (params: { data?: unknown; value?: unknown }) => (params.value ?? (params.data as { value?: number[] }).value ?? params.data) as number[]
    const associatedWithHover = (pingIndex: number) => hoverPingIndexes === null || hoverPingIndexes.has(pingIndex)
    const associationOpacity = (pingIndex: number) => associatedWithHover(pingIndex) ? 0.85 : 0.2
    const anchorOpacity = (pingIndex: number) => associatedWithHover(pingIndex) ? 1 : 0.2
    const edgeOpacity = (sourceIndex: number, targetIndex: number) =>
      hoverPingIndexes === null || (hoverPingIndexes.has(sourceIndex) && hoverPingIndexes.has(targetIndex)) ? 0.7 : 0.1
    const pingScale = (pingIndex: number) => hoverPingIndexes?.has(pingIndex) ? 1.1 : 1
    const pingCircle = (api: EChartsApi) => {
      const center = api.coord([api.value(0), api.value(1)])
      const edge = api.coord([api.value(0) + chartData.blockSide / 8, api.value(1)])
      return { center, radius: Math.abs(edge[0] - center[0]) }
    }
    const partialPath = (segment: typeof preparedSegments[number], progress: number) => {
      const target = segment.length * Math.max(0, progress)
      const drawn = [segment.points[0]]
      for (let index = 1; index < segment.points.length; index += 1) {
        const previous = segment.points[index - 1]
        const next = segment.points[index]
        const segmentLength = segment.cumulative[index] - segment.cumulative[index - 1]
        if (segment.cumulative[index] >= target) {
          const local = segmentLength === 0 ? 1 : (target - segment.cumulative[index - 1]) / segmentLength
          drawn.push([
            previous[0] + (next[0] - previous[0]) * local,
            previous[1] + (next[1] - previous[1]) * local,
          ])
          return drawn
        }
        drawn.push(next)
      }
      return drawn
    }
    const routeProgressAt = (timestampSeconds: number) => {
      const completedCached: number[][][] = []
      const completedFallback: number[][][] = []
      let activeCached: number[][] = []
      let activeFallback: number[][] = []
      let next: typeof preparedSegments[number] | null = null
      for (const segment of preparedSegments) {
        if (timestampSeconds >= segment.end) {
          if (segment.isFallback) completedFallback.push(segment.points)
          else completedCached.push(segment.points)
          continue
        }
        if (timestampSeconds >= segment.start) {
          const active = partialPath(segment, (timestampSeconds - segment.start) / Math.max(1, segment.end - segment.start))
          if (segment.isFallback) activeFallback = active
          else activeCached = active
          continue
        }
        if (!next) next = segment
      }
      return { completedCached, completedFallback, activeCached, activeFallback, next }
    }
    const latestPingIndexAt = (timestampSeconds: number) => {
      let index = 0
      for (let candidate = 0; candidate < scene.pings.length; candidate += 1) {
        if (scene.pings[candidate].timestamp <= timestampSeconds) index = candidate
        else break
      }
      return index
    }
    const pingClassifiedAt = (pingIndex: number, timestampSeconds: number) => {
      const pingTime = chartData.pingData[pingIndex][4]
      return pingTime <= timestampSeconds && (
        chartData.result.kind !== "density" ||
        Math.max(pingTime, chartData.result.aux_time[pingIndex] ?? pingTime) <= timestampSeconds
      )
    }
    const detectedCountFor = (timestampSeconds: number) => {
      let count = 0
      while (count < chartData.stopEndTimes.length && chartData.stopEndTimes[count] <= timestampSeconds) count += 1
      return count
    }
    const anchorFramesAt = (timestampSeconds: number) => {
      const framesByStop = new Map<number, (typeof chartData.anchorFrames)[number]>()
      chartData.anchorFrames.forEach((frame) => {
        if (frame.t <= timestampSeconds) framesByStop.set(frame.cluster, frame)
      })
      return Array.from(framesByStop.values())
    }
    const styledScatterPoint = (point: number[]) => ({
      value: point,
      symbolSize: 5 * pingScale(point[3]),
      itemStyle: {
        opacity: associationOpacity(point[3]),
      },
    })
    const styledXrayPoint = (point: number[]) => ({
      value: point,
      symbolSize: 15 * pingScale(point[3]),
      itemStyle: {
        color: clusterColor(point[2]),
        opacity: anchorOpacity(point[3]),
      },
    })
    const groundTruthAt = (timestampSeconds: number) => {
      const current = chartData.truthStops.find((truth) =>
        timestampSeconds >= truth.timestamp && timestampSeconds <= truth.timestamp + truth.duration * 60
      )
      const next = chartData.truthStops.find((truth) => truth.timestamp > timestampSeconds)
      return { current, next }
    }
    const buildingsSeriesData = (timestampSeconds: number) => {
      const truth = groundTruthAt(timestampSeconds)
      return chartData.buildings.map((building, index) => [
        index,
        layerStateRef.current.showGroundTruth && building.id === truth.current?.location
          ? 1 + pulseStrength
          : layerStateRef.current.showGroundTruth && building.id === truth.next?.location
            ? 2
            : 0,
        hoverBuildingId !== "" && building.id !== hoverBuildingId ? 1 : 0,
      ]).sort((a, b) => a[1] - b[1])
    }
    const buildingGlowData = (timestampSeconds: number) =>
      buildingsSeriesData(timestampSeconds).filter(([, state, faded]) => state > 0 && state < 2 && !faded)
    const routeGlowPoints = (route: ReturnType<typeof routeProgressAt>) =>
      [
        ...route.completedCached,
        ...route.completedFallback,
        route.activeCached,
        route.activeFallback,
      ].filter((points) => points.length > 1).flatMap((points, index) => index === 0 ? points : points.slice(1))
    // While hovering a ping that belongs to a detected stop, outline the building the algorithm
    // assigned that stop to, in the stop's cluster color - alongside the (untouched) ground-truth glow.
    const hoveredAssignedBuildingData = (timestampSeconds: number) => {
      if (!layerStateRef.current.showStops || hoverPingIndex === null) return []
      if (!pingClassifiedAt(hoverPingIndex, timestampSeconds)) return []
      const cluster = chartData.pingData[hoverPingIndex]?.[2] ?? -1
      if (cluster < 0) return []
      const stop = chartData.stops.find((candidate) => candidate.cluster === cluster)
      const buildingId = stop?.destination.id
      if (!buildingId) return []
      const buildingIndex = chartData.buildings.findIndex((building) => building.id === buildingId)
      return buildingIndex >= 0 ? [[buildingIndex, cluster]] : []
    }
    // For density-based algorithms, show the dist_thresh neighborhood radius around the hovered point.
    const distanceCircleData = (
      timestampSeconds: number,
      anchorFrames: (typeof chartData.anchorFrames),
    ) => {
      if (!layerStateRef.current.showXray) return []
      if (!isDensityAlgorithm) return anchorFrames.map((frame) => frame.point)
      if (hoverPingIndex === null) return []
      if (!pingClassifiedAt(hoverPingIndex, timestampSeconds)) return []
      const point = chartData.pingData[hoverPingIndex]
      return [[point[0], point[1], point[2]]]
    }
    const selectedPingLineData = () => {
      if (selectedPingIndexesRef.current.length !== 2) return []
      return [{ coords: selectedPingIndexesRef.current.map((pingIndex) => {
        const ping = chartData.pings[pingIndex]
        return [ping.x, ping.y]
      }) }]
    }
    const pastTruthStopData = (timestampSeconds: number) => chartData.truthStops.flatMap((stop, index) =>
      stop.timestamp + stop.duration * 60 < timestampSeconds
        ? [[stop.timestamp * 1000, (stop.timestamp + stop.duration * 60) * 1000, index]]
        : []
    )
    const currentTruthStopData = (timestampSeconds: number) => {
      const current = groundTruthAt(timestampSeconds).current
      return current ? [[current.timestamp * 1000, (current.timestamp + current.duration * 60) * 1000, pulseStrength, chartData.truthStops.indexOf(current)]] : []
    }
    const nextTruthStopData = (timestampSeconds: number) => {
      const next = groundTruthAt(timestampSeconds).next
      return next ? [[next.timestamp * 1000, (next.timestamp + next.duration * 60) * 1000, chartData.truthStops.indexOf(next)]] : []
    }
    const routeLength = (points: number[][]) =>
      points.slice(1).reduce((total, point, index) => {
        const previous = points[index]
        return total + Math.hypot(point[0] - previous[0], point[1] - previous[1])
      }, 0)
    const routeMarkerAt = (points: number[][], distance: number): number[] | null => {
      if (points.length < 2) return null
      if (distance <= 0) return [points[0][0], points[0][1], points[1][0], points[1][1]]
      let walked = 0
      for (let index = 1; index < points.length; index += 1) {
        const previous = points[index - 1]
        const next = points[index]
        const segmentLength = Math.hypot(next[0] - previous[0], next[1] - previous[1])
        if (walked + segmentLength > distance) {
          const local = segmentLength === 0 ? 1 : (distance - walked) / segmentLength
          return [
            previous[0] + (next[0] - previous[0]) * local,
            previous[1] + (next[1] - previous[1]) * local,
            next[0],
            next[1],
          ]
        }
        walked += segmentLength
      }
      const previous = points[points.length - 2]
      const last = points[points.length - 1]
      return [last[0], last[1], last[0] + last[0] - previous[0], last[1] + last[1] - previous[1]]
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
        const points = routeGlowPoints(routeProgressAt(timestampSeconds))
        const length = routeLength(points)
        const endHoldStarts = routeGlowStartDelay + routeGlowTravelSeconds
        const fadeOutStarts = endHoldStarts + routeGlowEndHoldSeconds
        const fadeOutEnds = fadeOutStarts + routeGlowFadeOutSeconds
        const cycleElapsed = ((now - routeGlowStartedAt) / 1000) % cycleSeconds
        const distance = Math.min(length, Math.max(0, cycleElapsed - routeGlowStartDelay) / routeGlowTravelSeconds * length)
        const marker = length > 0 ? routeMarkerAt(points, distance) : null
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
        const next = routeProgressAt(timestampSeconds).next
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
      previewing = false
      const latestPingIndex = latestPingIndexAt(timestampSeconds)
      const noisePings = chartData.pingData.filter((point) => point[2] < 0)
      const clusterPings = chartData.pingData.filter((point) => point[2] >= 0)
      const route = routeProgressAt(timestampSeconds)
      const detectedStopCount = detectedCountFor(timestampSeconds)
      const anchorFrames = anchorFramesAt(timestampSeconds)
      nextPathVisible = layerStateRef.current.showGroundTruth && Boolean(groundTruthAt(timestampSeconds).current && route.next)
      const anchorEdges = anchorFrames.flatMap((frame) => frame.edges)
      const promotionEdges = chartData.densityPromotionEdges.filter((edge) => edge.value[3] <= timestampSeconds)
      if (selectedPingIndexesRef.current.length === 2) {
        hoverPingIndexes = new Set(selectedPingIndexesRef.current)
        if (hoverPingIndex !== null) hoverPingIndexes.add(hoverPingIndex)
      } else if (hoverEdgeEndpoints) {
        // Edge hover: reveal only the connected component reachable from this edge.
        const connectedPings = new Set<number>(hoverEdgeEndpoints)
        hoverPingIndexes = connectedPings
        const pending: number[] = [...hoverEdgeEndpoints]
        while (pending.length) {
          const current = pending.pop()!
          anchorEdges.forEach((edge) => {
            const neighbor = edge.value[1] === current
              ? edge.value[2]
              : edge.value[2] === current
                ? edge.value[1]
                : null
            if (neighbor !== null && !connectedPings.has(neighbor)) {
              connectedPings.add(neighbor)
              pending.push(neighbor)
            }
          })
        }
      } else if (hoverPingIndex !== null) {
        // Ping hover: reveal every ping in the same detected stop (or just itself for noise).
        const cluster = pingClassifiedAt(hoverPingIndex, timestampSeconds)
          ? chartData.pingData[hoverPingIndex]?.[2] ?? -1
          : -1
        const members = cluster >= 0
          ? chartData.clusterMembers.get(cluster)?.filter((pingIndex) => pingClassifiedAt(pingIndex, timestampSeconds))
          : undefined
        hoverPingIndexes = new Set(members ?? [hoverPingIndex])
      } else if (selectedPingIndexesRef.current.length) {
        hoverPingIndexes = new Set(selectedPingIndexesRef.current.flatMap((pingIndex) => {
          const cluster = pingClassifiedAt(pingIndex, timestampSeconds)
            ? chartData.pingData[pingIndex]?.[2] ?? -1
            : -1
          return cluster >= 0
            ? chartData.clusterMembers.get(cluster)?.filter((memberIndex) => pingClassifiedAt(memberIndex, timestampSeconds)) ?? [pingIndex]
            : [pingIndex]
        }))
      } else {
        hoverPingIndexes = null
      }

      mapChart.setOption({
        series: [
          { id: "streets", data: chartData.streets.map((_, index) => index) },
          { id: "street-lanes", data: chartData.streetLanes.map((_, index) => index) },
          { id: "buildings", data: buildingsSeriesData(timestampSeconds) },
          { id: "building-glow", data: buildingGlowData(timestampSeconds) },
          { id: "assigned-building-outline", data: hoveredAssignedBuildingData(timestampSeconds) },
          { id: "completed-paths", data: layerStateRef.current.showGroundTruth ? route.completedCached.map((points) => ({ coords: points })) : [] },
          { id: "completed-fallback-paths", data: layerStateRef.current.showGroundTruth ? route.completedFallback.map((points) => ({ coords: points })) : [] },
          { id: "active-path", data: layerStateRef.current.showGroundTruth ? route.activeCached : [] },
          { id: "active-fallback-path", data: layerStateRef.current.showGroundTruth ? route.activeFallback : [] },
          ...(nextPathVisible ? [] : [{ id: "next-path", data: [] }]),
          { id: "ghost-pings", data: chartData.pingData.map((point) => ({ value: point, symbolSize: 5 * pingScale(point[3]), itemStyle: { opacity: associatedWithHover(point[3]) ? 1 : 0.18 } })) },
          { id: "noise-pings", data: layerStateRef.current.showStops ? noisePings.filter((point) => point[4] <= timestampSeconds).map(styledScatterPoint) : [] },
          { id: "cluster-pings", data: layerStateRef.current.showStops ? clusterPings.filter((point) => pingClassifiedAt(point[3], timestampSeconds)).map((point) => [...point, associationOpacity(point[3])]) : [] },
          { id: "promotion-edges", data: layerStateRef.current.showXray ? promotionEdges.map((edge) => ({ ...edge, lineStyle: { color: clusterColor(edge.value[0]), opacity: edgeOpacity(edge.value[1], edge.value[2]) } })) : [] },
          { id: "promotion-edges-hit-area", data: layerStateRef.current.showXray ? promotionEdges : [] },
          { id: "core-points", data: layerStateRef.current.showXray ? chartData.densityCorePointData.filter((point) => point[4] <= timestampSeconds).map(styledXrayPoint) : [] },
          { id: "anchor-edges", data: layerStateRef.current.showXray ? anchorEdges.map((edge) => ({ ...edge, lineStyle: { color: clusterColor(edge.value[0]), opacity: edgeOpacity(edge.value[1], edge.value[2]) } })) : [] },
          { id: "anchor-edges-hit-area", data: layerStateRef.current.showXray ? anchorEdges : [] },
          { id: "anchor-points", data: layerStateRef.current.showXray ? anchorFrames.map((frame) => frame.point).map(styledXrayPoint) : [] },
          { id: "current-ping", data: [{ value: [chartData.pingData[latestPingIndex][0], chartData.pingData[latestPingIndex][1], layerStateRef.current.showStops && pingClassifiedAt(latestPingIndex, timestampSeconds) ? chartData.pingData[latestPingIndex][2] : -1, latestPingIndex, chartData.pingData[latestPingIndex][4]], itemStyle: { opacity: associationOpacity(latestPingIndex) } }] },
          { id: "current-ping-hole", data: [[chartData.pingData[latestPingIndex][0], chartData.pingData[latestPingIndex][1]]] },
          { id: "distance-circles", data: distanceCircleData(timestampSeconds, anchorFrames) },
          { id: "ping-hit-area", data: chartData.pingData },
          { id: "selected-ping-line", data: selectedPingLineData() },
        ],
      }, { lazyUpdate: true })
      syncRouteGlow()
      syncNextPathFlow()
      timelineChart.setOption({
        series: [
          { id: "ping-ticks", data: chartData.pingData.map((_, index) => [index]) },
          { id: "core-point-ticks", data: layerStateRef.current.showXray ? chartData.coreTimelineData : [] },
          { id: "past-truth-stops", data: layerStateRef.current.showGroundTruth ? pastTruthStopData(timestampSeconds) : [] },
          { id: "next-truth-stop", data: layerStateRef.current.showGroundTruth ? nextTruthStopData(timestampSeconds) : [] },
          { id: "current-truth-stop", data: layerStateRef.current.showGroundTruth ? currentTruthStopData(timestampSeconds) : [] },
          { id: "stop-bars", data: layerStateRef.current.showStops ? chartData.stopBars.slice(0, detectedStopCount) : [] },
          { id: "cursor", data: [[timestampSeconds * 1000, 0.08], [timestampSeconds * 1000, 0.92]] },
        ],
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
          { id: "current-ping-hole", data: [] },
          { id: "distance-circles", data: [] },
          { id: "selected-ping-line", data: selectedPingLineData() },
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
    const activeTimestamp = () => selectedTimestampRef.current ?? chartData.timeSequence[sequenceIndex] ?? chartData.timeSequence[0]
    
    // Update the hovered ping and its ground-truth building, 
    // Redraw highlights and reposition tooltips
    const setHoveredPing = (pingIndex: number | null) => {
      const ping = pingIndex === null ? null : chartData.pings[pingIndex]
      const buildingId = ping ? groundTruthAt(ping.t).current?.location ?? "" : ""
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
    const boxIntersectsSelection: (position: number[], width: number, height: number, points: number[][]) => boolean = (position, width, height, points) => {
      if (!points.length) return false
      const clearance = 10
      const left = position[0] - clearance
      const top = position[1] - clearance
      const right = position[0] + width + clearance
      const bottom = position[1] + height + clearance
      const start = points[0]
      const end = points[points.length - 1]
      const deltaX = end[0] - start[0]
      const deltaY = end[1] - start[1]
      let entry = 0
      let exit = 1
      const boundaries = [
        [-deltaX, start[0] - left],
        [deltaX, right - start[0]],
        [-deltaY, start[1] - top],
        [deltaY, bottom - start[1]],
      ]
      for (const [direction, distance] of boundaries) {
        if (direction === 0 && distance < 0) return false
        if (direction < 0) entry = Math.max(entry, distance / direction)
        if (direction > 0) exit = Math.min(exit, distance / direction)
        if (entry > exit) return false
      }
      return true
    }
    const boxIntersectsPoint: (position: number[], width: number, height: number, point: number[]) => boolean = ([left, top], width, height, [x, y]) =>
      x >= left - 10 && x <= left + width + 10 && y >= top - 10 && y <= top + height + 10
    const boxOverlapsElement: (position: number[], width: number, height: number, element: HTMLDivElement | null, gap: number) => boolean = ([left, top], width, height, element, gap) => {
      if (!element || element.style.visibility === "hidden") return false
      return !(
        left + width + gap <= element.offsetLeft ||
        left >= element.offsetLeft + element.offsetWidth + gap ||
        top + height + gap <= element.offsetTop ||
        top >= element.offsetTop + element.offsetHeight + gap
      )
    }
    const tooltipPositions: (width: number, height: number, padding: number, gap: number, points: number[][]) => number[][] = (width, height, padding, gap, points) => {
      const minX = Math.min(...points.map(([x]) => x))
      const maxX = Math.max(...points.map(([x]) => x))
      const minY = Math.min(...points.map(([, y]) => y))
      const maxY = Math.max(...points.map(([, y]) => y))
      const maxLeft = Math.max(padding, mapEl.clientWidth - width - padding)
      const maxTop = Math.max(padding, mapEl.clientHeight - height - padding)
      const clamp: (position: number[]) => number[] = ([left, top]) => [
        Math.max(padding, Math.min(left, maxLeft)),
        Math.max(padding, Math.min(top, maxTop)),
      ]
      const horizontalCenter = (minX + maxX - width) / 2
      const verticalCenter = (minY + maxY - height) / 2
      const localOffsets = [gap, gap + 24, gap + 48]
      const edgeSteps = Array.from({ length: 9 }, (_, index) => index / 8)
      return [
        ...localOffsets.flatMap((offset) => [
          [maxX + offset, verticalCenter],
          [minX - offset - width, verticalCenter],
          [horizontalCenter, minY - offset - height],
          [horizontalCenter, maxY + offset],
        ]),
        ...edgeSteps.flatMap((step) => [
          [padding + (maxLeft - padding) * step, padding],
          [padding + (maxLeft - padding) * step, maxTop],
          [padding, padding + (maxTop - padding) * step],
          [maxLeft, padding + (maxTop - padding) * step],
        ]),
      ].map(clamp)
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
      const position = tooltipPositions(tooltipWidth, tooltipHeight, padding, gap, points)
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

    // Use Space for playback/replay and arrow keys to move the second selected ping
    // Ignore keyboard input on interactive controls
    const onKeyDown: (event: KeyboardEvent) => void = (event) => {
      if (event.target instanceof Element && event.target.closest("button, a, input, select, textarea, [role='slider']")) return
      if (event.key === " ") {
        if (!syncMaster || variant !== "full" || event.repeat) return
        event.preventDefault()
        if (paused && sequenceIndex >= chartData.timeSequence.length - 1) replayRef.current()
        else toggleRef.current()
        return
      }
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return
      const selected = selectedPingIndexesRef.current
      if (selected.length !== 2) return
      const direction = event.key === "ArrowRight" ? 1 : -1
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
      let index = 0
      for (let candidate = 0; candidate < chartData.timeSequence.length; candidate += 1) {
        if (chartData.timeSequence[candidate] <= timestampSeconds) index = candidate
        else break
      }
      sequenceIndex = index
    }

    // Convert a timeline pointer position into a timestamp clamped to the scene's time range
    const timestampFromOffset = (offsetX: number, offsetY: number) => {
      const point = timelineChart.convertFromPixel({ gridIndex: 0 }, [offsetX, offsetY])
      const timeMs = Array.isArray(point) ? point[0] : point
      const minT = chartData.timeSequence[0]
      const maxT = chartData.timeSequence[chartData.timeSequence.length - 1]
      return Math.max(minT, Math.min(maxT, timeMs / 1000))
    }

    // Update the local timestamp and sequence index, then report the new time to the parent
    const seekTo = (timestampSeconds: number) => {
      selectedTimestampRef.current = timestampSeconds
      syncSequenceIndex(timestampSeconds)
      onTimeChange(timestampSeconds)
    }
    let dragging = false

    // Seek continuously as the pointer drags across the timeline
    const onPointerMove = (event: MouseEvent) => {
      if (!dragging || !timelineRef.current) return
      const rect = timelineRef.current.getBoundingClientRect()
      seekTo(timestampFromOffset(event.clientX - rect.left, event.clientY - rect.top))
    }

    // End timeline dragging and remove its temporary mouse listeners
    const onPointerUp = () => {
      dragging = false
      window.removeEventListener("mousemove", onPointerMove)
      window.removeEventListener("mouseup", onPointerUp)
    }

    // Pause playback, seek to the pressed timeline position, and attach drag listeners
    const onTimelinePointerDown = (event: { offsetX: number; offsetY: number; event?: MouseEvent }) => {
      event.event?.preventDefault()
      window.clearTimeout(timer)
      paused = true
      dragging = true
      seekTo(timestampFromOffset(event.offsetX, event.offsetY))
      setPlaybackState("paused")
      onPlaybackStateChangeRef.current?.("paused")
      window.addEventListener("mousemove", onPointerMove)
      window.addEventListener("mouseup", onPointerUp)
    }
    let wheelStepSeconds = 60
    let wheelDirection = 0
    let lastWheelTime = 0

    // Pause and scrub time by scrolling
    // First scroll from the initial end view returns to the start, repeated scrolling accelerates
    const onTimelineWheel = (event: WheelEvent) => {
      if (event.ctrlKey || event.shiftKey) return
      event.preventDefault()
      window.clearTimeout(timer)
      paused = true
      const activeTime = selectedTimestampRef.current ?? chartData.timeSequence[sequenceIndex] ?? chartData.timeSequence[0]
      const minTime = chartData.timeSequence[0]
      const maxTime = chartData.timeSequence[chartData.timeSequence.length - 1]
      const initializedAtEnd = wheelStartsAtEndRef.current && activeTime === maxTime
      wheelStartsAtEndRef.current = false
      if (initializedAtEnd) {
        wheelStepSeconds = 60
        wheelDirection = 0
        lastWheelTime = 0
        seekTo(minTime)
      } else {
        const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY
        const direction = Math.sign(delta)
        const wheelTime = event.timeStamp
        wheelStepSeconds = direction !== wheelDirection || wheelTime - lastWheelTime > 200
          ? 60
          : Math.min(wheelStepSeconds * 1.2, Math.max(60, (maxTime - minTime) / 15))
        wheelDirection = direction
        lastWheelTime = wheelTime
        seekTo(Math.max(minTime, Math.min(maxTime, activeTime + direction * wheelStepSeconds)))
      }
      setPlaybackState("paused")
      onPlaybackStateChangeRef.current?.("paused")
    }

    // Advance playback on the controlling panel, report shared time, and stop at the end
    // Notify preview completion when applicable
    const advance = () => {
      if (paused || !syncMaster) return
      sequenceIndex = Math.min(sequenceIndex + 1, chartData.timeSequence.length - 1)
      const timestampSeconds = chartData.timeSequence[sequenceIndex]
      onTimeChange(timestampSeconds)
      if (sequenceIndex >= chartData.timeSequence.length - 1) {
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

    // Resize both charts, recalculate map bounds, and reposition tooltips
    const resize = () => {
      mapChart.resize()
      applyMapBounds()
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

    mapChart.setOption({
      animation: false,
      animationDurationUpdate: 0,
      backgroundColor: "#f8f9fc",
      grid: { left: 12, right: 12, top: 12, bottom: 12, containLabel: false },
      xAxis: { type: "value", min: bounds.xMin, max: bounds.xMax, axisLine: { show: false }, axisTick: { show: false }, axisLabel: { show: false }, splitLine: { show: false } },
      yAxis: { type: "value", min: bounds.yMin, max: bounds.yMax, axisLine: { show: false }, axisTick: { show: false }, axisLabel: { show: false }, splitLine: { show: false } },
      dataZoom: [
        {
          type: "inside",
          xAxisIndex: 0,
          filterMode: "none",
          zoomOnMouseWheel: "ctrl",
          moveOnMouseMove: true,
          moveOnMouseWheel: false,
          preventDefaultMouseMove: true,
        },
        {
          type: "inside",
          yAxisIndex: 0,
          filterMode: "none",
          zoomOnMouseWheel: "ctrl",
          moveOnMouseMove: true,
          moveOnMouseWheel: false,
          preventDefaultMouseMove: true,
        },
      ],
      tooltip: {
        trigger: "item",
        renderMode: "html",
        borderWidth: 0,
        confine: true,
        backgroundColor: "rgba(32, 33, 36, 0.92)",
        textStyle: { color: "#ffffff" },
        extraCssText: "pointer-events: none;",
        position: pingTooltipPosition,
        formatter(params: EChartsParams) {
          const value = paramsValue(params)
          if (params.seriesId === "core-points") {
            const ping = chartData.pings[value[3]]
            return `Core point for Stop ${value[2]}<br>Ping ${ping.i + 1}<br>${ping.time}<br>Distance threshold: ${chartData.distanceThreshold}`
          }
          if (params.seriesId === "anchor-points") {
            const ping = chartData.pings[value[3]]
            const label = panel.algo === "sequential_centroid"
              ? "Centroid anchor for"
              : panel.algo.startsWith("sequential_")
                ? "Anchor for"
                : "Cached anchor for"
            return `${label} Stop ${value[2]}<br>Ping ${ping.i + 1}<br>${ping.time}`
          }
          if (params.seriesId === "cluster-pings" || params.seriesId === "noise-pings" || params.seriesId === "current-ping" || params.seriesId === "ping-hit-area") {
            const ping = chartData.pings[value[3]]
            const classified = pingClassifiedAt(ping.i, activeTimestamp())
            const cluster = !classified
              ? "Unclassified"
              : ping.cluster < 0
                ? "Noise"
                : isDensityAlgorithm && layerStateRef.current.showXray
                  ? `${chartData.result.kind === "density" && chartData.result.core[ping.i] >= 0 ? "Core" : "Border"} · Cluster ${ping.cluster}`
                  : `Cluster ${ping.cluster}`
            const distanceLine = classified && isDensityAlgorithm && layerStateRef.current.showXray ? `<br>Distance threshold: ${chartData.distanceThreshold}` : ""
            return `Ping ${ping.i + 1}<br>${ping.time}<br>${cluster}${distanceLine}`
          }
          return ""
        },
      },
      series: [
        {
          id: "streets",
          type: "custom",
          coordinateSystem: "cartesian2d",
          silent: true,
          z: 0,
          data: chartData.streets.map((_, index) => index),
          renderItem(params: EChartsParams, api: EChartsApi) {
            const street = chartData.streets[params.dataIndex]
            return {
              type: "polygon",
              shape: { points: street.coords.map((coord) => api.coord(coord)) },
              style: {
                fill: "#b9bec1",
                stroke: "#b9bec1",
                lineWidth: 1,
                opacity: hoverBuildingId !== "" ? MAP_FOCUS_FADE_OPACITY : 1,
              },
            }
          },
        },
        {
          id: "street-lanes",
          type: "custom",
          coordinateSystem: "cartesian2d",
          silent: true,
          z: 1,
          data: chartData.streetLanes.map((_, index) => index),
          renderItem(params: EChartsParams, api: EChartsApi) {
            const [start, end] = chartData.streetLanes[params.dataIndex]
            const startPixel = api.coord(start)
            const endPixel = api.coord(end)
            return { type: "line", shape: { x1: startPixel[0], y1: startPixel[1], x2: endPixel[0], y2: endPixel[1] }, style: { stroke: "#ffffff", lineWidth: 1.6, lineDash: [7, 42], opacity: hoverBuildingId !== "" ? MAP_FOCUS_FADE_OPACITY : 1 } }
          },
        },
        {
          id: "buildings",
          type: "custom",
          coordinateSystem: "cartesian2d",
          silent: true,
          z: 1,
          data: chartData.buildings.map((_, index) => [index, 0]),
          renderItem(params: EChartsParams, api: EChartsApi) {
            const building = chartData.buildings[Number(api.value(0))]
            const state = Number(api.value(1))
            const next = state === 2
            const faded = Number(api.value(2)) === 1
            return {
              type: "polygon",
              shape: { points: building.coords.map((coord) => api.coord(coord)) },
              style: {
                fill: "#8b8b8b",
                stroke: next ? FUTURE_GROUND_TRUTH_COLOR : "#ffffff",
                lineWidth: next ? 2.6 : 2,
                opacity: faded ? MAP_FOCUS_FADE_OPACITY : 1,
              },
            }
          },
        },
        {
          id: "building-glow",
          type: "custom",
          coordinateSystem: "cartesian2d",
          silent: true,
          z: 2,
          data: [],
          renderItem(params: EChartsParams, api: EChartsApi) {
            const building = chartData.buildings[Number(api.value(0))]
            const currentPulse = Number(api.value(1)) - 1
            return {
              type: "polygon",
              shape: { points: building.coords.map((coord) => api.coord(coord)) },
              style: {
                fill: "transparent",
                stroke: `rgba(15, 118, 110, ${0.62 + currentPulse * 0.35})`,
                lineWidth: 2.4 + currentPulse * 1.2,
                shadowBlur: 6 + currentPulse * 10,
                shadowColor: `rgba(15, 118, 110, ${0.2 + currentPulse * 0.32})`,
              },
            }
          },
        },
        {
          id: "assigned-building-outline",
          name: "Algorithm-assigned building",
          type: "custom",
          coordinateSystem: "cartesian2d",
          silent: true,
          z: 2,
          data: [],
          renderItem(_params: EChartsParams, api: EChartsApi) {
            const building = chartData.buildings[Number(api.value(0))]
            const color = clusterColor(Number(api.value(1)))
            return {
              type: "polygon",
              shape: { points: building.coords.map((coord) => api.coord(coord)) },
              style: {
                fill: "transparent",
                stroke: color,
                lineWidth: 3,
                shadowBlur: 8,
                shadowColor: color,
              },
            }
          },
        },
        {
          id: "completed-paths",
          name: "Inferred street route",
          type: "lines",
          coordinateSystem: "cartesian2d",
          polyline: true,
          silent: true,
          z: 2,
          data: [],
          lineStyle: { color: "#1f6d6a", width: 2.4, opacity: 0.78 },
        },
        {
          id: "completed-fallback-paths",
          name: "Fallback inferred route",
          type: "lines",
          coordinateSystem: "cartesian2d",
          polyline: true,
          silent: true,
          z: 2,
          data: [],
          lineStyle: { color: "#d94b45", width: 2.4, opacity: 0.85 },
        },
        {
          id: "next-path",
          name: "Next ground-truth route",
          type: "lines",
          coordinateSystem: "cartesian2d",
          polyline: true,
          silent: true,
          z: 2,
          data: [],
          lineStyle: { color: FUTURE_GROUND_TRUTH_COLOR, width: 3, opacity: 0.38, type: "dashed" },
        },
        {
          id: "active-path",
          name: "Active route",
          type: "line",
          coordinateSystem: "cartesian2d",
          smooth: 0.38,
          showSymbol: false,
          silent: true,
          z: 4,
          data: [],
          lineStyle: { color: GROUND_TRUTH_COLOR, width: 4, opacity: 0.95, shadowBlur: 10, shadowColor: "rgba(15, 118, 110, 0.26)" },
        },
        {
          id: "active-fallback-path",
          name: "Active fallback route",
          type: "line",
          coordinateSystem: "cartesian2d",
          smooth: 0.38,
          showSymbol: false,
          silent: true,
          z: 4,
          data: [],
          lineStyle: { color: "#d94b45", width: 4, opacity: 0.95, shadowBlur: 10, shadowColor: "rgba(217, 75, 69, 0.26)" },
        },
        {
          id: "route-glow",
          name: "Route glow",
          type: "custom",
          coordinateSystem: "cartesian2d",
          silent: true,
          z: 6,
          data: [],
          renderItem(_params: EChartsParams, api: EChartsApi) {
            const center = api.coord([api.value(0), api.value(1)])
            const half = 5.5
            const opacity = Number(api.value(4))
            return {
              type: "rect",
              shape: { x: center[0] - half, y: center[1] - half, width: half * 2, height: half * 2 },
              style: {
                fill: GROUND_TRUTH_COLOR,
                stroke: "#ffffff",
                lineWidth: 1,
                shadowBlur: 10,
                shadowColor: `rgba(15, 118, 110, ${opacity * 0.43})`,
                opacity,
              },
            }
          },
        },
        { id: "ghost-pings", name: "All pings", type: "scatter", coordinateSystem: "cartesian2d", silent: false, z: 3, data: [], symbolSize: 5, itemStyle: { color: "#000000" } },
        {
          id: "ping-hit-area",
          name: "Ping hit area",
          type: "custom",
          coordinateSystem: "cartesian2d",
          z: 10,
          data: chartData.pingData,
          renderItem(_params: EChartsParams, api: EChartsApi) {
            const circle = pingCircle(api)
            return {
              type: "circle",
              shape: { cx: circle.center[0], cy: circle.center[1], r: circle.radius * pingScale(Number(api.value(3))) },
              style: { fill: "rgba(0, 0, 0, 0.001)" },
            }
          },
        },
        { id: "noise-pings", name: "Noise pings", type: "scatter", coordinateSystem: "cartesian2d", z: 5, data: [], symbolSize: 5, itemStyle: { color: "rgba(0, 0, 0, 0.75)" } },
        {
          id: "cluster-pings",
          name: "Cluster pings",
          type: "custom",
          coordinateSystem: "cartesian2d",
          z: 6,
          data: [],
          renderItem(_params: EChartsParams, api: EChartsApi) {
            const circle = pingCircle(api)
            const scale = pingScale(Number(api.value(3)))
            return {
              type: "group",
              children: [
                { type: "circle", shape: { cx: circle.center[0], cy: circle.center[1], r: circle.radius * scale }, style: { fill: clusterColor(Number(api.value(2))), stroke: "#202124", lineWidth: 1.6, opacity: Number(api.value(5)) } },
                { type: "circle", shape: { cx: circle.center[0], cy: circle.center[1], r: 3.6 * scale }, style: { fill: "#000000", opacity: Number(api.value(5)) } },
              ],
            }
          },
        },
        {
          id: "promotion-edges",
          name: "Density promotions",
          type: "lines",
          coordinateSystem: "cartesian2d",
          silent: true,
          z: 7,
          data: [],
          symbol: "none",
          lineStyle: { width: 1.8, opacity: 0.55 },
        },
        {
          id: "promotion-edges-hit-area",
          name: "Density promotions hit area",
          type: "lines",
          coordinateSystem: "cartesian2d",
          z: 7,
          data: [],
          symbol: "none",
          silent: false,
          tooltip: { show: false },
          lineStyle: { width: 16, opacity: 0 },
        },
        {
          id: "core-points",
          name: "Core points",
          type: "scatter",
          coordinateSystem: "cartesian2d",
          z: 8,
          data: [],
          symbolSize: 15,
          itemStyle: { borderColor: "#ffffff", borderWidth: 2.4, shadowBlur: 8, shadowColor: "rgba(32, 33, 36, 0.24)" },
        },
        {
          id: "anchor-edges",
          name: "Anchor assignments",
          type: "lines",
          coordinateSystem: "cartesian2d",
          silent: true,
          z: 7,
          data: [],
          symbol: "none",
          lineStyle: {
            width: 1.8,
            opacity: 0.55,
          },
        },
        {
          id: "anchor-edges-hit-area",
          name: "Anchor assignments hit area",
          type: "lines",
          coordinateSystem: "cartesian2d",
          z: 7,
          data: [],
          symbol: "none",
          silent: false,
          tooltip: { show: false },
          lineStyle: {
            width: 16,
            opacity: 0,
          },
        },
        {
          id: "anchor-points",
          name: "Anchor points",
          type: "scatter",
          coordinateSystem: "cartesian2d",
          z: 8,
          data: [],
          symbolSize: 15,
          itemStyle: { borderColor: "#ffffff", borderWidth: 2.4, shadowBlur: 8, shadowColor: "rgba(32, 33, 36, 0.24)" },
        },
        {
          id: "current-ping",
          name: "Current ping",
          type: "effectScatter",
          coordinateSystem: "cartesian2d",
          z: 9,
          data: [],
          symbol: "pin",
          symbolSize: 30,
          animationDurationUpdate: 0,
          rippleEffect: { scale: 1.8, brushType: "stroke" },
          itemStyle: { color: "#67D3E3", borderColor: "#202124", borderWidth: 1.2, opacity: 0.96 },
        },
        {
          id: "current-ping-hole",
          name: "Current ping hole",
          type: "custom",
          coordinateSystem: "cartesian2d",
          silent: true,
          z: 10,
          data: [],
          animationDurationUpdate: 0,
          renderItem(_params: EChartsParams, api: EChartsApi) {
            const center = api.coord([api.value(0), api.value(1)])
            return {
              type: "circle",
              shape: { cx: center[0], cy: center[1] - 16, r: 4.3 },
              style: { fill: "#ffffff", stroke: "#202124", lineWidth: 0.9 },
            }
          },
        },
        {
          id: "distance-circles",
          name: "Distance threshold radius",
          type: "custom",
          coordinateSystem: "cartesian2d",
          silent: true,
          z: 9,
          data: [],
          renderItem(_params: EChartsParams, api: EChartsApi) {
            const center = api.coord([api.value(0), api.value(1)])
            const edge = api.coord([api.value(0) + chartData.distanceThreshold, api.value(1)])
            const radius = Math.abs(edge[0] - center[0])
            const color = clusterColor(Number(api.value(2)))
            return {
              type: "circle",
              shape: { cx: center[0], cy: center[1], r: radius },
              style: {
                fill: "transparent",
                stroke: color,
                lineWidth: 1.6,
                lineDash: [5, 4],
                opacity: 0.9,
              },
            }
          },
        },
        {
          id: "selected-ping-line",
          name: "Selected ping distance",
          type: "lines",
          coordinateSystem: "cartesian2d",
          silent: true,
          z: 11,
          data: [],
          symbol: "none",
          lineStyle: { color: "#000000", width: 3 },
        },
      ],
    })
    const pingHitAreaSeriesIndex = (mapChart.getOption().series as Array<{ id?: string }>)
      .findIndex((series) => series.id === "ping-hit-area")

    timelineChart.setOption({
      backgroundColor: "#f8f9fc",
      animation: true,
      animationDurationUpdate: 180,
      animationEasingUpdate: "cubicOut",
      grid: { left: 34, right: 22, top: 0, bottom: 28 },
      dataZoom: [{
        id: "timeline-zoom",
        type: "inside",
        xAxisIndex: 0,
        filterMode: "none",
        minSpan: 1,
        zoomOnMouseWheel: "ctrl",
        moveOnMouseMove: "shift",
        moveOnMouseWheel: "shift",
      }],
      xAxis: {
        type: "time",
        min: timeMin,
        max: timeMax,
        axisLine: { lineStyle: { color: "#a9aea5" } },
        axisTick: { show: false },
        axisLabel: { color: "#626760", formatter: (value: number) => new Date(value).toISOString().slice(11, 16) },
        splitLine: { show: true, lineStyle: { color: "#edf0ea" } },
      },
      yAxis: { min: 0, max: 1, axisLine: { show: false }, axisTick: { show: false }, axisLabel: { show: false }, splitLine: { show: false } },
      tooltip: { show: false },
      series: [
        {
          id: "ping-ticks",
          type: "custom",
          coordinateSystem: "cartesian2d",
          silent: false,
          z: 7,
          data: [],
          renderItem(_params: EChartsParams, api: EChartsApi) {
            const pingIndex = Number(api.value(0))
            const ping = chartData.pings[pingIndex]
            const hovered = hoverPingIndex === pingIndex
            const selected = selectedPingIndexesRef.current.includes(pingIndex)
            const emphasized = hovered || selected
            const halfHeight = 0.22 * (emphasized ? 1.2 : 1)
            const top = api.coord([ping.t * 1000, 0.5 + halfHeight])
            const bottom = api.coord([ping.t * 1000, 0.5 - halfHeight])
            const shape = { x1: top[0], y1: top[1], x2: bottom[0], y2: bottom[1] }
            return {
              type: "group",
              children: [
                { type: "line", z2: emphasized ? 9 : 0, shape, style: { stroke: "rgba(0, 0, 0, 0)", lineWidth: 10 } },
                { type: "line", z2: emphasized ? 10 : 0, shape, style: { stroke: "#000000", lineWidth: emphasized ? 5 : 2.5, opacity: hoverPingIndex === null || emphasized ? 0.85 : 0.2 } },
              ],
            }
          },
        },
        {
          id: "core-point-ticks",
          type: "custom",
          coordinateSystem: "cartesian2d",
          silent: false,
          z: 7,
          data: [],
          renderItem(_params: EChartsParams, api: EChartsApi) {
            const pingIndex = Number(api.value(2))
            const hovered = hoverPingIndex === pingIndex
            const selected = selectedPingIndexesRef.current.includes(pingIndex)
            const emphasized = hovered || selected
            const halfHeight = 0.22 * (emphasized ? 1.2 : 1)
            const top = api.coord([api.value(0), 0.5 + halfHeight])
            const bottom = api.coord([api.value(0), 0.5 - halfHeight])
            const shape = { x1: top[0], y1: top[1], x2: bottom[0], y2: bottom[1] }
            const color = clusterColor(Number(api.value(1)))
            return emphasized
              ? { type: "group", children: [
                { type: "line", z2: 10, shape, style: { stroke: "#000000", lineWidth: 6 } },
                { type: "line", z2: 11, shape, style: { stroke: color, lineWidth: 3.5, opacity: 0.95 } },
              ] }
              : { type: "line", z2: 1, shape, style: { stroke: color, lineWidth: 3.5, opacity: hoverPingIndex === null ? 0.95 : 0.2 } }
          },
        },
        {
          id: "past-truth-stops",
          type: "custom",
          coordinateSystem: "cartesian2d",
          silent: false,
          z: 3,
          data: [],
          renderItem(params: EChartsParams, api: EChartsApi) {
            const start = api.coord([api.value(0), 0.18])
            const end = api.coord([api.value(1), 0.82])
            const shape = echarts.graphic.clipRectByRect(
              { x: start[0], y: end[1], width: Math.max(2, end[0] - start[0]), height: start[1] - end[1] },
              { x: params.coordSys.x, y: params.coordSys.y, width: params.coordSys.width, height: params.coordSys.height },
            )
            return shape ? { type: "rect", shape, style: { fill: "transparent", stroke: GROUND_TRUTH_COLOR, lineWidth: 2, opacity: 0.62 } } : null
          },
        },
        {
          id: "current-truth-stop",
          type: "custom",
          coordinateSystem: "cartesian2d",
          silent: false,
          z: 4,
          data: [],
          renderItem(params: EChartsParams, api: EChartsApi) {
            const start = api.coord([api.value(0), 0.18])
            const end = api.coord([api.value(1), 0.82])
            const pulse = Number(api.value(2))
            const shape = echarts.graphic.clipRectByRect(
              { x: start[0], y: end[1], width: Math.max(2, end[0] - start[0]), height: start[1] - end[1] },
              { x: params.coordSys.x, y: params.coordSys.y, width: params.coordSys.width, height: params.coordSys.height },
            )
            return shape ? { type: "rect", shape, style: { fill: "transparent", stroke: GROUND_TRUTH_COLOR, lineWidth: 2 + pulse, shadowBlur: 4 + pulse * 8, shadowColor: "rgba(15, 118, 110, 0.48)" } } : null
          },
        },
        {
          id: "next-truth-stop",
          type: "custom",
          coordinateSystem: "cartesian2d",
          silent: false,
          z: 2,
          data: [],
          renderItem(params: EChartsParams, api: EChartsApi) {
            const start = api.coord([api.value(0), 0.18])
            const end = api.coord([api.value(1), 0.82])
            const shape = echarts.graphic.clipRectByRect(
              { x: start[0], y: end[1], width: Math.max(2, end[0] - start[0]), height: start[1] - end[1] },
              { x: params.coordSys.x, y: params.coordSys.y, width: params.coordSys.width, height: params.coordSys.height },
            )
            return shape ? { type: "rect", shape, style: { fill: "transparent", stroke: FUTURE_GROUND_TRUTH_COLOR, lineWidth: 2, opacity: 0.78 } } : null
          },
        },
        {
          id: "stop-bars",
          type: "custom",
          coordinateSystem: "cartesian2d",
          silent: true,
          z: 4,
          data: [],
          renderItem(params: EChartsParams, api: EChartsApi) {
            const start = api.coord([api.value(0), 0.24])
            const end = api.coord([api.value(1), 0.76])
            const shape = echarts.graphic.clipRectByRect(
              { x: start[0], y: end[1], width: Math.max(2, end[0] - start[0]), height: start[1] - end[1] },
              { x: params.coordSys.x, y: params.coordSys.y, width: params.coordSys.width, height: params.coordSys.height },
            )
            return shape ? { type: "rect", shape, style: { fill: clusterColor(Number(api.value(2))), opacity: 0.4 } } : null
          },
        },
        { id: "cursor", type: "line", coordinateSystem: "cartesian2d", showSymbol: false, z: 6, data: [], lineStyle: { color: "#67D3E3", width: 2 } },
      ],
    })

    toggleRef.current = toggle
    replayRef.current = replay
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
    const initialTimestamp = variant === "preview"
      ? chartData.timeSequence[0]
      : selectedTimestampRef.current ?? chartData.timeSequence[chartData.timeSequence.length - 1]
    sequenceIndex = chartData.timeSequence.findIndex((timestamp) => timestamp >= initialTimestamp)
    if (sequenceIndex < 0) sequenceIndex = chartData.timeSequence.length - 1
    paused = true
    syncPlaybackState()
    renderSceneRef.current(initialTimestamp)
    window.addEventListener("resize", resize)
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
    mapChart.on("dataZoom", refreshTooltipLayout)
    mapChart.getZr().on("mousemove", onMapPointerMove)
    timelineChart.on("mouseover", onTimelineMouseOver)
    timelineChart.on("globalout", onTimelineMouseOut)
    timelineChart.on("click", onTimelineClick)
    timelineChart.getZr().on("mousedown", onTimelinePointerDown)
    mapEl.addEventListener("wheel", onTimelineWheel, { passive: false, capture: true })
    timelineEl.addEventListener("wheel", onTimelineWheel, { passive: false, capture: true })
    if (variant === "preview") timer = window.setTimeout(replay, initialDelay)
    const pulseTimer = window.setInterval(() => {
      if (previewing) return
      const timestampSeconds = selectedTimestampRef.current ?? chartData.timeSequence[sequenceIndex]
      const ended = timestampSeconds >= chartData.timeSequence[chartData.timeSequence.length - 1]
      if (ended && pulseStrength === 0) return
      pulsePhase = ended ? 0 : pulsePhase + 0.24
      pulseStrength = ended ? 0 : (Math.sin(pulsePhase) + 1) / 2
      mapChart.setOption({
        series: [
          { id: "streets", data: chartData.streets.map((_, index) => index) },
          { id: "street-lanes", data: chartData.streetLanes.map((_, index) => index) },
          { id: "buildings", data: buildingsSeriesData(timestampSeconds) },
          { id: "building-glow", data: buildingGlowData(timestampSeconds) },
        ],
      })
      timelineChart.setOption({
        series: [{ id: "current-truth-stop", data: layerStateRef.current.showGroundTruth ? currentTruthStopData(timestampSeconds) : [] }],
      })
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
      window.removeEventListener("mousemove", onPointerMove)
      window.removeEventListener("mouseup", onPointerUp)
      toggleRef.current = () => {}
      replayRef.current = () => {}
      previewRef.current = () => {}
      clearSelectionRef.current = () => {}
      updateResultRef.current = () => {}
      mapChart.off("mouseover", onMapMouseOver)
      mapChart.off("mouseout", onMapMouseOut)
      mapChart.off("globalout", onMapMouseOut)
      mapChart.off("click", onMapClick)
      mapChart.off("dataZoom", refreshTooltipLayout)
      mapChart.getZr().off("mousemove", onMapPointerMove)
      timelineChart.off("mouseover", onTimelineMouseOver)
      timelineChart.off("globalout", onTimelineMouseOut)
      timelineChart.off("click", onTimelineClick)
      timelineChart.getZr().off("mousedown", onTimelinePointerDown)
      mapEl.removeEventListener("wheel", onTimelineWheel, true)
      timelineEl.removeEventListener("wheel", onTimelineWheel, true)
      renderSceneRef.current = null
      mapEl.style.touchAction = previousTouchAction
      timelineEl.style.touchAction = previousTimelineTouchAction
    }
  }, [mode, onPreviewComplete, onTimeChange, panel.algo, scene.pings, syncMaster, variant])

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
    if (!resultData || currentTime !== null) return
    onTimeChange(variant === "preview" ? resultData.timeSequence[0] : resultData.timeSequence[resultData.timeSequence.length - 1])
  }, [currentTime, onTimeChange, resultData, variant])

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

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden rounded-md border border-[#d7dbd2] bg-[#f8f9fc] text-[#202124] shadow-[0_16px_45px_rgba(32,33,36,0.08)]">
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
              {playbackState !== "complete" && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => toggleRef.current()}
                      aria-label={playbackState === "playing" ? "Pause" : "Play"}
                      className="flex h-8 w-8 items-center justify-center rounded-md border border-[#bfc6bb] bg-[#f8f9fc] text-[#3b1370] hover:bg-white hover:border-[#7629db]"
                    >
                      {playbackState === "playing" ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 fill-current" />}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">{playbackState === "playing" ? "Pause" : "Play"}</TooltipContent>
                </Tooltip>
              )}
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
      <div ref={mapRef} className="min-h-0 flex-1 border-b border-[#d7dbd2]" data-tour={mode === "single" ? "tour-map" : undefined} />
      <div className={`flex shrink-0 flex-col bg-[#f8f9fc] ${variant === "preview" ? "h-20" : mode === "single" ? "h-28" : "h-24"}`} data-tour={mode === "single" ? "tour-timeline" : undefined}>
        <div ref={timelineRef} className="min-h-0 flex-1" />
        <div className="flex shrink-0 items-center justify-center gap-3 border-t border-[#d7dbd2] bg-[#f8f9fc] px-3 py-1 text-[11px] font-bold uppercase tracking-[0.08em] text-[#3b1370]">
          <span>Timeline</span>
          <span className="font-mono tracking-normal text-[#202124]">
            {currentTime ? new Date(currentTime * 1000).toISOString().slice(11, 19) : "--:--:--"}
          </span>
          {selectedPingIndexes.length > 0 && (
            <button type="button" onClick={() => clearSelectionRef.current()} className="rounded border border-[#bfc6bb] bg-[#f8f9fc] px-2 py-0.5 text-[10px] text-[#3b1370] hover:bg-white hover:border-[#7629db]">Clear selection</button>
          )}
        </div>
      </div>
    </div>
  )
}

// Wrap the scene renderer with the algorithm title, 
// Learn link, agent details, and loading placeholders
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
}) {
  const sceneMetadata = panel ? `Agent: ${panel.scene.user_id}` : null
  const learnAlgorithmId = panel?.algo

  return (
    <Card className="h-full min-h-0 overflow-hidden bg-[#f8f9fc] py-0">
      <CardHeader className="py-3 px-4 shrink-0">
      <CardTitle className="flex items-center gap-2 text-base font-semibold text-[#3b1370]">
          {panel?.title ?? <><Spinner className="text-[#8acac8]" /> Loading visualization</>}
          {learnAlgorithmId && (
            <Button asChild variant="outline" size="icon" title="Learn about this algorithm" aria-label={`Learn about ${panel?.title}`} className="h-8 w-8">
              <Link href={`/?view=learn&algo=${learnAlgorithmId}`} prefetch={false}>
                <HelpCircle className="h-4 w-4" />
              </Link>
            </Button>
          )}
        </CardTitle>
        {sceneMetadata && (
          <p className="text-xs text-[#87A0BE]">{sceneMetadata}</p>
        )}
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col p-5">
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

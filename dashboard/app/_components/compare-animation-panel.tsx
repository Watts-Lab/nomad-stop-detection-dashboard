"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import * as echarts from "echarts"
import { Pause, Play, RotateCcw } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
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
const DENSITY_ALGORITHMS = ["tadbscan", "dbstop", "seqscan", "hdbscan"]
const GROUND_TRUTH_COLOR = "#0f766e"
type PlaybackState = "playing" | "paused" | "complete"

function DemoSceneRenderer({
  panel,
  mode,
  currentTime,
  onTimeChange,
  syncMaster,
  showGroundTruth,
  showStops,
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
  const toggleRef = useRef<() => void>(() => {})
  const replayRef = useRef<() => void>(() => {})
  const previewRef = useRef<() => void>(() => {})
  const onReplayStartRef = useRef(onReplayStart)
  const sharedPlaybackStateRef = useRef(sharedPlaybackState)
  const onPlaybackStateChangeRef = useRef(onPlaybackStateChange)
  const selectedTimestampRef = useRef<number | null>(null)
  const renderSceneRef = useRef<((timestampSeconds: number) => void) | null>(null)
  const [playbackState, setPlaybackState] = useState<PlaybackState>("complete")
  const labels = useMemo(() => {
    if (!scene) return []
    if (panel.labels && panel.labels.length === scene.pings.length) return panel.labels
    return []
  }, [panel.labels, scene])
  const chartData = useMemo(() => {
    if (!scene || scene.pings.length === 0) return null
    if (labels.length !== scene.pings.length) return null

    const pings = scene.pings.map((ping, index) => ({
      i: index,
      x: ping.x,
      y: ping.y,
      t: ping.timestamp,
      time: new Date(ping.timestamp * 1000).toISOString().slice(11, 19) + " UTC",
      cluster: labels[index],
    }))
    const pingIndexByTimestamp = new Map(pings.map((ping) => [ping.t, ping.i]))
    const pingData = pings.map((ping) => [ping.x, ping.y, ping.cluster, ping.i, ping.t])
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
    const destinationFor = (x: number, y: number) => {
      const containing = buildings.find((building) =>
        x >= building.minX && x <= building.maxX && y >= building.minY && y <= building.maxY
      )
      const destination = containing ?? buildings.reduce((best, building) =>
        Math.hypot(x - building.center[0], y - building.center[1]) < Math.hypot(x - best.center[0], y - best.center[1])
          ? building
          : best
      )
      return {
        id: destination.type === "building" ? null : destination.id,
        center: destination.center,
      }
    }
    const routeBetween = (start: number[], end: number[]) => [
      start,
      [(start[0] + end[0]) / 2, start[1]],
      [(start[0] + end[0]) / 2, end[1]],
      end,
    ].filter((point, index, route) => index === 0 || point[0] !== route[index - 1][0] || point[1] !== route[index - 1][1])
    const routeByPair = new Map(scene.routes?.routes.map((route) => [`${route.from}->${route.to}`, route.path]) ?? [])
    const routeFor = (
      start: { id: string | null; center: number[] },
      end: { id: string | null; center: number[] },
    ) => {
      const cached = start.id && end.id ? routeByPair.get(`${start.id}->${end.id}`) : null
      return {
        points: cached ?? routeBetween(start.center, end.center),
        isFallback: !cached,
      }
    }
    const stops = stopsFromLabels(scene.pings, labels).map((stop) => ({
      ...stop,
      destination: destinationFor(stop.x, stop.y),
      radius: Math.max(
        stop.diameter / 2,
        Number(panel.params?.delta_roam ?? panel.params?.dist_thresh ?? panel.params?.eps_spatial ?? 0),
      ),
      label: `Stop ${stop.cluster}`,
      startTime: new Date(stop.start * 1000).toISOString().slice(11, 16) + " UTC",
      endTime: new Date(stop.end * 1000).toISOString().slice(11, 16) + " UTC",
    }))
    const sequentialGroups = panel.algo.startsWith("sequential-")
      ? stops.map((stop) => pings.filter((ping) => ping.cluster === stop.cluster))
      : []
    const firstAnchorData = panel.algo === "sequential-first" ? sequentialGroups.map((members, stopIndex) => {
      const anchor = members[0]
      return [anchor.x, anchor.y, anchor.cluster, anchor.i, stopIndex, anchor.t]
    }) : []
    const firstAnchorEdges = panel.algo === "sequential-first" ? sequentialGroups.flatMap((members, stopIndex) => {
      const anchor = members[0]
      return members.slice(1).map((ping) => ({
        coords: [[anchor.x, anchor.y], [ping.x, ping.y]],
        value: [anchor.cluster, anchor.i, ping.i, stopIndex, ping.t],
      }))
    }) : []
    const centroidAnchorFrames = panel.algo === "sequential-centroid" ? sequentialGroups.flatMap((members, stopIndex) => {
      let sumX = 0
      let sumY = 0
      return members.map((ping, index) => {
        sumX += ping.x
        sumY += ping.y
        const centroid = [sumX / (index + 1), sumY / (index + 1)]
        return {
          stopIndex,
          t: ping.t,
          point: [centroid[0], centroid[1], ping.cluster, ping.i, stopIndex, ping.t],
          edges: members.slice(0, index + 1).map((member) => ({
            coords: [centroid, [member.x, member.y]],
            value: [ping.cluster, ping.i, member.i, stopIndex, ping.t],
          })),
        }
      })
    }) : []
    const lachesisDiameterFrames = panel.algo === "lachesis" ? stops.flatMap((stop, stopIndex) => {
      const members = pings.filter((ping) => ping.cluster === stop.cluster)
      if (members.length < 2) return []
      let bestStart = members[0]
      let bestEnd = members[1]
      let bestDistance = bestStart && bestEnd ? Math.hypot(bestEnd.x - bestStart.x, bestEnd.y - bestStart.y) : 0
      return members.slice(1).map((ping, index) => {
        for (const previous of members.slice(0, index + 1)) {
          const distance = Math.hypot(ping.x - previous.x, ping.y - previous.y)
          if (distance > bestDistance) {
            bestStart = previous
            bestEnd = ping
            bestDistance = distance
          }
        }
        return {
          stopIndex,
          t: ping.t,
          edge: {
            coords: [[bestStart.x, bestStart.y], [bestEnd.x, bestEnd.y]],
            value: [stop.cluster, bestStart.i, bestEnd.i, stopIndex, ping.t],
          },
        }
      })
    }) : []
    const cachedCorePointKeys = new Set<string>()
    const cachedCorePointData = (panel.corePoints ?? []).flatMap((point) => {
      const pingIndex = pingIndexByTimestamp.get(point.timestamp)
      const roleIsCore = point.role === 1
      if (pingIndex === undefined || !roleIsCore) return []
      const key = `${point.timestamp}|${point.cluster}|${point.role}`
      if (cachedCorePointKeys.has(key)) return []
      cachedCorePointKeys.add(key)
      return [[point.x, point.y, point.cluster, pingIndex, point.cluster, point.coreTimestamp]]
    })
    const cachedCoreEdges = (panel.corePoints ?? []).flatMap((point) => {
      const pingIndex = pingIndexByTimestamp.get(point.timestamp)
      const sourceIndex = pingIndexByTimestamp.get(point.sourceTimestamp)
      if (pingIndex === undefined || sourceIndex === undefined || point.timestamp === point.sourceTimestamp) return []
      const visibleAt = Math.max(point.timestamp, point.sourceCoreTimestamp)
      return [{
        coords: [[point.sourceX, point.sourceY], [point.x, point.y]],
        value: [point.cluster, sourceIndex, pingIndex, point.cluster, visibleAt],
      }]
    })
    const coreTimelineData = DENSITY_ALGORITHMS.includes(panel.algo)
      ? cachedCorePointData.map((point) => [point[5] * 1000, point[2]])
      : []
    const useCachedCorePoints = Boolean(panel.corePoints?.length) && panel.algo !== "sequential-centroid"
    const anchorPointData = useCachedCorePoints ? cachedCorePointData : firstAnchorData
    const anchorEdgeData = useCachedCorePoints ? cachedCoreEdges : firstAnchorEdges
    const visibleCentroidAnchorFrames = useCachedCorePoints ? [] : centroidAnchorFrames
    const truthStops = scene.truth.flatMap((row) => {
      const building = row.location ? buildingById.get(row.location) : null
      return building ? [{ ...row, destination: { id: row.location, center: building.center } }] : []
    })
    const segments = truthStops.slice(1).map((current, index) => {
      const previous = truthStops[index]
      return {
        stopIndex: index,
        cluster: index,
        start: previous.timestamp + previous.duration * 60,
        end: current.timestamp,
        ...routeFor(previous.destination, current.destination),
      }
    }).filter((segment) => segment.end > segment.start && segment.points.length > 1)
    const focusBuildings = [
      ...truthStops.flatMap((stop) => stop.location ? buildingById.get(stop.location) ?? [] : []),
      ...stops.flatMap((stop) => stop.destination.id ? buildingById.get(stop.destination.id) ?? [] : []),
    ]
    const focusPoints = [
      ...pings.map((ping) => [ping.x, ping.y]),
      ...segments.flatMap((segment) => segment.points),
    ]
    const focusXs = [
      ...focusPoints.map(([x]) => x),
      ...focusBuildings.flatMap((building) => [building.minX, building.maxX]),
    ]
    const focusYs = [
      ...focusPoints.map(([, y]) => y),
      ...focusBuildings.flatMap((building) => [building.minY, building.maxY]),
    ]
    const start = scene.pings[0].timestamp
    const end = scene.pings[scene.pings.length - 1].timestamp
    const times = new Set([start, end])
    for (let timestamp = start; timestamp <= end; timestamp += 30) times.add(timestamp)

    return {
      streets: scene.routes?.streets ?? [],
      buildings,
      blockSide,
      pings,
      pingData,
      stops,
      anchorPointData,
      anchorEdgeData,
      coreTimelineData,
      centroidAnchorFrames: visibleCentroidAnchorFrames,
      lachesisDiameterFrames,
      anchorPointMode: panel.algo,
      truthStops,
      truthBars: truthStops.map((stop) => [
        stop.timestamp * 1000,
        (stop.timestamp + stop.duration * 60) * 1000,
      ]),
      segments,
      focusBounds: {
        minX: Math.min(...focusXs),
        minY: Math.min(...focusYs),
        maxX: Math.max(...focusXs),
        maxY: Math.max(...focusYs),
      },
      stopData: stops.map((stop) => [stop.x, stop.y, stop.cluster, stop.index, stop.nPings, stop.duration]),
      stopBars: stops.map((stop) => [stop.start * 1000, stop.end * 1000, stop.cluster, stop.index]),
      stopEndTimes: stops.map((stop) => stop.end),
      timeSequence: Array.from(times).sort((a, b) => a - b),
    }
  }, [labels, panel.algo, panel.corePoints, panel.params, scene])

  useEffect(() => {
    if (!scene || !chartData || !mapRef.current || !timelineRef.current) return

    const mapEl = mapRef.current
    const previousTouchAction = mapEl.style.touchAction
    mapEl.style.touchAction = "none"
    const mapChart = echarts.init(mapEl, null, { renderer: "canvas" })
    const timelineChart = echarts.init(timelineRef.current, null, { renderer: "canvas" })
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
    const noisePings = chartData.pingData.filter((point) => point[2] < 0)
    const clusterPings = chartData.pingData.filter((point) => point[2] >= 0)
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
    let hoverPingIndex: number | null = null
    const syncPlaybackState = () => {
      const atEnd = sequenceIndex >= chartData.timeSequence.length - 1
      const nextState = atEnd && paused ? "complete" : paused ? "paused" : "playing"
      setPlaybackState(nextState)
      onPlaybackStateChangeRef.current?.(nextState)
    }

    const clusterColor = (cluster: number) => cluster < 0 ? "#1f2326" : DEMO_CLUSTER_COLORS[cluster % DEMO_CLUSTER_COLORS.length]
    const paramsValue = (params: { data?: unknown; value?: unknown }) => (params.value ?? (params.data as { value?: number[] }).value ?? params.data) as number[]
    const associatedWithHover = (pingIndex: number, cluster: number) =>
      hoverPingIndex === null ||
      hoverPingIndex === pingIndex ||
      (cluster >= 0 && chartData.pings[hoverPingIndex]?.cluster === cluster)
    const associationOpacity = (pingIndex: number, cluster: number) => associatedWithHover(pingIndex, cluster) ? 0.75 : 0.12
    const anchorOpacity = (pingIndex: number, cluster: number) => associatedWithHover(pingIndex, cluster) ? 1 : 0.12
    const edgeOpacity = (pingIndex: number, cluster: number) => associatedWithHover(pingIndex, cluster) ? 0.7 : 0.08
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
    const detectedCountFor = (timestampSeconds: number) => {
      let count = 0
      while (count < chartData.stopEndTimes.length && chartData.stopEndTimes[count] <= timestampSeconds) count += 1
      return count
    }
    const anchorPointsAt = (timestampSeconds: number) => {
      return chartData.anchorPointData.filter((point) => point[5] <= timestampSeconds)
    }
    const centroidAnchorFramesAt = (timestampSeconds: number) => {
      const framesByStop = new Map<number, (typeof chartData.centroidAnchorFrames)[number]>()
      chartData.centroidAnchorFrames.forEach((frame) => {
        if (frame.t <= timestampSeconds) framesByStop.set(frame.stopIndex, frame)
      })
      return Array.from(framesByStop.values())
    }
    const lachesisDiameterFramesAt = (timestampSeconds: number) => {
      const framesByStop = new Map<number, (typeof chartData.lachesisDiameterFrames)[number]>()
      chartData.lachesisDiameterFrames.forEach((frame) => {
        if (frame.t <= timestampSeconds) framesByStop.set(frame.stopIndex, frame)
      })
      return Array.from(framesByStop.values())
    }
    const styledScatterPoint = (point: number[]) => ({
      value: point,
      itemStyle: {
        opacity: associationOpacity(point[3], point[2]),
      },
    })
    const styledAnchorPoint = (point: number[]) => ({
      value: point,
      itemStyle: {
        color: clusterColor(point[2]),
        opacity: anchorOpacity(point[3], point[2]),
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
        showGroundTruth && building.id === truth.current?.location
          ? 1 + pulseStrength
          : showGroundTruth && building.id === truth.next?.location
            ? 2
            : 0,
      ]).sort((a, b) => a[1] - b[1])
    }
    const buildingGlowData = (timestampSeconds: number) =>
      buildingsSeriesData(timestampSeconds).filter(([, state]) => state > 0 && state < 2)
    const routeGlowPoints = (route: ReturnType<typeof routeProgressAt>) =>
      [
        ...route.completedCached,
        ...route.completedFallback,
        route.activeCached,
        route.activeFallback,
      ].filter((points) => points.length > 1).flatMap((points, index) => index === 0 ? points : points.slice(1))
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
    const stopRouteGlow = () => {
      if (routeGlowFrame) window.cancelAnimationFrame(routeGlowFrame)
      routeGlowFrame = 0
      mapChart.setOption({ series: [{ id: "route-glow", data: [] }] }, { lazyUpdate: true })
    }
    const routeGlowAllowed = () =>
      showGroundTruth && paused && (syncMaster || (mode === "compare" && sharedPlaybackStateRef.current !== "playing"))
    const startRouteGlow = () => {
      if (routeGlowFrame || !routeGlowAllowed()) return
      routeGlowStartedAt = performance.now()
      const routeGlowSpeed = 30
      const routeGlowStartDelay = 1
      const routeGlowFadeInSeconds = 0.5
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
        const travelSeconds = length / routeGlowSpeed
        const endHoldStarts = routeGlowStartDelay + travelSeconds
        const fadeOutStarts = endHoldStarts + routeGlowEndHoldSeconds
        const cycleSeconds = fadeOutStarts + routeGlowFadeOutSeconds
        const cycleElapsed = ((now - routeGlowStartedAt) / 1000) % cycleSeconds
        const distance = Math.min(length, Math.max(0, cycleElapsed - routeGlowStartDelay) * routeGlowSpeed)
        const marker = length > 0 ? routeMarkerAt(points, distance) : null
        const opacity = cycleElapsed < routeGlowFadeInSeconds
          ? cycleElapsed / routeGlowFadeInSeconds * 0.98
          : cycleElapsed > fadeOutStarts
            ? (cycleSeconds - cycleElapsed) / routeGlowFadeOutSeconds * 0.98
            : 0.98
        mapChart.setOption({ series: [{ id: "route-glow", data: marker ? [[...marker, opacity]] : [] }] }, { lazyUpdate: true })
        routeGlowFrame = window.requestAnimationFrame(step)
      }
      routeGlowFrame = window.requestAnimationFrame(step)
    }
    const syncRouteGlow = () => {
      if (routeGlowAllowed()) startRouteGlow()
      else stopRouteGlow()
    }
    const stopNextPathFlow = () => {
      if (nextPathFrame) window.cancelAnimationFrame(nextPathFrame)
      nextPathFrame = 0
      nextPathStopIndex = -1
      mapChart.setOption({ series: [{ id: "next-path", data: [] }] }, { lazyUpdate: true })
    }
    const startNextPathFlow = () => {
      if (nextPathFrame || !nextPathVisible) return
      nextPathStartedAt = performance.now()
      const step = (now: number) => {
        const timestampSeconds = selectedTimestampRef.current ?? chartData.timeSequence[sequenceIndex] ?? chartData.timeSequence[0]
        const next = routeProgressAt(timestampSeconds).next
        if (!showGroundTruth || !next) {
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
    const syncNextPathFlow = () => {
      if (nextPathVisible) startNextPathFlow()
      else stopNextPathFlow()
    }
    const renderScene = (timestampSeconds: number) => {
      const latestPingIndex = latestPingIndexAt(timestampSeconds)
      const route = routeProgressAt(timestampSeconds)
      const detectedStopCount = detectedCountFor(timestampSeconds)
      const centroidAnchorFrames = centroidAnchorFramesAt(timestampSeconds)
      const lachesisDiameterFrames = lachesisDiameterFramesAt(timestampSeconds)
      nextPathVisible = showGroundTruth && Boolean(groundTruthAt(timestampSeconds).current && route.next)
      const anchorEdges = [
        ...chartData.anchorEdgeData.filter((edge) => edge.value[4] <= timestampSeconds),
        ...centroidAnchorFrames.flatMap((frame) => frame.edges),
        ...lachesisDiameterFrames.map((frame) => frame.edge),
      ]

      mapChart.setOption({
        series: [
          { id: "buildings", data: buildingsSeriesData(timestampSeconds) },
          { id: "building-glow", data: buildingGlowData(timestampSeconds) },
          { id: "completed-paths", data: showGroundTruth ? route.completedCached.map((points) => ({ coords: points })) : [] },
          { id: "completed-fallback-paths", data: showGroundTruth ? route.completedFallback.map((points) => ({ coords: points })) : [] },
          { id: "active-path", data: showGroundTruth ? route.activeCached : [] },
          { id: "active-fallback-path", data: showGroundTruth ? route.activeFallback : [] },
          ...(nextPathVisible ? [] : [{ id: "next-path", data: [] }]),
          { id: "route-glow", data: [] },
          { id: "ghost-pings", data: chartData.pingData },
          { id: "noise-pings", data: showStops ? noisePings.filter((point) => point[4] <= timestampSeconds).map(styledScatterPoint) : [] },
          { id: "cluster-pings", data: showStops ? clusterPings.filter((point) => point[4] <= timestampSeconds).map((point) => [...point, associationOpacity(point[3], point[2])]) : [] },
          { id: "detected-stops", data: [] },
          { id: "anchor-edges", data: showStops ? anchorEdges.map((edge) => ({ ...edge, lineStyle: { color: clusterColor(edge.value[0]), opacity: edgeOpacity(edge.value[2], edge.value[0]) } })) : [] },
          { id: "anchor-points", data: showStops ? [...anchorPointsAt(timestampSeconds), ...centroidAnchorFrames.map((frame) => frame.point)].map(styledAnchorPoint) : [] },
          { id: "current-ping", data: [{ value: [chartData.pingData[latestPingIndex][0], chartData.pingData[latestPingIndex][1], showStops ? chartData.pingData[latestPingIndex][2] : -1, latestPingIndex, chartData.pingData[latestPingIndex][4]], itemStyle: { opacity: associationOpacity(latestPingIndex, chartData.pingData[latestPingIndex][2]) } }] },
          { id: "current-ping-hole", data: [[chartData.pingData[latestPingIndex][0], chartData.pingData[latestPingIndex][1]]] },
        ],
      }, { lazyUpdate: true })
      syncRouteGlow()
      syncNextPathFlow()
      timelineChart.setOption({
        series: [
          { id: "ping-ticks", data: chartData.pingData.map((_, index) => index) },
          { id: "core-point-arrows", data: showStops ? chartData.coreTimelineData : [] },
          { id: "ground-truth-bars", data: showGroundTruth ? chartData.truthBars : [] },
          { id: "stop-bars", data: chartData.stopBars.slice(0, detectedStopCount) },
          { id: "cursor", data: [[timestampSeconds * 1000, 0.08], [timestampSeconds * 1000, 0.92]] },
        ],
      }, { lazyUpdate: true })
    }
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
          { id: "detected-stops", data: [] },
          { id: "anchor-edges", data: [] },
          { id: "anchor-points", data: [] },
          { id: "current-ping", data: [] },
          { id: "current-ping-hole", data: [] },
        ],
      }, { lazyUpdate: true })
      timelineChart.setOption({
        series: [
          { id: "ping-ticks", data: previewPings.map((_, index) => index) },
          { id: "core-point-arrows", data: [] },
          { id: "ground-truth-bars", data: [] },
          { id: "stop-bars", data: [] },
          { id: "cursor", data: [] },
        ],
      }, { lazyUpdate: true })
    }
    const playTrajectoryPreview = (onComplete: () => void) => {
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
    const setHoveredPing = (pingIndex: number | null) => {
      if (hoverPingIndex === pingIndex) return
      hoverPingIndex = pingIndex
      renderScene(activeTimestamp())
    }
    const onMapMouseOver = (params: echarts.ECElementEvent) => {
      if (params.seriesId === "anchor-edges") {
        setHoveredPing(paramsValue(params)[2])
        return
      }
      if (
        params.seriesId === "cluster-pings" ||
        params.seriesId === "noise-pings" ||
        params.seriesId === "current-ping" ||
        params.seriesId === "anchor-points"
      ) {
        setHoveredPing(paramsValue(params)[3])
      }
    }
    const onMapMouseOut = () => setHoveredPing(null)
    const syncSequenceIndex = (timestampSeconds: number) => {
      let index = 0
      for (let candidate = 0; candidate < chartData.timeSequence.length; candidate += 1) {
        if (chartData.timeSequence[candidate] <= timestampSeconds) index = candidate
        else break
      }
      sequenceIndex = index
    }
    const timestampFromOffset = (offsetX: number, offsetY: number) => {
      const point = timelineChart.convertFromPixel({ gridIndex: 0 }, [offsetX, offsetY])
      const timeMs = Array.isArray(point) ? point[0] : point
      const minT = chartData.timeSequence[0]
      const maxT = chartData.timeSequence[chartData.timeSequence.length - 1]
      return Math.max(minT, Math.min(maxT, timeMs / 1000))
    }
    const seekTo = (timestampSeconds: number) => {
      syncSequenceIndex(timestampSeconds)
      onTimeChange(timestampSeconds)
    }
    let dragging = false
    const onPointerMove = (event: MouseEvent) => {
      if (!dragging || !timelineRef.current) return
      const rect = timelineRef.current.getBoundingClientRect()
      seekTo(timestampFromOffset(event.clientX - rect.left, event.clientY - rect.top))
    }
    const onPointerUp = () => {
      dragging = false
      window.removeEventListener("mousemove", onPointerMove)
      window.removeEventListener("mouseup", onPointerUp)
    }
    const onTimelinePointerDown = (event: { offsetX: number; offsetY: number; event?: MouseEvent }) => {
      event.event?.preventDefault()
      window.clearTimeout(timer)
      paused = true
      dragging = true
      syncPlaybackState()
      seekTo(timestampFromOffset(event.offsetX, event.offsetY))
      window.addEventListener("mousemove", onPointerMove)
      window.addEventListener("mouseup", onPointerUp)
    }
    const onTimelineWheel = (event: WheelEvent) => {
      event.preventDefault()
      window.clearTimeout(timer)
      paused = true
      syncPlaybackState()
      const activeTime = selectedTimestampRef.current ?? chartData.timeSequence[sequenceIndex] ?? chartData.timeSequence[0]
      const span = chartData.timeSequence[chartData.timeSequence.length - 1] - chartData.timeSequence[0]
      seekTo(Math.max(chartData.timeSequence[0], Math.min(chartData.timeSequence[chartData.timeSequence.length - 1], activeTime + Math.sign(event.deltaY) * Math.max(10, span / 360))))
    }
    const frameDelay = variant === "preview" ? 30 : 60
    const startDelay = variant === "preview" ? 150 : 300
    const initialDelay = variant === "preview" ? 1000 : 300
    const toggleDelay = variant === "preview" ? 80 : 160
    const advance = () => {
      if (paused || !syncMaster) return
      sequenceIndex = Math.min(sequenceIndex + 1, chartData.timeSequence.length - 1)
      const timestampSeconds = chartData.timeSequence[sequenceIndex]
      const previousStopCount = detectedCountFor(chartData.timeSequence[Math.max(0, sequenceIndex - 1)])
      onTimeChange(timestampSeconds)
      if (detectedCountFor(timestampSeconds) > previousStopCount) {
        timer = window.setTimeout(advance, frameDelay)
        return
      }
      if (sequenceIndex < chartData.timeSequence.length - 1) {
        timer = window.setTimeout(advance, frameDelay)
      } else {
        paused = true
        syncPlaybackState()
        renderScene(timestampSeconds)
        if (variant === "preview") onPreviewComplete?.()
      }
    }
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
    const toggle = () => {
      paused = !paused
      syncPlaybackState()
      renderScene(activeTimestamp())
      if (!paused && syncMaster) timer = window.setTimeout(advance, toggleDelay)
    }
    const resize = () => {
      mapChart.resize()
      applyMapBounds()
      timelineChart.resize()
    }
    const bounds = mapBounds()

    mapChart.setOption({
      animation: false,
      animationDurationUpdate: 0,
      backgroundColor: "#d2d2d2",
      grid: { left: 12, right: 12, top: 12, bottom: 12, containLabel: false },
      xAxis: { type: "value", min: bounds.xMin, max: bounds.xMax, axisLine: { show: false }, axisTick: { show: false }, axisLabel: { show: false }, splitLine: { show: false } },
      yAxis: { type: "value", min: bounds.yMin, max: bounds.yMax, axisLine: { show: false }, axisTick: { show: false }, axisLabel: { show: false }, splitLine: { show: false } },
      dataZoom: [
        {
          type: "inside",
          xAxisIndex: 0,
          filterMode: "none",
          zoomOnMouseWheel: true,
          moveOnMouseMove: true,
          moveOnMouseWheel: false,
          preventDefaultMouseMove: true,
        },
        {
          type: "inside",
          yAxisIndex: 0,
          filterMode: "none",
          zoomOnMouseWheel: true,
          moveOnMouseMove: true,
          moveOnMouseWheel: false,
          preventDefaultMouseMove: true,
        },
      ],
      tooltip: {
        trigger: "item",
        borderWidth: 0,
        backgroundColor: "rgba(32, 33, 36, 0.92)",
        textStyle: { color: "#ffffff" },
        formatter(params: EChartsParams) {
          const value = paramsValue(params)
          if (params.seriesId === "detected-stops") {
            const stop = chartData.stops[value[3]]
            return `${stop.label}<br>${stop.startTime} - ${stop.endTime}<br>${stop.nPings} pings / ${stop.duration} min`
          }
          if (params.seriesId === "anchor-points") {
            const ping = chartData.pings[value[3]]
            const label = chartData.anchorPointMode === "sequential-centroid"
              ? "Centroid anchor for"
              : chartData.anchorPointMode.startsWith("sequential-")
                ? "Anchor for"
                : "Core point for"
            return `${label} Stop ${value[2]}<br>Ping ${ping.i + 1}<br>${ping.time}`
          }
          if (params.seriesId === "cluster-pings" || params.seriesId === "noise-pings" || params.seriesId === "current-ping") {
            const ping = chartData.pings[value[3]]
            const cluster = ping.cluster < 0 ? "Noise" : `Cluster ${ping.cluster}`
            return `Ping ${ping.i + 1}<br>${ping.time}<br>${cluster}`
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
                fill: "#d2d2d2",
                stroke: "#d2d2d2",
                lineWidth: 1,
              },
            }
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
            return {
              type: "polygon",
              shape: { points: building.coords.map((coord) => api.coord(coord)) },
              style: {
                fill: "#8b8b8b",
                stroke: "#ffffff",
                lineWidth: 2,
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
          id: "completed-paths",
          name: "Inferred street route",
          type: "lines",
          coordinateSystem: "cartesian2d",
          polyline: true,
          silent: true,
          z: 2,
          data: [],
          lineStyle: {
            color: "#1f6d6a",
            width: 2.4,
            opacity: 0.78,
          },
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
          lineStyle: {
            color: "#d94b45",
            width: 2.4,
            opacity: 0.85,
          },
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
          lineStyle: { color: "#4b918d", width: 3, opacity: 0.38, type: "dashed" },
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
          lineStyle: {
            color: GROUND_TRUTH_COLOR,
            width: 4,
            opacity: 0.95,
            shadowBlur: 10,
            shadowColor: "rgba(15, 118, 110, 0.26)",
          },
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
          lineStyle: {
            color: "#d94b45",
            width: 4,
            opacity: 0.95,
            shadowBlur: 10,
            shadowColor: "rgba(217, 75, 69, 0.26)",
          },
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
            const mid = api.coord([api.value(0), api.value(1)])
            const ahead = api.coord([api.value(2), api.value(3)])
            const opacity = Number(api.value(4))
            let dx = ahead[0] - mid[0]
            let dy = ahead[1] - mid[1]
            const length = Math.hypot(dx, dy) || 1
            dx /= length
            dy /= length
            const perpX = -dy
            const perpY = dx
            const reach = 8
            const halfWidth = 5.5
            const tip = [mid[0] + dx * reach, mid[1] + dy * reach]
            const left = [mid[0] - dx * reach + perpX * halfWidth, mid[1] - dy * reach + perpY * halfWidth]
            const right = [mid[0] - dx * reach - perpX * halfWidth, mid[1] - dy * reach - perpY * halfWidth]
            return {
              type: "polygon",
              shape: { points: [tip, left, right] },
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
        { id: "ghost-pings", name: "All pings", type: "scatter", coordinateSystem: "cartesian2d", silent: true, z: 3, data: [], symbolSize: 5, itemStyle: { color: "#000000" } },
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
            return {
              type: "group",
              children: [
                { type: "circle", shape: { cx: circle.center[0], cy: circle.center[1], r: circle.radius }, style: { fill: clusterColor(Number(api.value(2))), stroke: "#202124", lineWidth: 1.6, opacity: Number(api.value(5)) } },
                { type: "circle", shape: { cx: circle.center[0], cy: circle.center[1], r: 3.6 }, style: { fill: "#000000", opacity: Number(api.value(5)) } },
              ],
            }
          },
        },
        {
          id: "detected-stops",
          name: "Detected stops",
          type: "scatter",
          coordinateSystem: "cartesian2d",
          z: 7,
          data: [],
          symbol: "diamond",
          symbolSize: 20,
          itemStyle: { color: (params: EChartsParams) => clusterColor(paramsValue(params)[2]), borderColor: "#ffffff", borderWidth: 2, shadowBlur: 8, shadowColor: "rgba(32, 33, 36, 0.22)" },
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
      ],
    })

    timelineChart.setOption({
      animation: true,
      animationDurationUpdate: 180,
      animationEasingUpdate: "cubicOut",
      grid: { left: 34, right: 22, top: 0, bottom: 28 },
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
          silent: true,
          z: 1,
          data: [],
          renderItem(params: EChartsParams, api: EChartsApi) {
            const ping = chartData.pings[params.dataIndex]
            const top = api.coord([ping.t * 1000, 0.72])
            const bottom = api.coord([ping.t * 1000, 0.28])
            return { type: "line", shape: { x1: top[0], y1: top[1], x2: bottom[0], y2: bottom[1] }, style: { stroke: "#000000", lineWidth: 2.5, opacity: 0.85 } }
          },
        },
        {
          id: "core-point-arrows",
          type: "custom",
          coordinateSystem: "cartesian2d",
          silent: true,
          z: 5,
          data: [],
          renderItem(_params: EChartsParams, api: EChartsApi) {
            const top = api.coord([api.value(0), 0.98])
            const tip = api.coord([api.value(0), 0.8])
            const color = clusterColor(Number(api.value(1)))
            return {
              type: "group",
              children: [
                { type: "line", shape: { x1: top[0], y1: top[1], x2: tip[0], y2: tip[1] - 4 }, style: { stroke: color, lineWidth: 2 } },
                { type: "polygon", shape: { points: [[tip[0], tip[1]], [tip[0] - 4, tip[1] - 5], [tip[0] + 4, tip[1] - 5]] }, style: { fill: color } },
              ],
            }
          },
        },
        {
          id: "ground-truth-bars",
          type: "custom",
          coordinateSystem: "cartesian2d",
          silent: true,
          z: 3,
          data: [],
          renderItem(_params: EChartsParams, api: EChartsApi) {
            const start = api.coord([api.value(0), 0.1])
            const end = api.coord([api.value(1), 0.1])
            return {
              type: "line",
              shape: { x1: start[0], y1: start[1], x2: end[0], y2: end[1] },
              style: { stroke: GROUND_TRUTH_COLOR, lineWidth: 5 },
            }
          },
        },
        {
          id: "stop-bars",
          type: "custom",
          coordinateSystem: "cartesian2d",
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

    const timelineEl = timelineRef.current
    toggleRef.current = toggle
    replayRef.current = replay
    previewRef.current = playLocalPreview
    renderSceneRef.current = (timestampSeconds) => {
      syncSequenceIndex(timestampSeconds)
      renderScene(timestampSeconds)
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
    timelineEl.style.cursor = "ew-resize"
    mapChart.on("mouseover", onMapMouseOver)
    mapChart.on("mouseout", onMapMouseOut)
    mapChart.on("globalout", onMapMouseOut)
    timelineChart.getZr().on("mousedown", onTimelinePointerDown)
    timelineEl.addEventListener("wheel", onTimelineWheel, { passive: false })
    if (variant === "preview") timer = window.setTimeout(replay, initialDelay)
    const pulseTimer = window.setInterval(() => {
      const timestampSeconds = selectedTimestampRef.current ?? chartData.timeSequence[sequenceIndex]
      const ended = timestampSeconds >= chartData.timeSequence[chartData.timeSequence.length - 1]
      pulsePhase = ended ? 0 : pulsePhase + 0.24
      pulseStrength = ended ? 0 : (Math.sin(pulsePhase) + 1) / 2
      mapChart.setOption({
        series: [
          { id: "buildings", data: buildingsSeriesData(timestampSeconds) },
          { id: "building-glow", data: buildingGlowData(timestampSeconds) },
        ],
      })
    }, 80)

    return () => {
      window.clearTimeout(timer)
      window.clearInterval(pulseTimer)
      if (routeGlowFrame) window.cancelAnimationFrame(routeGlowFrame)
      if (nextPathFrame) window.cancelAnimationFrame(nextPathFrame)
      window.removeEventListener("resize", resize)
      window.removeEventListener("mousemove", onPointerMove)
      window.removeEventListener("mouseup", onPointerUp)
      toggleRef.current = () => {}
      replayRef.current = () => {}
      previewRef.current = () => {}
      mapChart.off("mouseover", onMapMouseOver)
      mapChart.off("mouseout", onMapMouseOut)
      mapChart.off("globalout", onMapMouseOut)
      timelineChart.getZr().off("mousedown", onTimelinePointerDown)
      timelineEl.removeEventListener("wheel", onTimelineWheel)
      renderSceneRef.current = null
      mapEl.style.touchAction = previousTouchAction
      mapChart.dispose()
      timelineChart.dispose()
    }
  }, [chartData, mode, onPreviewComplete, onTimeChange, scene, showGroundTruth, showStops, syncMaster, variant])

  useEffect(() => {
    onReplayStartRef.current = onReplayStart
  }, [onReplayStart])

  useEffect(() => {
    onPlaybackStateChangeRef.current = onPlaybackStateChange
  }, [onPlaybackStateChange])

  useEffect(() => {
    sharedPlaybackStateRef.current = sharedPlaybackState
    if (syncMaster) return
    renderSceneRef.current?.(selectedTimestampRef.current ?? currentTime ?? 0)
  }, [currentTime, sharedPlaybackState, syncMaster])

  useEffect(() => {
    if (!previewRunId || syncMaster) return
    previewRef.current()
  }, [previewRunId, syncMaster])

  useEffect(() => {
    if (!chartData || currentTime !== null) return
    onTimeChange(variant === "preview" ? chartData.timeSequence[0] : chartData.timeSequence[chartData.timeSequence.length - 1])
  }, [chartData, currentTime, onTimeChange, variant])

  useEffect(() => {
    if (!chartData || currentTime === null) return
    selectedTimestampRef.current = currentTime
    renderSceneRef.current?.(currentTime)
  }, [chartData, currentTime])

  if (!scene) return null

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden rounded-md border border-[#d7dbd2] bg-[#ffffff] text-[#202124] shadow-[0_16px_45px_rgba(32,33,36,0.08)]">
      {syncMaster && variant === "full" && (
        <div className="pointer-events-none absolute right-3 top-3 z-10 flex gap-2">
          <TooltipProvider delayDuration={300}>
            <div className="pointer-events-auto flex items-center gap-1 rounded-md border border-[#d7dbd2] bg-white/92 px-1 py-1 shadow-sm">
              {playbackState !== "complete" && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => toggleRef.current()}
                      aria-label={playbackState === "playing" ? "Pause" : "Play"}
                      className="flex h-8 w-8 items-center justify-center rounded-md border border-[#bfc6bb] bg-white text-[#202124] hover:border-[#2f6f73] hover:text-[#2f6f73]"
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
                    className="flex h-8 w-8 items-center justify-center rounded-md border border-[#bfc6bb] bg-white text-[#202124] hover:border-[#2f6f73] hover:text-[#2f6f73]"
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
      <div className={`flex shrink-0 flex-col bg-white ${variant === "preview" ? "h-20" : mode === "single" ? "h-28" : "h-24"}`} data-tour={mode === "single" ? "tour-timeline" : undefined}>
        <div ref={timelineRef} className="min-h-0 flex-1" />
        <div className="flex shrink-0 items-center justify-center gap-3 border-t border-[#d7dbd2] bg-white px-3 py-1 text-[11px] font-bold uppercase tracking-[0.08em] text-[#626760]">
          <span>Timeline</span>
          <span className="font-mono tracking-normal text-[#202124]">
            {currentTime ? new Date(currentTime * 1000).toISOString().slice(11, 19) + " UTC" : "--:--:-- UTC"}
          </span>
        </div>
      </div>
    </div>
  )
}

export function CompareAnimationPanel({
  panel,
  mode = "compare",
  currentTime,
  onTimeChange,
  syncMaster = true,
  showGroundTruth,
  showStops,
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
  previewRunId?: number
  onReplayStart?: () => void
  sharedPlaybackState?: PlaybackState
  onPlaybackStateChange?: (state: PlaybackState) => void
}) {
  const sceneMetadata = panel?.scene ? `Agent: ${panel.scene.user_id}` : null

  return (
    <Card className="h-full min-h-0 overflow-hidden py-0">
      <CardHeader className="py-3 px-4 shrink-0">
        <CardTitle className="text-base font-semibold">{panel?.title ?? "Preparing visualization"}</CardTitle>
        {sceneMetadata && (
          <p className="text-xs text-[#87A0BE]">{sceneMetadata}</p>
        )}
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col p-5">
        {panel?.scene ? (
          <div className="min-h-0 w-full flex-1">
            <DemoSceneRenderer panel={panel} mode={mode} currentTime={currentTime} onTimeChange={onTimeChange} syncMaster={syncMaster} showGroundTruth={showGroundTruth} showStops={showStops} previewRunId={previewRunId} onReplayStart={onReplayStart} sharedPlaybackState={sharedPlaybackState} onPlaybackStateChange={onPlaybackStateChange} />
          </div>
        ) : (
          <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden rounded-md border border-[#263449] bg-[#111625]">
            <Skeleton className="flex-1 rounded-none bg-[#202738]" />
            <div className="h-24 border-t border-[#263449] bg-[#151b2c] p-4">
              <Skeleton className="h-4 w-full bg-[#202738]" />
              <Skeleton className="mt-4 h-4 w-2/3 bg-[#202738]" />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

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
  if (!panel?.scene) {
    return (
      <div className="flex h-full w-full flex-col overflow-hidden rounded-md border border-[#263449] bg-[#111625]">
        <Skeleton className="flex-1 rounded-none bg-[#202738]" />
        <Skeleton className="m-4 h-4 bg-[#202738]" />
      </div>
    )
  }

  return (
    <DemoSceneRenderer
      panel={panel}
      mode="single"
      currentTime={currentTime}
      onTimeChange={onTimeChange}
      syncMaster
      showGroundTruth
      showStops
      variant="preview"
      onPreviewComplete={onComplete}
    />
  )
}

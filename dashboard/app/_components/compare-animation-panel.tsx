"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import * as echarts from "echarts"
import { Pause, Play, RotateCcw } from "lucide-react"
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { stopsFromLabels } from "@/lib/stop-detection"
import {
  assignDemoClusters,
  darkenHex,
} from "../_lib/dashboard-utils"
import type {
  ComparePanelResponse,
  EChartsApi,
  EChartsParams,
} from "../_lib/types"

const DEMO_CLUSTER_COLORS = ["#f6d746", "#f89540", "#dc5039", "#a11b63", "#5d126e", "#1f4f99", "#149a8f"]
const DEMO_BUILDING_COLORS: Record<string, string> = {
  home: "#d3d7d0",
  workplace: "#c8d8dd",
  work: "#c8d8dd",
  park: "#c6dcc1",
  school: "#d7d0df",
  retail: "#ded3c5",
  shop: "#ded3c5",
  building: "#d4d5d1",
}

function DemoSceneRenderer({
  panel,
  mode,
  currentTime,
  onTimeChange,
  syncMaster,
  showGroundTruth,
  showStops,
}: {
  panel: ComparePanelResponse
  mode: "single" | "compare"
  currentTime: number | null
  onTimeChange: (timestamp: number) => void
  syncMaster: boolean
  showGroundTruth: boolean
  showStops: boolean
}) {
  const scene = panel.scene
  const mapRef = useRef<HTMLDivElement | null>(null)
  const timelineRef = useRef<HTMLDivElement | null>(null)
  const toggleRef = useRef<() => void>(() => {})
  const replayRef = useRef<() => void>(() => {})
  const selectedTimestampRef = useRef<number | null>(null)
  const renderSceneRef = useRef<((timestampSeconds: number) => void) | null>(null)
  const [playbackState, setPlaybackState] = useState<"playing" | "paused" | "complete">("complete")
  const labels = useMemo(() => {
    if (!scene) return []
    // Prefer the real cached labels from the stop-detection cache; fall back to the
    // client-side approximation only if the cache has no matching rows for this user/config.
    if (panel.labels && panel.labels.length === scene.pings.length) return panel.labels
    return assignDemoClusters(panel.algo, scene.pings, panel.params)
  }, [panel.labels, panel.algo, panel.params, scene])
  const chartData = useMemo(() => {
    if (!scene || scene.pings.length === 0) return null

    const pings = scene.pings.map((ping, index) => ({
      i: index,
      x: ping.x,
      y: ping.y,
      t: ping.timestamp,
      time: new Date(ping.timestamp * 1000).toISOString().slice(11, 19) + " UTC",
      cluster: labels[index],
    }))
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
    const revealDelay = Math.max(0, Number(panel.params?.dur_min ?? panel.params?.min_time ?? 5)) * 60
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
    const start = scene.pings[0].timestamp
    const end = scene.pings[scene.pings.length - 1].timestamp
    const times = new Set([start, end])
    for (let timestamp = start; timestamp <= end; timestamp += 30) times.add(timestamp)

    return {
      buildings,
      pings,
      pingData,
      stops,
      truthStops,
      segments,
      stopData: stops.map((stop) => [stop.x, stop.y, stop.cluster, stop.index, stop.nPings, stop.duration]),
      stopBars: stops.map((stop) => [stop.start * 1000, stop.end * 1000, stop.cluster, stop.index]),
      stopEndTimes: stops.map((stop) => stop.end),
      durMinSec: revealDelay,
      timeSequence: Array.from(times).sort((a, b) => a - b),
    }
  }, [labels, panel.params, scene])

  useEffect(() => {
    if (!scene || !chartData || !mapRef.current || !timelineRef.current) return

    const mapEl = mapRef.current
    const mapChart = echarts.init(mapEl, null, { renderer: "canvas" })
    const timelineChart = echarts.init(timelineRef.current, null, { renderer: "canvas" })
    const minX = Math.min(scene.bounds[0], ...chartData.buildings.map((building) => building.minX), ...scene.pings.map((ping) => ping.x))
    const minY = Math.min(scene.bounds[1], ...chartData.buildings.map((building) => building.minY), ...scene.pings.map((ping) => ping.y))
    const maxX = Math.max(scene.bounds[2], ...chartData.buildings.map((building) => building.maxX), ...scene.pings.map((ping) => ping.x))
    const maxY = Math.max(scene.bounds[3], ...chartData.buildings.map((building) => building.maxY), ...scene.pings.map((ping) => ping.y))
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
    let flashOn = false
    const syncPlaybackState = () => {
      const atEnd = sequenceIndex >= chartData.timeSequence.length - 1
      setPlaybackState(atEnd && paused ? "complete" : paused ? "paused" : "playing")
    }

    const clusterColor = (cluster: number) => cluster < 0 ? "#1f2326" : DEMO_CLUSTER_COLORS[cluster % DEMO_CLUSTER_COLORS.length]
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
      let next: number[][] = []
      preparedSegments.forEach((segment) => {
        if (timestampSeconds >= segment.end) {
          if (segment.isFallback) completedFallback.push(segment.points)
          else completedCached.push(segment.points)
          return
        }
        if (timestampSeconds >= segment.start) {
          const active = partialPath(segment, (timestampSeconds - segment.start) / Math.max(1, segment.end - segment.start))
          if (segment.isFallback) activeFallback = active
          else activeCached = active
          return
        }
        if (next.length === 0) next = segment.points
      })
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
    const durMinLinesAt = (timestampSeconds: number) =>
      chartData.stops.flatMap((stop) => {
        const members = chartData.pings.filter((ping) => ping.cluster === stop.cluster && ping.t <= timestampSeconds)
        if (members.length === 0) return []
        const firstPing = members[0]
        return [[firstPing.t * 1000, (firstPing.t + chartData.durMinSec) * 1000, stop.cluster, stop.index]]
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
        showGroundTruth && building.id === truth.current?.location && flashOn
          ? 1
          : showGroundTruth && building.id === truth.next?.location
            ? 2
            : 0,
      ]).sort((a, b) => a[1] - b[1])
    }
    // Places a direction arrow at the arc-length midpoint of a route polyline,
    // pointing toward the next vertex so it reads as the agent's travel direction.
    const arrowItemFor = (points: number[][], isFallback: boolean): number[] | null => {
      if (!points || points.length < 2) return null
      const segmentLengths: number[] = []
      let total = 0
      for (let index = 1; index < points.length; index += 1) {
        const length = Math.hypot(points[index][0] - points[index - 1][0], points[index][1] - points[index - 1][1])
        segmentLengths.push(length)
        total += length
      }
      if (total === 0) return null
      const half = total / 2
      let accumulated = 0
      let segmentIndex = segmentLengths.length - 1
      for (let index = 0; index < segmentLengths.length; index += 1) {
        if (accumulated + segmentLengths[index] >= half) {
          segmentIndex = index
          break
        }
        accumulated += segmentLengths[index]
      }
      const start = points[segmentIndex]
      const end = points[segmentIndex + 1]
      const fraction = (half - accumulated) / (segmentLengths[segmentIndex] || 1)
      const midX = start[0] + (end[0] - start[0]) * fraction
      const midY = start[1] + (end[1] - start[1]) * fraction
      return [midX, midY, end[0], end[1], isFallback ? 1 : 0]
    }
    const directionArrowsFor = (route: ReturnType<typeof routeProgressAt>) =>
      [
        ...route.completedCached.map((points) => arrowItemFor(points, false)),
        ...route.completedFallback.map((points) => arrowItemFor(points, true)),
        arrowItemFor(route.activeCached, false),
        arrowItemFor(route.activeFallback, true),
      ].filter((item): item is number[] => item !== null)
    const groundTruthPositionAt = (timestampSeconds: number, route: ReturnType<typeof routeProgressAt>) => {
      const activeRoute = route.activeCached.length > 0 ? route.activeCached : route.activeFallback
      if (activeRoute.length > 0) return activeRoute[activeRoute.length - 1]
      return groundTruthAt(timestampSeconds).current?.destination.center ?? null
    }
    const renderScene = (timestampSeconds: number) => {
      const latestPingIndex = latestPingIndexAt(timestampSeconds)
      const route = routeProgressAt(timestampSeconds)
      const detectedStopCount = detectedCountFor(timestampSeconds)

      mapChart.setOption({
        series: [
          { id: "buildings", data: buildingsSeriesData(timestampSeconds) },
          { id: "completed-paths", data: showGroundTruth ? route.completedCached.map((points) => ({ coords: points })) : [] },
          { id: "completed-fallback-paths", data: showGroundTruth ? route.completedFallback.map((points) => ({ coords: points })) : [] },
          { id: "active-path", data: showGroundTruth ? route.activeCached : [] },
          { id: "active-fallback-path", data: showGroundTruth ? route.activeFallback : [] },
          { id: "next-path", data: showGroundTruth && route.next.length > 0 ? [{ coords: route.next }] : [] },
          { id: "noise-pings", data: showStops ? noisePings.filter((point) => point[4] <= timestampSeconds) : [] },
          { id: "cluster-pings", data: showStops ? clusterPings.filter((point) => point[4] <= timestampSeconds) : [] },
          { id: "detected-stops", data: showStops ? chartData.stopData.slice(0, detectedStopCount) : [] },
          { id: "current-ping", data: [[chartData.pingData[latestPingIndex][0], chartData.pingData[latestPingIndex][1], showStops ? chartData.pingData[latestPingIndex][2] : -1, latestPingIndex, chartData.pingData[latestPingIndex][4]]] },
          { id: "direction-arrows", data: showGroundTruth ? directionArrowsFor(route) : [] },
          { id: "ground-truth-marker", data: showGroundTruth ? [groundTruthPositionAt(timestampSeconds, route)].filter(Boolean) : [] },
        ],
      }, { lazyUpdate: true })
      timelineChart.setOption({
        series: [
          { id: "dur-min-lines", data: durMinLinesAt(timestampSeconds) },
          { id: "stop-bars", data: chartData.stopBars.slice(0, detectedStopCount) },
          { id: "cursor", data: [[timestampSeconds * 1000, 0.08], [timestampSeconds * 1000, 0.92]] },
        ],
      }, { lazyUpdate: true })
    }
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
    const advance = () => {
      if (paused || !syncMaster) return
      sequenceIndex = Math.min(sequenceIndex + 1, chartData.timeSequence.length - 1)
      const timestampSeconds = chartData.timeSequence[sequenceIndex]
      const previousStopCount = detectedCountFor(chartData.timeSequence[Math.max(0, sequenceIndex - 1)])
      onTimeChange(timestampSeconds)
      if (detectedCountFor(timestampSeconds) > previousStopCount) {
        timer = window.setTimeout(advance, 60)
        return
      }
      if (sequenceIndex < chartData.timeSequence.length - 1) {
        timer = window.setTimeout(advance, 60)
      } else {
        paused = true
        syncPlaybackState()
      }
    }
    const replay = () => {
      window.clearTimeout(timer)
      paused = false
      sequenceIndex = 0
      onTimeChange(chartData.timeSequence[0])
      setPlaybackState("playing")
      if (syncMaster) timer = window.setTimeout(advance, 300)
    }
    const toggle = () => {
      paused = !paused
      syncPlaybackState()
      if (!paused && syncMaster) timer = window.setTimeout(advance, 160)
    }
    const resize = () => {
      mapChart.resize()
      applyMapBounds()
      timelineChart.resize()
    }
    const bounds = mapBounds()

    mapChart.setOption({
      animation: true,
      animationDurationUpdate: 120,
      grid: { left: 12, right: 12, top: 12, bottom: 12, containLabel: false },
      xAxis: { type: "value", min: bounds.xMin, max: bounds.xMax, axisLine: { show: false }, axisTick: { show: false }, axisLabel: { show: false }, splitLine: { show: false } },
      yAxis: { type: "value", min: bounds.yMin, max: bounds.yMax, axisLine: { show: false }, axisTick: { show: false }, axisLabel: { show: false }, splitLine: { show: false } },
      tooltip: {
        trigger: "item",
        borderWidth: 0,
        backgroundColor: "rgba(32, 33, 36, 0.92)",
        textStyle: { color: "#ffffff" },
        formatter(params: EChartsParams) {
          if (params.seriesId === "detected-stops") {
            const stop = chartData.stops[params.data[3]]
            return `${stop.label}<br>${stop.startTime} - ${stop.endTime}<br>${stop.nPings} pings / ${stop.duration} min`
          }
          if (params.seriesId === "cluster-pings" || params.seriesId === "noise-pings" || params.seriesId === "current-ping") {
            const ping = chartData.pings[params.data[3]]
            const cluster = ping.cluster < 0 ? "Noise" : `Cluster ${ping.cluster}`
            return `Ping ${ping.i + 1}<br>${ping.time}<br>${cluster}`
          }
          return ""
        },
      },
      series: [
        {
          id: "buildings",
          type: "custom",
          coordinateSystem: "cartesian2d",
          silent: true,
          z: 0,
          data: chartData.buildings.map((_, index) => [index, 0]),
          renderItem(params: EChartsParams, api: EChartsApi) {
            const building = chartData.buildings[Number(api.value(0))]
            const fill = DEMO_BUILDING_COLORS[building.type] ?? DEMO_BUILDING_COLORS.building
            const state = Number(api.value(1))
            return {
              type: "polygon",
              shape: { points: building.coords.map((coord) => api.coord(coord)) },
              style: {
                fill: state === 2 ? "#b7dcd8" : fill,
                stroke: state === 1 ? darkenHex(fill, 0.48) : state === 2 ? "#65a9a4" : "#ffffff",
                lineWidth: state === 1 ? 3 : state === 2 ? 1.5 : 1,
                shadowBlur: state === 1 ? 8 : 0,
                shadowColor: state === 1 ? darkenHex(fill, 0.55) : "transparent",
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
          lineStyle: { color: "#4b918d", width: 2, opacity: 0.38, type: "dashed" },
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
            color: "#0f766e",
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
        { id: "ghost-pings", name: "All pings", type: "scatter", coordinateSystem: "cartesian2d", silent: true, z: 3, data: chartData.pingData, symbolSize: 5, itemStyle: { color: "rgba(31, 35, 38, 0.13)" } },
        { id: "noise-pings", name: "Noise pings", type: "scatter", coordinateSystem: "cartesian2d", z: 5, data: [], symbolSize: 7, itemStyle: { color: "rgba(31, 35, 38, 0.72)" } },
        { id: "cluster-pings", name: "Cluster pings", type: "scatter", coordinateSystem: "cartesian2d", z: 6, data: [], symbolSize: 12, itemStyle: { color: (params: EChartsParams) => clusterColor(params.data[2]), borderColor: "#202124", borderWidth: 0.8, opacity: 0.95 } },
        { id: "detected-stops", name: "Detected stops", type: "scatter", coordinateSystem: "cartesian2d", z: 7, data: [], symbol: "diamond", symbolSize: 20, itemStyle: { color: (params: EChartsParams) => clusterColor(params.data[2]), borderColor: "#ffffff", borderWidth: 2, shadowBlur: 8, shadowColor: "rgba(32, 33, 36, 0.22)" } },
        { id: "current-ping", name: "Current ping", type: "effectScatter", coordinateSystem: "cartesian2d", z: 8, data: [], symbolSize: 13, animationDurationUpdate: 180, animationEasingUpdate: "cubicOut", rippleEffect: { scale: 2.4, brushType: "stroke" }, itemStyle: { color: (params: EChartsParams) => clusterColor(params.data[2]), borderColor: "#ffffff", borderWidth: 1.5 } },
        { id: "ground-truth-marker", name: "Ground truth position", type: "scatter", coordinateSystem: "cartesian2d", silent: true, z: 9, data: [], symbolSize: 11, itemStyle: { color: "#0f766e", borderColor: "#ffffff", borderWidth: 2, shadowBlur: 8, shadowColor: "rgba(15, 118, 110, 0.35)" } },
        {
          id: "direction-arrows",
          name: "Travel direction",
          type: "custom",
          coordinateSystem: "cartesian2d",
          silent: true,
          z: 6,
          data: [],
          // Each datum is [midX, midY, aheadX, aheadY, isFallback]; the arrow is drawn
          // in pixel space at the segment midpoint, pointing toward the "ahead" point.
          renderItem(params: EChartsParams, api: EChartsApi) {
            const mid = api.coord([api.value(0), api.value(1)])
            const ahead = api.coord([api.value(2), api.value(3)])
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
            const color = api.value(4) ? "#d94b45" : "#0f766e"
            return {
              type: "polygon",
              shape: { points: [tip, left, right] },
              style: { fill: color, stroke: "#ffffff", lineWidth: 1, opacity: 0.96 },
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
          data: chartData.pingData.map((_, index) => index),
          renderItem(params: EChartsParams, api: EChartsApi) {
            const ping = chartData.pings[params.dataIndex]
            const top = api.coord([ping.t * 1000, 0.72])
            const bottom = api.coord([ping.t * 1000, 0.28])
            return { type: "line", shape: { x1: top[0], y1: top[1], x2: bottom[0], y2: bottom[1] }, style: { stroke: "rgba(32, 33, 36, 0.18)", lineWidth: 1 } }
          },
        },
        {
          id: "dur-min-lines",
          type: "custom",
          coordinateSystem: "cartesian2d",
          silent: true,
          z: 3,
          data: [],
          renderItem(params: EChartsParams, api: EChartsApi) {
            const lineStart = api.coord([api.value(0), 0.77])
            const lineEnd = api.coord([api.value(1), 0.77])
            const tickTop = api.coord([api.value(1), 0.8])
            const color = clusterColor(Number(api.value(2)))
            return {
              type: "group",
              children: [
                { type: "line", shape: { x1: lineStart[0], y1: lineStart[1], x2: lineEnd[0], y2: lineEnd[1] }, style: { stroke: color, lineWidth: 3, opacity: 0.9 } },
                { type: "line", shape: { x1: lineEnd[0], y1: tickTop[1], x2: lineEnd[0], y2: lineStart[1] }, style: { stroke: color, lineWidth: 2, opacity: 0.85 } },
              ],
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
            return shape ? { type: "rect", shape, style: { fill: clusterColor(Number(api.value(2))), opacity: 0.44 } } : null
          },
        },
        { id: "cursor", type: "line", coordinateSystem: "cartesian2d", showSymbol: false, z: 5, data: [], lineStyle: { color: "#67D3E3", width: 2 } },
      ],
    })

    const timelineEl = timelineRef.current
    toggleRef.current = toggle
    replayRef.current = replay
    renderSceneRef.current = (timestampSeconds) => {
      syncSequenceIndex(timestampSeconds)
      renderScene(timestampSeconds)
    }
    const initialTimestamp = selectedTimestampRef.current ?? chartData.timeSequence[chartData.timeSequence.length - 1]
    sequenceIndex = chartData.timeSequence.findIndex((timestamp) => timestamp >= initialTimestamp)
    if (sequenceIndex < 0) sequenceIndex = chartData.timeSequence.length - 1
    paused = true
    syncPlaybackState()
    renderSceneRef.current(initialTimestamp)
    window.addEventListener("resize", resize)
    timelineEl.style.cursor = "ew-resize"
    timelineChart.getZr().on("mousedown", onTimelinePointerDown)
    timelineEl.addEventListener("wheel", onTimelineWheel, { passive: false })
    const flashTimer = window.setInterval(() => {
      const timestampSeconds = selectedTimestampRef.current ?? chartData.timeSequence[sequenceIndex]
      // Stop blinking once playback has reached the end of the timeline.
      const ended = timestampSeconds >= chartData.timeSequence[chartData.timeSequence.length - 1]
      flashOn = ended ? false : !flashOn
      mapChart.setOption({ series: [{ id: "buildings", data: buildingsSeriesData(timestampSeconds) }] })
    }, 500)

    return () => {
      window.clearTimeout(timer)
      window.clearInterval(flashTimer)
      window.removeEventListener("resize", resize)
      window.removeEventListener("mousemove", onPointerMove)
      window.removeEventListener("mouseup", onPointerUp)
      toggleRef.current = () => {}
      replayRef.current = () => {}
      timelineChart.getZr().off("mousedown", onTimelinePointerDown)
      timelineEl.removeEventListener("wheel", onTimelineWheel)
      renderSceneRef.current = null
      mapChart.dispose()
      timelineChart.dispose()
    }
  }, [chartData, onTimeChange, scene, showGroundTruth, showStops, syncMaster])

  useEffect(() => {
    if (!chartData || currentTime !== null) return
    onTimeChange(chartData.timeSequence[chartData.timeSequence.length - 1])
  }, [chartData, currentTime, onTimeChange])

  useEffect(() => {
    if (!chartData || currentTime === null) return
    selectedTimestampRef.current = currentTime
    renderSceneRef.current?.(currentTime)
  }, [chartData, currentTime])

  if (!scene) return null

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden rounded-md border border-[#d7dbd2] bg-[#ffffff] text-[#202124] shadow-[0_16px_45px_rgba(32,33,36,0.08)]">
      {syncMaster && (
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
      <div ref={mapRef} className="min-h-0 flex-1 border-b border-[#d7dbd2]" />
      <div className={`flex shrink-0 flex-col bg-white ${mode === "single" ? "h-28" : "h-24"}`}>
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
  setShowGroundTruth,
  setShowStops,
}: {
  panel: ComparePanelResponse | null | undefined
  mode?: "single" | "compare"
  currentTime: number | null
  onTimeChange: (timestamp: number) => void
  syncMaster?: boolean
  showGroundTruth: boolean
  showStops: boolean
  setShowGroundTruth: (checked: boolean) => void
  setShowStops: (checked: boolean) => void
}) {
  const sceneMetadata = panel?.scene ? `Trajectory: ${panel.scene.user_id}` : null

  return (
    <Card className="h-full min-h-[520px] overflow-hidden border-[#244367] bg-[#0A1526] py-0 lg:min-h-0">
      <CardHeader className="py-3 px-4 bg-[#10213A]/90 shrink-0">
        <CardTitle className="text-base font-semibold">{panel?.title ?? "No visualization"}</CardTitle>
        {sceneMetadata && (
          <p className="truncate text-xs text-[#87A0BE]">{sceneMetadata}</p>
        )}
        {syncMaster && (
          <CardAction className="self-center">
            <div className="flex items-center gap-3 text-xs font-medium text-[#D8E4F2]">
              <label className="flex cursor-pointer items-center gap-2">
                <Checkbox checked={showGroundTruth} onCheckedChange={(checked) => setShowGroundTruth(checked === true)} />
                Ground Truth
              </label>
              <label className="flex cursor-pointer items-center gap-2">
                <Checkbox checked={showStops} onCheckedChange={(checked) => setShowStops(checked === true)} />
                Detected Stops
              </label>
            </div>
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col p-5">
        {panel?.scene ? (
          <div className="min-h-0 w-full flex-1">
            <DemoSceneRenderer panel={panel} mode={mode} currentTime={currentTime} onTimeChange={onTimeChange} syncMaster={syncMaster} showGroundTruth={showGroundTruth} showStops={showStops} />
          </div>
        ) : (
          <div className="min-h-0 w-full flex-1 rounded-md border border-dashed border-border bg-muted/40" />
        )}
      </CardContent>
    </Card>
  )
}

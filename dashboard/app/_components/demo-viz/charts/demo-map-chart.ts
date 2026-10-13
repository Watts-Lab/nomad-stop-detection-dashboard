/* OWN ECHARTS MAP CONFIGURATION */

import * as echarts from "echarts"
import type { EChartsApi, EChartsParams } from "../../../_lib/types"
import type { DemoResultData } from "../../../_lib/demo-result-data"
import { associatedWithHover, pingInfoLines, pingScale } from "../demo-interactions"
import { pingClassifiedAt } from "../overlays/demo-detected-stops"
import { xrayAnchorFramesAt } from "../overlays/demo-xray"

const CURRENT_PING_COLOR = "#d83832"
const GROUND_TRUTH_COLOR = "#0f766e"
const FUTURE_GROUND_TRUTH_COLOR = "#4b918d"
const MAP_FOCUS_FADE_OPACITY = 0.2

type MapBounds = {
  minX: number
  maxX: number
  minY: number
  maxY: number
}

type MapChartBounds = {
  axis: MapBounds
  view: MapBounds
}

type MapChartOptionsArgs = {
  getChartData: () => DemoResultData
  bounds: MapChartBounds
  getHoverBuildingId: () => string
  getHoverPingIndexes: () => Set<number> | null
  getHoverPingIndex: () => number | null
  getSelectedPingIndexes: () => number[]
  getContainmentAreas: () => Array<{ cluster: number; points: number[][]; shaded: boolean }>
  pingTooltipPosition: NonNullable<echarts.TooltipComponentOption["position"]>
  algorithm: string
  getShowXray: () => boolean
  getShowStops: () => boolean
  destinationPreview: boolean
  getActiveTimestamp: () => number
  getBaseMapPixelsPerUnit: () => number
  clusterColor: (cluster: number) => string
}

export function createDemoMapChartOptions({
  getChartData,
  bounds,
  getHoverBuildingId,
  getHoverPingIndexes,
  getHoverPingIndex,
  getSelectedPingIndexes,
  getContainmentAreas,
  pingTooltipPosition,
  algorithm,
  getShowXray,
  getShowStops,
  getActiveTimestamp,
  getBaseMapPixelsPerUnit,
  destinationPreview,
  clusterColor
}: MapChartOptionsArgs) {

  const mapZoomScale = (api: EChartsApi) => {
    const ping = getChartData().pings[0]
    return Math.abs(
      api.coord([ping.x + 1, ping.y])[0] - api.coord([ping.x, ping.y])[0]
    ) / getBaseMapPixelsPerUnit()
  }

  const pingCircle = (api: EChartsApi, scale = 1) => {
    const center = api.coord([api.value(0), api.value(1)])
    const edge = api.coord([
      api.value(0) + (getChartData().blockSide / 8) * scale,
      api.value(1)
    ])

    return {
      center,
      radius: Math.abs(edge[0] - center[0])
    }
  }

  const renderGpsPing = (_params: EChartsParams, api: EChartsApi) => {
    const pingIndex = Number(api.value(3))
    const circle = pingCircle(
      api,
      0.28 * pingScale(pingIndex, getHoverPingIndexes(), getHoverPingIndex())
    )
    // Outline only when this dot is the ping's visible mark, not the center of a cluster ping.
    const outlined = pingIndex === getHoverPingIndex() && !(
      getShowStops() &&
      Number(api.value(2)) >= 0 &&
      pingClassifiedAt(pingIndex, getActiveTimestamp(), getChartData())
    )

    return {
      type: "circle",
      z2: pingIndex * 2 + 1,
      shape: {
        cx: circle.center[0],
        cy: circle.center[1],
        r: circle.radius
      },
      style: {
        fill: associatedWithHover(pingIndex, getHoverPingIndexes())
          ? "#000000"
          : "#9ba0a3",
        stroke: outlined ? "#ffffff" : undefined,
        lineWidth: mapZoomScale(api)
      }
    }
  }

  const renderXrayPoint = (_params: EChartsParams, api: EChartsApi) => {
    const pingIndex = Number(api.value(3))
    const circle = pingCircle(
      api,
      1.3 * pingScale(pingIndex, getHoverPingIndexes(), getHoverPingIndex())
    )

    return {
      type: "circle",
      z2: pingIndex * 2,
      shape: {
        cx: circle.center[0],
        cy: circle.center[1],
        r: circle.radius
      },
      style: {
        fill: clusterColor(Number(api.value(2))),
        stroke: "#ffffff",
        lineWidth: 1.6 * mapZoomScale(api),
        opacity: Number(api.value(5)),
        shadowBlur: 8 * mapZoomScale(api),
        shadowColor: "rgba(32, 33, 36, 0.24)"
      }
    }
  }

  const paramsValue = (params: { data?: unknown; value?: unknown }) =>
    (
      params.value ??
      (params.data as { value?: number[] }).value ??
      params.data
    ) as number[]

  return {
    animation: false,
    animationDurationUpdate: 0,
    backgroundColor: "#f8f9fc",
    grid: { left: 8, right: 8, top: 8, bottom: 8, containLabel: false },
    xAxis: { type: "value", min: bounds.axis.minX, max: bounds.axis.maxX, axisLine: { show: false }, axisTick: { show: false }, axisLabel: { show: false }, splitLine: { show: false } },
    yAxis: { type: "value", min: bounds.axis.minY, max: bounds.axis.maxY, axisLine: { show: false }, axisTick: { show: false }, axisLabel: { show: false }, splitLine: { show: false } },
    dataZoom: [
      {
        id: "map-x-zoom",
        type: "inside",
        xAxisIndex: 0,
        filterMode: "none",
        ...(!destinationPreview && { startValue: bounds.view.minX, endValue: bounds.view.maxX }),
        zoomOnMouseWheel: "ctrl",
        moveOnMouseMove: true,
        moveOnMouseWheel: false,
        preventDefaultMouseMove: true,
      },
      {
        id: "map-y-zoom",
        type: "inside",
        yAxisIndex: 0,
        filterMode: "none",
        ...(!destinationPreview && { startValue: bounds.view.minY, endValue: bounds.view.maxY }),
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
          const ping = getChartData().pings[value[3]]
          return `Core point for Stop ${value[2]}<br>Ping ${ping.i + 1}<br>${ping.time}<br>Distance threshold: ${getChartData().distanceThreshold}`
        }
        if (params.seriesId === "anchor-points") {
          const ping = getChartData().pings[value[3]]
          const label = algorithm === "sequential_centroid"
            ? "Centroid anchor for"
            : algorithm.startsWith("sequential_")
              ? "Anchor for"
              : "Cached anchor for"
          return `${label} Stop ${value[2]}<br>Ping ${ping.i + 1}<br>${ping.time}`
        }
        if (params.seriesId === "cluster-pings" || params.seriesId === "noise-pings" || params.seriesId === "current-ping" || params.seriesId === "ping-hit-area") {
          // Selected pings already show this in the selection box; empty content hides the tooltip.
          if (getSelectedPingIndexes().includes(value[3])) return ""
          return pingInfoLines(value[3], getActiveTimestamp(), getChartData(), getShowXray()).join("<br>")
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
        data: getChartData().streets.map((_, index) => index),
        renderItem(params: EChartsParams, api: EChartsApi) {
          const street = getChartData().streets[params.dataIndex]
          return {
            type: "polygon",
            shape: { points: street.coords.map((coord) => api.coord(coord)) },
            style: {
              fill: "#b9bec1",
              stroke: "#b9bec1",
              lineWidth: mapZoomScale(api),
              opacity: getHoverBuildingId() !== "" ? MAP_FOCUS_FADE_OPACITY : 1,
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
        data: getChartData().streetLanes.map((_, index) => index),
        renderItem(params: EChartsParams, api: EChartsApi) {
          const [start, end] = getChartData().streetLanes[params.dataIndex]
          const startPixel = api.coord(start)
          const endPixel = api.coord(end)
          const scale = mapZoomScale(api)
          return { type: "line", shape: { x1: startPixel[0], y1: startPixel[1], x2: endPixel[0], y2: endPixel[1] }, style: { stroke: "#ffffff", lineWidth: 1.6 * scale, lineDash: [7 * scale, 42 * scale], opacity: getHoverBuildingId() !== "" ? MAP_FOCUS_FADE_OPACITY : 1 } }
        },
      },
      {
        id: "buildings",
        type: "custom",
        coordinateSystem: "cartesian2d",
        silent: true,
        z: 1,
        data: getChartData().buildings.map((_, index) => [index, 0]),
        renderItem(_params: EChartsParams, api: EChartsApi) {
          const building = getChartData().buildings[Number(api.value(0))]
          const state = Number(api.value(1))
          const next = state === 2
          const faded = Number(api.value(2)) === 1
          const destinationColor = Number(api.value(3))
          const scale = destinationPreview && destinationColor >= 0
            ? Number(api.value(4))
            : 1

          return {
            type: "polygon",
            shape: {
              points: building.coords.map(([x, y]) =>
                api.coord([
                  building.center[0] + (x - building.center[0]) * scale,
                  building.center[1] + (y - building.center[1]) * scale
                ])
              )
            },
            style: {
              fill: destinationColor >= 0
                ? clusterColor(destinationColor)
                : "#8b8b8b",
              stroke: next ? FUTURE_GROUND_TRUTH_COLOR : "#ffffff",
              lineWidth: (next ? 2.6 : 2) * mapZoomScale(api),
              opacity: faded ? MAP_FOCUS_FADE_OPACITY : 1
            }
          }
        }
      },
      {
        id: "building-glow",
        type: "custom",
        coordinateSystem: "cartesian2d",
        silent: true,
        z: 2,
        data: [],
        renderItem(params: EChartsParams, api: EChartsApi) {
          const building = getChartData().buildings[Number(api.value(0))]
          const currentPulse = Number(api.value(1)) - 1
          const scale = mapZoomScale(api)
          return {
            type: "polygon",
            shape: { points: building.coords.map((coord) => api.coord(coord)) },
            style: {
              fill: "transparent",
              stroke: `rgba(15, 118, 110, ${0.62 + currentPulse * 0.35})`,
              lineWidth: (2.4 + currentPulse * 1.2) * scale,
              shadowBlur: (6 + currentPulse * 10) * scale,
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
          const building = getChartData().buildings[Number(api.value(0))]
          const color = clusterColor(Number(api.value(1)))
          const scale = mapZoomScale(api)
          return {
            type: "polygon",
            shape: { points: building.coords.map((coord) => api.coord(coord)) },
            style: {
              fill: "transparent",
              stroke: color,
              lineWidth: 3 * scale,
              shadowBlur: 8 * scale,
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
        name: "Inferred fallback street route",
        type: "lines",
        coordinateSystem: "cartesian2d",
        polyline: true,
        silent: true,
        z: 2,
        data: [],
        lineStyle: { color: "#d94b45", width: 2.4, opacity: 0.78 },
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
          const scale = mapZoomScale(api)
          const half = 5.5 * scale
          const opacity = Number(api.value(4))
          return {
            type: "rect",
            shape: { x: center[0] - half, y: center[1] - half, width: half * 2, height: half * 2 },
            style: {
              fill: GROUND_TRUTH_COLOR,
              stroke: "#ffffff",
              lineWidth: scale,
              shadowBlur: 10 * scale,
              shadowColor: `rgba(15, 118, 110, ${opacity * 0.43})`,
              opacity,
            },
          }
        },
      },
      {
        id: "ghost-pings",
        name: "All pings",
        type: "custom",
        coordinateSystem: "cartesian2d",
        z: 5,
        data: [],
        renderItem: renderGpsPing
      },
      {
        id: "ping-hit-area",
        name: "Ping hit area",
        type: "custom",
        coordinateSystem: "cartesian2d",
        z: 10,
        data: destinationPreview ? [] : getChartData().pingData,
        renderItem(_params: EChartsParams, api: EChartsApi) {
          const pingIndex = Number(api.value(3))
          const timestampSeconds = getActiveTimestamp()
      
          const visibleAnchor = getShowXray() && (
            xrayAnchorFramesAt(timestampSeconds, getChartData()).some(
              (frame) => frame.point[3] === pingIndex
            ) ||
            getChartData().densityCorePointData.some(
              (point) =>
                point[3] === pingIndex &&
                point[4] <= timestampSeconds
            )
          )
      
          const markScale = visibleAnchor
            ? 1.3
            : getShowStops() &&
                Number(api.value(2)) >= 0 &&
                pingClassifiedAt(pingIndex, timestampSeconds, getChartData())
              ? 1
              : 0.28
      
          const circle = pingCircle(
            api,
            markScale * pingScale(pingIndex, getHoverPingIndexes(), getHoverPingIndex())
          )
      
          return {
            type: "circle",
            shape: {
              cx: circle.center[0],
              cy: circle.center[1],
              r: circle.radius
            },
            style: {
              fill: "rgba(0, 0, 0, 0.001)"
            }
          }
        }
      },
      {
        id: "noise-pings",
        name: "Noise pings",
        type: "custom",
        coordinateSystem: "cartesian2d",
        z: 6,
        data: [],
        renderItem: renderGpsPing
      },
      {
        id: "cluster-pings",
        name: "Cluster pings",
        type: "custom",
        coordinateSystem: "cartesian2d",
        z: 5,
        data: [],
        renderItem(_params: EChartsParams, api: EChartsApi) {
          const pingIndex = Number(api.value(3))
          const circle = pingCircle(api)
          const scale = pingScale(pingIndex, getHoverPingIndexes(), getHoverPingIndex())
          const strokeScale = mapZoomScale(api)
          const hovered = pingIndex === getHoverPingIndex()

          return {
            type: "group",
            z2: pingIndex * 2,
            children: [
              {
                type: "circle",
                shape: {
                  cx: circle.center[0],
                  cy: circle.center[1],
                  r: circle.radius * scale
                },
                style: {
                  fill: clusterColor(Number(api.value(2))),
                  stroke: hovered ? "#ffffff" : "#202124",
                  lineWidth: (hovered ? 1.2 : 1.6) * strokeScale,
                  opacity: Number(api.value(5))
                }
              },
              {
                type: "circle",
                shape: {
                  cx: circle.center[0],
                  cy: circle.center[1],
                  r: circle.radius * scale * 0.28
                },
                style: {
                  fill: associatedWithHover(pingIndex, getHoverPingIndexes())
                    ? "#000000"
                    : "#9ba0a3"
                }
              }
            ]
          }
        }
      },
      {
        id: "promotion-edges",
        name: "Density promotions",
        type: "lines",
        coordinateSystem: "cartesian2d",
        silent: true,
        z: 4,
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
        type: "custom",
        coordinateSystem: "cartesian2d",
        z: 5,
        data: [],
        renderItem: renderXrayPoint
      },
      {
        id: "anchor-edges",
        name: "Anchor assignments",
        type: "lines",
        coordinateSystem: "cartesian2d",
        silent: true,
        z: 4,
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
        type: "custom",
        coordinateSystem: "cartesian2d",
        z: 5,
        data: [],
        renderItem: renderXrayPoint
      },
      {
        id: "current-ping",
        name: "Current ping",
        type: "custom",
        coordinateSystem: "cartesian2d",
        z: 10,
        animationDurationUpdate: 0,
        data: [],
        renderItem(_params: EChartsParams, api: EChartsApi) {
          const circle = pingCircle(api, 1.08)
          const size = circle.radius * 2.8
          const scale = mapZoomScale(api)

          return {
            type: "path",
            x: circle.center[0],
            y: circle.center[1] + Number(api.value(6)),
            scaleX: size / 24,
            scaleY: size / 24,
            shape: {
              pathData: "M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z",
              x: -12,
              y: -24,
              width: 24,
              height: 24
            },
            style: {
              fill: CURRENT_PING_COLOR,
              stroke: Number(api.value(3)) === getHoverPingIndex() ? "#ffffff" : "#202124",
              lineWidth: 1.2 * scale,
              strokeNoScale: true,
              opacity: Number(api.value(5))
            }
          }
        }
      },
      {
        id: "containment-areas",
        name: "Containment area",
        type: "custom",
        coordinateSystem: "cartesian2d",
        silent: true,
        z: 3,
        data: [],
        renderItem(params: EChartsParams, api: EChartsApi) {
          const area = getContainmentAreas()[params.dataIndex]
          if (!area) return null
          const scale = mapZoomScale(api)
          // Noise candidates get a neutral outline
          const color = area.cluster < 0 ? "#8b8b8b" : clusterColor(area.cluster)
          return {
            type: "polygon",
            shape: { points: area.points.map((point) => api.coord(point)) },
            style: area.shaded
              ? { fill: color, opacity: 0.2 }
              : {
                fill: "transparent",
                stroke: color,
                lineWidth: 1.4 * scale,
                lineDash: [5 * scale, 4 * scale],
              },
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
          const edge = api.coord([api.value(0) + getChartData().distanceThreshold, api.value(1)])
          const radius = Math.abs(edge[0] - center[0])
          const color = clusterColor(Number(api.value(2)))
          const scale = mapZoomScale(api)
          return {
            type: "circle",
            shape: { cx: center[0], cy: center[1], r: radius },
            style: {
              fill: "transparent",
              stroke: color,
              lineWidth: 1.6 * scale,
              lineDash: [5 * scale, 4 * scale],
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
      }
    ]
  }
}

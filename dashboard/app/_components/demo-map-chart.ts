/* OWN ECHARTS MAP CONFIGURATION */

import * as echarts from "echarts"
import type { EChartsApi, EChartsParams } from "../_lib/types"
import type { DemoResultData } from "../_lib/demo-result-data"
import { pingScale } from "./demo-interactions"
import { pingClassifiedAt } from "./demo-detected-stops"

const DEMO_CLUSTER_COLORS = [
  "#f6d746", "#f89540", "#dc5039", "#a11b63", "#5d126e",
  "#1f4f99", "#149a8f", "#00a8cc", "#72b01d", "#8c6d31",
  "#e377c2", "#9467bd", "#2ca02c", "#d62728", "#17becf",
  "#bcbd22", "#8c564b", "#ff6f91", "#6b8e23", "#00b894",
  "#0984e3", "#6c5ce7", "#e17055", "#d63031", "#008080",
  "#c44569", "#4a69bd", "#f19066", "#b33771", "#218c74"
]

const GROUND_TRUTH_COLOR = "#0f766e"
const FUTURE_GROUND_TRUTH_COLOR = "#4b918d"
const MAP_FOCUS_FADE_OPACITY = 0.2

type MapBounds = {
  xMin: number
  xMax: number
  yMin: number
  yMax: number
}

type MapChartOptionsArgs = {
    chartData: DemoResultData
    bounds: MapBounds
    hoverBuildingId: string
    hoverPingIndexes: Set<number> | null
    pingTooltipPosition: NonNullable<echarts.TooltipComponentOption["position"]>
    algorithm: string
    showXray: boolean
    activeTimestamp: number
  }
  
  export function createDemoMapChartOptions({
    chartData,
    bounds,
    hoverBuildingId,
    hoverPingIndexes,
    pingTooltipPosition,
    algorithm,
    showXray,
    activeTimestamp
  }: MapChartOptionsArgs) {
    const clusterColor = (cluster: number) =>
      cluster < 0
        ? "#1f2326"
        : DEMO_CLUSTER_COLORS[cluster % DEMO_CLUSTER_COLORS.length]
  
    const pingCircle = (api: EChartsApi) => {
      const center = api.coord([api.value(0), api.value(1)])
      const edge = api.coord([
        api.value(0) + chartData.blockSide / 8,
        api.value(1)
      ])
  
      return {
        center,
        radius: Math.abs(edge[0] - center[0])
      }
    }
  
    const paramsValue = (params: { data?: unknown; value?: unknown }) =>
      (
        params.value ??
        (params.data as { value?: number[] }).value ??
        params.data
      ) as number[]

      const isDensityAlgorithm = chartData.result.kind === "density"

      return {
        animation: false,
                    animationDurationUpdate: 0,
                    backgroundColor: "#e7e9e4",
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
                          const label = algorithm === "sequential_centroid"
                            ? "Centroid anchor for"
                            : algorithm.startsWith("sequential_")
                              ? "Anchor for"
                              : "Cached anchor for"
                          return `${label} Stop ${value[2]}<br>Ping ${ping.i + 1}<br>${ping.time}`
                        }
                        if (params.seriesId === "cluster-pings" || params.seriesId === "noise-pings" || params.seriesId === "current-ping" || params.seriesId === "ping-hit-area") {
                            const ping = chartData.pings[value[3]]
                            const classified = pingClassifiedAt(ping.i, activeTimestamp, chartData)
                            const cluster = !classified
                              ? "Unclassified"
                              : ping.cluster < 0
                                ? "Noise"
                                : isDensityAlgorithm && showXray
                                  ? `${chartData.result.kind === "density" && chartData.result.core[ping.i] >= 0 ? "Core" : "Border"} · Cluster ${ping.cluster}`
                                  : `Cluster ${ping.cluster}`
                            const distanceLine = classified && isDensityAlgorithm && showXray ? `<br>Distance threshold: ${chartData.distanceThreshold}` : ""
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
                                shape: { cx: circle.center[0], cy: circle.center[1], r: circle.radius * pingScale(Number(api.value(3)), hoverPingIndexes) },
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
                              const scale = pingScale(Number(api.value(3)), hoverPingIndexes)
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
              }
            ]
          }
        }        
/* OWN TIMELINE ECHARTS CONFIGURATION */

import * as echarts from "echarts"
import type { EChartsApi, EChartsParams } from "../../../_lib/types"
import type { DemoResultData } from "../../../_lib/demo-result-data"

const DEMO_CLUSTER_COLORS = [
  "#f6d746", "#f89540", "#dc5039", "#a11b63", "#5d126e",
  "#1f4f99", "#149a8f", "#00a8cc", "#72b01d", "#8c6d31",
  "#e377c2", "#9467bd", "#2ca02c", "#d62728", "#17becf",
  "#bcbd22", "#8c564b", "#ff6f91", "#9467bd", "#00b894",
  "#0984e3", "#6c5ce7", "#e17055", "#d63031", "#008080",
  "#c44569", "#4a69bd", "#f19066", "#b33771", "#218c74"
]

const GROUND_TRUTH_COLOR = "#0f766e"
const FUTURE_GROUND_TRUTH_COLOR = "#4b918d"

type TimelineChartOptionsArgs = {
  chartData: DemoResultData
  timeMin: number
  timeMax: number
  getHoverPingIndex: () => number | null
  getSelectedPingIndexes: () => number[]
}

export function createDemoTimelineChartOptions({
  chartData,
  timeMin,
  timeMax,
  getHoverPingIndex,
  getSelectedPingIndexes
}: TimelineChartOptionsArgs) {
  const clusterColor = (cluster: number) =>
    cluster < 0
      ? "#1f2326"
      : DEMO_CLUSTER_COLORS[cluster % DEMO_CLUSTER_COLORS.length]

  return {
    animation: true,
    animationDurationUpdate: 180,
    animationEasingUpdate: "cubicOut" as const,

    grid: {
      left: 34,
      right: 22,
      top: 0,
      bottom: 28
    },

    dataZoom: [
      {
        id: "timeline-zoom",
        type: "inside",
        xAxisIndex: 0,
        filterMode: "none",
        minSpan: 1,
        zoomOnMouseWheel: "ctrl",
        moveOnMouseMove: "shift",
        moveOnMouseWheel: "shift"
      }
    ],

    xAxis: {
      type: "time",
      min: timeMin,
      max: timeMax,
      axisLine: {
        lineStyle: { color: "#a9aea5" }
      },
      axisTick: { show: false },
      axisLabel: {
        color: "#626760",
        formatter: (value: number) =>
          new Date(value).toISOString().slice(11, 16)
      },
      splitLine: {
        show: true,
        lineStyle: { color: "#edf0ea" }
      }
    },

    yAxis: {
      min: 0,
      max: 1,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { show: false },
      splitLine: { show: false }
    },

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
          const hoverPingIndex = getHoverPingIndex()
          const selected = getSelectedPingIndexes().includes(pingIndex)
          const hovered = hoverPingIndex === pingIndex
          const emphasized = hovered || selected
          const halfHeight = 0.22 * (emphasized ? 1.2 : 1)

          const top = api.coord([
            ping.t * 1000,
            0.5 + halfHeight
          ])

          const bottom = api.coord([
            ping.t * 1000,
            0.5 - halfHeight
          ])

          const shape = {
            x1: top[0],
            y1: top[1],
            x2: bottom[0],
            y2: bottom[1]
          }

          return {
            type: "group",
            children: [
              {
                type: "line",
                z2: emphasized ? 9 : 0,
                shape,
                style: {
                  stroke: "rgba(0, 0, 0, 0)",
                  lineWidth: 10
                }
              },
              {
                type: "line",
                z2: emphasized ? 10 : 0,
                shape,
                style: {
                  stroke: "#000000",
                  lineWidth: emphasized ? 5 : 2.5,
                  opacity:
                    hoverPingIndex === null || emphasized
                      ? 0.85
                      : 0.2
                }
              }
            ]
          }
        }
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
          const hoverPingIndex = getHoverPingIndex()
          const hovered = hoverPingIndex === pingIndex
          const selected = getSelectedPingIndexes().includes(pingIndex)
          const emphasized = hovered || selected
          const halfHeight = 0.22 * (emphasized ? 1.2 : 1)

          const top = api.coord([
            api.value(0),
            0.5 + halfHeight
          ])

          const bottom = api.coord([
            api.value(0),
            0.5 - halfHeight
          ])

          const shape = {
            x1: top[0],
            y1: top[1],
            x2: bottom[0],
            y2: bottom[1]
          }

          const color = clusterColor(Number(api.value(1)))

          return emphasized
            ? {
                type: "group",
                children: [
                  {
                    type: "line",
                    z2: 10,
                    shape,
                    style: {
                      stroke: "#000000",
                      lineWidth: 6
                    }
                  },
                  {
                    type: "line",
                    z2: 11,
                    shape,
                    style: {
                      stroke: color,
                      lineWidth: 3.5,
                      opacity: 0.95
                    }
                  }
                ]
              }
            : {
                type: "line",
                z2: 1,
                shape,
                style: {
                  stroke: color,
                  lineWidth: 3.5,
                  opacity: hoverPingIndex === null ? 0.95 : 0.2
                }
              }
        }
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
            {
              x: start[0],
              y: end[1],
              width: Math.max(2, end[0] - start[0]),
              height: start[1] - end[1]
            },
            {
              x: params.coordSys.x,
              y: params.coordSys.y,
              width: params.coordSys.width,
              height: params.coordSys.height
            }
          )

          return shape
            ? {
                type: "rect",
                shape,
                style: {
                  fill: "transparent",
                  stroke: GROUND_TRUTH_COLOR,
                  lineWidth: 2,
                  opacity: 0.62
                }
              }
            : null
        }
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
            {
              x: start[0],
              y: end[1],
              width: Math.max(2, end[0] - start[0]),
              height: start[1] - end[1]
            },
            {
              x: params.coordSys.x,
              y: params.coordSys.y,
              width: params.coordSys.width,
              height: params.coordSys.height
            }
          )

          return shape
            ? {
                type: "rect",
                shape,
                style: {
                  fill: "transparent",
                  stroke: GROUND_TRUTH_COLOR,
                  lineWidth: 2 + pulse,
                  shadowBlur: 4 + pulse * 8,
                  shadowColor: "rgba(15, 118, 110, 0.48)"
                }
              }
            : null
        }
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
            {
              x: start[0],
              y: end[1],
              width: Math.max(2, end[0] - start[0]),
              height: start[1] - end[1]
            },
            {
              x: params.coordSys.x,
              y: params.coordSys.y,
              width: params.coordSys.width,
              height: params.coordSys.height
            }
          )

          return shape
            ? {
                type: "rect",
                shape,
                style: {
                  fill: "transparent",
                  stroke: FUTURE_GROUND_TRUTH_COLOR,
                  lineWidth: 2,
                  opacity: 0.78
                }
              }
            : null
        }
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
            {
              x: start[0],
              y: end[1],
              width: Math.max(2, end[0] - start[0]),
              height: start[1] - end[1]
            },
            {
              x: params.coordSys.x,
              y: params.coordSys.y,
              width: params.coordSys.width,
              height: params.coordSys.height
            }
          )

          return shape
            ? {
                type: "rect",
                shape,
                style: {
                  fill: clusterColor(Number(api.value(2))),
                  opacity: 0.4
                }
              }
            : null
        }
      },

      {
        id: "cursor",
        type: "line",
        coordinateSystem: "cartesian2d",
        showSymbol: false,
        z: 6,
        data: [],
        lineStyle: {
          color: "#67D3E3",
          width: 2
        }
      }
    ]
  }
}
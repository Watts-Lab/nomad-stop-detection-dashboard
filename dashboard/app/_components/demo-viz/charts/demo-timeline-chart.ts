/* OWN TIMELINE ECHARTS CONFIGURATION */

import * as echarts from "echarts"
import type { EChartsApi, EChartsParams } from "../../../_lib/types"
import type { DemoResultData } from "../../../_lib/demo-result-data"

const GROUND_TRUTH_COLOR = "#0f766e"
const FUTURE_GROUND_TRUTH_COLOR = "#4b918d"

type TimelineChartOptionsArgs = {
  getChartData: () => DemoResultData
  timeMin: number
  timeMax: number
  destinationPreview: boolean
  getHoverPingIndex: () => number | null
  getSelectedPingIndexes: () => number[]
  clusterColor: (cluster: number) => string
}

export function createDemoTimelineChartOptions({
  getChartData,
  timeMin,
  timeMax,
  getHoverPingIndex,
  getSelectedPingIndexes,
  destinationPreview,
  clusterColor
}: TimelineChartOptionsArgs) {

  return {
    backgroundColor: "#f8f9fc",
    animation: !destinationPreview,
    animationDurationUpdate: 180,
    animationEasingUpdate: "cubicOut" as const,

    grid: destinationPreview
      ? { left: 0, right: 0, top: 0, bottom: 0 }
      : { left: 28, right: 28, top: 0, bottom: 28 },

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
      axisLine: destinationPreview
        ? { show: false }
        : { lineStyle: { color: "#a9aea5" } },
      axisTick: { show: false },
      axisLabel: destinationPreview
        ? { show: false }
        : {
          color: "#626760",
          formatter: (value: number) =>
            new Date(value).toISOString().slice(11, 16)
        },
      splitLine: destinationPreview
        ? { show: false }
        : {
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
          const ping = getChartData().pings[pingIndex]
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
          const start = api.coord([api.value(0), destinationPreview ? 0 : 0.24])
          const end = api.coord([api.value(1), destinationPreview ? 1 : 0.76])

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
              style: destinationPreview
                ? {
                  fill: clusterColor(Number(api.value(2))),
                  stroke: "rgba(255, 255, 255, 0.7)",
                  lineWidth: 1
                }
                : {
                  fill: clusterColor(Number(api.value(2))),
                  opacity: 0.4
                }
            }
            : null
        }
      },

      {
        id: "selected-ping-times",
        type: "custom",
        coordinateSystem: "cartesian2d",
        silent: true,
        z: 12,
        data: [],
        renderItem(params: EChartsParams, api: EChartsApi) {
          const timestamp = Number(api.value(0))
          const cluster = Number(api.value(1))
          const selectionIndex = Number(api.value(2))
          const markerX = api.coord([timestamp, 0.5])[0]
          const labelHalfWidth = 29
          const labelX = Math.max(
            params.coordSys.x + labelHalfWidth,
            Math.min(markerX, params.coordSys.x + params.coordSys.width - labelHalfWidth)
          )
          const labelY = params.coordSys.y + 10 + selectionIndex * 19
          const color = cluster >= 0 ? clusterColor(cluster) : "#626760"
          const time = new Date(timestamp).toISOString().slice(11, 19)

          return {
            type: "group",
            children: [
              {
                type: "line",
                shape: {
                  x1: markerX,
                  y1: params.coordSys.y + 20 + selectionIndex * 19,
                  x2: markerX,
                  y2: params.coordSys.y + params.coordSys.height - 2
                },
                style: { stroke: color, lineWidth: 2, opacity: 0.95 }
              },
              {
                type: "text",
                x: labelX,
                y: labelY,
                style: {
                  text: time,
                  align: "center",
                  verticalAlign: "middle",
                  fill: "#ffffff",
                  backgroundColor: color,
                  borderColor: "#ffffff",
                  borderWidth: 1,
                  borderRadius: 2,
                  padding: [2, 4],
                  font: "600 10px monospace"
                }
              }
            ]
          }
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
          color: "#d83832",
          width: 2
        }
      }
    ]
  }
}

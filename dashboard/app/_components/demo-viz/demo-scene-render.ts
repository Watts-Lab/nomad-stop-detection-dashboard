/* BUILD DYNAMIC MAP & TIMELINE SERIES DATA FOR CURRENT PLAYBACK TIMESTAMP */

import type { DemoResultData } from "../../_lib/demo-result-data"
import {
    relatedPingIndexesAt, anchorOpacity,
    associationOpacity, edgeOpacity, selectedPingLineData
} from "./demo-interactions"
import { pingClassifiedAt, selectedAssignedBuildingData, visibleClusterPingsAt, visibleNoisePingsAt } from "./overlays/demo-detected-stops"
import { groundTruthBuildingGlowData, groundTruthBuildingsSeriesData } from "./overlays/demo-ground-truth"
import { xrayDistanceCircleData } from "./overlays/demo-xray"

type ResolveHoverPingIndexesArgs = {
    timestampSeconds: number
    chartData: DemoResultData
    selectedPingIndexes: number[]
}

// Determine which pings should be highlighted based on the current selection.
// Hover only magnifies the hovered ping, so it doesn't change this set.
export function resolveHoverPingIndexes({
    timestampSeconds,
    chartData,
    selectedPingIndexes
}: ResolveHoverPingIndexesArgs): Set<number> | null {
    if (selectedPingIndexes.length === 2) {
        return new Set(selectedPingIndexes)
    }

    if (selectedPingIndexes.length) {
        return new Set(
            selectedPingIndexes.flatMap((pingIndex) =>
                relatedPingIndexesAt(
                    pingIndex,
                    timestampSeconds,
                    chartData
                )
            )
        )
    }

    return null
}

// Prepare the current ping's position, classification, opacity,
// and floating offset for the map renderer.
export function currentPingData(
    timestampSeconds: number,
    chartData: DemoResultData,
    latestPingIndex: number,
    showStops: boolean,
    hoverPingIndexes: Set<number> | null,
    pingFloatOffset: number,
  ) {
    const ping = chartData.pingData[latestPingIndex]
    const cluster =
      showStops &&
      pingClassifiedAt(latestPingIndex, timestampSeconds, chartData)
        ? ping[2]
        : -1
  
    return [[
      ping[0],
      ping[1],
      cluster,
      latestPingIndex,
      ping[4],
      associationOpacity(latestPingIndex, hoverPingIndexes),
      pingFloatOffset,
    ]]
  }

type BuildDemoMapSeriesArgs = {
    timestampSeconds: number
    chartData: DemoResultData
    route: {
        completedCached: number[][][]
        completedFallback: number[][][]
        activeCached: number[][]
        activeFallback: number[][]
    }
    latestPingIndex: number
    anchorFrames: DemoResultData["anchorFrames"]
    anchorEdges: DemoResultData["densityPromotionEdges"]
    promotionEdges: DemoResultData["densityPromotionEdges"]
    hoverPingIndexes: Set<number> | null
    containmentAreas: Array<{ cluster: number; points: number[][]; shaded: boolean }>
    hoverBuildingId: string
    selectedPingIndexes: number[]
    showGroundTruth: boolean
    showStops: boolean
    showXray: boolean
    nextPathVisible: boolean
    pulseStrength: number
    isDensityAlgorithm: boolean
    algorithm: string
    clusterColor: (cluster: number) => string
    pingFloatOffset: number
}

export function buildDemoMapSeries({
    timestampSeconds,
    chartData,
    route,
    latestPingIndex,
    anchorFrames,
    anchorEdges,
    promotionEdges,
    hoverPingIndexes,
    containmentAreas,
    hoverBuildingId,
    selectedPingIndexes,
    showGroundTruth,
    showStops,
    showXray,
    nextPathVisible,
    pulseStrength,
    pingFloatOffset,
    isDensityAlgorithm,
    algorithm,
    clusterColor
}: BuildDemoMapSeriesArgs) {
    const styledXrayPoint = (point: number[]) => [
        ...point,
        anchorOpacity(point[3], hoverPingIndexes),
      ]

    return [
        {
            id: "streets",
            data: chartData.streets.map((_, index) => index)
        },
        {
            id: "street-lanes",
            data: chartData.streetLanes.map((_, index) => index)
        },
        {
            id: "buildings",
            data: groundTruthBuildingsSeriesData(
                timestampSeconds,
                chartData,
                showGroundTruth,
                pulseStrength,
                hoverBuildingId
            )
        },
        {
            id: "building-glow",
            data: groundTruthBuildingGlowData(
                timestampSeconds,
                chartData,
                showGroundTruth,
                pulseStrength,
                hoverBuildingId
            )
        },
        {
            id: "assigned-building-outline",
            data: selectedAssignedBuildingData(
                timestampSeconds,
                chartData,
                showStops,
                selectedPingIndexes
            )
        },
        {
            id: "completed-paths",
            data: showGroundTruth
                ? route.completedCached.map((points) => ({ coords: points }))
                : []
        },
        {
            id: "completed-fallback-paths",
            data: showGroundTruth
                ? route.completedFallback.map((points) => ({ coords: points }))
                : []
        },
        {
            id: "active-path",
            data: showGroundTruth ? route.activeCached : []
        },
        {
            id: "active-fallback-path",
            data: showGroundTruth ? route.activeFallback : []
        },
        ...(nextPathVisible ? [] : [{ id: "next-path", data: [] }]),
        {
            id: "ghost-pings",
            data: chartData.pingData,
        },
        {
            id: "noise-pings",
            data: showStops
                ? visibleNoisePingsAt(timestampSeconds, chartData)
                : []
        },
        {
            id: "cluster-pings",
            data: showStops
                ? visibleClusterPingsAt(timestampSeconds, chartData).map((point: number[]) => [
                    ...point,
                    associationOpacity(point[3], hoverPingIndexes)
                ])
                : []
        },
        {
            id: "promotion-edges",
            data: showXray
                ? promotionEdges.map((edge) => ({
                    ...edge,
                    lineStyle: {
                        color: clusterColor(edge.value[0]),
                        opacity: edgeOpacity(
                            edge.value[1],
                            edge.value[2],
                            hoverPingIndexes
                        )
                    }
                }))
                : []
        },
        {
            id: "promotion-edges-hit-area",
            data: showXray ? promotionEdges : []
        },
        {
            id: "core-points",
            data: showXray
                ? chartData.densityCorePointData
                    .filter((point) => point[4] <= timestampSeconds)
                    .map(styledXrayPoint)
                : []
        },
        {
            id: "anchor-edges",
            data: showXray
                ? anchorEdges.map((edge) => ({
                    ...edge,
                    lineStyle: {
                        color: clusterColor(edge.value[0]),
                        opacity: edgeOpacity(
                            edge.value[1],
                            edge.value[2],
                            hoverPingIndexes
                        )
                    }
                }))
                : []
        },
        {
            id: "anchor-edges-hit-area",
            data: showXray ? anchorEdges : []
        },
        {
            id: "anchor-points",
            data: showXray
                ? anchorFrames.map((frame) => frame.point).map(styledXrayPoint)
                : []
        },
        {
            id: "current-ping",
            data: currentPingData(
              timestampSeconds,
              chartData,
              latestPingIndex,
              showStops,
              hoverPingIndexes,
              pingFloatOffset,
            ),
        },
        {
            id: "containment-areas",
            data: containmentAreas.map((area) => [area.cluster])
        },
        {
            id: "distance-circles",
            data: xrayDistanceCircleData(
                chartData,
                showXray,
                isDensityAlgorithm,
                algorithm === "lachesis",
                selectedPingIndexes,
                timestampSeconds
            )
        },
        {
            id: "ping-hit-area",
            data: chartData.pingData
        },
        {
            id: "selected-ping-line",
            data: selectedPingLineData(selectedPingIndexes, chartData)
        }
    ]
}


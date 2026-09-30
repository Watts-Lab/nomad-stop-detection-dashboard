/* GROUND TRUTH VISUALIZATION LOGIC FOR DEMO MODE */

import type { DemoResultData } from "../../../_lib/demo-result-data"

// Find the active and upcoming ground-truth stops at a given playback time.
export function groundTruthAt(
  timestampSeconds: number,
  chartData: DemoResultData,
) {
  const current = chartData.truthStops.find(
    (truth) =>
      timestampSeconds >= truth.timestamp &&
      timestampSeconds <= truth.timestamp + truth.duration * 60,
  )

  const next = chartData.truthStops.find(
    (truth) => truth.timestamp > timestampSeconds,
  )

  return { current, next }
}

// Build timeline data for ground-truth stops that have already ended.
export function pastTruthStopData(
  timestampSeconds: number,
  chartData: DemoResultData,
) {
  return chartData.truthStops.flatMap((stop, index) =>
    stop.timestamp + stop.duration * 60 < timestampSeconds
      ? [[
          stop.timestamp * 1000,
          (stop.timestamp + stop.duration * 60) * 1000,
          index,
        ]]
      : [],
  )
}

// Build timeline data for the currently active ground-truth stop.
export function currentTruthStopData(
  timestampSeconds: number,
  chartData: DemoResultData,
  pulseStrength: number,
) {
  const current = groundTruthAt(timestampSeconds, chartData).current

  return current
    ? [[
        current.timestamp * 1000,
        (current.timestamp + current.duration * 60) * 1000,
        pulseStrength,
        chartData.truthStops.indexOf(current),
      ]]
    : []
}

// Build timeline data for the next upcoming ground-truth stop.
export function nextTruthStopData(
  timestampSeconds: number,
  chartData: DemoResultData,
) {
  const next = groundTruthAt(timestampSeconds, chartData).next

  return next
    ? [[
        next.timestamp * 1000,
        (next.timestamp + next.duration * 60) * 1000,
        chartData.truthStops.indexOf(next),
      ]]
    : []
}

// Build map data that highlights the current and next ground-truth buildings.
export function groundTruthBuildingsSeriesData(
  timestampSeconds: number,
  chartData: DemoResultData,
  showGroundTruth: boolean,
  pulseStrength: number,
  hoverBuildingId: string,
) {
  const truth = groundTruthAt(timestampSeconds, chartData)

  return chartData.buildings
    .map((building, index) => [
      index,
      showGroundTruth && building.id === truth.current?.location
        ? 1 + pulseStrength
        : showGroundTruth && building.id === truth.next?.location
          ? 2
          : 0,
      hoverBuildingId !== "" && building.id !== hoverBuildingId ? 1 : 0,
    ])
    .sort((a, b) => a[1] - b[1])
}

// Return only the active ground-truth building data used for the glow effect.
export function groundTruthBuildingGlowData(
  timestampSeconds: number,
  chartData: DemoResultData,
  showGroundTruth: boolean,
  pulseStrength: number,
  hoverBuildingId: string,
) {
  return groundTruthBuildingsSeriesData(
    timestampSeconds,
    chartData,
    showGroundTruth,
    pulseStrength,
    hoverBuildingId,
  ).filter(([, state, faded]) => state > 0 && state < 2 && !faded)
}

// Calculate the total distance along a ground-truth route.
export function groundTruthRouteLength(points: number[][]) {
  return points.slice(1).reduce((total, point, index) => {
    const previous = points[index]

    return total + Math.hypot(
      point[0] - previous[0],
      point[1] - previous[1],
    )
  }, 0)
}

// Find the animated marker position and direction at a given distance
// along a ground-truth route.
export function groundTruthRouteMarkerAt(
  points: number[][],
  distance: number,
): number[] | null {
  if (points.length < 2) return null

  if (distance <= 0) {
    return [
      points[0][0],
      points[0][1],
      points[1][0],
      points[1][1],
    ]
  }

  let walked = 0

  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1]
    const next = points[index]

    const segmentLength = Math.hypot(
      next[0] - previous[0],
      next[1] - previous[1],
    )

    if (walked + segmentLength > distance) {
      const local =
        segmentLength === 0
          ? 1
          : (distance - walked) / segmentLength

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

  return [
    last[0],
    last[1],
    last[0] + last[0] - previous[0],
    last[1] + last[1] - previous[1],
  ]
}

// Combine completed and active ground-truth route segments into
// one continuous path for the route-glow animation.
export function groundTruthRouteGlowPoints(route: {
  completedCached: number[][][]
  completedFallback: number[][][]
  activeCached: number[][]
  activeFallback: number[][]
}) {
  return [
    ...route.completedCached,
    ...route.completedFallback,
    route.activeCached,
    route.activeFallback,
  ]
    .filter((points) => points.length > 1)
    .flatMap((points, index) =>
      index === 0 ? points : points.slice(1)
    )
}


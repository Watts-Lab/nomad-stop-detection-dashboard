/* X-RAY VISUALIZATION LOGIC FOR DEMO MODE */

import type { DemoResultData } from "../../../_lib/demo-result-data"
import { pingClassifiedAt, visibleClusterPingsAt } from "./demo-detected-stops"

// Return the most recent X-ray anchor frame for each stop/cluster
// that has been reached by the current playback time.
export function xrayAnchorFramesAt(
  timestampSeconds: number,
  chartData: DemoResultData,
) {
  const framesByStop = new Map<
    number,
    DemoResultData["anchorFrames"][number]
  >()

  chartData.anchorFrames.forEach((frame) => {
    if (frame.t <= timestampSeconds) {
      framesByStop.set(frame.cluster, frame)
    }
  })

  return Array.from(framesByStop.values())
}

// Determine which points should display an X-ray distance-radius circle.
export function xrayDistanceCircleData(
    chartData: DemoResultData,
    anchorFrames: DemoResultData["anchorFrames"],
    showXray: boolean,
    isDensityAlgorithm: boolean,
    isLachesis: boolean,
    selectedPingIndexes: number[],
    timestampSeconds: number,
  ) {
    if (!showXray) return []
  
    if (!isDensityAlgorithm && !isLachesis) {
      return anchorFrames.map((frame) => frame.point)
    }
  
    // Density and Lachesis circles follow the pings the user has selected.
    return selectedPingIndexes
      .filter((pingIndex) =>
        pingClassifiedAt(pingIndex, timestampSeconds, chartData) &&
        (!isLachesis || chartData.pingData[pingIndex][2] >= 0)
      )
      .map((pingIndex) => chartData.pingData[pingIndex].slice(0, 4))
  }

// Outline the region within the distance threshold of every classified ping
// in each Lachesis stop, i.e. the intersection of their distance circles.
export function lachesisIntersectionAreas(
  timestampSeconds: number,
  chartData: DemoResultData,
) {
  const pointsByCluster = new Map<number, number[][]>()
  visibleClusterPingsAt(timestampSeconds, chartData).forEach((point) => {
    const points = pointsByCluster.get(point[2])
    if (points) points.push([point[0], point[1]])
    else pointsByCluster.set(point[2], [[point[0], point[1]]])
  })
  const radius = chartData.distanceThreshold
  const radiusSquared = radius ** 2

  return Array.from(pointsByCluster, ([cluster, centers]) => {
    // Only boundary points belong in the outline; interior centers create notches.
    const candidates = centers.flatMap(([x, y]) => Array.from({ length: 64 }, (_, index) => {
      const angle = index / 64 * Math.PI * 2
      return [x + radius * Math.cos(angle), y + radius * Math.sin(angle)]
    }))
    centers.forEach(([firstX, firstY], firstIndex) => {
      centers.slice(firstIndex + 1).forEach(([secondX, secondY]) => {
        const distance = Math.hypot(secondX - firstX, secondY - firstY)
        if (distance === 0 || distance > radius * 2) return
        const midpointX = (firstX + secondX) / 2
        const midpointY = (firstY + secondY) / 2
        const offset = Math.sqrt(radiusSquared - (distance / 2) ** 2)
        const perpendicularX = -(secondY - firstY) / distance * offset
        const perpendicularY = (secondX - firstX) / distance * offset
        candidates.push(
          [midpointX + perpendicularX, midpointY + perpendicularY],
          [midpointX - perpendicularX, midpointY - perpendicularY],
        )
      })
    })
    const points = candidates.filter(([x, y]) => centers.every(([centerX, centerY]) =>
      (x - centerX) ** 2 + (y - centerY) ** 2 <= radiusSquared + 0.000001
    ))
    const centerX = points.reduce((sum, [x]) => sum + x, 0) / points.length
    const centerY = points.reduce((sum, [, y]) => sum + y, 0) / points.length

    return {
      cluster,
      points: points.sort(([firstX, firstY], [secondX, secondY]) =>
        Math.atan2(firstY - centerY, firstX - centerX) - Math.atan2(secondY - centerY, secondX - centerX)
      ),
    }
  }).filter((area) => area.points.length >= 3)
}

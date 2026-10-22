/* X-RAY VISUALIZATION LOGIC FOR DEMO MODE */

import type { DemoResultData } from "../../../_lib/demo-result-data"
import { pingClassifiedAt } from "./demo-detected-stops"

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

export function xrayGridCellsAt(timestampSeconds: number, chartData: DemoResultData) {
  const visible = new Map<number, [number, number, number]>()
  let currentCell = -1

  for (const [cellIndex, time, cluster] of chartData.gridCellFrames) {
    if (time > timestampSeconds) break
    visible.set(cellIndex, [cellIndex, cluster, 0])
    currentCell = cellIndex
  }

  const current = visible.get(currentCell)
  if (current) current[2] = 1
  return Array.from(visible.values())
}

// Determine which points should display an X-ray distance-radius circle.
// Density and Lachesis circles follow the pings the user has selected; the other
// sequential algorithms show their radius through the containment areas instead.
export function xrayDistanceCircleData(
    chartData: DemoResultData,
    showXray: boolean,
    isDensityAlgorithm: boolean,
    isLachesis: boolean,
    selectedPingIndexes: number[],
    timestampSeconds: number,
  ) {
    if (!showXray || (!isDensityAlgorithm && !isLachesis)) return []
  
    return selectedPingIndexes
      .filter((pingIndex) =>
        pingClassifiedAt(pingIndex, timestampSeconds, chartData) &&
        (!isLachesis || chartData.pingData[pingIndex][2] >= 0)
      )
      .map((pingIndex) => chartData.pingData[pingIndex].slice(0, 4))
  }

// Approximate the intersection of equal-radius circles as a polygon.
function circleIntersectionPolygon(centers: number[][], radius: number) {
  const radiusSquared = radius ** 2
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

  return points.sort(([firstX, firstY], [secondX, secondY]) =>
    Math.atan2(firstY - centerY, firstX - centerX) - Math.atan2(secondY - centerY, secondX - centerX)
  )
}

// Return the containment areas of a sequential algorithm at the current playback time:
// the region the next ping must fall in to join the latest ping's candidate, plus the
// final areas of stops already left behind. Lachesis bounds the candidate's diameter
// (intersection of circles around every ping); the first- and centroid-anchored
// variants bound the distance to their anchor. The current area is shaded once its
// candidate lasts dur_min; a noise ping's area (cluster -1) is never shaded.
export function containmentAreasAt(
  timestampSeconds: number,
  chartData: DemoResultData,
  algorithm: string,
  latestPingIndex: number,
) {
  const latestPing = chartData.pings[latestPingIndex]
  const membersOf = (cluster: number) =>
    (chartData.clusterMembers.get(cluster) ?? []).map((pingIndex) => chartData.pings[pingIndex])
  const areaFor = (members: DemoResultData["pings"]) => {
    const centers = algorithm === "lachesis"
      ? members.map((ping) => [ping.x, ping.y])
      : algorithm === "sequential_centroid"
        ? [[
          members.reduce((sum, ping) => sum + ping.x, 0) / members.length,
          members.reduce((sum, ping) => sum + ping.y, 0) / members.length,
        ]]
        : [[members[0].x, members[0].y]]
    return circleIntersectionPolygon(centers, chartData.distanceThreshold)
  }

  const pastAreas = chartData.stops
    .filter((stop) => stop.cluster !== latestPing.cluster && stop.end <= timestampSeconds)
    .map((stop) => ({ cluster: stop.cluster, points: areaFor(membersOf(stop.cluster)), shaded: false }))

  if (latestPing.cluster < 0) {
    return [...pastAreas, { cluster: -1, points: areaFor([latestPing]), shaded: false }]
  }

  const candidate = membersOf(latestPing.cluster).filter((ping) => ping.i <= latestPingIndex)

  return [...pastAreas, {
    cluster: latestPing.cluster,
    points: areaFor(candidate),
    shaded: Math.floor((latestPing.t - candidate[0].t) / 60) >= chartData.durMin,
  }]
}

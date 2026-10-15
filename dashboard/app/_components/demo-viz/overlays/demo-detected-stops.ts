/* DETECTED STOPS VISUALIZATION LOGIC FOR DEMO MODE */

import type { DemoResultData } from "../../../_lib/demo-result-data"

// Count how many detected stops have been reached by the current playback time.
export function detectedCountFor(
  timestampSeconds: number,
  chartData: DemoResultData
) {
  let count = 0

  while (
    count < chartData.stopEndTimes.length &&
    chartData.stopEndTimes[count] <= timestampSeconds
  ) {
    count += 1
  }

  return count
}

// Determine whether a ping's stop assignment is available
// at the current playback time.
export function pingClassifiedAt(
  pingIndex: number,
  timestampSeconds: number,
  chartData: DemoResultData,
) {
  const ping = chartData.pingData[pingIndex]
  const pingTime = ping[4]
  const cluster = ping[2]

  if (pingTime > timestampSeconds) return false

  if (chartData.result.kind === "density") {
      return Math.max(
          pingTime,
          chartData.result.aux_time[pingIndex] ?? pingTime,
      ) <= timestampSeconds
  }

  const detectionTime =
      chartData.sequentialStopDetectionTimes.get(cluster)

  return detectionTime === undefined ||
      detectionTime <= timestampSeconds
}

// Find the building assigned to the detected stop containing the hovered ping.
export function hoveredAssignedBuildingData(
    timestampSeconds: number,
    chartData: DemoResultData,
    showStops: boolean,
    hoverPingIndex: number | null
) {
    if (!showStops || hoverPingIndex === null) return []

    if (
        !pingClassifiedAt(
            hoverPingIndex,
            timestampSeconds,
            chartData
        )
    ) {
        return []
    }

    const cluster = chartData.pingData[hoverPingIndex]?.[2] ?? -1

    if (cluster < 0) return []
    const stop = chartData.stops.find(
        (candidate) => candidate.cluster === cluster
    )

    const buildingId = stop?.destination.id
    if (!buildingId) return []
    const buildingIndex = chartData.buildings.findIndex(
        (building) => building.id === buildingId
    )
    return buildingIndex >= 0
        ? [[buildingIndex, cluster]]
        : []
}

// Return noise pings that have occurred by the current playback time.
export function visibleNoisePingsAt(
    timestampSeconds: number,
    chartData: DemoResultData
  ) {
    return chartData.pingData.filter(
      (point) =>
        point[2] < 0 &&
        point[4] <= timestampSeconds
    )
  }

// Return clustered pings that have been classified by the current playback time.
export function visibleClusterPingsAt(
    timestampSeconds: number,
    chartData: DemoResultData
  ) {
    return chartData.pingData.filter(
      (point) =>
        point[2] >= 0 &&
        pingClassifiedAt(
          point[3],
          timestampSeconds,
          chartData
        )
    )
  }

// Return members of a detected stop that have been classified by the current playback time.
export function classifiedClusterMembersAt(
    cluster: number,
    timestampSeconds: number,
    chartData: DemoResultData
  ) {
    return chartData.clusterMembers
      .get(cluster)
      ?.filter((pingIndex) =>
        pingClassifiedAt(
          pingIndex,
          timestampSeconds,
          chartData
        )
      )
  }

  // Build each stop's timeline interval using only members classified
// by the current playback time.
export function detectedStopBarsAt(
  timestampSeconds: number,
  chartData: DemoResultData,
): number[][] {
  return chartData.stops.flatMap((stop) => {
    const members =
      classifiedClusterMembersAt(
        stop.cluster,
        timestampSeconds,
        chartData,
      ) ?? []

    if (!members.length) return []

    let start = Infinity
    let end = -Infinity

    for (const pingIndex of members) {
      const pingTime = chartData.pingData[pingIndex][4]
      start = Math.min(start, pingTime)
      end = Math.max(end, pingTime)
    }

    return [[
      start * 1000,
      end * 1000,
      stop.cluster,
      stop.index,
    ]]
  })
}
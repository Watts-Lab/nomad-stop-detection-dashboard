/* HOVER AND SELECTION INTERACTION LOGIC FOR DEMO MODE */

import type { DemoResultData } from "../../_lib/demo-result-data"
import { classifiedClusterMembersAt, pingClassifiedAt } from "./overlays/demo-detected-stops"

// Build the line connecting two selected pings.
export function selectedPingLineData(
  selectedPingIndexes: number[],
  chartData: DemoResultData
) {
  if (selectedPingIndexes.length !== 2) return []

  return [{
    coords: selectedPingIndexes.map((pingIndex) => {
      const ping = chartData.pings[pingIndex]
      return [ping.x, ping.y]
    })
  }]
}

// Describe a ping for its hover tooltip.
export function pingTooltipHtml(
    pingIndex: number,
    timestampSeconds: number,
    chartData: DemoResultData,
    showStops: boolean,
    showXray: boolean,
    clusterColor: (cluster: number) => string,
  ) {
    const ping = chartData.pings[pingIndex]
    const rows = [
      `<div><span style="font-weight:600">${ping.i + 1}:</span> <span style="font-weight:400">${ping.time}</span></div>`,
    ]

    if (!showStops) return rows.join("")

    const classified = pingClassifiedAt(pingIndex, timestampSeconds, chartData)
    if (!classified) rows.push("<div>Unclassified</div>")
    else if (ping.cluster < 0) rows.push("<div>Noise</div>")
    else {
      if (chartData.result.kind === "density" && showXray) {
        rows.push(`<div>${chartData.result.core[ping.i] >= 0 ? "Core" : "Border"}</div>`)
      }
      const stop = chartData.stops.find((candidate) => candidate.cluster === ping.cluster)
      if (stop) {
        rows.push(
          `<div style="display:flex;align-items:center;gap:6px"><span style="display:inline-flex;width:12px;height:12px;align-items:center;justify-content:center;background:${clusterColor(ping.cluster)};border:1px solid #202124"><span style="width:3px;height:3px;border-radius:50%;background:#202124"></span></span><span>${stop.startTime}–${stop.endTime}</span></div>`,
        )
      }
    }

    return rows.join("")
  }

// Return the detected cluster for an interacted-with ping once that ping has been classified at the current playback time.
export function activePingClusterAt(
    pingIndex: number,
    timestampSeconds: number,
    chartData: DemoResultData
  ) {
    if (
      !pingClassifiedAt(
        pingIndex,
        timestampSeconds,
        chartData
      )
    ) {
      return -1
    }
  
    return chartData.pingData[pingIndex]?.[2] ?? -1
  }

// Return the pings that should be highlighted when a ping is hovered or selected at the current playback time.
export function relatedPingIndexesAt(
    pingIndex: number,
    timestampSeconds: number,
    chartData: DemoResultData
  ) {
    const cluster = activePingClusterAt(
      pingIndex,
      timestampSeconds,
      chartData
    )
  
    if (cluster < 0) return [pingIndex]
  
    return classifiedClusterMembersAt(
      cluster,
      timestampSeconds,
      chartData
    ) ?? [pingIndex]
  }

// Determine whether a ping belongs to the currently highlighted interaction set.
export function associatedWithHover(
    pingIndex: number,
    hoverPingIndexes: Set<number> | null
  ) {
    return (
      hoverPingIndexes === null ||
      hoverPingIndexes.has(pingIndex)
    )
  }

// Determine the opacity of a ping based on whether it belongs
// to the currently highlighted interaction set.
export function associationOpacity(
    pingIndex: number,
    hoverPingIndexes: Set<number> | null
  ) {
    return associatedWithHover(
      pingIndex,
      hoverPingIndexes
    ) ? 1 : 0.2
  }
  
  // Determine the opacity of an X-ray anchor point based on
  // whether it belongs to the currently highlighted interaction set.
  export function anchorOpacity(
    pingIndex: number,
    hoverPingIndexes: Set<number> | null
  ) {
    return associatedWithHover(
      pingIndex,
      hoverPingIndexes
    ) ? 1 : 0.2
  }
  
  // Determine the opacity of an edge based on whether both of its
  // endpoint pings belong to the currently highlighted interaction set.
  export function edgeOpacity(
    sourceIndex: number,
    targetIndex: number,
    hoverPingIndexes: Set<number> | null
  ) {
    return (
      hoverPingIndexes === null ||
      (
        hoverPingIndexes.has(sourceIndex) &&
        hoverPingIndexes.has(targetIndex)
      )
    ) ? 0.7 : 0.1
  }
  
  // Magnify the hovered ping as an accent, and slightly enlarge
  // pings that belong to the selection set.
  export function pingScale(
    pingIndex: number,
    hoverPingIndexes: Set<number> | null,
    hoverPingIndex: number | null
  ) {
    return pingIndex === hoverPingIndex
      ? 1.25
      : hoverPingIndexes?.has(pingIndex)
        ? 1.1
        : 1
  }

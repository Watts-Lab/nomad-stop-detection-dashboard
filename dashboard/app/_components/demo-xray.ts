/* X-RAY VISUALIZATION LOGIC FOR DEMO MODE */

import type { DemoResultData } from "../_lib/demo-result-data"

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
    hoverPingIndex: number | null,
    hoverPingIsClassified: boolean,
  ) {
    if (!showXray) return []
  
    if (!isDensityAlgorithm) {
      return anchorFrames.map((frame) => frame.point)
    }
  
    if (hoverPingIndex === null) return []
    if (!hoverPingIsClassified) return []
  
    const point = chartData.pingData[hoverPingIndex]
  
    return [[point[0], point[1], point[2]]]
  }
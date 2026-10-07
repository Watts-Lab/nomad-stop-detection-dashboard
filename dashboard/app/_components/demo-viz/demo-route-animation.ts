/* COMPUTES PARTIAL, COMPLETED, ACTIVE, UPCOMING ROUTE PATHS BASED ON PLAYBACK PROGRESS */

type PreparedRouteSegment = {
    points: number[][]
    cumulative: number[]
    length: number
    start: number
    end: number
    isFallback: boolean
    stopIndex: number
  }
  
  export type RouteProgress = {
    completedCached: number[][][]
    completedFallback: number[][][]
    activeCached: number[][]
    activeFallback: number[][]
    next: PreparedRouteSegment | null
  }
  
  // Return the portion of a route segment that should be visible
  // for the supplied progress value.
  export function partialPath(
    segment: PreparedRouteSegment,
    progress: number
  ) {
    const target = segment.length * Math.max(0, progress)
    const drawn = [segment.points[0]]
  
    for (let index = 1; index < segment.points.length; index += 1) {
      const previous = segment.points[index - 1]
      const next = segment.points[index]
  
      const segmentLength =
        segment.cumulative[index] - segment.cumulative[index - 1]
  
      if (segment.cumulative[index] >= target) {
        const local =
          segmentLength === 0
            ? 1
            : (target - segment.cumulative[index - 1]) / segmentLength
  
        drawn.push([
          previous[0] + (next[0] - previous[0]) * local,
          previous[1] + (next[1] - previous[1]) * local
        ])
  
        return drawn
      }
  
      drawn.push(next)
    }
  
    return drawn
  }
  
  // Split route segments into completed, currently active, and upcoming
  // paths for the supplied playback timestamp.
  export function routeProgressAt(
    timestampSeconds: number,
    preparedSegments: PreparedRouteSegment[]
  ): RouteProgress {
    const completedCached: number[][][] = []
    const completedFallback: number[][][] = []
  
    let activeCached: number[][] = []
    let activeFallback: number[][] = []
    let next: PreparedRouteSegment | null = null
  
    for (const segment of preparedSegments) {
      if (timestampSeconds >= segment.end) {
        if (segment.isFallback) {
          completedFallback.push(segment.points)
        } else {
          completedCached.push(segment.points)
        }
  
        continue
      }
  
      if (timestampSeconds >= segment.start) {
        const active = partialPath(
          segment,
          (timestampSeconds - segment.start) /
            Math.max(1, segment.end - segment.start)
        )
  
        if (segment.isFallback) {
          activeFallback = active
        } else {
          activeCached = active
        }
  
        continue
      }
  
      if (!next) next = segment
    }
  
    return {
      completedCached,
      completedFallback,
      activeCached,
      activeFallback,
      next
    }
  }
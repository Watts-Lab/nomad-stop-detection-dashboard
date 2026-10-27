/* PLAYBACK AND TIMELINE LOGIC FOR DEMO MODE */

// Find the latest playback sequence index reached by a timestamp.
export function sequenceIndexAt(
    timestampSeconds: number,
    timeSequence: number[]
  ) {
    let index = 0
  
    for (
      let candidate = 0;
      candidate < timeSequence.length;
      candidate += 1
    ) {
      if (timeSequence[candidate] <= timestampSeconds) {
        index = candidate
      } else {
        break
      }
    }
  
    return index
  }

  export function latestPingIndexAt(
    timestampSeconds: number,
    pings: Array<{ timestamp: number }>
  ) {
    let index = 0
  
    for (
      let candidate = 0;
      candidate < pings.length;
      candidate += 1
    ) {
      if (pings[candidate].timestamp <= timestampSeconds) {
        index = candidate
      } else {
        break
      }
    }
  
    return index
  }

  export function activePlaybackTimestamp(
    selectedTimestamp: number | null,
    sequenceIndex: number,
    timeSequence: number[]
  ) {
    return (
      selectedTimestamp ??
      timeSequence[sequenceIndex] ??
      timeSequence[0]
    )
  }

  export function playbackStateFor(
    paused: boolean,
    sequenceIndex: number,
    timeSequenceLength: number
  ): "playing" | "paused" | "complete" {
    const atEnd = isPlaybackComplete(
        sequenceIndex,
        timeSequenceLength
      )
  
    if (atEnd && paused) return "complete"
    if (paused) return "paused"
  
    return "playing"
  }

  // Keep a playback timestamp within the available timeline range.
export function clampPlaybackTimestamp(
    timestampSeconds: number,
    timeSequence: number[]
  ) {
    const minTimestamp = timeSequence[0]
    const maxTimestamp = timeSequence[timeSequence.length - 1]
  
    return Math.max(
      minTimestamp,
      Math.min(maxTimestamp, timestampSeconds)
    )
  }

// Advance playback by one step without exceeding the timeline.
export function nextSequenceIndex(
    sequenceIndex: number,
    timeSequenceLength: number
  ) {
    return Math.min(
      sequenceIndex + 1,
      timeSequenceLength - 1
    )
  }

// Check whether playback has reached the final timeline step.
export function isPlaybackComplete(
    sequenceIndex: number,
    timeSequenceLength: number
  ) {
    return sequenceIndex >= timeSequenceLength - 1
  }

// Convert a timeline value in milliseconds into a valid playback timestamp.
export function timelineValueToTimestamp(
    timeMs: number,
    timeSequence: number[]
  ) {
    return clampPlaybackTimestamp(
      timeMs / 1000,
      timeSequence
    )
  }

// Move the playback timestamp by a timeline scrub delta.
export function scrubPlaybackTimestamp(
    currentTimestamp: number,
    deltaSeconds: number,
    timeSequence: number[]
  ) {
    return clampPlaybackTimestamp(
      currentTimestamp + deltaSeconds,
      timeSequence
    )
  }
// Wheel deltas are pixels, lines, or pages depending on the browser and device.
const WHEEL_LINE_PIXELS = 16
const WHEEL_PAGE_PIXELS = 800
// A 100px mouse-wheel notch moves 60 seconds before acceleration.
const WHEEL_BASE_SECONDS_PER_PIXEL = 0.6
// Scroll speed doubles for every 400px scrolled within one wheel gesture.
const WHEEL_DOUBLING_PIXELS = 400
// At full speed, 1500px of scrolling spans the whole timeline.
const WHEEL_FULL_RANGE_PIXELS = 1500

// Convert the dominant wheel axis into a signed pixel distance.
export function wheelDeltaPixels(event: WheelEvent) {
    const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY
    if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) return delta * WHEEL_LINE_PIXELS
    if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) return delta * WHEEL_PAGE_PIXELS
    return delta
  }

// Convert a wheel distance into seconds, accelerating with the distance already
// scrolled in the current gesture so mice and trackpads ramp up alike.
export function wheelScrubSeconds(
    deltaPixels: number,
    gesturePixels: number,
    timeSequence: number[]
  ) {
    const range = timeSequence[timeSequence.length - 1] - timeSequence[0]
    const maxSecondsPerPixel = Math.max(WHEEL_BASE_SECONDS_PER_PIXEL, range / WHEEL_FULL_RANGE_PIXELS)
    const secondsPerPixel = Math.min(
      maxSecondsPerPixel,
      WHEEL_BASE_SECONDS_PER_PIXEL * 2 ** (gesturePixels / WHEEL_DOUBLING_PIXELS)
    )
  
    return deltaPixels * secondsPerPixel
  }

// Find the nearest ping timestamp strictly before or after a timestamp.
export function adjacentPingTimestamp(
    timestampSeconds: number,
    pings: Array<{ timestamp: number }>,
    direction: number
  ) {
    const ping = direction > 0
      ? pings.find((candidate) => candidate.timestamp > timestampSeconds)
      : pings.findLast((candidate) => candidate.timestamp < timestampSeconds)
  
    return ping?.timestamp
  }

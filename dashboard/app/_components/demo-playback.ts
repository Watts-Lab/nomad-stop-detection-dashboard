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
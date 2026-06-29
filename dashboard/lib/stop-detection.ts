export type TrajectoryPing = {
  x: number
  y: number
  timestamp: number
}

export type DetectedStop = {
  index: number
  cluster: number
  x: number
  y: number
  start: number
  end: number
  duration: number
  nPings: number
  diameter: number
}

function distance(a: TrajectoryPing, b: TrajectoryPing): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function diameter(points: TrajectoryPing[]): number {
  return points.reduce(
    (maxDistance, point, index) => Math.max(
      maxDistance,
      ...points.slice(index + 1).map((candidate) => distance(point, candidate)),
    ),
    0,
  )
}

function updateDiameter(point: TrajectoryPing, points: TrajectoryPing[], currentDiameter: number): number {
  return points.reduce((maxDistance, candidate) => Math.max(maxDistance, distance(point, candidate)), currentDiameter)
}

export function lachesisLabels(
  pings: TrajectoryPing[],
  params: Record<string, number> | undefined,
): number[] {
  const dtMax = Number(params?.dt_max ?? 60) * 60
  const deltaRoam = Number(params?.delta_roam ?? 20)
  const durMin = Number(params?.dur_min ?? 5) * 60
  const labels = new Array(pings.length).fill(-1)
  let cluster = 0
  let i = 0

  while (i < pings.length - 1) {
    const startTime = pings[i].timestamp
    const jStar = pings.findIndex((ping, index) => index >= i && ping.timestamp - startTime >= durMin)
    if (jStar === -1) break

    let currentDiameter = diameter(pings.slice(i, jStar + 1))
    const hasLargeGap = pings.slice(i + 1, jStar + 1).some((ping, index) => ping.timestamp - pings[i + index].timestamp >= dtMax)
    if (hasLargeGap || currentDiameter > deltaRoam) {
      i += 1
      continue
    }

    let jFinal = jStar
    for (let j = jStar; j < pings.length; j += 1) {
      const nextDiameter = updateDiameter(pings[j], pings.slice(i, j), currentDiameter)
      const timeGap = pings[j].timestamp - pings[j - 1].timestamp
      if (nextDiameter > deltaRoam || timeGap > dtMax) {
        jFinal = j - 1
        break
      }
      currentDiameter = nextDiameter
      jFinal = j
    }

    if (Math.floor((pings[jFinal].timestamp - pings[i].timestamp) / 60) >= Number(params?.dur_min ?? 5)) {
      for (let index = i; index <= jFinal; index += 1) labels[index] = cluster
      cluster += 1
    }
    i = jFinal + 1
  }

  return labels
}

export function sequentialLabels(
  pings: TrajectoryPing[],
  params: Record<string, number> | undefined,
  method: "sliding" | "centroid",
): number[] {
  const deltaRoam = Number(params?.delta_roam ?? 100)
  const dtMax = Number(params?.dt_max ?? 15) * 60
  const durMin = Number(params?.dur_min ?? 5) * 60
  const labels = new Array(pings.length).fill(-1)
  let cluster = 0
  let i = 0

  while (i < pings.length) {
    let j = i + 1
    let anchor = pings[i]
    const startTime = pings[i].timestamp

    while (j < pings.length) {
      const timeGap = pings[j].timestamp - pings[j - 1].timestamp
      if (timeGap > dtMax || distance(pings[j], anchor) > deltaRoam) break

      if (method === "centroid") {
        anchor = {
          x: ((j - i) * anchor.x + pings[j].x) / (j - i + 1),
          y: ((j - i) * anchor.y + pings[j].y) / (j - i + 1),
          timestamp: anchor.timestamp,
        }
      }
      j += 1
    }

    if (pings[j - 1].timestamp - startTime >= durMin) {
      for (let index = i; index < j; index += 1) labels[index] = cluster
      cluster += 1
      i = j
    } else {
      i += 1
    }
  }

  return labels
}

export function stopsFromLabels(pings: TrajectoryPing[], labels: number[]): DetectedStop[] {
  return Array.from(new Set(labels.filter((label) => label >= 0))).map((cluster, index) => {
    const members = pings.filter((_ping, pingIndex) => labels[pingIndex] === cluster)
    const x = members.reduce((sum, ping) => sum + ping.x, 0) / members.length
    const y = members.reduce((sum, ping) => sum + ping.y, 0) / members.length
    return {
      index,
      cluster,
      x,
      y,
      start: members[0].timestamp,
      end: members[members.length - 1].timestamp,
      duration: Math.floor((members[members.length - 1].timestamp - members[0].timestamp) / 60),
      nPings: members.length,
      diameter: diameter(members),
    }
  })
}

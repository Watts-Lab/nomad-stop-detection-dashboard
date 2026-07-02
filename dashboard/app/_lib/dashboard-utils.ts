import { lachesisLabels, sequentialLabels } from "@/lib/stop-detection"
import { METRICS_RESULTS_FILE, PARAMETER_CONSTRAINTS } from "./dashboard-data"
import type { AlgorithmDefinition } from "./dashboard-data"
import type { CompareScene } from "./types"

export function prototypeChartSrc(algorithm: string, sweepParameter: string) {
  const field = sweepParameter || "delta_roam"
  const params = new URLSearchParams({
    x: field,
    field,
    data: METRICS_RESULTS_FILE[algorithm] ?? "lachesis_results.parquet",
  })
  return `/echarts-prototype/index.html?${params.toString()}`
}

export function validateAlgorithmParams(
  algoId: string,
  algoDef: AlgorithmDefinition,
  values: Record<string, string>,
) {
  const normalized: Record<string, number> = {}
  const errors: Record<string, string> = {}
  const constraints = PARAMETER_CONSTRAINTS[algoId] ?? {}

  for (const p of algoDef.parameters) {
    const constraint = constraints[p.name]
    const raw = values[p.name] ?? p.defaultValue
    const trimmed = raw.trim()
    const num = Number(trimmed)

    // Keep non-numeric fixed parameters (e.g., method='centroid') as informational only.
    if (!constraint && !Number.isFinite(num)) continue

    if (trimmed === "" || !Number.isFinite(num)) {
      errors[p.name] = "Enter a number."
      continue
    }

    if (constraint) {
      if (constraint.allowedValues && !constraint.allowedValues.includes(num)) {
        errors[p.name] = `Allowed values: ${constraint.allowedValues.join(", ")}`
        continue
      }
      if (num < constraint.min || num > constraint.max) {
        errors[p.name] = `Must be between ${constraint.min} and ${constraint.max}.`
        continue
      }
    }
    normalized[p.name] = num
  }
  return { normalized, errors }
}

export function paramInputValue(
  values: Record<string, string>,
  name: string,
  defaultValue: string,
) {
  return Object.prototype.hasOwnProperty.call(values, name) ? values[name] : defaultValue
}

export function darkenHex(hex: string, amount: number) {
  const color = hex.replace("#", "")
  const value = Number.parseInt(color, 16)
  const channel = (shift: number) => Math.max(0, Math.round(((value >> shift) & 255) * amount))
  return `#${[16, 8, 0].map((shift) => channel(shift).toString(16).padStart(2, "0")).join("")}`
}

export function distanceMeters(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

export function meanPoint(points: Array<{ x: number; y: number }>) {
  return {
    x: points.reduce((sum, point) => sum + point.x, 0) / Math.max(1, points.length),
    y: points.reduce((sum, point) => sum + point.y, 0) / Math.max(1, points.length),
  }
}

export function assignDemoClusters(
  algo: string,
  pings: CompareScene["pings"],
  params: Record<string, number> | undefined,
) {
  if (pings.length === 0) return []
  const labels = new Array(pings.length).fill(-1)
  const normalized = algo === "dbscan" || algo === "st-dbscan" ? "tadbscan" : algo

  if (normalized === "lachesis") return lachesisLabels(pings, params)
  if (normalized === "sequential-centroid") return sequentialLabels(pings, params, "centroid")
  if (normalized === "sequential-first") return sequentialLabels(pings, params, "sliding")

  if (normalized === "gridbased") {
    const cellSize = Math.max(20, Number(params?.cell_size ?? 100))
    const minTime = Math.max(1, Number(params?.min_time ?? 5)) * 60
    const minX = Math.min(...pings.map((ping) => ping.x))
    const minY = Math.min(...pings.map((ping) => ping.y))
    const groups = new Map<string, number[]>()
    pings.forEach((ping, index) => {
      const key = `${Math.floor((ping.x - minX) / cellSize)}:${Math.floor((ping.y - minY) / cellSize)}`
      groups.set(key, [...(groups.get(key) ?? []), index])
    })
    let cluster = 0
    for (const indexes of groups.values()) {
      const duration = pings[indexes[indexes.length - 1]].timestamp - pings[indexes[0]].timestamp
      if (indexes.length >= 2 && duration >= minTime) {
        indexes.forEach((index) => {
          labels[index] = cluster
        })
        cluster += 1
      }
    }
    return labels
  }

  const dist = Math.max(1, Number(params?.dist_thresh ?? params?.eps_spatial ?? 10))
  const timeThresh = Math.max(1, Number(params?.time_thresh ?? params?.T_max ?? 60)) * 60
  const minPts = Math.max(1, Number(params?.min_pts ?? params?.minPts ?? 2))
  const durMin = Math.max(0, Number(params?.dur_min ?? 5)) * 60
  let cluster = 0
  let current: number[] = [0]

  const commit = (indexes: number[]) => {
    if (indexes.length < minPts) return
    const duration = pings[indexes[indexes.length - 1]].timestamp - pings[indexes[0]].timestamp
    if (duration < durMin) return
    indexes.forEach((index) => {
      labels[index] = cluster
    })
    cluster += 1
  }

  for (let i = 1; i < pings.length; i += 1) {
    const centroid = meanPoint(current.map((index) => pings[index]))
    const gap = pings[i].timestamp - pings[i - 1].timestamp
    const multiplier = normalized === "tadbscan" ? 1.4 : normalized === "dbstop" ? 1.1 : 1.0
    if (gap <= timeThresh && distanceMeters(pings[i], centroid) <= dist * multiplier) {
      current.push(i)
    } else {
      commit(current)
      current = [i]
    }
  }
  commit(current)
  return labels
}

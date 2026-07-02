import { parquetReadObjects } from "hyparquet"
import { compressors } from "hyparquet-compressors"
import { publicPath } from "./public-path"
import type { CompareApiResponse, ComparePanelResponse, CompareScene } from "./types"

type ComparePayload = {
  seed?: number
  mode?: "single" | "compare"
  left?: {
    algo?: string
    params?: Record<string, number>
  }
  right?: {
    algo?: string
    params?: Record<string, number>
  }
}

type ManifestEntry = {
  display_name: string
  parameter_columns: string[]
  labels: string
  configs: string
  label_column_prefix: string
}

type Manifest = {
  config_key: string
  parameter_columns: Record<string, string>
  users: string[]
  files: Record<string, ManifestEntry>
}

type ConfigRow = {
  params: Record<string, number>
  label_column: string
  key: string
}

type SceneCache = {
  crs: string
  source: string
  bounds: [number, number, number, number]
  users: string[]
  buildings: CompareScene["buildings"]
  pings: Array<{
    ping_id: number
    user_id: string
    x: number
    y: number
    timestamp: number
  }>
  truth: Array<{
    user_id: string
    location: string | null
    timestamp: number
    duration: number
    x: number | null
    y: number | null
  }>
}

type SeedScene = {
  response: CompareScene
  orderedPingIds: number[]
}

const cacheRoot = publicPath("/cached-results/stop-detection-cache")

const algorithmDirectories: Record<string, string> = {
  lachesis: "lachesis",
  "sequential-centroid": "sequential_centroid",
  "sequential-first": "sequential_first",
  gridbased: "gridbased",
  tadbscan: "st_dbscan",
  dbstop: "dbstop",
  seqscan: "seqscan",
  hdbscan: "hdbscan",
}

const parameterAbbreviations: Record<string, string> = {
  cell_size: "cs",
  dist_thresh: "dt",
  delta_roam: "dr",
  dt_max: "dmx",
  dur_min: "dmn",
  time_thresh: "tt",
  min_pts: "mp",
  min_time: "mt",
  min_cluster_size: "mcs",
  eps_spatial: "dt",
  T_max: "tt",
  minPts: "mp",
}

let manifestPromise: Promise<Manifest> | null = null
let scenePromise: Promise<SceneCache> | null = null
let routesPromise: Promise<NonNullable<CompareScene["routes"]>> | null = null
const configCache = new Map<string, Promise<ConfigRow[]>>()
const labelCache = new Map<string, Promise<Map<number, Record<string, unknown>>>>()

async function fetchJson<T>(relativePath: string) {
  const response = await fetch(`${cacheRoot}/${relativePath}`)
  if (!response.ok) throw new Error(`Failed to load ${relativePath}`)
  return response.json() as Promise<T>
}

async function readParquet(relativePath: string) {
  const response = await fetch(`${cacheRoot}/${relativePath}`)
  if (!response.ok) throw new Error(`Failed to load ${relativePath}`)
  const buffer = await response.arrayBuffer()
  return parquetReadObjects({ file: buffer, compressors }) as Promise<Record<string, unknown>[]>
}

function loadManifest() {
  manifestPromise ??= fetchJson<Manifest>("manifest.json")
  return manifestPromise
}

function loadScene() {
  scenePromise ??= fetchJson<SceneCache>("scene.json")
  return scenePromise
}

function loadRoutes() {
  routesPromise ??= fetchJson<NonNullable<CompareScene["routes"]>>("routes.json")
  return routesPromise
}

function loadConfigs(algorithmDirectory: string, entry: ManifestEntry) {
  const cached = configCache.get(algorithmDirectory)
  if (cached) return cached

  const configs = readParquet(entry.configs).then((rows) => rows.map((row) => ({
    params: Object.fromEntries(
      entry.parameter_columns
        .map((column) => [column, Number(row[column])] as const)
        .filter(([, value]) => Number.isFinite(value)),
    ),
    label_column: String(row.label_column),
    key: String(row.key),
  })))
  configCache.set(algorithmDirectory, configs)
  return configs
}

function loadLabels(algorithmDirectory: string, entry: ManifestEntry) {
  const cached = labelCache.get(algorithmDirectory)
  if (cached) return cached

  const labels = readParquet(entry.labels).then((rows) => new Map(
    rows.map((row) => [Number(row.ping_id), row]),
  ))
  labelCache.set(algorithmDirectory, labels)
  return labels
}

function resolveConfig(entry: ManifestEntry, configs: ConfigRow[], params: Record<string, number>) {
  const requested = Object.fromEntries(
    Object.entries(params)
      .map(([name, value]) => [parameterAbbreviations[name], value] as const)
      .filter(([name, value]) => name && entry.parameter_columns.includes(name) && Number.isFinite(value)),
  )
  let best = configs[0]
  let bestDistance = Infinity

  for (const config of configs) {
    const distance = entry.parameter_columns.reduce((total, column) => (
      column in requested ? total + Math.abs(requested[column] - config.params[column]) : total
    ), 0)
    if (distance < bestDistance) {
      bestDistance = distance
      best = config
    }
  }
  return best
}

async function labelsForUser(algorithm: string, orderedPingIds: number[], params: Record<string, number>) {
  const manifest = await loadManifest()
  const algorithmDirectory = algorithmDirectories[algorithm] ?? algorithm
  const entry = manifest.files[algorithmDirectory]
  const [configs, labels] = await Promise.all([
    loadConfigs(algorithmDirectory, entry),
    loadLabels(algorithmDirectory, entry),
  ])
  const config = resolveConfig(entry, configs, params)

  return {
    labels: orderedPingIds.map((pingId) => Number(labels.get(pingId)?.[config.label_column] ?? -1)),
    configKey: config.key,
  }
}

function normalizeAlgorithm(input: string | undefined) {
  const normalized = (input ?? "").trim().toLowerCase()
  if (!normalized) return "dbstop"
  if (normalized === "dbscan" || normalized === "st-dbscan") return "tadbscan"
  return normalized
}

function prettyAlgorithmName(algorithm: string) {
  const names: Record<string, string> = {
    dbstop: "DBSTOP",
    lachesis: "Lachesis",
    "sequential-centroid": "Sequential (centroid-anchored)",
    "sequential-first": "Sequential (first-anchored)",
    seqscan: "SeqScan",
    tadbscan: "ST-DBSCAN",
    gridbased: "Grid-based",
    hdbscan: "HDBSCAN",
  }
  return names[algorithm] ?? algorithm.toUpperCase()
}

async function sceneForSeed(seed: number) {
  const [scene, routes] = await Promise.all([loadScene(), loadRoutes()])
  const user = scene.users[Math.abs(seed) % scene.users.length]
  const userPings = scene.pings
    .filter((ping) => ping.user_id === user)
    .sort((a, b) => a.timestamp - b.timestamp)
  const truth = scene.truth
    .filter((row) => row.user_id === user)
    .map((row) => ({
      location: row.location,
      timestamp: row.timestamp,
      duration: row.duration,
      x: row.x,
      y: row.y,
    }))
    .sort((a, b) => a.timestamp - b.timestamp)

  return {
    response: {
      crs: scene.crs,
      source: scene.source,
      user_id: user,
      bounds: scene.bounds,
      buildings: scene.buildings,
      pings: userPings.map((ping) => ({ x: ping.x, y: ping.y, timestamp: ping.timestamp })),
      truth,
      routes,
    },
    orderedPingIds: userPings.map((ping) => ping.ping_id),
  } satisfies SeedScene
}

async function buildPanel(algorithm: string | undefined, params: Record<string, number> | undefined, scene: SeedScene) {
  const normalized = normalizeAlgorithm(algorithm)
  const cachedLabels = await labelsForUser(normalized, scene.orderedPingIds, params ?? {})

  return {
    algo: normalized,
    title: prettyAlgorithmName(normalized),
    available: true,
    scene: scene.response,
    params: params ?? {},
    labels: cachedLabels.labels,
    configKey: cachedLabels.configKey,
  } satisfies ComparePanelResponse
}

export async function loadCompareData(payload: ComparePayload): Promise<CompareApiResponse> {
  const mode = payload.mode === "single" ? "single" : "compare"
  const seed = Number.isFinite(payload.seed) ? Number(payload.seed) : 1
  const scene = await sceneForSeed(seed)
  const result: CompareApiResponse = {
    seed,
    mode,
    left: await buildPanel(payload.left?.algo, payload.left?.params, scene),
  }

  if (mode === "compare") {
    result.right = await buildPanel(payload.right?.algo, payload.right?.params, scene)
  }
  return result
}

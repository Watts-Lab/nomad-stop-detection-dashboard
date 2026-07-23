import { parquetReadObjects } from "hyparquet"
import { compressors } from "hyparquet-compressors"
import { publicPath } from "./public-path"
import type { CompareApiResponse, ComparePanelResponse, CompareScene } from "./types"

type ComparePayload = {
  seed?: number
  trajectory?: string
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
  core_points?: string
}

type Manifest = {
  algorithm_keys: string[]
  algorithms: Record<string, ManifestEntry>
  users: string[]
  shared_files: { configs: string }
}

type ConfigsFile = {
  configs: Array<Record<string, unknown> & {
    algorithm: string
    config_id: number
    key: string
    label_column: string
  }>
}

type ConfigRow = {
  params: Record<string, number>
  config_id: number
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
  userId: string
  orderedTimestamps: number[]
}

const stopCacheRoot = publicPath("/cached-results/stop-detection-cache")
const defaultTrajectory = "two-stop"
const trajectoryDirectories = new Set([defaultTrajectory, "four-stop-high-ha", "four-stop-low-ha"])

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

const parameterAliases: Record<string, string> = {
  eps_spatial: "dist_thresh",
  T_max: "time_thresh",
  minPts: "min_pts",
}

const routesCache = new Map<string, Promise<NonNullable<CompareScene["routes"]>>>()
const manifestCache = new Map<string, Promise<Manifest>>()
const configsFileCache = new Map<string, Promise<ConfigsFile["configs"]>>()
const sceneCache = new Map<string, Promise<SceneCache>>()
const configCache = new Map<string, Promise<ConfigRow[]>>()
const labelCache = new Map<string, Promise<Map<string, Record<string, unknown>>>>()
const corePointCache = new Map<string, Promise<Map<string, Record<string, unknown>[]>>>()

function cacheRootForTrajectory(trajectory: string | undefined) {
  const trajectoryDirectory = trajectory && trajectoryDirectories.has(trajectory) ? trajectory : defaultTrajectory
  return stopCacheRoot + "/" + trajectoryDirectory
}

async function fetchJson<T>(cacheRoot: string, relativePath: string) {
  const response = await fetch(cacheRoot + "/" + relativePath)
  if (!response.ok) throw new Error("Failed to load " + relativePath)
  return response.json() as Promise<T>
}

async function readParquet(cacheRoot: string, relativePath: string) {
  const response = await fetch(cacheRoot + "/" + relativePath)
  if (!response.ok) throw new Error("Failed to load " + relativePath)
  const buffer = await response.arrayBuffer()
  return parquetReadObjects({ file: buffer, compressors }) as Promise<Record<string, unknown>[]>
}

function loadManifest(cacheRoot: string) {
  const cached = manifestCache.get(cacheRoot)
  if (cached) return cached

  const manifest = fetchJson<Manifest>(cacheRoot, "manifest.json")
  manifestCache.set(cacheRoot, manifest)
  return manifest
}

function loadConfigsFile(cacheRoot: string, manifest: Manifest) {
  const cached = configsFileCache.get(cacheRoot)
  if (cached) return cached

  const configs = fetchJson<ConfigsFile>(cacheRoot, manifest.shared_files.configs).then((file) => file.configs)
  configsFileCache.set(cacheRoot, configs)
  return configs
}

function loadScene(cacheRoot: string) {
  const cached = sceneCache.get(cacheRoot)
  if (cached) return cached

  const scene = fetchJson<SceneCache>(cacheRoot, "scene.json")
  sceneCache.set(cacheRoot, scene)
  return scene
}

function loadRoutes(cacheRoot: string) {
  const cached = routesCache.get(cacheRoot)
  if (cached) return cached

  const routes = Promise.all([
    fetchJson<NonNullable<CompareScene["routes"]>>(cacheRoot, "routes.json"),
    fetchJson<NonNullable<CompareScene["routes"]>>(stopCacheRoot, "routes.json"),
  ]).then(([trajectoryRoutes, sharedRoutes]) => ({
    ...trajectoryRoutes,
    streets: sharedRoutes.streets,
  }))
  routesCache.set(cacheRoot, routes)
  return routes
}

function loadConfigs(cacheRoot: string, algorithmDirectory: string, entry: ManifestEntry, manifest: Manifest) {
  const cacheKey = cacheRoot + "|" + algorithmDirectory
  const cached = configCache.get(cacheKey)
  if (cached) return cached

  const configs = loadConfigsFile(cacheRoot, manifest).then((rows) => rows
    .filter((row) => row.algorithm === algorithmDirectory)
    .map((row) => ({
      params: Object.fromEntries(
        entry.parameter_columns
          .map((column) => [column, Number(row[column])] as const)
          .filter(([, value]) => Number.isFinite(value)),
      ),
      config_id: Number(row.config_id),
      label_column: String(row.label_column),
      key: String(row.key),
    })))
  configCache.set(cacheKey, configs)
  return configs
}

function loadLabels(cacheRoot: string, algorithmDirectory: string, entry: ManifestEntry) {
  const cacheKey = cacheRoot + "|" + algorithmDirectory
  const cached = labelCache.get(cacheKey)
  if (cached) return cached

  const labels = readParquet(cacheRoot, entry.labels).then((rows) => new Map(
    rows.map((row) => [String(row.user_id) + "|" + Number(row.timestamp), row]),
  ))
  labelCache.set(cacheKey, labels)
  return labels
}

async function loadCorePoints(cacheRoot: string, algorithmDirectory: string, entry: ManifestEntry) {
  if (!entry.core_points) return new Map<string, Record<string, unknown>[]>()
  const cacheKey = cacheRoot + "|" + algorithmDirectory
  const cached = corePointCache.get(cacheKey)
  if (cached) return cached

  const corePoints = readParquet(cacheRoot, entry.core_points).then((rows) => {
    const grouped = new Map<string, Record<string, unknown>[]>()
    for (const row of rows) {
      const key = Number(row.config_id) + "|" + row.user_id
      const points = grouped.get(key)
      if (points) points.push(row)
      else grouped.set(key, [row])
    }
    return grouped
  })
  corePointCache.set(cacheKey, corePoints)
  return corePoints
}

function resolveConfig(entry: ManifestEntry, configs: ConfigRow[], params: Record<string, number>) {
  const requested = Object.fromEntries(
    Object.entries(params)
      .map(([name, value]) => [parameterAliases[name] ?? name, value] as const)
      .filter(([name, value]) => entry.parameter_columns.includes(name) && Number.isFinite(value)),
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

async function labelsForUser(
  cacheRoot: string,
  algorithm: string,
  userId: string,
  pings: CompareScene["pings"],
  orderedTimestamps: number[],
  params: Record<string, number>,
) {
  const manifest = await loadManifest(cacheRoot)
  const algorithmDirectory = algorithmDirectories[algorithm] ?? algorithm
  const entry = manifest.algorithms[algorithmDirectory]
  const [configs, labels, corePoints] = await Promise.all([
    loadConfigs(cacheRoot, algorithmDirectory, entry, manifest),
    loadLabels(cacheRoot, algorithmDirectory, entry),
    loadCorePoints(cacheRoot, algorithmDirectory, entry),
  ])
  const config = resolveConfig(entry, configs, params)
  const pingByTimestamp = new Map(pings.map((ping) => [ping.timestamp, ping]))

  return {
    labels: orderedTimestamps.map((timestamp) => Number(labels.get(userId + "|" + timestamp)?.[config.label_column] ?? -1)),
    corePoints: (corePoints.get(config.config_id + "|" + userId) ?? []).flatMap((row) => {
      const timestamp = Number(row.timestamp)
      const sourceTimestamp = Number(row.source_timestamp)
      const point = pingByTimestamp.get(timestamp)
      const sourcePoint = pingByTimestamp.get(sourceTimestamp)
      if (!point || !sourcePoint) return []
      return [{
        timestamp,
        role: String(row.role),
        sourceTimestamp,
        cluster: Number(row.cluster),
        x: point.x,
        y: point.y,
        sourceX: sourcePoint.x,
        sourceY: sourcePoint.y,
      }]
    }),
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

async function sceneForSeed(cacheRoot: string, seed: number) {
  const [scene, routes] = await Promise.all([loadScene(cacheRoot), loadRoutes(cacheRoot)])
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
    userId: user,
    orderedTimestamps: userPings.map((ping) => ping.timestamp),
  } satisfies SeedScene
}

async function buildPanel(
  cacheRoot: string,
  algorithm: string | undefined,
  params: Record<string, number> | undefined,
  scene: SeedScene,
) {
  const normalized = normalizeAlgorithm(algorithm)
  const cachedLabels = await labelsForUser(
    cacheRoot,
    normalized,
    scene.userId,
    scene.response.pings,
    scene.orderedTimestamps,
    params ?? {},
  )

  return {
    algo: normalized,
    title: prettyAlgorithmName(normalized),
    available: true,
    scene: scene.response,
    params: params ?? {},
    labels: cachedLabels.labels,
    corePoints: cachedLabels.corePoints,
    configKey: cachedLabels.configKey,
  } satisfies ComparePanelResponse
}

export async function loadCompareData(payload: ComparePayload): Promise<CompareApiResponse> {
  const mode = payload.mode === "single" ? "single" : "compare"
  const seed = Number.isFinite(payload.seed) ? Number(payload.seed) : 1
  const cacheRoot = cacheRootForTrajectory(payload.trajectory)
  const scene = await sceneForSeed(cacheRoot, seed)
  const result: CompareApiResponse = {
    seed,
    trajectory: payload.trajectory && trajectoryDirectories.has(payload.trajectory) ? payload.trajectory : defaultTrajectory,
    mode,
    left: await buildPanel(cacheRoot, payload.left?.algo, payload.left?.params, scene),
  }

  if (mode === "compare") {
    result.right = await buildPanel(cacheRoot, payload.right?.algo, payload.right?.params, scene)
  }
  return result
}

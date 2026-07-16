import { NextRequest, NextResponse } from "next/server"
import fs from "node:fs"
import path from "node:path"
import { asyncBufferFromFile, parquetReadObjects } from "hyparquet"
import { compressors } from "hyparquet-compressors"

export const runtime = "nodejs"

type ComparePayload = {
  seed?: number
  trajectory?: string
  mode?: "single" | "compare"
  left?: {
    algo?: string
    params?: Record<string, number>
    cmap?: string
  }
  right?: {
    algo?: string
    params?: Record<string, number>
    cmap?: string
  }
}

type CachedPanel = {
  title?: string
}

type CompareCache = {
  panels?: Record<string, CachedPanel>
}

type ComparePanelResponse = {
  algo: string
  title: string
  available: boolean
  scene?: CompareSceneResponse | null
  params?: Record<string, number>
  labels?: number[]
  corePoints?: CorePointResponse[]
  configKey?: string | null
}

type ManifestEntry = {
  display_name: string
  parameter_columns: string[]
  labels: string
  core_points?: string
}

type Manifest = {
  config_key: string
  algorithm_keys: string[]
  algorithms: Record<string, ManifestEntry>
  users: string[]
  shared_files: {
    scene: string
    routes: string
    configs: string
  }
}

// One row of the shared configs.json: swept params (full names) plus the wide
// labels.parquet column that stores this config's per-ping clusters.
type ConfigsFile = {
  configs: Array<Record<string, unknown> & { algorithm: string; key: string; label_column: string; config_id: number }>
}

type ConfigRow = {
  params: Record<string, number>
  config_id: number
  label_column: string
  key: string
}

type CorePointResponse = {
  timestamp: number
  role: string
  sourceTimestamp: number
  cluster: number
  x: number
  y: number
  sourceX: number
  sourceY: number
}

type SceneCache = {
  crs: string
  source: string
  bounds: [number, number, number, number]
  users: string[]
  buildings: Array<{
    id: string
    type: string
    rings: number[][][]
  }>
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

type RoutesCache = {
  crs: string
  source: string
  streets?: Array<{
    id: string
    coords: number[][]
  }>
  doors: Array<{
    id: string
    type: string
    door_cell_x: number
    door_cell_y: number
    x: number
    y: number
  }>
  routes: Array<{
    from: string
    to: string
    blocks: number[][]
    path: number[][]
  }>
}

type CompareSceneResponse = {
  crs: string
  source: string
  user_id: string
  bounds: [number, number, number, number]
  buildings: SceneCache["buildings"]
  pings: Array<Omit<SceneCache["pings"][number], "user_id">>
  truth: Array<Omit<SceneCache["truth"][number], "user_id">>
  routes?: RoutesCache | null
}

const CACHE_ROOT = process.env.CACHED_RESULTS_DIR
  ? path.resolve(process.env.CACHED_RESULTS_DIR)
  : path.resolve(process.cwd(), "..", "cached_results")

const STOP_CACHE_DIR = path.join(CACHE_ROOT, "stop-detection-cache")
const FOUR_STOP_CACHE_DIR = path.join(CACHE_ROOT, "four-stop-cache")
const DEFAULT_TRAJECTORY = "two-stop"
const TRAJECTORY_CACHE_DIRS: Record<string, string> = {
  [DEFAULT_TRAJECTORY]: STOP_CACHE_DIR,
  "four-stop-low-ha": path.join(FOUR_STOP_CACHE_DIR, "low_ha"),
  "four-stop-high-ha": path.join(FOUR_STOP_CACHE_DIR, "high_ha"),
}

// Maps the normalized demo algorithm id to its directory key inside the cache.
const ALGO_DIR: Record<string, string> = {
  lachesis: "lachesis",
  "sequential-centroid": "sequential_centroid",
  "sequential-first": "sequential_first",
  gridbased: "gridbased",
  tadbscan: "st_dbscan",
  dbstop: "dbstop",
  seqscan: "seqscan",
  hdbscan: "hdbscan",
}

// Synonyms used by some demo definitions; the cache columns are already the
// canonical parameter names, so most client params pass through unchanged.
const PARAM_ALIASES: Record<string, string> = {
  eps_spatial: "dist_thresh",
  T_max: "time_thresh",
  minPts: "min_pts",
}

function readJsonIfExists<T>(filePath: string): T | null {
  if (!fs.existsSync(filePath)) return null
  const raw = fs.readFileSync(filePath, "utf-8")
  return JSON.parse(raw) as T
}

const manifestCaches = new Map<string, Manifest | null>()
function loadManifest(cacheDir: string): Manifest | null {
  const cached = manifestCaches.get(cacheDir)
  if (cached !== undefined) return cached
  const manifest = readJsonIfExists<Manifest>(path.join(cacheDir, "manifest.json"))
  manifestCaches.set(cacheDir, manifest)
  return manifest
}

const configsFileCaches = new Map<string, ConfigsFile["configs"] | null>()
function loadConfigsFile(cacheDir: string, manifest: Manifest): ConfigsFile["configs"] | null {
  const cached = configsFileCaches.get(cacheDir)
  if (cached !== undefined) return cached
  const configs = readJsonIfExists<ConfigsFile>(path.join(cacheDir, manifest.shared_files.configs))?.configs ?? null
  configsFileCaches.set(cacheDir, configs)
  return configs
}

async function readParquet(cacheDir: string, relPath: string): Promise<Record<string, unknown>[] | null> {
  const file = path.join(cacheDir, relPath)
  if (!fs.existsSync(file)) return null
  const buffer = await asyncBufferFromFile(file)
  return parquetReadObjects({ file: buffer, compressors })
}

// `${cacheDir}|${algoDir}` -> config rows (params are numeric; bigint columns from parquet coerced).
const configCache = new Map<string, ConfigRow[]>()

function loadConfigs(cacheDir: string, algoDir: string, entry: ManifestEntry, manifest: Manifest): ConfigRow[] | null {
  const cacheKey = `${cacheDir}|${algoDir}`
  const cached = configCache.get(cacheKey)
  if (cached) return cached
  const allConfigs = loadConfigsFile(cacheDir, manifest)
  if (!allConfigs) return null
  const configs = allConfigs
    .filter((row) => row.algorithm === algoDir)
    .map((row) => ({
      params: Object.fromEntries(
        entry.parameter_columns
          .map((col) => [col, Number(row[col])] as const)
          .filter(([, value]) => Number.isFinite(value)),
      ),
      config_id: Number(row.config_id),
      label_column: String(row.label_column),
      key: String(row.key),
    }))
  configCache.set(cacheKey, configs)
  return configs
}

// `${cacheDir}|${algoDir}` -> (`${user_id}|${timestamp}` -> wide labels row of per-config cluster columns).
const labelCache = new Map<string, Map<string, Record<string, unknown>>>()

async function loadLabels(cacheDir: string, algoDir: string, entry: ManifestEntry): Promise<Map<string, Record<string, unknown>> | null> {
  const cacheKey = `${cacheDir}|${algoDir}`
  const cached = labelCache.get(cacheKey)
  if (cached) return cached
  const rows = await readParquet(cacheDir, entry.labels)
  if (!rows) return null
  const map = new Map<string, Record<string, unknown>>()
  for (const row of rows) map.set(`${row.user_id}|${Number(row.timestamp)}`, row)
  labelCache.set(cacheKey, map)
  return map
}

// `${cacheDir}|${algoDir}` -> (`${config_id}|${user_id}` -> compact core plotting rows).
const corePointCache = new Map<string, Map<string, Record<string, unknown>[]>>()

async function loadCorePoints(cacheDir: string, algoDir: string, entry: ManifestEntry): Promise<Map<string, Record<string, unknown>[]> | null> {
  if (!entry.core_points) return null
  const cacheKey = `${cacheDir}|${algoDir}`
  const cached = corePointCache.get(cacheKey)
  if (cached) return cached
  const rows = await readParquet(cacheDir, entry.core_points)
  if (!rows) return null
  const map = new Map<string, Record<string, unknown>[]>()
  for (const row of rows) {
    const key = `${Number(row.config_id)}|${row.user_id}`
    const existing = map.get(key)
    if (existing) existing.push(row)
    else map.set(key, [row])
  }
  corePointCache.set(cacheKey, map)
  return map
}

// Picks the config whose swept parameters are closest to the requested values.
function resolveConfig(entry: ManifestEntry, configs: ConfigRow[], params: Record<string, number>): ConfigRow | null {
  if (configs.length === 0) return null
  const requested: Record<string, number> = {}
  for (const [name, value] of Object.entries(params)) {
    const column = PARAM_ALIASES[name] ?? name
    if (entry.parameter_columns.includes(column) && Number.isFinite(value)) {
      requested[column] = value
    }
  }
  let best = configs[0]
  let bestDist = Infinity
  for (const config of configs) {
    let dist = 0
    for (const col of entry.parameter_columns) {
      if (!(col in requested)) continue
      const have = config.params[col]
      if (typeof have === "number") dist += Math.abs(requested[col] - have)
    }
    if (dist < bestDist) {
      bestDist = dist
      best = config
    }
  }
  return best
}

// Returns real per-ping cluster labels aligned to orderedTimestamps for one config.
async function labelsForUser(
  cacheDir: string,
  algo: string,
  userId: string,
  seedPings: CompareSceneResponse["pings"],
  orderedTimestamps: number[],
  params: Record<string, number>,
): Promise<{ labels: number[]; corePoints: CorePointResponse[]; configKey: string } | null> {
  const manifest = loadManifest(cacheDir)
  if (!manifest) return null
  const algoDir = ALGO_DIR[algo] ?? algo
  const entry = manifest.algorithms[algoDir]
  if (!entry) return null
  const configs = loadConfigs(cacheDir, algoDir, entry, manifest)
  if (!configs) return null
  const config = resolveConfig(entry, configs, params)
  if (!config) return null
  const index = await loadLabels(cacheDir, algoDir, entry)
  if (!index) return null
  const labels = orderedTimestamps.map((timestamp) => {
    const row = index.get(`${userId}|${timestamp}`)
    return row ? Number(row[config.label_column]) : -1
  })
  const corePointIndex = algoDir === "lachesis" ? null : await loadCorePoints(cacheDir, algoDir, entry)
  const coreRows = corePointIndex?.get(`${config.config_id}|${userId}`) ?? []
  const pingByTimestamp = new Map(seedPings.map((ping) => [ping.timestamp, ping]))
  const corePoints = coreRows.flatMap((row) => {
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
  })
  return { labels, corePoints, configKey: config.key }
}

function normalizeAlgo(input: string | undefined): string {
  const normalized = (input ?? "").trim().toLowerCase()
  if (!normalized) return "dbstop"
  if (normalized === "dbscan" || normalized === "st-dbscan") return "tadbscan"
  return normalized
}

function prettyAlgoName(algo: string): string {
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
  return names[algo] ?? algo.toUpperCase()
}

function cacheDirForTrajectory(trajectory: string | undefined): { id: string; cacheDir: string } {
  const id = trajectory ?? DEFAULT_TRAJECTORY
  const cacheDir = TRAJECTORY_CACHE_DIRS[id]
  if (!cacheDir) throw new Error(`Unknown trajectory cache: ${id}`)
  return { id, cacheDir }
}

// The selected user and its ordered ping timestamps are kept alongside the client
// scene so labels can be joined by (user_id, timestamp) server-side.
type SeedScene = { response: CompareSceneResponse; userId: string; orderedTimestamps: number[] }

function sceneForSeed(cacheDir: string, manifest: Manifest, seed: number): SeedScene | null {
  const scenePath = path.join(cacheDir, manifest.shared_files.scene)
  const scene = readJsonIfExists<SceneCache>(scenePath)
  const routes = readJsonIfExists<RoutesCache>(path.join(cacheDir, manifest.shared_files.routes))
  if (!scene || scene.users.length === 0) return null

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

  if (userPings.length === 0) return null
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
  }
}

async function buildPanel(
  cacheDir: string,
  algo: string,
  params: Record<string, number> | undefined,
  cache: CompareCache | null,
  seed: SeedScene | null,
): Promise<ComparePanelResponse> {
  const normalized = normalizeAlgo(algo)
  const fromCache = cache?.panels?.[normalized]
  const cachedLabels = seed ? await labelsForUser(cacheDir, normalized, seed.userId, seed.response.pings, seed.orderedTimestamps, params ?? {}) : null
  if (!seed) throw new Error(`Missing scene cache in ${cacheDir}`)
  if (!cachedLabels) throw new Error(`Missing labels cache for ${normalized} in ${cacheDir}`)

  return {
    algo: normalized,
    title: fromCache?.title ?? prettyAlgoName(normalized),
    available: Boolean(seed),
    scene: seed?.response ?? null,
    params: params ?? {},
    labels: cachedLabels?.labels,
    corePoints: cachedLabels?.corePoints,
    configKey: cachedLabels?.configKey ?? null,
  }
}

export async function POST(req: NextRequest) {
  try {
    const payload = (await req.json()) as ComparePayload
    const cachePath = path.join(CACHE_ROOT, "algorithm-compare", "default.json")
    const cache = readJsonIfExists<CompareCache>(cachePath)

    const mode = payload.mode === "single" ? "single" : "compare"
    const seed = Number.isFinite(payload.seed) ? Number(payload.seed) : 1
    const { id: trajectory, cacheDir } = cacheDirForTrajectory(payload.trajectory)
    const manifest = loadManifest(cacheDir)
    if (!manifest) throw new Error(`Missing manifest cache in ${cacheDir}`)
    const leftAlgo = normalizeAlgo(payload.left?.algo)
    const rightAlgo = normalizeAlgo(payload.right?.algo)
    const scene = sceneForSeed(cacheDir, manifest, seed)

    const body: {
      seed: number
      trajectory: string
      mode: "single" | "compare"
      left: ComparePanelResponse
      right?: ComparePanelResponse
    } = {
      seed,
      trajectory,
      mode,
      left: await buildPanel(cacheDir, leftAlgo, payload.left?.params, cache, scene),
    }

    if (mode === "compare") {
      body.right = await buildPanel(cacheDir, rightAlgo, payload.right?.params, cache, scene)
    }

    return NextResponse.json(body)
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load cached compare result"
    return NextResponse.json({ error: message }, { status: 400 })
  }
}

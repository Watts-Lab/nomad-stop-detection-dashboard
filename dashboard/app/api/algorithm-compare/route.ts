import { NextRequest, NextResponse } from "next/server"
import fs from "node:fs"
import path from "node:path"
import { asyncBufferFromFile, parquetReadObjects } from "hyparquet"
import { compressors } from "hyparquet-compressors"

export const runtime = "nodejs"

type ComparePayload = {
  seed?: number
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
  configKey?: string | null
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

// One config row from configs.parquet: swept params (by abbreviated column) mapped
// to the wide labels.parquet column that stores this config's per-ping clusters.
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
  buildings: Array<{
    id: string
    type: string
    rings: number[][][]
  }>
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

type RoutesCache = {
  crs: string
  source: string
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
  pings: Array<Omit<SceneCache["pings"][number], "user_id" | "ping_id">>
  truth: Array<Omit<SceneCache["truth"][number], "user_id">>
  routes?: RoutesCache | null
}

const CACHE_ROOT = process.env.CACHED_RESULTS_DIR
  ? path.resolve(process.env.CACHED_RESULTS_DIR)
  : path.resolve(process.cwd(), "..", "cached_results")

const STOP_CACHE_DIR = path.join(CACHE_ROOT, "stop-detection-cache")

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

// Maps the parameter names the client sends to the abbreviated cache columns.
const PARAM_ABBREV: Record<string, string> = {
  cell_size: "cs",
  dist_thresh: "dt",
  delta_roam: "dr",
  dt_max: "dmx",
  dur_min: "dmn",
  time_thresh: "tt",
  min_pts: "mp",
  min_time: "mt",
  min_cluster_size: "mcs",
  // Synonyms used by some demo definitions.
  eps_spatial: "dt",
  T_max: "tt",
  minPts: "mp",
}

function readJsonIfExists<T>(filePath: string): T | null {
  if (!fs.existsSync(filePath)) return null
  const raw = fs.readFileSync(filePath, "utf-8")
  return JSON.parse(raw) as T
}

let manifestCache: Manifest | null | undefined
function loadManifest(): Manifest | null {
  if (manifestCache === undefined) {
    manifestCache = readJsonIfExists<Manifest>(path.join(STOP_CACHE_DIR, "manifest.json"))
  }
  return manifestCache
}

async function readParquet(relPath: string): Promise<Record<string, unknown>[] | null> {
  const file = path.join(STOP_CACHE_DIR, relPath)
  if (!fs.existsSync(file)) return null
  const buffer = await asyncBufferFromFile(file)
  return parquetReadObjects({ file: buffer, compressors })
}

// algoDir -> config rows (params are numeric; bigint columns from parquet coerced).
const configCache = new Map<string, ConfigRow[]>()

async function loadConfigs(algoDir: string, entry: ManifestEntry): Promise<ConfigRow[] | null> {
  const cached = configCache.get(algoDir)
  if (cached) return cached
  const rows = await readParquet(entry.configs)
  if (!rows) return null
  const configs = rows.map((row) => ({
    params: Object.fromEntries(
      entry.parameter_columns
        .map((col) => [col, Number(row[col])] as const)
        .filter(([, value]) => Number.isFinite(value)),
    ),
    label_column: String(row.label_column),
    key: String(row.key),
  }))
  configCache.set(algoDir, configs)
  return configs
}

// algoDir -> (ping_id -> wide labels row of `${prefix}NNN` cluster columns).
const labelCache = new Map<string, Map<number, Record<string, unknown>>>()

async function loadLabels(algoDir: string, entry: ManifestEntry): Promise<Map<number, Record<string, unknown>> | null> {
  const cached = labelCache.get(algoDir)
  if (cached) return cached
  const rows = await readParquet(entry.labels)
  if (!rows) return null
  const map = new Map<number, Record<string, unknown>>()
  for (const row of rows) map.set(Number(row.ping_id), row)
  labelCache.set(algoDir, map)
  return map
}

// Picks the config whose swept parameters are closest to the requested values.
function resolveConfig(entry: ManifestEntry, configs: ConfigRow[], params: Record<string, number>): ConfigRow | null {
  if (configs.length === 0) return null
  const requested: Record<string, number> = {}
  for (const [name, value] of Object.entries(params)) {
    const abbrev = PARAM_ABBREV[name]
    if (abbrev && entry.parameter_columns.includes(abbrev) && Number.isFinite(value)) {
      requested[abbrev] = value
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

// Returns real per-ping cluster labels aligned to orderedPingIds for one config.
async function labelsForUser(
  algo: string,
  orderedPingIds: number[],
  params: Record<string, number>,
): Promise<{ labels: number[]; configKey: string } | null> {
  const manifest = loadManifest()
  if (!manifest) return null
  const algoDir = ALGO_DIR[algo] ?? algo
  const entry = manifest.files[algoDir]
  if (!entry) return null
  const configs = await loadConfigs(algoDir, entry)
  if (!configs) return null
  const config = resolveConfig(entry, configs, params)
  if (!config) return null
  const index = await loadLabels(algoDir, entry)
  if (!index) return null
  const labels = orderedPingIds.map((pingId) => {
    const row = index.get(pingId)
    return row ? Number(row[config.label_column]) : -1
  })
  return { labels, configKey: config.key }
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

// Ordered ping_ids are kept alongside the client scene so labels can be joined by
// ping_id server-side; the client scene itself omits ping_id.
type SeedScene = { response: CompareSceneResponse; orderedPingIds: number[] }

function sceneForSeed(seed: number): SeedScene | null {
  const scenePath = path.join(STOP_CACHE_DIR, "scene.json")
  const routesPath = path.join(STOP_CACHE_DIR, "routes.json")
  const scene = readJsonIfExists<SceneCache>(scenePath)
  const routes = readJsonIfExists<RoutesCache>(routesPath)
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
    orderedPingIds: userPings.map((ping) => ping.ping_id),
  }
}

async function buildPanel(
  algo: string,
  params: Record<string, number> | undefined,
  cache: CompareCache | null,
  seed: SeedScene | null,
): Promise<ComparePanelResponse> {
  const normalized = normalizeAlgo(algo)
  const fromCache = cache?.panels?.[normalized]
  const cachedLabels = seed ? await labelsForUser(normalized, seed.orderedPingIds, params ?? {}) : null

  return {
    algo: normalized,
    title: fromCache?.title ?? prettyAlgoName(normalized),
    available: Boolean(seed),
    scene: seed?.response ?? null,
    params: params ?? {},
    labels: cachedLabels?.labels,
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
    const leftAlgo = normalizeAlgo(payload.left?.algo)
    const rightAlgo = normalizeAlgo(payload.right?.algo)
    const scene = sceneForSeed(seed)

    const body: {
      seed: number
      mode: "single" | "compare"
      left: ComparePanelResponse
      right?: ComparePanelResponse
    } = {
      seed,
      mode,
      left: await buildPanel(leftAlgo, payload.left?.params, cache, scene),
    }

    if (mode === "compare") {
      body.right = await buildPanel(rightAlgo, payload.right?.params, cache, scene)
    }

    return NextResponse.json(body)
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load cached compare result"
    return NextResponse.json({ error: message }, { status: 400 })
  }
}

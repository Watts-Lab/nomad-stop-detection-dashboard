import { NextRequest, NextResponse } from "next/server"
import fs from "node:fs"
import path from "node:path"

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

type ManifestConfig = {
  key: string
  params: Record<string, number | string | boolean>
}

type ManifestEntry = {
  display_name: string
  parameter_columns: string[]
  labels: string
  stops: string
  metrics: string
  configs: ManifestConfig[]
}

type Manifest = {
  config_key: string
  parameter_columns: Record<string, string>
  users: string[]
  files: Record<string, ManifestEntry>
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

// Picks the cached config whose swept parameters are closest to the requested values.
function resolveConfigKey(entry: ManifestEntry, params: Record<string, number>): string | null {
  if (entry.configs.length === 0) return null
  const requested: Record<string, number> = {}
  for (const [name, value] of Object.entries(params)) {
    const abbrev = PARAM_ABBREV[name]
    if (abbrev && entry.parameter_columns.includes(abbrev) && Number.isFinite(value)) {
      requested[abbrev] = value
    }
  }
  let best = entry.configs[0]
  let bestDist = Infinity
  for (const config of entry.configs) {
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
  return best.key
}

// algoDir -> (`${user}|${key}` -> rows sorted by timestamp as [timestamp, cluster])
const labelIndexCache = new Map<string, Map<string, Array<[number, number]>>>()

function loadLabelIndex(algoDir: string, relPath: string): Map<string, Array<[number, number]>> | null {
  const cached = labelIndexCache.get(algoDir)
  if (cached) return cached
  const file = path.join(STOP_CACHE_DIR, relPath)
  if (!fs.existsSync(file)) return null
  const raw = fs.readFileSync(file, "utf-8")
  const lines = raw.split("\n")
  if (lines.length < 2) return null
  const header = lines[0].split(",")
  const tIdx = header.indexOf("timestamp")
  const uIdx = header.indexOf("user_id")
  const kIdx = header.indexOf("key")
  const cIdx = header.indexOf("cluster")
  if (tIdx < 0 || uIdx < 0 || kIdx < 0 || cIdx < 0) return null
  const map = new Map<string, Array<[number, number]>>()
  for (let i = 1; i < lines.length; i += 1) {
    const line = lines[i]
    if (!line) continue
    const cols = line.split(",")
    const mapKey = `${cols[uIdx]}|${cols[kIdx]}`
    let arr = map.get(mapKey)
    if (!arr) {
      arr = []
      map.set(mapKey, arr)
    }
    arr.push([Number(cols[tIdx]), Number(cols[cIdx])])
  }
  labelIndexCache.set(algoDir, map)
  return map
}

// Returns real per-ping cluster labels (ordered by timestamp) for one user + config.
function labelsForUser(
  algo: string,
  user: string,
  params: Record<string, number>,
): { labels: number[]; configKey: string } | null {
  const manifest = loadManifest()
  if (!manifest) return null
  const algoDir = ALGO_DIR[algo] ?? algo
  const entry = manifest.files[algoDir]
  if (!entry) return null
  const configKey = resolveConfigKey(entry, params)
  if (!configKey) return null
  const index = loadLabelIndex(algoDir, entry.labels)
  if (!index) return null
  const rows = index.get(`${user}|${configKey}`)
  if (!rows || rows.length === 0) return null
  const labels = rows
    .slice()
    .sort((a, b) => a[0] - b[0])
    .map((row) => row[1])
  return { labels, configKey }
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

function sceneForSeed(seed: number): CompareSceneResponse | null {
  const scenePath = path.join(STOP_CACHE_DIR, "scene.json")
  const routesPath = path.join(STOP_CACHE_DIR, "routes.json")
  const scene = readJsonIfExists<SceneCache>(scenePath)
  const routes = readJsonIfExists<RoutesCache>(routesPath)
  if (!scene || scene.users.length === 0) return null

  const user = scene.users[Math.abs(seed) % scene.users.length]
  const pings = scene.pings
    .filter((ping) => ping.user_id === user)
    .map((ping) => ({ x: ping.x, y: ping.y, timestamp: ping.timestamp }))
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

  if (pings.length === 0) return null
  return {
    crs: scene.crs,
    source: scene.source,
    user_id: user,
    bounds: scene.bounds,
    buildings: scene.buildings,
    pings,
    truth,
    routes,
  }
}

function buildPanel(
  algo: string,
  params: Record<string, number> | undefined,
  cache: CompareCache | null,
  scene: CompareSceneResponse | null,
): ComparePanelResponse {
  const normalized = normalizeAlgo(algo)
  const fromCache = cache?.panels?.[normalized]
  const cachedLabels = scene ? labelsForUser(normalized, scene.user_id, params ?? {}) : null

  return {
    algo: normalized,
    title: fromCache?.title ?? prettyAlgoName(normalized),
    available: Boolean(scene),
    scene,
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
      left: buildPanel(leftAlgo, payload.left?.params, cache, scene),
    }

    if (mode === "compare") {
      body.right = buildPanel(rightAlgo, payload.right?.params, cache, scene)
    }

    return NextResponse.json(body)
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load cached compare result"
    return NextResponse.json({ error: message }, { status: 400 })
  }
}

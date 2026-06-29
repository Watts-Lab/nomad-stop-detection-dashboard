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
  animation_data_url?: string | null
}

type CompareCache = {
  fallback_animation?: string
  panels?: Record<string, CachedPanel>
}

type ComparePanelResponse = {
  algo: string
  title: string
  available: boolean
  animation_data_url: string | null
  scene?: CompareSceneResponse | null
  params?: Record<string, number>
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

type CompareSceneResponse = {
  crs: string
  source: string
  user_id: string
  bounds: [number, number, number, number]
  buildings: SceneCache["buildings"]
  pings: Array<Omit<SceneCache["pings"][number], "user_id">>
  truth: Array<Omit<SceneCache["truth"][number], "user_id">>
}

const CACHE_ROOT = process.env.CACHED_RESULTS_DIR
  ? path.resolve(process.env.CACHED_RESULTS_DIR)
  : path.resolve(process.cwd(), "..", "cached_results")

const DEFAULT_FALLBACK_ANIMATION = "/issue-images/ground-truth-placeholder.svg"

function readJsonIfExists<T>(filePath: string): T | null {
  if (!fs.existsSync(filePath)) return null
  const raw = fs.readFileSync(filePath, "utf-8")
  return JSON.parse(raw) as T
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
  const scenePath = path.join(CACHE_ROOT, "algorithm-compare", "scene.json")
  const scene = readJsonIfExists<SceneCache>(scenePath)
  if (!scene || scene.users.length === 0) return null

  const user = scene.users[Math.abs(seed) % scene.users.length]
  const pings = scene.pings
    .filter((ping) => ping.user_id === user)
    .map(({ user_id: _user_id, ...ping }) => ping)
    .sort((a, b) => a.timestamp - b.timestamp)
  const truth = scene.truth
    .filter((row) => row.user_id === user)
    .map(({ user_id: _user_id, ...row }) => row)
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
  const fallbackAnimation = cache?.fallback_animation ?? DEFAULT_FALLBACK_ANIMATION
  const animation = fromCache?.animation_data_url ?? fallbackAnimation

  return {
    algo: normalized,
    title: fromCache?.title ?? prettyAlgoName(normalized),
    available: Boolean(scene || animation),
    animation_data_url: animation,
    scene,
    params: params ?? {},
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

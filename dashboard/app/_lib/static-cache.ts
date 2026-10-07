/*
LOADS & CACHES PRECOMPUTED TRAJECTORY, GROUND-TRUTH, AND ALGO RESULTS FROM JSON/PARQUET FILES
ASSEMBLE INTO DATA USED BY DEMO/COMPARE
*/

import {
  asyncBufferFromUrl,
  cachedAsyncBuffer,
  parquetReadObjects,
  type ParquetQueryFilter,
} from "hyparquet"
import { compressors } from "hyparquet-compressors"
import { publicPath } from "./public-path"
import type {
  AlignedStopResult,
  CompareApiResponse,
  ComparePanelResponse,
  CompareScene,
} from "./types"

type ComparePayload = {
  seed?: number
  userId?: string
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
  result_kind: AlignedStopResult["kind"]
  configs: string
  results: string
}

type Manifest = {
  format: string
  algorithms: Record<string, ManifestEntry>
  users: string[]
  shared_files: {
    scene: string
    routes: string
    trajectory: string
    diary: string
  }
}

type ConfigsFile = {
  configs: ConfigRow[]
}

type ConfigRow = {
  params: Record<string, number | string | boolean | null>
  config_id: number
}

type SceneCache = Pick<CompareScene, "crs" | "source" | "bounds" | "buildings" | "destinationDiary">

type SeedScene = {
  response: CompareScene
  userIndex: number
}

type ParquetSelection = {
  columns?: string[]
  rowStart?: number
  rowEnd?: number
  filter?: ParquetQueryFilter
}

const stopCacheRoot = publicPath("/cached-results/stop-detection-cache")
const defaultTrajectory = "two-stop"
const trajectoryDirectories = new Set([defaultTrajectory, "four-stop-high-ha", "four-stop-low-ha", "commute-return"])

const manifestCache = new Map<string, Promise<Manifest>>()
const configsFileCache = new Map<string, Promise<ConfigRow[]>>()
const sceneCache = new Map<string, Promise<SceneCache>>()
const routeCache = new Map<string, Promise<NonNullable<CompareScene["routes"]>>>()
let diaryCache: { key: string; value: Promise<CompareScene["truth"]> } | undefined
let trajectoryCache: { key: string; value: Promise<CompareScene["pings"]> } | undefined
const resultCache = new Map<string, { key: string; value: Promise<Record<string, unknown>[]> }>()
const parquetFileCache = new Map<string, ReturnType<typeof asyncBufferFromUrl>>()

function cacheRootForTrajectory(trajectory: string | undefined) {
  const trajectoryDirectory = trajectory && trajectoryDirectories.has(trajectory) ? trajectory : defaultTrajectory
  return stopCacheRoot + "/" + trajectoryDirectory
}

async function fetchJson<T>(cacheRoot: string, relativePath: string) {
  const response = await fetch(cacheRoot + "/" + relativePath)
  if (!response.ok) throw new Error("Failed to load " + relativePath)
  return response.json() as Promise<T>
}

async function readParquet(cacheRoot: string, relativePath: string, selection: ParquetSelection = {}) {
  const url = cacheRoot + "/" + relativePath
  let file = parquetFileCache.get(url)
  if (!file) {
    file = asyncBufferFromUrl({ url }).then((buffer) => cachedAsyncBuffer(buffer))
    parquetFileCache.set(url, file)
  }
  return parquetReadObjects({ file: await file, compressors, ...selection })
}

function loadManifest(cacheRoot: string) {
  const cached = manifestCache.get(cacheRoot)
  if (cached) return cached

  const manifest = fetchJson<Manifest>(cacheRoot, "manifest.json").then((value) => {
    if (value.format !== "stop-detection-dashboard-parquet-cache-v4") {
      throw new Error("Unsupported stop-detection cache format: " + value.format)
    }
    return value
  })
  manifestCache.set(cacheRoot, manifest)
  return manifest
}

function loadConfigs(cacheRoot: string, relativePath: string) {
  const cacheKey = cacheRoot + "|" + relativePath
  const cached = configsFileCache.get(cacheKey)
  if (cached) return cached

  const configs = fetchJson<ConfigsFile>(cacheRoot, relativePath).then((file) => file.configs)
  configsFileCache.set(cacheKey, configs)
  return configs
}

function loadScene(cacheRoot: string, manifest: Manifest) {
  const cached = sceneCache.get(cacheRoot)
  if (cached) return cached

  const scene = fetchJson<SceneCache>(cacheRoot, manifest.shared_files.scene)
  sceneCache.set(cacheRoot, scene)
  return scene
}

function loadRoutes(cacheRoot: string, manifest: Manifest) {
  const cached = routeCache.get(cacheRoot)
  if (cached) return cached

  const routes = fetchJson<NonNullable<CompareScene["routes"]>>(cacheRoot, manifest.shared_files.routes)
  routeCache.set(cacheRoot, routes)
  return routes
}

function loadDiary(cacheRoot: string, manifest: Manifest, userId: string) {
  const cacheKey = cacheRoot + "|" + userId
  if (diaryCache?.key === cacheKey) return diaryCache.value

  const diary = readParquet(cacheRoot, manifest.shared_files.diary, {
    columns: ["user_id", "location", "timestamp", "duration", "x", "y"],
    filter: { user_id: { $eq: userId } },
  }).then((rows) => rows.map((row) => {
    if (String(row.user_id) !== userId) throw new Error("Cached diary row does not match selected user " + userId)
    return {
      location: row.location == null ? null : String(row.location),
      timestamp: Number(row.timestamp),
      duration: Number(row.duration),
      x: row.x == null ? null : Number(row.x),
      y: row.y == null ? null : Number(row.y),
    }
  }))
  diaryCache = { key: cacheKey, value: diary }
  return diary
}

function loadTrajectory(cacheRoot: string, manifest: Manifest, userId: string, userIndex: number) {
  const cacheKey = cacheRoot + "|" + userIndex
  if (trajectoryCache?.key === cacheKey) return trajectoryCache.value

  const pings = readParquet(cacheRoot, manifest.shared_files.trajectory, {
    columns: ["user_id", "timestamp", "x", "y"],
    rowStart: userIndex,
    rowEnd: userIndex + 1,
  }).then((rows) => {
    if (rows.length !== 1 || String(rows[0].user_id) !== userId) {
      throw new Error("Cached trajectory row does not match selected user " + userId)
    }
    const timestamps = listValues(rows[0].timestamp, "timestamp").map(Number)
    const x = listValues(rows[0].x, "x", timestamps.length).map(Number)
    const y = listValues(rows[0].y, "y", timestamps.length).map(Number)
    return timestamps.map((timestamp, index) => ({ timestamp, x: x[index], y: y[index] }))
  })
  trajectoryCache = { key: cacheKey, value: pings }
  return pings
}

function loadResults(
  cacheRoot: string,
  algorithm: string,
  resultsPath: string,
  resultKind: AlignedStopResult["kind"],
  userId: string,
  userIndex: number,
  configCount: number,
) {
  const cacheKey = cacheRoot + "|" + algorithm + "|" + userIndex
  const cached = resultCache.get(algorithm)
  if (cached?.key === cacheKey) return cached.value

  const rowStart = userIndex * configCount
  const columns = ["user_id", "config_id", "cluster"]
  if (resultKind === "density") columns.push("core", "aux_time")
  if (resultKind === "anchor") columns.push("aux_time")
  const results = readParquet(cacheRoot, resultsPath, {
    columns,
    rowStart,
    rowEnd: rowStart + configCount,
  }).then((rows) => {
    if (rows.length !== configCount || rows.some((row) => String(row.user_id) !== userId)) {
      throw new Error("Cached results do not match selected user " + userId)
    }
    return rows
  })
  resultCache.set(algorithm, { key: cacheKey, value: results })
  return results
}

function resolveConfig(configs: ConfigRow[], params: Record<string, number>) {
  const requested = Object.entries(params)
  if (requested.some(([, value]) => !Number.isFinite(value))) {
    throw new Error("Stop-detection parameters must be finite numbers")
  }
  const matches = configs.filter((config) => requested.every(
    ([name, value]) => Object.is(config.params[name], value),
  ))
  if (matches.length === 0) throw new Error("No cached configuration matches the requested parameters")
  if (matches.length > 1) throw new Error("Requested parameters match multiple cached configurations")
  return matches[0]
}

function listValues(value: unknown, field: string, expectedLength?: number) {
  if (value == null) throw new Error("Cached row is missing required list field: " + field)
  const values = Array.from(value as ArrayLike<unknown>)
  if (expectedLength !== undefined && values.length !== expectedLength) {
    throw new Error("Cached " + field + " is not aligned with the selected trajectory")
  }
  return values
}

async function resultForUser(
  cacheRoot: string,
  algorithm: string,
  userId: string,
  userIndex: number,
  trajectoryLength: number,
  params: Record<string, number>,
) {
  const manifest = await loadManifest(cacheRoot)
  const entry = manifest.algorithms[algorithm]
  if (!entry) throw new Error("Unknown stop-detection algorithm: " + algorithm)

  const configs = await loadConfigs(cacheRoot, entry.configs)
  const config = resolveConfig(configs, params)
  const rows = await loadResults(
    cacheRoot,
    algorithm,
    entry.results,
    entry.result_kind,
    userId,
    userIndex,
    configs.length,
  )
  const row = rows.find((candidate) => Number(candidate.config_id) === config.config_id)
  if (!row) throw new Error("Cached result is missing config_id " + config.config_id)

  const cluster = listValues(row.cluster, "cluster", trajectoryLength).map(Number)
  let result: AlignedStopResult
  if (entry.result_kind === "density") {
    const core = listValues(row.core, "core", trajectoryLength).map(Number)
    const aux_time = listValues(row.aux_time, "aux_time", trajectoryLength).map(
      (value) => value == null ? null : Number(value),
    )
    result = { kind: "density", cluster, core, aux_time }
  } else if (entry.result_kind === "anchor") {
    const aux_time = listValues(row.aux_time, "aux_time", trajectoryLength).map(
      (value) => value == null ? null : Number(value),
    )
    result = { kind: "anchor", cluster, aux_time }
  } else if (entry.result_kind === "labels") {
    result = { kind: "labels", cluster }
  } else {
    throw new Error("Unsupported result kind for " + algorithm + ": " + entry.result_kind)
  }
  return { displayName: entry.display_name, result }
}

async function sceneForSeed(cacheRoot: string, seed: number, requestedUserId?: string) {
  const manifest = await loadManifest(cacheRoot)
  const userId = requestedUserId && manifest.users.includes(requestedUserId)
    ? requestedUserId
    : manifest.users[Math.abs(seed) % manifest.users.length]
  const userIndex = manifest.users.indexOf(userId)
  const [scene, routes, pings, diary] = await Promise.all([
    loadScene(cacheRoot, manifest),
    loadRoutes(cacheRoot, manifest),
    loadTrajectory(cacheRoot, manifest, userId, userIndex),
    loadDiary(cacheRoot, manifest, userId),
  ])
  return {
    response: {
      crs: scene.crs,
      source: scene.source,
      user_id: userId,
      bounds: scene.bounds,
      buildings: scene.buildings,
      destinationDiary: scene.destinationDiary,
      pings,
      truth: diary,
      routes,
    },
    userIndex,
  } satisfies SeedScene
}

async function buildPanel(
  cacheRoot: string,
  algorithm: string | undefined,
  params: Record<string, number> | undefined,
  scene: SeedScene,
) {
  const algorithmId = algorithm ?? "dbstop"
  const cachedResult = await resultForUser(
    cacheRoot,
    algorithmId,
    scene.response.user_id,
    scene.userIndex,
    scene.response.pings.length,
    params ?? {},
  )

  return {
    algo: algorithmId,
    title: cachedResult.displayName,
    scene: scene.response,
    params: params ?? {},
    result: cachedResult.result,
  } satisfies ComparePanelResponse
}

export async function loadCompareData(payload: ComparePayload): Promise<CompareApiResponse> {
  const mode = payload.mode === "single" ? "single" : "compare"
  const seed = Number.isFinite(payload.seed) ? Number(payload.seed) : 1
  const cacheRoot = cacheRootForTrajectory(payload.trajectory)
  const scene = await sceneForSeed(cacheRoot, seed, payload.userId)
  const [left, right] = await Promise.all([
    buildPanel(cacheRoot, payload.left?.algo, payload.left?.params, scene),
    mode === "compare" ? buildPanel(cacheRoot, payload.right?.algo, payload.right?.params, scene) : undefined,
  ])
  return {
    seed,
    trajectory: payload.trajectory && trajectoryDirectories.has(payload.trajectory) ? payload.trajectory : defaultTrajectory,
    mode,
    left,
    right,
  }
}

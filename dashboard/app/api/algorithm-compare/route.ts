import { NextRequest, NextResponse } from "next/server"
import fs from "node:fs"
import path from "node:path"

export const runtime = "nodejs"

type ComparePayload = {
  seed?: number
  mode?: "single" | "compare"
  left?: {
    algo?: string
  }
  right?: {
    algo?: string
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
    seqscan: "SeqScan",
    tadbscan: "ST-DBSCAN",
    gridbased: "Grid-based",
  }
  return names[algo] ?? algo.toUpperCase()
}

function buildPanel(algo: string, cache: CompareCache | null): ComparePanelResponse {
  const normalized = normalizeAlgo(algo)
  const fromCache = cache?.panels?.[normalized]
  const fallbackAnimation = cache?.fallback_animation ?? DEFAULT_FALLBACK_ANIMATION
  const animation = fromCache?.animation_data_url ?? fallbackAnimation

  return {
    algo: normalized,
    title: fromCache?.title ?? prettyAlgoName(normalized),
    available: Boolean(animation),
    animation_data_url: animation,
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

    const body: {
      seed: number
      mode: "single" | "compare"
      left: ComparePanelResponse
      right?: ComparePanelResponse
    } = {
      seed,
      mode,
      left: buildPanel(leftAlgo, cache),
    }

    if (mode === "compare") {
      body.right = buildPanel(rightAlgo, cache)
    }

    return NextResponse.json(body)
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load cached compare result"
    return NextResponse.json({ error: message }, { status: 400 })
  }
}

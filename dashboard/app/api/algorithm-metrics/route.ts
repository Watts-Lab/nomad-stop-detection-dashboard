import { NextRequest, NextResponse } from "next/server"
import fs from "node:fs"
import path from "node:path"

export const runtime = "nodejs"

type MetricsPayload = {
  mode?: "single" | "compare"
  left_algorithm?: string
  right_algorithm?: string
  trajectory_user_id?: string
  iterations?: number
  sweep_points?: number
}

type SweepLimit = { min: number; max: number }

type MetricsOptionsResponse = {
  algorithms: string[]
  trajectories: Array<{ user_id: string; label: string }>
  parameter_notes: Record<string, {
    source: string
    sweep_parameter: string
    sweep_note?: string
    fixed_parameters: string[]
  }>
  defaults: {
    mode: "single" | "compare"
    left_algorithm: string
    right_algorithm: string
    iterations: number
    sweep_min: number
    sweep_max: number
    sweep_points: number
    seed: number
  }
  sweep_limits: Record<string, SweepLimit>
  max_iterations: number
}

type MetricsPanelResponse = {
  algorithm: string
  title: string
  image_data_url: string | null
  max_mean: number
  points: number
}

type MetricsApiResponse = {
  mode: "single" | "compare"
  meta: {
    cache_hit: boolean
    iterations: number
    sweep_points: number
    elapsed_sec: number
    cache_files?: number
    cache_total_bytes?: number
  }
  left: MetricsPanelResponse
  right?: MetricsPanelResponse | null
  trajectory_preview: {
    user_id: string
    image_data_url: string | null
    timeline_data_url: string | null
  }
}

const CACHE_ROOT = process.env.CACHED_RESULTS_DIR
  ? path.resolve(process.env.CACHED_RESULTS_DIR)
  : path.resolve(process.cwd(), "..", "cached_results")

const FIGURE_BY_ALGO: Record<string, string> = {
  Lachesis: "/notebook-figures/lachesis_delta_roam_all_metrics_grid.svg",
  Sequential: "/notebook-figures/seq_delta_roam_acc.svg",
  SeqScan: "/notebook-figures/db_dist_thresh_acc.svg",
  "ST-DBSCAN": "/notebook-figures/dbscan_dist_thresh_all_metrics_grid.svg",
  DBSTOP: "/notebook-figures/db_dist_thresh_acc.svg",
}

const DEFAULT_OPTIONS: MetricsOptionsResponse = {
  algorithms: ["Lachesis", "Sequential", "SeqScan", "ST-DBSCAN", "DBSTOP"],
  trajectories: [
    { user_id: "cached-user-001", label: "Cached trajectory 001" },
    { user_id: "cached-user-002", label: "Cached trajectory 002" },
    { user_id: "cached-user-003", label: "Cached trajectory 003" },
  ],
  parameter_notes: {
    Lachesis: {
      source: "delta_roam_vs_acc_exp.ipynb",
      sweep_parameter: "delta_roam",
      sweep_note: "UI sweep is scaled as 1.7 x value for Lachesis.",
      fixed_parameters: ["dt_max=60", "dur_min=5 (function default)"],
    },
    Sequential: {
      source: "delta_roam_vs_acc_exp.ipynb",
      sweep_parameter: "delta_roam",
      fixed_parameters: ["dt_max=60", "method='centroid'", "dur_min=5 (function default)"],
    },
    SeqScan: {
      source: "dist_thresh_vs_acc_exp.ipynb",
      sweep_parameter: "dist_thresh",
      fixed_parameters: ["time_thresh=60", "min_pts=2", "back_merge=False", "dur_min=5"],
    },
    "ST-DBSCAN": {
      source: "dist_thresh_vs_acc_exp.ipynb",
      sweep_parameter: "dist_thresh",
      fixed_parameters: ["time_thresh=60", "min_pts=2", "remove_overlaps=True"],
    },
    DBSTOP: {
      source: "ta_seqscan_examples.ipynb (dashboard compare path)",
      sweep_parameter: "dist_thresh",
      fixed_parameters: ["time_thresh=60", "min_pts=2", "dur_min=5", "back_merge=False"],
    },
  },
  defaults: {
    mode: "compare",
    left_algorithm: "Lachesis",
    right_algorithm: "Sequential",
    iterations: 100,
    sweep_min: 5,
    sweep_max: 50,
    sweep_points: 50,
    seed: 2026,
  },
  sweep_limits: {
    Lachesis: { min: 5, max: 50 },
    Sequential: { min: 5, max: 50 },
    SeqScan: { min: 1, max: 50 },
    "ST-DBSCAN": { min: 1, max: 50 },
    DBSTOP: { min: 1, max: 50 },
  },
  max_iterations: 500,
}

function readJsonIfExists<T>(filePath: string): T | null {
  if (!fs.existsSync(filePath)) return null
  const raw = fs.readFileSync(filePath, "utf-8")
  return JSON.parse(raw) as T
}

function normalizeMetricsAlgo(input: string | undefined, fallback: string): string {
  const value = (input ?? "").trim().toLowerCase()
  if (!value) return fallback
  if (value === "lachesis") return "Lachesis"
  if (value === "sequential") return "Sequential"
  if (value === "seqscan") return "SeqScan"
  if (value === "st-dbscan" || value === "dbscan" || value === "tadbscan") return "ST-DBSCAN"
  if (value === "dbstop") return "DBSTOP"
  return fallback
}

function buildPanel(algorithm: string, points: number, fallback: MetricsPanelResponse | undefined): MetricsPanelResponse {
  return {
    algorithm,
    title: `${algorithm} aggregated metrics (cached)`,
    image_data_url: FIGURE_BY_ALGO[algorithm] ?? fallback?.image_data_url ?? null,
    max_mean: fallback?.max_mean ?? 0.75,
    points,
  }
}

function getCacheStats(): { cache_files: number; cache_total_bytes: number } {
  const files = fs.existsSync(CACHE_ROOT)
    ? fs.readdirSync(CACHE_ROOT, { recursive: true })
        .filter((entry) => typeof entry === "string" && entry.endsWith(".json"))
        .map((entry) => path.join(CACHE_ROOT, entry as string))
    : []

  let totalBytes = 0
  for (const file of files) {
    totalBytes += fs.statSync(file).size
  }

  return {
    cache_files: files.length,
    cache_total_bytes: totalBytes,
  }
}

export async function GET() {
  try {
    const optionsPath = path.join(CACHE_ROOT, "algorithm-metrics", "options.json")
    const options = readJsonIfExists<MetricsOptionsResponse>(optionsPath) ?? DEFAULT_OPTIONS
    return NextResponse.json(options)
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load metrics options cache"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const payload = (await req.json()) as MetricsPayload
    const optionsPath = path.join(CACHE_ROOT, "algorithm-metrics", "options.json")
    const defaultPath = path.join(CACHE_ROOT, "algorithm-metrics", "default.json")

    const options = readJsonIfExists<MetricsOptionsResponse>(optionsPath) ?? DEFAULT_OPTIONS
    const cached = readJsonIfExists<MetricsApiResponse>(defaultPath)

    const mode: "single" | "compare" = payload.mode === "single" ? "single" : "compare"
    const sweepPoints = Number.isFinite(payload.sweep_points)
      ? Math.max(2, Math.min(200, Math.floor(Number(payload.sweep_points))))
      : (cached?.meta?.sweep_points ?? options.defaults.sweep_points)
    const iterations = Number.isFinite(payload.iterations)
      ? Math.max(1, Math.floor(Number(payload.iterations)))
      : (cached?.meta?.iterations ?? options.defaults.iterations)

    const leftAlgorithm = normalizeMetricsAlgo(payload.left_algorithm, options.defaults.left_algorithm)
    const rightAlgorithm = normalizeMetricsAlgo(payload.right_algorithm, options.defaults.right_algorithm)

    const fallbackLeft = cached?.left
    const fallbackRight = cached?.right ?? undefined

    const stats = getCacheStats()

    const response: MetricsApiResponse = {
      mode,
      meta: {
        cache_hit: true,
        iterations,
        sweep_points: sweepPoints,
        elapsed_sec: cached?.meta?.elapsed_sec ?? 0.03,
        cache_files: stats.cache_files,
        cache_total_bytes: stats.cache_total_bytes,
      },
      left: buildPanel(leftAlgorithm, sweepPoints, fallbackLeft),
      right: mode === "compare" ? buildPanel(rightAlgorithm, sweepPoints, fallbackRight) : null,
      trajectory_preview: {
        user_id: payload.trajectory_user_id || cached?.trajectory_preview?.user_id || options.trajectories[0]?.user_id || "cached-user-001",
        image_data_url: cached?.trajectory_preview?.image_data_url ?? "/issue-images/ground-truth-placeholder.svg",
        timeline_data_url: cached?.trajectory_preview?.timeline_data_url ?? "/notebook-figures/db_dist_thresh_acc.svg",
      },
    }

    return NextResponse.json(response)
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load cached metrics result"
    return NextResponse.json({ error: message }, { status: 400 })
  }
}

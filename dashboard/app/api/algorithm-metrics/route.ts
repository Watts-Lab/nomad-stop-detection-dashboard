import { NextRequest, NextResponse } from "next/server"
import fs from "node:fs"
import path from "node:path"

export const runtime = "nodejs"

type MetricsPayload = {
  mode?: "single" | "compare"
  left_algorithm?: string
  right_algorithm?: string
  left_parameter?: string
  right_parameter?: string
  trajectory_user_id?: string
  iterations?: number
  sweep_min?: number
  sweep_max?: number
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
  sweep_parameter: string
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

const DEFAULT_SWEEP_PARAMETER_BY_ALGO: Record<string, string> = {
  Lachesis: "delta_roam",
  Sequential: "delta_roam",
  SeqScan: "dist_thresh",
  "ST-DBSCAN": "dist_thresh",
  DBSTOP: "dist_thresh",
}

const SUPPORTED_SWEEP_PARAMETERS: Record<string, string[]> = {
  Lachesis: ["delta_roam", "dur_min"],
  Sequential: ["delta_roam", "dur_min"],
  SeqScan: ["dist_thresh", "dur_min"],
  "ST-DBSCAN": ["dist_thresh"],
  DBSTOP: ["dist_thresh", "dur_min"],
}

const FIGURE_BY_ALGO_AND_PARAMETER: Record<string, string> = {
  "Lachesis:delta_roam": "/notebook-figures/lachesis_delta_roam_all_metrics_grid.svg",
  "ST-DBSCAN:dist_thresh": "/notebook-figures/dbscan_dist_thresh_all_metrics_grid.svg",
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

function normalizeSweepParameter(algorithm: string, input: string | undefined): string {
  const supported = SUPPORTED_SWEEP_PARAMETERS[algorithm] ?? [DEFAULT_SWEEP_PARAMETER_BY_ALGO[algorithm] ?? "dist_thresh"]
  const value = (input ?? "").trim()
  return supported.includes(value) ? value : supported[0]
}

function placeholderMetricsGrid(algorithm: string, sweepParameter: string): string {
  const labels = ["Precision", "Recall", "F1 Score", "Stops Missed", "Stops Merged", "Stops Split"]
  const panelWidth = 280
  const panelHeight = 205
  const gap = 22
  const marginX = 28
  const marginY = 58
  const width = marginX * 2 + panelWidth * 3 + gap * 2
  const height = marginY + panelHeight * 2 + gap + 38
  const panels = labels.map((label, index) => {
    const col = index % 3
    const row = Math.floor(index / 3)
    const x = marginX + col * (panelWidth + gap)
    const y = marginY + row * (panelHeight + gap)
    return `
      <g>
        <rect x="${x}" y="${y}" width="${panelWidth}" height="${panelHeight}" fill="#ffffff" stroke="#d7dce5"/>
        <line x1="${x + 40}" y1="${y + 162}" x2="${x + panelWidth - 18}" y2="${y + 162}" stroke="#d6dbe5" stroke-dasharray="2 3"/>
        <line x1="${x + 40}" y1="${y + 28}" x2="${x + 40}" y2="${y + 162}" stroke="#d6dbe5" stroke-dasharray="2 3"/>
        <path d="M ${x + 42} ${y + 150} C ${x + 86} ${y + 72}, ${x + 148} ${y + 42}, ${x + 218} ${y + 92} S ${x + 255} ${y + 132}, ${x + 262} ${y + 125}" fill="none" stroke="#123fa3" stroke-width="3"/>
        <circle cx="${x + 86}" cy="${y + 88}" r="2.4" fill="#82a9ce" opacity="0.5"/>
        <circle cx="${x + 142}" cy="${y + 56}" r="2.4" fill="#82a9ce" opacity="0.5"/>
        <circle cx="${x + 208}" cy="${y + 102}" r="2.4" fill="#82a9ce" opacity="0.5"/>
        <text x="${x + panelWidth / 2}" y="${y + 22}" text-anchor="middle" font-family="Arial, sans-serif" font-size="15" fill="#1d2430">${label}</text>
        <text x="${x + panelWidth / 2}" y="${y + 190}" text-anchor="middle" font-family="Arial, sans-serif" font-size="11" fill="#4b5565">${sweepParameter}</text>
      </g>
    `
  }).join("")
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <rect width="100%" height="100%" fill="#f7f8fb"/>
      <text x="${width / 2}" y="28" text-anchor="middle" font-family="Arial, sans-serif" font-size="19" font-weight="700" fill="#111827">${algorithm} aggregated metrics</text>
      <text x="${width / 2}" y="48" text-anchor="middle" font-family="Arial, sans-serif" font-size="12" fill="#687386">Cached six-panel figure placeholder for x-axis ${sweepParameter}</text>
      ${panels}
    </svg>
  `
  return "data:image/svg+xml;base64," + Buffer.from(svg).toString("base64")
}

function buildPanel(
  algorithm: string,
  sweepParameter: string,
  points: number,
  fallback: MetricsPanelResponse | undefined,
): MetricsPanelResponse {
  const figureKey = `${algorithm}:${sweepParameter}`
  const image = FIGURE_BY_ALGO_AND_PARAMETER[figureKey] ?? placeholderMetricsGrid(algorithm, sweepParameter)
  return {
    algorithm,
    sweep_parameter: sweepParameter,
    title: `${algorithm} aggregated metrics by ${sweepParameter} (cached)`,
    image_data_url: image,
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
    const leftParameter = normalizeSweepParameter(leftAlgorithm, payload.left_parameter)
    const rightParameter = normalizeSweepParameter(rightAlgorithm, payload.right_parameter)

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
      left: buildPanel(leftAlgorithm, leftParameter, sweepPoints, fallbackLeft),
      right: mode === "compare" ? buildPanel(rightAlgorithm, rightParameter, sweepPoints, fallbackRight) : null,
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

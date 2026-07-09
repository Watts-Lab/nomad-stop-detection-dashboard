import { NextResponse } from "next/server"
import fs from "node:fs"
import path from "node:path"

export const runtime = "nodejs"

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

const CACHE_ROOT = process.env.CACHED_RESULTS_DIR
  ? path.resolve(process.env.CACHED_RESULTS_DIR)
  : path.resolve(process.cwd(), "..", "cached_results")

const DEFAULT_OPTIONS: MetricsOptionsResponse = {
  algorithms: [
    "Lachesis",
    "Sequential (Centroid)",
    "Sequential (First)",
    "SeqScan",
    "ST-DBSCAN",
    "DBSTOP",
    "HDBSCAN",
    "Grid-Based",
  ],
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
      fixed_parameters: ["dt_max=60", "dur_min=5"],
    },
    "Sequential (Centroid)": {
      source: "delta_roam_vs_acc_exp.ipynb",
      sweep_parameter: "delta_roam",
      fixed_parameters: ["dt_max=60", "method='centroid'", "dur_min=5"],
    },
    "Sequential (First)": {
      source: "delta_roam_vs_acc_exp.ipynb",
      sweep_parameter: "delta_roam",
      fixed_parameters: ["dt_max=60", "method='sliding'", "dur_min=5"],
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
    HDBSCAN: {
      source: "cached_results/stop-detection-cache/hdbscan",
      sweep_parameter: "dist_thresh",
      fixed_parameters: ["time_thresh=60", "min_pts=2", "dur_min=5", "min_cluster_size=1"],
    },
    "Grid-Based": {
      source: "cached_results/stop-detection-cache/gridbased",
      sweep_parameter: "cell_size",
      fixed_parameters: ["min_time=5", "min_cluster_size=2"],
    },
  },
  defaults: {
    mode: "compare",
    left_algorithm: "Lachesis",
    right_algorithm: "Sequential (Centroid)",
    iterations: 100,
    sweep_min: 5,
    sweep_max: 50,
    sweep_points: 50,
    seed: 2026,
  },
  sweep_limits: {
    Lachesis: { min: 5, max: 50 },
    "Sequential (Centroid)": { min: 5, max: 50 },
    "Sequential (First)": { min: 5, max: 50 },
    SeqScan: { min: 1, max: 50 },
    "ST-DBSCAN": { min: 1, max: 50 },
    DBSTOP: { min: 1, max: 50 },
    HDBSCAN: { min: 1, max: 50 },
    "Grid-Based": { min: 25, max: 500 },
  },
  max_iterations: 500,
}

function readJsonIfExists<T>(filePath: string): T | null {
  if (!fs.existsSync(filePath)) return null
  const raw = fs.readFileSync(filePath, "utf-8")
  return JSON.parse(raw) as T
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

import { publicPath } from "./public-path"
import type { DashboardView, MetricsParameterNote } from "./types"

export type ParameterConstraint = {
  min: number
  max: number
  step: number
  allowedValues?: number[]
}

export type DemoEditableParam = ParameterConstraint & {
  label?: string
}

export const SEQUENTIAL_CARD_DIAGRAM = publicPath("/assets/diagram-svgs/sequential_algorithms_card.svg")
export const SEQUENTIAL_EXPANDED_DIAGRAM = publicPath("/assets/diagram-svgs/sequential_algorithms.svg")
export const DENSITY_CARD_DIAGRAM = publicPath("/assets/diagram-svgs/density_based_card.svg")
export const DENSITY_EXPANDED_DIAGRAM = publicPath("/assets/diagram-svgs/density_based.svg")

export const LEARN_FAMILIES = [
  { id: "sequential", title: "Sequential Algorithms" },
  { id: "density", title: "Density-Based Algorithms" },
]

export const FALLBACK_PARAMETER_NOTES: Record<string, MetricsParameterNote> = {
  Lachesis: {
    source: "Generated stop-detection cache",
    sweep_parameter: "delta_roam",
    sweep_note: "UI sweep is scaled as 1.7 × value for Lachesis.",
    fixed_parameters: ["dt_max=60", "dur_min=5"],
  },
  "Sequential (Centroid)": {
    source: "Generated stop-detection cache",
    sweep_parameter: "delta_roam",
    fixed_parameters: ["dt_max=60", "method='centroid'", "dur_min=5"],
  },
  "Sequential (First)": {
    source: "Generated stop-detection cache",
    sweep_parameter: "delta_roam",
    fixed_parameters: ["dt_max=60", "method='sliding'", "dur_min=5"],
  },
  SeqScan: {
    source: "Generated stop-detection cache",
    sweep_parameter: "dist_thresh",
    fixed_parameters: ["time_thresh=60", "min_pts=2", "back_merge=False", "dur_min=5"],
  },
  "ST-DBSCAN": {
    source: "Generated stop-detection cache",
    sweep_parameter: "dist_thresh",
    fixed_parameters: ["time_thresh=60", "min_pts=2", "remove_overlaps=True"],
  },
  DBSTOP: {
    source: "Generated stop-detection cache",
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
}

export const TIME_THRESH_VALUES = [60, 240]
export const MIN_PTS_VALUES = [2, 3]
export const DUR_MIN_VALUES = [5, 10]
export const CELL_SIZE_VALUES = [25, 37.5, 50, 75, 100, 175, 250, 375, 500]

export const PARAMETER_CONSTRAINTS: Record<string, Record<string, ParameterConstraint>> = {
  dbstop: {
    dist_thresh: { min: 0, max: 50, step: 2.5 },
    time_thresh: { min: 60, max: 240, step: 180, allowedValues: TIME_THRESH_VALUES },
    min_pts: { min: 2, max: 3, step: 1, allowedValues: MIN_PTS_VALUES },
    dur_min: { min: 5, max: 10, step: 5, allowedValues: DUR_MIN_VALUES },
  },
  seqscan: {
    dist_thresh: { min: 0, max: 50, step: 2.5 },
    time_thresh: { min: 60, max: 240, step: 180, allowedValues: TIME_THRESH_VALUES },
    min_pts: { min: 2, max: 3, step: 1, allowedValues: MIN_PTS_VALUES },
    dur_min: { min: 5, max: 10, step: 5, allowedValues: DUR_MIN_VALUES },
  },
  hdbscan: {
    dist_thresh: { min: 0, max: 50, step: 2.5 },
    time_thresh: { min: 60, max: 240, step: 180, allowedValues: TIME_THRESH_VALUES },
    min_pts: { min: 2, max: 3, step: 1, allowedValues: MIN_PTS_VALUES },
    dur_min: { min: 5, max: 10, step: 5, allowedValues: DUR_MIN_VALUES },
  },
  dbscan: {
    eps_spatial: { min: 0, max: 50, step: 2.5 },
    T_max: { min: 60, max: 240, step: 180, allowedValues: TIME_THRESH_VALUES },
    minPts: { min: 2, max: 3, step: 1, allowedValues: MIN_PTS_VALUES },
  },
  lachesis: {
    delta_roam: { min: 5, max: 120, step: 2.5 },
    dt_max: { min: 60, max: 120, step: 60, allowedValues: [60, 120] },
    dur_min: { min: 5, max: 10, step: 5, allowedValues: DUR_MIN_VALUES },
  },
  "sequential-centroid": {
    delta_roam: { min: 5, max: 120, step: 2.5 },
    dt_max: { min: 60, max: 120, step: 60, allowedValues: [60, 120] },
    dur_min: { min: 5, max: 10, step: 5, allowedValues: DUR_MIN_VALUES },
  },
  "sequential-first": {
    delta_roam: { min: 5, max: 120, step: 2.5 },
    dt_max: { min: 60, max: 120, step: 60, allowedValues: [60, 120] },
    dur_min: { min: 5, max: 10, step: 5, allowedValues: DUR_MIN_VALUES },
  },
  gridbased: {
    cell_size: { min: 25, max: 500, step: 12.5, allowedValues: CELL_SIZE_VALUES },
    min_time: { min: 5, max: 10, step: 5, allowedValues: DUR_MIN_VALUES },
  },
}

export const DEMO_EDITABLE_PARAMS: Record<string, Record<string, DemoEditableParam>> = {
  dbstop: {
    dist_thresh: { min: 0, max: 50, step: 2.5 },
    time_thresh: { min: 60, max: 240, step: 180, allowedValues: TIME_THRESH_VALUES },
    min_pts: { min: 2, max: 3, step: 1, allowedValues: MIN_PTS_VALUES },
    dur_min: { min: 5, max: 10, step: 5, allowedValues: DUR_MIN_VALUES },
  },
  seqscan: {
    dist_thresh: { min: 0, max: 50, step: 2.5 },
    time_thresh: { min: 60, max: 240, step: 180, allowedValues: TIME_THRESH_VALUES },
    min_pts: { min: 2, max: 3, step: 1, allowedValues: MIN_PTS_VALUES },
    dur_min: { min: 5, max: 10, step: 5, allowedValues: DUR_MIN_VALUES },
  },
  hdbscan: {
    dist_thresh: { min: 0, max: 50, step: 2.5 },
    time_thresh: { min: 60, max: 240, step: 180, allowedValues: TIME_THRESH_VALUES },
    min_pts: { min: 2, max: 3, step: 1, allowedValues: MIN_PTS_VALUES },
    dur_min: { min: 5, max: 10, step: 5, allowedValues: DUR_MIN_VALUES },
  },
  dbscan: {
    eps_spatial: { min: 0, max: 50, step: 2.5, label: "dist_thresh" },
    T_max: { min: 60, max: 240, step: 180, allowedValues: TIME_THRESH_VALUES, label: "time_thresh" },
    minPts: { min: 2, max: 3, step: 1, allowedValues: MIN_PTS_VALUES, label: "min_pts" },
  },
  lachesis: {
    delta_roam: { min: 5, max: 120, step: 2.5 },
    dt_max: { min: 60, max: 120, step: 60, allowedValues: [60, 120] },
    dur_min: { min: 5, max: 10, step: 5, allowedValues: DUR_MIN_VALUES },
  },
  "sequential-centroid": {
    delta_roam: { min: 5, max: 120, step: 2.5 },
    dt_max: { min: 60, max: 120, step: 60, allowedValues: [60, 120] },
    dur_min: { min: 5, max: 10, step: 5, allowedValues: DUR_MIN_VALUES },
  },
  "sequential-first": {
    delta_roam: { min: 5, max: 120, step: 2.5 },
    dt_max: { min: 60, max: 120, step: 60, allowedValues: [60, 120] },
    dur_min: { min: 5, max: 10, step: 5, allowedValues: DUR_MIN_VALUES },
  },
  gridbased: {
    cell_size: { min: 25, max: 500, step: 12.5, allowedValues: CELL_SIZE_VALUES },
    min_time: { min: 5, max: 10, step: 5, allowedValues: DUR_MIN_VALUES },
  },
}

export const METRICS_ALGORITHM_BY_DEMO_ID: Record<string, string> = {
  dbstop: "DBSTOP",
  lachesis: "Lachesis",
  "sequential-centroid": "Sequential (Centroid)",
  "sequential-first": "Sequential (First)",
  seqscan: "SeqScan",
  dbscan: "ST-DBSCAN",
  hdbscan: "HDBSCAN",
  gridbased: "Grid-Based",
}

export const DEMO_ID_BY_METRICS_ALGORITHM: Record<string, string> = Object.fromEntries(
  Object.entries(METRICS_ALGORITHM_BY_DEMO_ID).map(([demoId, metricsName]) => [metricsName, demoId]),
)

// Maps notebook/metrics parameter names to the demo's editable-param keys where they differ.
export const DEMO_PARAM_ALIASES: Record<string, Record<string, string>> = {
  dbscan: {
    dist_thresh: "eps_spatial",
    time_thresh: "T_max",
    min_pts: "minPts",
  },
}

export const METRICS_SWEEP_PARAMETERS: Record<string, Array<{ value: string; label: string; min: number; max: number }>> = {
  DBSTOP: [
    { value: "dist_thresh", label: "dist_thresh", min: 0, max: 50 },
    { value: "dur_min", label: "dur_min", min: 0, max: 180 },
  ],
  Lachesis: [
    { value: "delta_roam", label: "delta_roam", min: 0, max: 120 },
    { value: "dur_min", label: "dur_min", min: 0, max: 180 },
  ],
  "Sequential (Centroid)": [
    { value: "delta_roam", label: "delta_roam", min: 0, max: 120 },
    { value: "dur_min", label: "dur_min", min: 0, max: 180 },
  ],
  "Sequential (First)": [
    { value: "delta_roam", label: "delta_roam", min: 0, max: 120 },
    { value: "dur_min", label: "dur_min", min: 0, max: 180 },
  ],
  SeqScan: [
    { value: "dist_thresh", label: "dist_thresh", min: 0, max: 50 },
    { value: "dur_min", label: "dur_min", min: 0, max: 180 },
  ],
  "ST-DBSCAN": [
    { value: "dist_thresh", label: "dist_thresh", min: 0, max: 50 },
  ],
  HDBSCAN: [
    { value: "dist_thresh", label: "dist_thresh", min: 0, max: 50 },
    { value: "dur_min", label: "dur_min", min: 0, max: 180 },
  ],
  "Grid-Based": [
    { value: "cell_size", label: "cell_size", min: 0, max: 500 },
    { value: "min_time", label: "min_time", min: 0, max: 180 },
  ],
}

export const METRICS_RESULTS_FILE: Record<string, string> = {
  Lachesis: "lachesis_results.parquet",
  "Sequential (Centroid)": "sequential_centroid_results.parquet",
  "Sequential (First)": "sequential_first_results.parquet",
  SeqScan: "seqscan_results.parquet",
  "ST-DBSCAN": "st_dbscan_results.parquet",
  DBSTOP: "dbstop_results.parquet",
  HDBSCAN: "hdbscan_results.parquet",
  "Grid-Based": "gridbased_results.parquet",
}

export const algorithms = [
  {
    id: "lachesis",
    name: "Lachesis",
    family: "sequential",
    shortDesc: "Greedy sequential parsing with roaming-distance and duration thresholds.",
    description: "Lachesis scans pings in time order and grows a candidate stop while the observed movement remains within a roaming-distance threshold, temporal gaps stay bounded, and the accumulated dwell time reaches a minimum duration.",
    source: "Hariharan and Toyama (2004), Project Lachesis",
    cardDiagramSrc: SEQUENTIAL_CARD_DIAGRAM,
    expandedDiagramSrc: SEQUENTIAL_EXPANDED_DIAGRAM,
    parameters: [
      { name: "dur_min", defaultValue: "5", description: "Minimum duration for a stop, in minutes." },
      { name: "dt_max", defaultValue: "60", description: "Maximum allowed time gap between consecutive pings, in minutes." },
      { name: "delta_roam", defaultValue: "25", description: "Maximum roaming distance for a candidate stop, in meters." },
    ],
  },
  {
    id: "sequential-centroid",
    name: "Sequential (centroid-anchored)",
    family: "sequential",
    shortDesc: "Sequential stop detection anchored by the evolving candidate centroid.",
    description: "The centroid-anchored sequential method scans pings chronologically and updates the candidate stop center as the group grows. A stop is retained when the candidate satisfies the configured roaming-distance, gap, and dwell-time constraints.",
    source: "NOMAD sequential stop detection, method='centroid'",
    cardDiagramSrc: SEQUENTIAL_CARD_DIAGRAM,
    expandedDiagramSrc: SEQUENTIAL_EXPANDED_DIAGRAM,
    parameters: [
      { name: "delta_roam", defaultValue: "25", description: "Maximum distance from the candidate centroid, in meters." },
      { name: "dt_max", defaultValue: "60", description: "Maximum allowed time gap between consecutive pings, in minutes." },
      { name: "dur_min", defaultValue: "5", description: "Minimum duration for a stop, in minutes." },
      { name: "method", defaultValue: "centroid", description: "Anchoring rule for the candidate stop center." },
    ],
  },
  {
    id: "sequential-first",
    name: "Sequential (first-anchored)",
    family: "sequential",
    shortDesc: "Sequential stop detection anchored by the first ping in the candidate stop.",
    description: "The first-anchored sequential method scans pings chronologically and compares new pings with the first ping in the active candidate stop. This copy is provisional until the exact source language is added.",
    source: "NOMAD sequential stop detection, method='first' (placeholder source)",
    cardDiagramSrc: SEQUENTIAL_CARD_DIAGRAM,
    expandedDiagramSrc: SEQUENTIAL_EXPANDED_DIAGRAM,
    parameters: [
      { name: "delta_roam", defaultValue: "25", description: "Maximum distance from the first ping in the candidate stop, in meters." },
      { name: "dt_max", defaultValue: "60", description: "Maximum allowed time gap between consecutive pings, in minutes." },
      { name: "dur_min", defaultValue: "5", description: "Minimum duration for a stop, in minutes." },
      { name: "method", defaultValue: "first", description: "Anchoring rule for the candidate stop center." },
    ],
  },
  {
    id: "gridbased",
    name: "Grid-Based",
    family: "sequential",
    shortDesc: "Cell-based dwell detection over a spatial grid.",
    description: "Grid-Based stop detection assigns pings to spatial cells and identifies stops from sustained dwell within a cell. This copy is provisional until the final source text is added.",
    source: "NOMAD grid-based stop detection",
    cardDiagramSrc: SEQUENTIAL_CARD_DIAGRAM,
    expandedDiagramSrc: SEQUENTIAL_EXPANDED_DIAGRAM,
    parameters: [
      { name: "cell_size", defaultValue: "100", description: "Grid cell size, in meters." },
      { name: "min_time", defaultValue: "5", description: "Minimum dwell time inside a cell, in minutes." },
    ],
  },
  {
    id: "dbscan",
    name: "ST-DBSCAN",
    family: "density",
    shortDesc: "Density-based clustering with spatial and temporal neighborhood thresholds.",
    description: "ST-DBSCAN extends DBSCAN with a temporal scale so pings must be close in both space and time to form stop clusters. The dashboard copy should later be aligned with the exact implementation notes.",
    source: "Birant and Kut (2007), ST-DBSCAN",
    cardDiagramSrc: DENSITY_CARD_DIAGRAM,
    expandedDiagramSrc: DENSITY_EXPANDED_DIAGRAM,
    parameters: [
      { name: "eps_spatial", defaultValue: "50", description: "Spatial neighborhood radius, in meters." },
      { name: "T_max", defaultValue: "60", description: "Maximum temporal gap for neighborhood linkage, in minutes." },
      { name: "minPts", defaultValue: "3", description: "Minimum neighbors required for a core point." },
    ],
  },
  {
    id: "dbstop",
    name: "DBSTOP",
    family: "density",
    shortDesc: "Density-based stop detection with distance, time, and duration constraints.",
    description: "DBSTOP identifies dense groups of pings as stops using spatial distance, temporal neighborhood, minimum point count, and minimum duration parameters. This text is provisional until the final NOMAD reference copy is added.",
    source: "NOMAD DBSTOP implementation notes",
    cardDiagramSrc: DENSITY_CARD_DIAGRAM,
    expandedDiagramSrc: DENSITY_EXPANDED_DIAGRAM,
    parameters: [
      { name: "time_thresh", defaultValue: "60", description: "Temporal threshold (minutes)" },
      { name: "dist_thresh", defaultValue: "10", description: "Distance threshold (meters)" },
      { name: "min_pts", defaultValue: "3", description: "Minimum points for cluster core" },
      { name: "dur_min", defaultValue: "5", description: "Minimum stop duration (minutes)" },
    ],
  },
  {
    id: "seqscan",
    name: "SeqScan",
    family: "density",
    shortDesc: "Density-based sequential scan with temporal separation between stops.",
    description: "SeqScan applies density-based clustering within a moving temporal context, expanding active clusters while preserving temporal separation between detected stops.",
    source: "NOMAD SeqScan implementation notes",
    cardDiagramSrc: DENSITY_CARD_DIAGRAM,
    expandedDiagramSrc: DENSITY_EXPANDED_DIAGRAM,
    parameters: [
      { name: "time_thresh", defaultValue: "60", description: "Time threshold for stop detection (minutes)" },
      { name: "dist_thresh", defaultValue: "10", description: "Distance threshold (meters)" },
      { name: "min_pts", defaultValue: "3", description: "Minimum points for cluster core" },
      { name: "dur_min", defaultValue: "5", description: "Minimum stop duration (minutes)" },
    ],
  },
  {
    id: "hdbscan",
    name: "HDBSCAN",
    family: "density",
    shortDesc: "Hierarchical density-based clustering for variable-density stop patterns.",
    description: "HDBSCAN extends density-based clustering hierarchically, allowing stop clusters of varying density. In this dashboard it is swept over the same spatial/temporal thresholds as the other density methods.",
    source: "Campello, Moulavi, and Sander (2013), HDBSCAN",
    cardDiagramSrc: DENSITY_CARD_DIAGRAM,
    expandedDiagramSrc: DENSITY_EXPANDED_DIAGRAM,
    parameters: [
      { name: "dist_thresh", defaultValue: "10", description: "Distance threshold (meters)" },
      { name: "time_thresh", defaultValue: "60", description: "Temporal threshold (minutes)" },
      { name: "min_pts", defaultValue: "3", description: "Minimum points for cluster core" },
      { name: "dur_min", defaultValue: "5", description: "Minimum stop duration (minutes)" },
    ],
  },
]

export type AlgorithmDefinition = (typeof algorithms)[number]

export const DEMO_ALGORITHM_IDS = new Set(algorithms.map((algorithm) => algorithm.id))
export const DASHBOARD_VIEWS = new Set<DashboardView>(["home", "learn", "demo", "metrics"])

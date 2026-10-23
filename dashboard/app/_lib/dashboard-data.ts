/* STORE STATIC DEFINITIONS/CONFIG OF ALGOS, PARAMS, TRAJECTORY OPTIONS */

import { publicPath } from "./public-path"
import type { DashboardView, MetricsParameterNote } from "./types"

export type DemoEditableParam = {
  min: number
  max: number
  step: number
  allowedValues?: number[]
}

export const SEQUENTIAL_CARD_DIAGRAM = publicPath("/assets/diagram-svgs/sequential_algorithms_card.svg")
export const SEQUENTIAL_EXPANDED_DIAGRAM = publicPath("/assets/diagram-svgs/sequential_algorithms.svg")
export const DENSITY_CARD_DIAGRAM = publicPath("/assets/diagram-svgs/density_based_card.svg")
export const DENSITY_EXPANDED_DIAGRAM = publicPath("/assets/diagram-svgs/density_based.svg")

export const LEARN_FAMILIES = [
  {
    id: "sequential",
    title: "Sequential Algorithms",
    diagramSrc: SEQUENTIAL_CARD_DIAGRAM,
  },
  {
    id: "density",
    title: "Density-Based Algorithms",
    diagramSrc: DENSITY_CARD_DIAGRAM,
  },
]

export const LEARN_CONCEPTS = [
  {
    id: "merging",
    category: "failure-modes",
    name: "Merging",
    description:
      "Merging occurs when an algorithm combines two or more distinct true stops into a single detected stop.",
  },
  {
    id: "splitting",
    category: "failure-modes",
    name: "Splitting",
    description:
      "Splitting occurs when an algorithm divides one true stop into two or more detected stops.",
  },
  {
    id: "missing",
    category: "failure-modes",
    name: "Missing",
    description:
      "Missing occurs when a true stop is not identified by the algorithm.",
  },
  {
    id: "temporal-overlap",
    category: "failure-modes",
    name: "Temporal Overlap",
    description:
      "Temporal overlap occurs when distinct detected stops overlap in time, rather than remaining temporally separated.",
  },
  {
    id: "ping",
    category: "glossary",
    name: "Ping",
    description:
      "A single recorded location observation with a timestamp.",
  },
  {
    id: "true-stop",
    category: "glossary",
    name: "True Stop",
    description:
      "An actual period spent at a destination that a stop-detection algorithm aims to identify.",
  },
  {
    id: "ground-truth-diary",
    category: "glossary",
    name: "Ground Truth Diary",
    description:
      "A chronological reference record of actual visits and trips, including their locations and times, used to evaluate detected stops.",
  },
  {
    id: "sampled-trajectory",
    category: "glossary",
    name: "Sampled Trajectory",
    description:
      "A sequence of location observations sampled over time to represent movement.",
  },
  {
    id: "noise",
    category: "glossary",
    name: "Noise",
    description:
      "Error or variation in recorded locations that makes observations differ from the actual position.",
  },
]

export const TRAJECTORY_OPTIONS = [
  {
    id: "two-stop",
    name: "Two-stop trajectory",
    note: "(Default trajectory) Two stops of equal duration at nearby destinations of equal size.",
  },
  {
    id: "four-stop-low-ha",
    name: "Four-stop",
    note: "Heterogeneous trajectory consisting of four stops to destinations of varying sizes, but equal durations.",
  },
  {
    id: "four-stop-high-ha",
    name: "Four-stop (noisier)",
    note: "Same as 'Four-stop' but with increased noise in its horizontal accuracy.",
  },
  {
    id: "commute-return",
    name: "Commute return",
    note: "Trajectory representing recurring visits to a same destination, starting with a short visit in one destination, followed by a lengthier visit at a second destination, and a final visit to the starting destination.",
  },
]

export const FALLBACK_PARAMETER_NOTES: Record<string, MetricsParameterNote> = {
  Lachesis: {
    source: "Generated stop-detection cache",
    sweep_parameter: "delta_roam",
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
    sweep_parameter: "h3_resolution",
    fixed_parameters: ["time_thresh=60", "dur_min=5", "min_cluster_size=2"],
  },
}

export const TIME_THRESH_VALUES = [60, 240]
export const MIN_PTS_VALUES = [2, 3]
export const DUR_MIN_VALUES = [5, 10]
export const DELTA_ROAM_VALUES = Array.from({ length: 21 }, (_, index) => 5 + index * 5.75)
export const H3_RESOLUTION_VALUES = [10, 11, 12, 13]
export const HDBSCAN_DIST_THRESH_VALUES = Array.from({ length: 15 }, (_, index) => 5 + index * 2.5)

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
    dist_thresh: { min: 5, max: 40, step: 2.5, allowedValues: HDBSCAN_DIST_THRESH_VALUES },
    time_thresh: { min: 60, max: 240, step: 180, allowedValues: TIME_THRESH_VALUES },
    min_pts: { min: 2, max: 3, step: 1, allowedValues: MIN_PTS_VALUES },
    dur_min: { min: 5, max: 10, step: 5, allowedValues: DUR_MIN_VALUES },
  },
  st_dbscan: {
    dist_thresh: { min: 0, max: 50, step: 2.5 },
    time_thresh: { min: 60, max: 240, step: 180, allowedValues: TIME_THRESH_VALUES },
    min_pts: { min: 2, max: 3, step: 1, allowedValues: MIN_PTS_VALUES },
  },
  lachesis: {
    delta_roam: { min: 5, max: 120, step: 5.75, allowedValues: DELTA_ROAM_VALUES },
    dt_max: { min: 60, max: 120, step: 60, allowedValues: [60, 120] },
    dur_min: { min: 5, max: 10, step: 5, allowedValues: DUR_MIN_VALUES },
  },
  sequential_centroid: {
    delta_roam: { min: 5, max: 120, step: 5.75, allowedValues: DELTA_ROAM_VALUES },
    dt_max: { min: 60, max: 120, step: 60, allowedValues: [60, 120] },
    dur_min: { min: 5, max: 10, step: 5, allowedValues: DUR_MIN_VALUES },
  },
  sequential_first: {
    delta_roam: { min: 5, max: 120, step: 5.75, allowedValues: DELTA_ROAM_VALUES },
    dt_max: { min: 60, max: 120, step: 60, allowedValues: [60, 120] },
    dur_min: { min: 5, max: 10, step: 5, allowedValues: DUR_MIN_VALUES },
  },
  gridbased: {
    h3_resolution: { min: 10, max: 13, step: 1, allowedValues: H3_RESOLUTION_VALUES },
    time_thresh: { min: 60, max: 240, step: 180, allowedValues: TIME_THRESH_VALUES },
    dur_min: { min: 5, max: 10, step: 5, allowedValues: DUR_MIN_VALUES },
  },
}

export const METRICS_ALGORITHM_BY_DEMO_ID: Record<string, string> = {
  dbstop: "DBSTOP",
  lachesis: "Lachesis",
  sequential_centroid: "Sequential (Centroid)",
  sequential_first: "Sequential (First)",
  seqscan: "SeqScan",
  st_dbscan: "ST-DBSCAN",
  hdbscan: "HDBSCAN",
  gridbased: "Grid-Based",
}

export const DEMO_ID_BY_METRICS_ALGORITHM: Record<string, string> = Object.fromEntries(
  Object.entries(METRICS_ALGORITHM_BY_DEMO_ID).map(([demoId, metricsName]) => [metricsName, demoId]),
)

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

export type AlgorithmDefinition = {
  id: string
  name: string
  family: string
  shortDesc: string
  description: string
  source: string
  documentationUrl: string
  cardDiagramSrc: string
  expandedDiagramSrc: string
  parameters: Array<{ name: string; defaultValue: string; description: string }>
}

export const algorithms = [
  {
    id: "lachesis",
    name: "Lachesis",
    family: "sequential",
    shortDesc: "Greedy sequential parsing with roaming-distance and duration thresholds.",
    description: "Lachesis scans pings in time order and grows a candidate stop while the observed movement remains within a roaming-distance threshold, temporal gaps stay bounded, and the accumulated dwell time reaches a minimum duration.",
    source: "Hariharan and Toyama (2004), Project Lachesis",
    documentationUrl: "https://watts-lab.github.io/nomad/api/generated/nomad.stop_detection.sequential_algs.html#nomad.stop_detection.sequential_algs.lachesis",
    cardDiagramSrc: SEQUENTIAL_CARD_DIAGRAM,
    expandedDiagramSrc: SEQUENTIAL_EXPANDED_DIAGRAM,
    parameters: [
      { name: "delta_roam", defaultValue: "28", description: "Maximum roaming distance for a candidate stop, in meters." },
      { name: "dt_max", defaultValue: "60", description: "Maximum allowed time gap between consecutive pings, in minutes." },
      { name: "dur_min", defaultValue: "5", description: "Minimum duration allowed for detected stops." },
    ],
  },
  {
    id: "sequential_centroid",
    name: "Sequential (centroid-anchored)",
    family: "sequential",
    shortDesc: "Sequential stop detection anchored by the evolving candidate centroid.",
    description: "The centroid-anchored sequential method scans pings chronologically and updates the candidate stop center as the group grows. A stop is retained when the candidate satisfies the configured roaming-distance, gap, and dwell-time constraints.",
    source: "NOMAD sequential stop detection, method='centroid'",
    documentationUrl: "https://watts-lab.github.io/nomad/api/generated/nomad.stop_detection.sequential_algs.html#nomad.stop_detection.sequential_algs.detect_stops_labels",
    cardDiagramSrc: SEQUENTIAL_CARD_DIAGRAM,
    expandedDiagramSrc: SEQUENTIAL_EXPANDED_DIAGRAM,
    parameters: [
      { name: "delta_roam", defaultValue: "28", description: "Maximum distance from the candidate centroid, in meters." },
      { name: "dt_max", defaultValue: "60", description: "Maximum time gap allowed between consecutive pings in a detected stop." },
      { name: "dur_min", defaultValue: "5", description: "Minimum duration allowed for detected stops." },
      { name: "method", defaultValue: "centroid", description: "Anchoring rule for the candidate stop center." },
    ],
  },
  {
    id: "sequential_first",
    name: "Sequential (first-anchored)",
    family: "sequential",
    shortDesc: "Sequential stop detection anchored by the first ping in the candidate stop.",
    description: "The first-anchored sequential method scans pings chronologically and compares new pings with the first ping in the active candidate stop. This copy is provisional until the exact source language is added.",
    source: "NOMAD sequential stop detection, method='sliding' (placeholder source)",
    documentationUrl: "https://watts-lab.github.io/nomad/api/generated/nomad.stop_detection.sequential_algs.html#nomad.stop_detection.sequential_algs.detect_stops",
    cardDiagramSrc: SEQUENTIAL_CARD_DIAGRAM,
    expandedDiagramSrc: SEQUENTIAL_EXPANDED_DIAGRAM,
    parameters: [
      { name: "delta_roam", defaultValue: "28", description: "Maximum distance from the first ping in the candidate stop, in meters." },
      { name: "dt_max", defaultValue: "60", description: "Maximum time gap allowed between consecutive pings in a detected stop." },
      { name: "dur_min", defaultValue: "5", description: "Minimum duration allowed for detected stops." },
      { name: "method", defaultValue: "sliding", description: "Anchoring rule for the candidate stop center." },
    ],
  },
  {
    id: "gridbased",
    name: "Grid-Based",
    family: "sequential",
    shortDesc: "Cell-based dwell detection over a spatial grid.",
    description: "Grid-Based stop detection assigns pings to spatial cells and identifies stops from sustained dwell within a cell. This copy is provisional until the final source text is added.",
    source: "NOMAD grid-based stop detection",
    documentationUrl: "https://watts-lab.github.io/nomad/api/generated/nomad.stop_detection.sequential_algs.html#nomad.stop_detection.sequential_algs.grid_based",
    cardDiagramSrc: SEQUENTIAL_CARD_DIAGRAM,
    expandedDiagramSrc: SEQUENTIAL_EXPANDED_DIAGRAM,
    parameters: [
      { name: "h3_resolution", defaultValue: "10", description: "H3 resolution used to tessellate the trajectory." },
      { name: "time_thresh", defaultValue: "60", description: "Maximum time gap allowed between consecutive pings in a detected stop." },
      { name: "dur_min", defaultValue: "5", description: "Minimum duration allowed for detected stops." },
    ],
  },
  {
    id: "st_dbscan",
    name: "ST-DBSCAN",
    family: "density",
    shortDesc: "Density-based clustering with spatial and temporal neighborhood thresholds.",
    description: "ST-DBSCAN extends DBSCAN with a temporal scale so pings must be close in both space and time to form stop clusters. The dashboard copy should later be aligned with the exact implementation notes.",
    source: "Birant and Kut (2007), ST-DBSCAN",
    documentationUrl: "https://watts-lab.github.io/nomad/api/generated/nomad.stop_detection.density_algs.html#nomad.stop_detection.density_algs.ta_dbscan",
    cardDiagramSrc: DENSITY_CARD_DIAGRAM,
    expandedDiagramSrc: DENSITY_EXPANDED_DIAGRAM,
    parameters: [
      { name: "dist_thresh", defaultValue: "50", description: "Maximum distance between a core point and its neighbors, determining density." },
      { name: "time_thresh", defaultValue: "60", description: "Maximum time gap allowed between consecutive pings in a detected stop." },
      { name: "min_pts", defaultValue: "3", description: "Minimum number of points in a ping's neighborhood to be considered a core point." },
    ],
  },
  {
    id: "dbstop",
    name: "DBSTOP",
    family: "density",
    shortDesc: "Density-based stop detection with distance, time, and duration constraints.",
    description: "DBSTOP identifies dense groups of pings as stops using spatial distance, temporal neighborhood, minimum point count, and minimum duration parameters. This text is provisional until the final NOMAD reference copy is added.",
    source: "NOMAD DBSTOP implementation notes",
    documentationUrl: "https://watts-lab.github.io/nomad/api/generated/nomad.stop_detection.density_algs.html#nomad.stop_detection.density_algs.dbstop",
    cardDiagramSrc: DENSITY_CARD_DIAGRAM,
    expandedDiagramSrc: DENSITY_EXPANDED_DIAGRAM,
    parameters: [
      { name: "dist_thresh", defaultValue: "10", description: "Maximum distance between a core point and its neighbors, determining density." },
      { name: "time_thresh", defaultValue: "60", description: "Maximum time gap allowed between consecutive pings in a detected stop." },
      { name: "min_pts", defaultValue: "3", description: "Minimum number of points in a ping's neighborhood to be considered a core point." },
      { name: "dur_min", defaultValue: "5", description: "Minimum duration allowed for detected stops." },
    ],
  },
  {
    id: "seqscan",
    name: "SeqScan",
    family: "density",
    shortDesc: "Density-based sequential scan with temporal separation between stops.",
    description: "SeqScan applies density-based clustering within a moving temporal context, expanding active clusters while preserving temporal separation between detected stops.",
    source: "NOMAD SeqScan implementation notes",
    documentationUrl: "https://watts-lab.github.io/nomad/api/generated/nomad.stop_detection.density_algs.html#nomad.stop_detection.density_algs.seqscan",
    cardDiagramSrc: DENSITY_CARD_DIAGRAM,
    expandedDiagramSrc: DENSITY_EXPANDED_DIAGRAM,
    parameters: [
        { name: "dist_thresh", defaultValue: "10", description: "Maximum distance between a core point and its neighbors, determining density" },
      { name: "time_thresh", defaultValue: "60", description: "Maximum time gap allowed between consecutive pings in a detected stop." },
      { name: "min_pts", defaultValue: "3", description: "Minimum number of points in a ping's neighborhood to be considered a core point." },
      { name: "dur_min", defaultValue: "5", description: "Minimum duration allowed for detected stops." },
    ],
  },
  {
    id: "hdbscan",
    name: "HDBSCAN",
    family: "density",
    shortDesc: "Hierarchical density-based clustering for variable-density stop patterns.",
    description: "HDBSCAN extends density-based clustering hierarchically, allowing stop clusters of varying density. In this dashboard it is swept over the same spatial/temporal thresholds as the other density methods.",
    source: "Campello, Moulavi, and Sander (2013), HDBSCAN",
    documentationUrl: "https://watts-lab.github.io/nomad/api/generated/nomad.stop_detection.density_algs.html#nomad.stop_detection.density_algs.hdbscan_labels",
    cardDiagramSrc: DENSITY_CARD_DIAGRAM,
    expandedDiagramSrc: DENSITY_EXPANDED_DIAGRAM,
    parameters: [
      { name: "dist_thresh", defaultValue: "10", description: "Maximum distance between a core point and its neighbors, determining density." },
      { name: "time_thresh", defaultValue: "60", description: "Maximum time gap allowed between consecutive pings in a detected stop." },
      { name: "min_pts", defaultValue: "3", description: "Minimum number of points in a ping's neighborhood to be considered a core point." },
      { name: "dur_min", defaultValue: "5", description: "Minimum duration allowed for detected stops." },
    ],
  },
] satisfies AlgorithmDefinition[]

export const DEMO_ALGORITHM_IDS = new Set(
  algorithms.filter((algorithm) => algorithm.id !== "hdbscan").map((algorithm) => algorithm.id),
)
export const DASHBOARD_VIEWS = new Set<DashboardView>(["home", "learn", "demo", "metrics"])

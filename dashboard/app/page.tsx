"use client"

import { Suspense, useState, useCallback, useEffect, useRef } from "react"
import Image from "next/image"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ArrowLeft, Home, Columns2, Square } from "lucide-react"

const GROUND_TRUTH_PLACEHOLDER_IMAGE = "/issue-images/ground-truth-placeholder.svg"

// ============ NOMAD Logo ============
function CSSLabLogo({ className = "" }: { className?: string }) {
  return (
    <Image
      src="/assets/logos/nomad-logo.svg"
      alt="NOMAD"
      width={212}
      height={37}
      priority
      className={`h-8 w-auto ${className}`}
    />
  )
}

// ============ Navigation Buttons ============
function NavButtons({ onHome, onBack }: { onHome: () => void; onBack?: () => void }) {
  return (
    <div className="flex items-center gap-2">
      <Button variant="ghost" size="icon" onClick={onHome} title="Home">
        <Home className="h-5 w-5" />
      </Button>
      {onBack && (
        <Button variant="ghost" size="icon" onClick={onBack} title="Back">
          <ArrowLeft className="h-5 w-5" />
        </Button>
      )}
    </div>
  )
}

// ============ Floor Plan ============
const rooms = [
  { x: 20, y: 20, width: 60, height: 50 },
  { x: 20, y: 90, width: 80, height: 80 },
  { x: 20, y: 190, width: 60, height: 50 },
  { x: 20, y: 260, width: 40, height: 40 },
  { x: 180, y: 20, width: 180, height: 60 },
  { x: 180, y: 100, width: 180, height: 160 },
  { x: 180, y: 280, width: 80, height: 40 },
  { x: 280, y: 280, width: 80, height: 40 },
  { x: 420, y: 20, width: 140, height: 50 },
  { x: 420, y: 90, width: 140, height: 100 },
  { x: 420, y: 210, width: 140, height: 110 },
]

const pointColors = { orange: "#F5A623", pink: "#E57373", purple: "#7B68EE" }

function FloorPlan({
  dataPoints,
  selectedTimeRange,
  compact = false,
  placeholderSrc,
}: {
  dataPoints: DataPoint[]
  selectedTimeRange: string | null
  compact?: boolean
  placeholderSrc?: string
}) {
  const filtered = selectedTimeRange ? dataPoints.filter((p) => p.time === selectedTimeRange) : dataPoints

  if (placeholderSrc) {
    return (
      <div className="relative w-full">
        <img
          src={placeholderSrc}
          alt="Ground truth trajectory placeholder"
          className={`w-full ${compact ? "h-32" : "h-auto"} object-contain`}
        />
      </div>
    )
  }

  return (
    <div className="relative w-full">
      <svg viewBox="0 0 600 340" className={`w-full ${compact ? "h-32" : "h-auto"}`} style={{ backgroundColor: "#d4d4d4" }} preserveAspectRatio={compact ? "xMidYMid slice" : "xMidYMid meet"}>
        {rooms.map((room, i) => (
          <rect key={i} x={room.x} y={room.y} width={room.width} height={room.height} fill="#888" stroke="#777" strokeWidth="1" />
        ))}
        {filtered.map((p) => (
          <g key={p.id}>
            <circle cx={p.x} cy={p.y} r={12} fill="none" stroke={pointColors[p.color]} strokeWidth="2" />
            <circle cx={p.x} cy={p.y} r={4} fill={pointColors[p.color]} />
          </g>
        ))}
      </svg>
    </div>
  )
}

// ============ Timeline ============
const segmentColors = { orange: "bg-[#F5A623]", pink: "bg-[#E8B4B8]", purple: "bg-[#9B8BB8]" }

function Timeline({ segments, selectedSegment, onSegmentClick }: { segments: TimeSegment[]; selectedSegment: string | null; onSegmentClick: (id: string | null) => void }) {
  return (
    <div className="w-full">
      <p className="text-center text-muted-foreground mb-2 text-sm">Timestamps</p>
      <div className="relative">
        <div className="relative h-10 bg-card border border-border rounded-sm overflow-hidden">
          {segments.map((seg) => (
            <button
              key={seg.id}
              onClick={() => onSegmentClick(selectedSegment === seg.id ? null : seg.id)}
              className={`absolute top-0 h-full transition-all ${segmentColors[seg.color]} ${selectedSegment === seg.id ? "ring-2 ring-foreground/50 ring-offset-1" : ""} ${selectedSegment && selectedSegment !== seg.id ? "opacity-40" : ""}`}
              style={{ left: `${seg.startPercent}%`, width: `${seg.widthPercent}%` }}
            />
          ))}
        </div>
        <div className="flex justify-between mt-2 text-sm text-muted-foreground px-1">
          <span>08 AM</span>
          <span>09 AM</span>
          <span>10 AM</span>
        </div>
      </div>
    </div>
  )
}

const NOTEBOOK_FIGURES: Record<string, { learn: string; metrics: string; source: string }> = {
  dbstop: {
    learn: "/notebook-figures/db_dist_thresh_acc.svg",
    metrics: "/notebook-figures/db_dist_thresh_acc.svg",
    source: "ta_seqscan_examples.ipynb (compare panel)",
  },
  lachesis: {
    learn: "/notebook-figures/seq_delta_roam_acc.svg",
    metrics: "/notebook-figures/lachesis_delta_roam_all_metrics_grid.svg",
    source: "delta_roam_vs_acc_exp.ipynb",
  },
  seqscan: {
    learn: "/notebook-figures/db_dist_thresh_acc.svg",
    metrics: "/notebook-figures/db_dist_thresh_acc.svg",
    source: "dist_thresh_vs_acc_exp.ipynb",
  },
  dbscan: {
    learn: "/notebook-figures/db_dist_thresh_acc.svg",
    metrics: "/notebook-figures/dbscan_dist_thresh_all_metrics_grid.svg",
    source: "dist_thresh_vs_acc_exp.ipynb",
  },
  gridbased: {
    learn: "/notebook-figures/exp1_all_metrics_grid.svg",
    metrics: "/notebook-figures/exp1_all_metrics_grid.svg",
    source: "exp_1_merge_vs_beta_ping.ipynb",
  },
  medoid: {
    learn: "/notebook-figures/exp1_all_metrics_grid.svg",
    metrics: "/notebook-figures/exp1_all_metrics_grid.svg",
    source: "exp_1_merge_vs_beta_ping.ipynb",
  },
}

function NotebookFigure({
  algorithmId,
  mode,
  alt,
  className = "",
}: {
  algorithmId: string
  mode: "learn" | "metrics"
  alt: string
  className?: string
}) {
  const fig = NOTEBOOK_FIGURES[algorithmId]
  if (!fig) {
    return <p className="text-sm text-muted-foreground">No notebook visualization available.</p>
  }

  return (
    <img
      src={mode === "learn" ? fig.learn : fig.metrics}
      alt={alt}
      className={`w-full h-full object-contain ${className}`}
    />
  )
}

// ============ TYPES & DATA ============

type DataPoint = { id: string; x: number; y: number; time: string; color: "orange" | "pink" | "purple" }
type TimeSegment = { id: string; startPercent: number; widthPercent: number; color: "orange" | "pink" | "purple" }
type ComparePanelResponse = {
  algo: string
  title: string
  available: boolean
  animation_data_url: string | null
}
type CompareApiResponse = {
  seed: number
  mode?: "single" | "compare"
  left: ComparePanelResponse
  right?: ComparePanelResponse
}

type MetricsPanelResponse = {
  algorithm: string
  title: string
  image_data_url: string | null
  max_mean: number
  points: number
}

type MetricsTrajectoryPreview = {
  user_id: string
  image_data_url: string | null
  timeline_data_url: string | null
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
  trajectory_preview: MetricsTrajectoryPreview
}

type SweepLimit = { min: number; max: number }

type MetricsOptionsResponse = {
  algorithms: string[]
  trajectories: Array<{ user_id: string; label: string }>
  parameter_notes?: Record<string, {
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
  sweep_limits?: Record<string, SweepLimit>
  max_iterations: number
}

const FALLBACK_PARAMETER_NOTES: NonNullable<MetricsOptionsResponse["parameter_notes"]> = {
  Lachesis: {
    source: "delta_roam_vs_acc_exp.ipynb",
    sweep_parameter: "delta_roam",
    sweep_note: "UI sweep is scaled as 1.7 × value for Lachesis.",
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
}

type ParameterConstraint = {
  min: number
  max: number
  step: number
  allowedValues?: number[]
}

const PARAMETER_CONSTRAINTS: Record<string, Record<string, ParameterConstraint>> = {
  dbstop: {
    time_thresh: { min: 1, max: 180, step: 1 },
    dist_thresh: { min: 1, max: 50, step: 1 },
    min_pts: { min: 2, max: 4, step: 1, allowedValues: [2, 3, 4] },
    dur_min: { min: 1, max: 180, step: 1 },
  },
  seqscan: {
    time_thresh: { min: 1, max: 180, step: 1 },
    dist_thresh: { min: 1, max: 50, step: 1 },
    min_pts: { min: 2, max: 4, step: 1, allowedValues: [2, 3, 4] },
    dur_min: { min: 1, max: 180, step: 1 },
  },
  dbscan: {
    eps_spatial: { min: 1, max: 50, step: 1 },
    T_max: { min: 1, max: 180, step: 1 },
    minPts: { min: 2, max: 4, step: 1, allowedValues: [2, 3, 4] },
  },
  lachesis: {
    dur_min: { min: 1, max: 180, step: 1 },
    dt_max: { min: 1, max: 180, step: 1 },
    delta_roam: { min: 5, max: 60, step: 1 },
  },
  gridbased: {
    cell_size: { min: 25, max: 500, step: 1 },
    min_time: { min: 1, max: 180, step: 1 },
  },
  medoid: {
    radius: { min: 1, max: 500, step: 1 },
    min_duration: { min: 1, max: 3600, step: 1 },
  },
}

const ALGORITHM_REFERENCES: Record<string, { paper_label: string; paper_url?: string; docs_url?: string }> = {
  dbstop: {
    paper_label: "NOMAD DBSTOP compare configuration",
    docs_url: "https://nomad.readthedocs.io/en/latest/stop_detection.html#dbscan",
  },
  lachesis: {
    paper_label: "Hariharan & Toyama (2004), Project Lachesis",
    paper_url: "https://www.microsoft.com/en-us/research/publication/project-lachesis-parsing-and-modeling-location-histories/",
    docs_url: "https://nomad.readthedocs.io/en/latest/stop_detection.html#lachesis",
  },
  seqscan: {
    paper_label: "NOMAD SeqScan implementation notes",
    docs_url: "https://nomad.readthedocs.io/en/latest/stop_detection.html#dbscan",
  },
  dbscan: {
    paper_label: "Birant & Kut (2007), ST-DBSCAN",
    paper_url: "https://doi.org/10.1016/j.datak.2006.01.013",
    docs_url: "https://nomad.readthedocs.io/en/latest/stop_detection.html#dbscan",
  },
  gridbased: {
    paper_label: "NOMAD grid-based stop detection",
    docs_url: "https://nomad.readthedocs.io/en/latest/stop_detection.html#grid-based",
  },
  medoid: {
    paper_label: "Medoid-based clustering family",
  },
}

function validateAlgorithmParams(
  algoId: string,
  algoDef: { parameters: Array<{ name: string; defaultValue: string }> },
  values: Record<string, string>,
): { normalized: Record<string, number>; errors: Record<string, string> } {
  const normalized: Record<string, number> = {}
  const errors: Record<string, string> = {}
  const constraints = PARAMETER_CONSTRAINTS[algoId] ?? {}

  for (const p of algoDef.parameters) {
    const constraint = constraints[p.name]
    const raw = values[p.name] ?? p.defaultValue
    if (raw.trim() === "") {
      errors[p.name] = "Enter a number."
      continue
    }
    const num = Number(raw)
    if (!Number.isFinite(num)) {
      errors[p.name] = "Enter a number."
      continue
    }
    if (constraint) {
      if (constraint.allowedValues && !constraint.allowedValues.includes(num)) {
        errors[p.name] = `Allowed values: ${constraint.allowedValues.join(", ")}`
        continue
      }
      if (num < constraint.min || num > constraint.max) {
        errors[p.name] = `Must be between ${constraint.min} and ${constraint.max}.`
        continue
      }
      const offset = Math.abs((num - constraint.min) % constraint.step)
      if (offset > 1e-9 && Math.abs(offset - constraint.step) > 1e-9) {
        errors[p.name] = `Must be a multiple of ${constraint.step}.`
        continue
      }
    }
    normalized[p.name] = num
  }
  return { normalized, errors }
}

function paramInputValue(
  values: Record<string, string>,
  name: string,
  defaultValue: string,
): string {
  return Object.prototype.hasOwnProperty.call(values, name) ? values[name] : defaultValue
}

function CompareAnimationPanel({
  panel,
  mode = "compare",
}: {
  panel: ComparePanelResponse | null | undefined
  mode?: "single" | "compare"
}) {
  const maxHeightClass = mode === "single" ? "max-h-[calc(100vh-300px)]" : "max-h-[calc(100vh-420px)]"
  const hasAnimation = Boolean(panel?.available && panel?.animation_data_url)

  return (
    <Card className="overflow-hidden">
      <CardHeader className="py-2 px-3 bg-muted/30 shrink-0">
        <CardTitle className="text-sm font-semibold">{panel?.title ?? "No visualization"}</CardTitle>
      </CardHeader>
      <CardContent className="p-2">
        {hasAnimation ? (
          <div className={`w-full ${maxHeightClass} flex justify-center`}>
            <img
              src={panel?.animation_data_url ?? ""}
              alt={panel?.title ?? "Algorithm animation"}
              className={`mx-auto w-auto max-w-full ${maxHeightClass} h-auto object-contain rounded-md border border-border`}
            />
          </div>
        ) : (
          <div className={`w-full ${maxHeightClass} rounded-md border border-dashed border-border bg-muted/40`} />
        )}
      </CardContent>
    </Card>
  )
}

const algorithms = [
  {
    id: "dbstop",
    name: "DBSTOP",
    shortDesc: "Density-based stop detection (notebook compare panel)",
    description:
      "DBSTOP is a density-based stop detection configuration used in this dashboard’s compare workflow. It is parameterized by time_thresh, dist_thresh, min_pts, and dur_min, and is visualized with the same map-and-barcode layout as the notebook compare panel so behavior can be inspected side-by-side against other methods.",
    source: "ta_seqscan_examples.ipynb compare section",
    parameters: [
      { name: "time_thresh", defaultValue: "60", description: "Temporal threshold (minutes)" },
      { name: "dist_thresh", defaultValue: "10", description: "Distance threshold (meters)" },
      { name: "min_pts", defaultValue: "3", description: "Minimum points for cluster core" },
      { name: "dur_min", defaultValue: "5", description: "Minimum stop duration (minutes)" },
    ],
  },
  { 
    id: "lachesis", 
    name: "Lachesis", 
    shortDesc: "Roaming-distance based stop detection",
    description: "Lachesis is a greedy, sequential and threshold-based algorithm taking in three parameters: dur_min, dt_max, and delta_roam. The algorithm processes pings in time order, and builds a candidate stop by scanning trajectories and grouping consecutive pings into a cluster under the following conditions: (1) the cluster diameter is less than or equal to delta_roam, (2) has no temporal gaps larger than dt_max, and (3) the accumulated duration is equal to or greater than dur_min. Key limitations include (1) being highly sensitive to parameter choices, with a small delta_roam leading to splitting or missing stops, and a large delta_roam leading to merging stops, and (2) assuming continuous sampling, so GPS noise or sparse data can lead to fragmented stops.", 
    source: "Lachesis: A GPS-Based Human Mobility Pattern Analyzer",
    parameters: [
      { name: "dur_min", defaultValue: "5", description: "Minimum duration for a stop (minutes)" }, 
      { name: "dt_max", defaultValue: "60", description: "Maximum allowed temporal gap between pings (minutes)" },
      { name: "delta_roam", defaultValue: "25", description: "Maximum roaming distance (meters)" }
    ] 
  },
  { 
    id: "seqscan", 
    name: "SeqScan", 
    shortDesc: "Sequential scanning with thresholds",
    description: "SeqScan extends DBSCAN to spatio-temporal data while guaranteeing temporal separation between detected stops. Each stop is defined as a DBSCAN cluster computed over a local time context, using the reachability graph of core points (a ping with a minimum of min_pts neighbors at a distance below dist_thresh). The algorithm scans points in chronological order, maintaining both an active cluster and an active time context for neighbor queries. For each incoming ping, neighbors are queried within the active time context; if it is connected to the active cluster, the active cluster is expanded. Otherwise, DBSCAN is applied to the tail of the trajectory, starting from the last ping of the active cluster up to the incoming ping. If a cluster with duration at least dur_min is found in the tail, it becomes the new active cluster and the active time context is shifted, continuing until reaching the end of the trajectory.", 
    source: "Sequential Scan Algorithm for GPS Stop Detection",
    parameters: [
      { name: "time_thresh", defaultValue: "60", description: "Time threshold for stop detection (minutes)" }, 
      { name: "dist_thresh", defaultValue: "10", description: "Distance threshold (meters)" },
      { name: "min_pts", defaultValue: "3", description: "Minimum points for cluster core" },
      { name: "dur_min", defaultValue: "5", description: "Minimum stop duration (minutes)" }
    ] 
  },
  { 
    id: "dbscan", 
    name: "ST-DBSCAN", 
    shortDesc: "Density-based spatiotemporal clustering",
    description: "ST-DBSCAN extends classical DBSCAN by incorporating a second scale parameter to avoid long temporal gaps within detected stops, namely T_max, in addition to the spatial scale parameter eps_spatial and minPts, the usual density threshold in DBSCAN. In this way, it incorporates both spatial and temporal proximity to define reachability. Since stops are defined as components of the reachability graph of core points, ST-DBSCAN is robust to noise points that could break up stops in sequential algorithms. Standard ST-DBSCAN does not guarantee temporal separation, so clusters can overlap in time even if they represent different stops. In this dashboard, we extend it with a simple heuristic to remove overlaps in which every core point acts as a cutoff and prevents the merging of core points that are not neighbors of said point.", 
    source: "ST-DBSCAN: An algorithm for clustering spatial-temporal data",
    parameters: [
      { name: "eps_spatial", defaultValue: "50", description: "Spatial radius epsilon (meters)" }, 
      { name: "T_max", defaultValue: "60", description: "Maximum temporal gap for neighborhood linkage (minutes)" }, 
      { name: "minPts", defaultValue: "3", description: "Minimum neighbors required for a core point" }
    ] 
  },
  { 
    id: "gridbased", 
    name: "Grid-based", 
    shortDesc: "Cell-based dwell time analysis",
    description: "Divides the geographic area into grid cells and identifies stops based on dwell time within cells, useful for aggregated analysis at different spatial resolutions.", 
    source: "Grid-based Methods for Mobility Analysis",
    parameters: [
      { name: "cell_size", defaultValue: "100", description: "Grid cell size (meters)" }, 
      { name: "min_time", defaultValue: "5", description: "Minimum time in cell (minutes)" }
    ] 
  },
  { 
    id: "medoid", 
    name: "Medoid-based", 
    shortDesc: "Representative point clustering",
    description: "Uses medoid computation to find representative central points of potential stops, robust against outliers in noisy GPS data.", 
    source: "Medoid-based Clustering for GPS Trajectories",
    parameters: [
      { name: "radius", defaultValue: "50", description: "Search radius (meters)" }, 
      { name: "min_duration", defaultValue: "60", description: "Minimum stop duration" }
    ] 
  },
]

const sampleDataPoints: DataPoint[] = [
  { id: "1", x: 50, y: 110, time: "orange", color: "orange" }, { id: "2", x: 65, y: 100, time: "orange", color: "orange" },
  { id: "3", x: 80, y: 115, time: "orange", color: "orange" }, { id: "4", x: 55, y: 140, time: "orange", color: "orange" },
  { id: "5", x: 260, y: 130, time: "pink", color: "pink" }, { id: "6", x: 280, y: 145, time: "pink", color: "pink" },
  { id: "7", x: 295, y: 155, time: "pink", color: "pink" }, { id: "8", x: 275, y: 170, time: "pink", color: "pink" },
  { id: "9", x: 290, y: 185, time: "pink", color: "pink" }, { id: "10", x: 305, y: 160, time: "pink", color: "pink" },
  { id: "11", x: 265, y: 200, time: "pink", color: "pink" }, { id: "12", x: 290, y: 295, time: "pink", color: "pink" },
  { id: "13", x: 475, y: 100, time: "purple", color: "purple" }, { id: "14", x: 490, y: 135, time: "purple", color: "purple" },
  { id: "15", x: 505, y: 150, time: "purple", color: "purple" }, { id: "16", x: 520, y: 115, time: "purple", color: "purple" },
  { id: "17", x: 540, y: 130, time: "purple", color: "purple" }, { id: "18", x: 475, y: 250, time: "purple", color: "purple" },
  { id: "19", x: 495, y: 270, time: "purple", color: "purple" }, { id: "20", x: 530, y: 255, time: "purple", color: "purple" },
]

const timelineSegments: TimeSegment[] = [
  { id: "orange", startPercent: 10, widthPercent: 8, color: "orange" },
  { id: "pink", startPercent: 30, widthPercent: 25, color: "pink" },
  { id: "purple", startPercent: 68, widthPercent: 20, color: "purple" },
]

const generateDataPoints = (): DataPoint[] => {
  const colors = ["orange", "pink", "purple"] as const
  const clusters = [{ cx: 60, cy: 120, count: 4, color: colors[0] }, { cx: 280, cy: 160, count: 8, color: colors[1] }, { cx: 500, cy: 180, count: 6, color: colors[2] }]
  const points: DataPoint[] = []
  let id = 1
  for (const c of clusters) {
    for (let i = 0; i < c.count; i++) {
      points.push({ id: String(id++), x: c.cx + (Math.random() - 0.5) * 60, y: c.cy + (Math.random() - 0.5) * 60, time: c.color, color: c.color })
    }
  }
  return points
}

const DEMO_ALGORITHM_IDS = new Set(["dbstop", "lachesis", "seqscan", "dbscan", "gridbased"])
const DASHBOARD_VIEWS = new Set(["home", "learn", "demo", "metrics"] as const)
type DashboardView = "home" | "learn" | "demo" | "metrics"

// ============ MAIN COMPONENT ============

function NomadDashboard() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [activeView, setActiveView] = useState<DashboardView>("home")
  const [previousView, setPreviousView] = useState<DashboardView>("home")
  const [selectedTimeRange, setSelectedTimeRange] = useState<string | null>(null)
  const [expandedAlgorithm, setExpandedAlgorithm] = useState<string | null>(null)
  const [compareMode, setCompareMode] = useState(false)
  const [leftAlgorithm, setLeftAlgorithm] = useState("dbstop")
  const [rightAlgorithm, setRightAlgorithm] = useState("seqscan")
  const [leftParams, setLeftParams] = useState<Record<string, string>>({})
  const [rightParams, setRightParams] = useState<Record<string, string>>({})
  const [leftParamErrors, setLeftParamErrors] = useState<Record<string, string>>({})
  const [rightParamErrors, setRightParamErrors] = useState<Record<string, string>>({})
  const [compareApiData, setCompareApiData] = useState<CompareApiResponse | null>(null)
  const [compareLoading, setCompareLoading] = useState(false)
  const [compareError, setCompareError] = useState<string | null>(null)
  const [compareSeed, setCompareSeed] = useState(1)
  const compareRequestIdRef = useRef(0)
  const [metricsOptions, setMetricsOptions] = useState<MetricsOptionsResponse | null>(null)
  const metricsMode = "compare" as const
  const [metricsLeftAlgorithm, setMetricsLeftAlgorithm] = useState("Lachesis")
  const [metricsRightAlgorithm, setMetricsRightAlgorithm] = useState("Sequential")
  const [metricsTrajectoryUser, setMetricsTrajectoryUser] = useState("")
  const [metricsIterations, setMetricsIterations] = useState(100)
  const [metricsSweepMin, setMetricsSweepMin] = useState(5)
  const [metricsSweepMax, setMetricsSweepMax] = useState(50)
  const [metricsSweepPoints, setMetricsSweepPoints] = useState(50)
  const [metricsSeed, setMetricsSeed] = useState(2026)
  const [metricsSweepLimits, setMetricsSweepLimits] = useState<Record<string, SweepLimit>>({})
  const [metricsApiData, setMetricsApiData] = useState<MetricsApiResponse | null>(null)
  const [metricsLoading, setMetricsLoading] = useState(false)
  const [metricsError, setMetricsError] = useState<string | null>(null)

  const syncUrl = useCallback((view: DashboardView, algoId: string | null = null) => {
    const params = new URLSearchParams(searchParams.toString())
    if (view === "home") {
      params.delete("view")
      params.delete("algo")
    } else {
      params.set("view", view)
      if (view === "learn" && algoId) {
        params.set("algo", algoId)
      } else {
        params.delete("algo")
      }
    }
    const qs = params.toString()
    router.push(qs ? `${pathname}?${qs}` : pathname)
  }, [pathname, router, searchParams])

  const runCompareVisualization = useCallback(async (seed: number) => {
    const leftAlgo = algorithms.find((a) => a.id === leftAlgorithm)
    const rightAlgo = algorithms.find((a) => a.id === rightAlgorithm)
    if (!leftAlgo || !rightAlgo) return
    const requestId = ++compareRequestIdRef.current

    const parseParams = (algoId: string, normalized: Record<string, number>) => {
      const out: Record<string, number> = { ...normalized }
      if (algoId === "dbscan") {
        out.dist_thresh = out.eps_spatial ?? 10
        out.time_thresh = out.T_max ?? 60
        out.min_pts = out.minPts ?? 3
      }
      if (algoId === "seqscan") {
        out.min_pts = out.min_pts ?? 3
      }
      if (algoId === "lachesis") {
        out.dt_max = out.dt_max ?? 60
        out.delta_roam = out.delta_roam ?? 20
        out.dur_min = out.dur_min ?? 5
      }
      return out
    }

    const leftValidation = validateAlgorithmParams(leftAlgorithm, leftAlgo, leftParams)
    const rightValidation = validateAlgorithmParams(rightAlgorithm, rightAlgo, rightParams)
    setLeftParamErrors(leftValidation.errors)
    setRightParamErrors(compareMode ? rightValidation.errors : {})
    if (Object.keys(leftValidation.errors).length > 0 || (compareMode && Object.keys(rightValidation.errors).length > 0)) {
      setCompareError("Fix highlighted parameter values before running.")
      return
    }

    setCompareLoading(true)
    setCompareError(null)
    setCompareApiData(null)
    try {
      const res = await fetch("/api/algorithm-compare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          seed,
          mode: compareMode ? "compare" : "single",
          left: {
            algo: leftAlgorithm === "dbscan" ? "tadbscan" : leftAlgorithm,
            params: parseParams(leftAlgorithm, leftValidation.normalized),
            cmap: "PiYG",
          },
          right: {
            algo: rightAlgorithm === "dbscan" ? "tadbscan" : rightAlgorithm,
            params: parseParams(rightAlgorithm, rightValidation.normalized),
            cmap: "PiYG",
          },
        }),
      })
      if (!res.ok) {
        const msg = await res.text()
        throw new Error(msg || "Algorithm compare request failed")
      }
      const data = (await res.json()) as CompareApiResponse
      if (requestId !== compareRequestIdRef.current) return
      setCompareApiData(data)
    } catch (err) {
      if (requestId !== compareRequestIdRef.current) return
      setCompareError(err instanceof Error ? err.message : "Unexpected compare error")
    } finally {
      if (requestId !== compareRequestIdRef.current) return
      setCompareLoading(false)
    }
  }, [leftAlgorithm, rightAlgorithm, leftParams, rightParams, compareMode])

  const handleVisualize = useCallback((_side: "left" | "right") => {
    void runCompareVisualization(compareSeed)
  }, [runCompareVisualization, compareSeed])

  const handleNewTrajectory = useCallback(() => {
    const nextSeed = compareSeed + 1
    setCompareSeed(nextSeed)
    void runCompareVisualization(nextSeed)
  }, [compareSeed, runCompareVisualization])

  const loadMetricsOptions = useCallback(async () => {
    try {
      const res = await fetch("/api/algorithm-metrics", { method: "GET" })
      if (!res.ok) {
        const msg = await res.text()
        throw new Error(msg || "Failed to load aggregated metrics options")
      }
      const data = (await res.json()) as MetricsOptionsResponse
      setMetricsOptions(data)
      setMetricsLeftAlgorithm(data.defaults.left_algorithm ?? "Lachesis")
      setMetricsRightAlgorithm(data.defaults.right_algorithm ?? "Sequential")
      setMetricsIterations(data.defaults.iterations ?? 100)
      setMetricsSweepMin(data.defaults.sweep_min ?? 5)
      setMetricsSweepMax(data.defaults.sweep_max ?? 50)
      setMetricsSweepPoints(data.defaults.sweep_points ?? 50)
      setMetricsSeed(data.defaults.seed ?? 2026)
      setMetricsSweepLimits(data.sweep_limits ?? {})
      const firstUser = data.trajectories?.[0]?.user_id ?? ""
      setMetricsTrajectoryUser(firstUser)
    } catch (err) {
      setMetricsError(err instanceof Error ? err.message : "Failed to load metrics options")
    }
  }, [])

  const runMetricsVisualization = useCallback(async () => {
    if (!metricsOptions) return
    const algorithmsForRange = [metricsLeftAlgorithm, metricsRightAlgorithm]
    const limits = algorithmsForRange
      .map((a) => metricsSweepLimits[a])
      .filter((v): v is SweepLimit => Boolean(v))
    if (limits.length > 0) {
      const allowedMin = Math.max(...limits.map((l) => l.min))
      const allowedMax = Math.min(...limits.map((l) => l.max))
      if (!Number.isInteger(metricsSweepMin) || !Number.isInteger(metricsSweepMax) || !Number.isInteger(metricsSweepPoints)) {
        setMetricsError("Sweep values must be integers (step = 1).")
        return
      }
      if (metricsSweepMin < allowedMin || metricsSweepMax > allowedMax || metricsSweepMin > metricsSweepMax) {
        setMetricsError(`Sweep range must be between ${allowedMin} and ${allowedMax} for the selected algorithms.`)
        return
      }
      if (metricsSweepPoints < 2 || metricsSweepPoints > 200) {
        setMetricsError("Sweep points must be between 2 and 200.")
        return
      }
    }
    setMetricsLoading(true)
    setMetricsError(null)
    try {
      const res = await fetch("/api/algorithm-metrics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: metricsMode,
          left_algorithm: metricsLeftAlgorithm,
          right_algorithm: metricsRightAlgorithm,
          trajectory_user_id: metricsTrajectoryUser,
          iterations: metricsIterations,
          sweep_min: metricsSweepMin,
          sweep_max: metricsSweepMax,
          sweep_points: metricsSweepPoints,
          seed: metricsSeed,
        }),
      })
      const data = (await res.json()) as MetricsApiResponse | { error?: string }
      if (!res.ok) {
        throw new Error("error" in data && data.error ? data.error : "Aggregated metrics run failed")
      }
      setMetricsApiData(data as MetricsApiResponse)
    } catch (err) {
      setMetricsError(err instanceof Error ? err.message : "Aggregated metrics run failed")
    } finally {
      setMetricsLoading(false)
    }
  }, [
    metricsIterations,
    metricsLeftAlgorithm,
    metricsMode,
    metricsOptions,
    metricsRightAlgorithm,
    metricsSeed,
    metricsSweepMax,
    metricsSweepMin,
    metricsSweepPoints,
    metricsSweepLimits,
    metricsTrajectoryUser,
  ])

  const handleNewMetricsTrajectory = useCallback(() => {
    if (!metricsOptions || metricsOptions.trajectories.length === 0) return
    const ids = metricsOptions.trajectories.map((t) => t.user_id)
    const curr = Math.max(0, ids.indexOf(metricsTrajectoryUser))
    const next = ids[(curr + 1) % ids.length]
    setMetricsTrajectoryUser(next)
    setMetricsSeed((s) => s + 1)
  }, [metricsOptions, metricsTrajectoryUser])

  const handleAlgorithmSelect = (algorithmId: string) => {
    setLeftAlgorithm(DEMO_ALGORITHM_IDS.has(algorithmId) ? algorithmId : "dbstop")
    setExpandedAlgorithm(null)
    setActiveView("demo")
    syncUrl("demo")
  }

  const handleLeftAlgorithmChange = useCallback((algorithmId: string) => {
    setLeftAlgorithm(algorithmId)
    setLeftParams({})
    setLeftParamErrors({})
  }, [])

  const handleRightAlgorithmChange = useCallback((algorithmId: string) => {
    setRightAlgorithm(algorithmId)
    setRightParams({})
    setRightParamErrors({})
  }, [])

  const goHome = () => {
    setActiveView("home")
    setExpandedAlgorithm(null)
    syncUrl("home")
  }

  const goBack = () => {
    let nextView: DashboardView
    if (activeView === "metrics") {
      nextView = "demo"
    } else {
      nextView = previousView
    }
    setActiveView(nextView)
    setExpandedAlgorithm(null)
    syncUrl(nextView)
  }

  const navigateTo = (view: DashboardView) => {
    setPreviousView(activeView)
    setActiveView(view)
    syncUrl(view)
  }

  const openLearnAlgorithm = useCallback((algorithmId: string) => {
    setExpandedAlgorithm(algorithmId)
    setActiveView("learn")
    syncUrl("learn", algorithmId)
  }, [syncUrl])

  const leftAlgo = algorithms.find((a) => a.id === leftAlgorithm)
  const rightAlgo = algorithms.find((a) => a.id === rightAlgorithm)
  const demoAlgorithms = algorithms.filter((a) => DEMO_ALGORITHM_IDS.has(a.id))
  const metricsAlgorithms = metricsOptions?.algorithms ?? ["Lachesis", "Sequential"]
  const metricsTrajectories = metricsOptions?.trajectories ?? []
  const parameterNotes = metricsOptions?.parameter_notes ?? FALLBACK_PARAMETER_NOTES
  const leftParameterNote = parameterNotes[metricsLeftAlgorithm]
  const rightParameterNote = parameterNotes[metricsRightAlgorithm]
  const previewMapUrl = metricsApiData?.trajectory_preview?.image_data_url ?? null
  const previewTimelineUrl = metricsApiData?.trajectory_preview?.timeline_data_url ?? null
  const hasGroundTruthPreview = Boolean(previewMapUrl || previewTimelineUrl)

  useEffect(() => {
    const rawView = searchParams.get("view")
    const nextView: DashboardView = rawView && DASHBOARD_VIEWS.has(rawView as DashboardView)
      ? (rawView as DashboardView)
      : "home"
    const rawAlgo = searchParams.get("algo")
    const hasAlgo = Boolean(rawAlgo && algorithms.some((a) => a.id === rawAlgo))
    const nextExpanded = nextView === "learn" && hasAlgo ? rawAlgo : null

    setActiveView(nextView)
    setExpandedAlgorithm(nextExpanded)
  }, [searchParams])

  useEffect(() => {
    if (activeView === "demo") {
      if (!DEMO_ALGORITHM_IDS.has(leftAlgorithm)) {
        setLeftAlgorithm("dbstop")
        return
      }
      if (!DEMO_ALGORITHM_IDS.has(rightAlgorithm)) {
        setRightAlgorithm("seqscan")
        return
      }
      void runCompareVisualization(compareSeed)
    }
  }, [activeView, compareSeed, runCompareVisualization, leftAlgorithm, rightAlgorithm])

  useEffect(() => {
    void loadMetricsOptions()
  }, [loadMetricsOptions])

  useEffect(() => {
    if (activeView === "metrics" && metricsOptions && !metricsApiData && !metricsLoading) {
      void runMetricsVisualization()
    }
  }, [activeView, metricsApiData, metricsLoading, metricsOptions, runMetricsVisualization])

  return (
    <div className="h-screen overflow-hidden bg-background flex flex-col nomad-shell">
      {/* HOME VIEW */}
      {activeView === "home" && (
        <div className="flex-1 overflow-y-auto">
          <header className="sticky top-0 z-20 border-b border-[#263449] bg-[#111625]/92 backdrop-blur">
            <div className="mx-auto flex h-[74px] max-w-7xl items-center justify-between px-5">
              <CSSLabLogo />
              <nav className="hidden items-center gap-8 text-sm font-medium text-[#94a1b7] md:flex">
                <button className="transition-colors hover:text-[#f2f4eb]" onClick={() => navigateTo("learn")}>About</button>
                <button className="transition-colors hover:text-[#f2f4eb]" onClick={() => navigateTo("demo")}>Solution</button>
                <button className="transition-colors hover:text-[#f2f4eb]" onClick={() => navigateTo("learn")}>Tools</button>
                <button className="transition-colors hover:text-[#f2f4eb]" onClick={() => navigateTo("metrics")}>Dashboard</button>
              </nav>
              <Button size="lg" onClick={() => navigateTo("demo")} className="h-11 bg-[#459ba4] px-6 text-[#08101c] hover:bg-[#62b8bf]">
                Open Dashboard
              </Button>
            </div>
          </header>

          <section className="nomad-hero min-h-[610px] border-b border-[#263449] px-5">
            <div className="mx-auto flex max-w-6xl flex-col items-center py-12 text-center md:py-16">
              <div className="mb-10 rounded-full border border-[#459ba4]/35 bg-[#111625]/65 px-5 py-2 text-sm font-medium tracking-[0.12em] text-[#8acac8]">
                UNIVERSITY OF PENNSYLVANIA - SEAS
              </div>
              <h1 className="text-7xl font-black leading-none tracking-normal text-[#f2f4eb] sm:text-8xl md:text-[7.5rem]">
                N<span className="text-[#8acac8]">O</span>MAD
              </h1>
              <p className="mt-8 max-w-4xl text-2xl font-semibold tracking-normal text-[#f2f4eb] md:text-3xl">
                Stop detection tools for noisy human mobility data.
              </p>
              <p className="mt-5 max-w-4xl text-xl leading-relaxed text-[#94a1b7]">
                Visualize how algorithms turn sparse GPS pings into visits, trips, and time-separated stops that are easier to inspect and compare.
              </p>
              <div className="mt-10 flex flex-col gap-4 sm:flex-row">
                <Button size="lg" onClick={() => navigateTo("demo")} className="h-14 min-w-60 bg-[#459ba4] text-base font-semibold text-[#08101c] hover:bg-[#62b8bf]">
                  Demo
                </Button>
                <Button variant="outline" size="lg" onClick={() => navigateTo("learn")} className="h-14 min-w-44 border-[#3a465d] bg-[#111625]/45 text-base font-semibold text-[#f2f4eb] hover:bg-[#242b3d]">
                  Learn More
                </Button>
              </div>

              <div className="mt-16 grid w-full overflow-hidden rounded-lg border border-[#263449] bg-[#171d2e]/78 text-left backdrop-blur md:grid-cols-4">
                {[
                  ["7", "Algorithms"],
                  ["20", "Sample pings"],
                  ["3", "Timeline blocks"],
                  ["100%", "Cached workflow"],
                ].map(([value, label]) => (
                  <div key={label} className="border-[#263449] p-7 text-center md:border-r last:border-r-0">
                    <p className="text-4xl font-bold text-[#459ba4]">{value}</p>
                    <p className="mt-2 text-xs font-medium uppercase tracking-[0.18em] text-[#94a1b7]">{label}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="mx-auto grid max-w-7xl gap-8 px-5 py-10 lg:grid-cols-[1.05fr_0.95fr]">
            <div className="space-y-6">
              <div>
                <h2 className="text-3xl font-bold text-[#f2f4eb]">Stop Detection Overview</h2>
                <p className="mt-4 text-lg leading-relaxed text-[#b6c9dc]">
                  Stop detection identifies intervals where a person remains stationary long enough to count as a meaningful visit. Each detected stop summarizes a user, a centroid, and start and end times, reducing raw GPS streams into mobility events that can support downstream analysis.
                </p>
                <p className="mt-4 text-lg leading-relaxed text-[#94a1b7]">
                  The DBSTOP work highlights the core challenge: real GPS data is noisy, sparse, and bursty. Sequential methods can merge nearby visits or split a large stop, while density-based methods need temporal separation so stops do not overlap in time.
                </p>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                {[
                  ["#8acac8", "Noise robust", "Inspect behavior when GPS uncertainty scatters pings around places."],
                  ["#8199d8", "Time consistent", "Compare methods that must separate visits across a trajectory."],
                  ["#dec345", "Parameter aware", "See how thresholds change merging, splitting, and missing stops."],
                ].map(([color, title, body]) => (
                  <Card key={title} className="nomad-soft-card rounded-lg py-0">
                    <CardContent className="p-5">
                      <div className="mb-4 h-3 w-10 rounded-full" style={{ backgroundColor: color }} />
                      <h3 className="text-lg font-semibold text-[#f2f4eb]">{title}</h3>
                      <p className="mt-2 text-sm leading-relaxed text-[#94a1b7]">{body}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>

            <Card className="nomad-card overflow-hidden rounded-lg py-0">
              <CardContent className="p-0">
                <div className="border-b border-[#263449] bg-[#202738]/80 px-5 py-4">
                  <h3 className="text-lg font-semibold text-[#f2f4eb]">Trajectory Preview</h3>
                </div>
                <div className="p-5">
                  <div className="overflow-hidden rounded-md border border-[#263449] bg-[#111625]">
                    <FloorPlan
                      dataPoints={sampleDataPoints}
                      selectedTimeRange={selectedTimeRange}
                      placeholderSrc={GROUND_TRUTH_PLACEHOLDER_IMAGE}
                    />
                  </div>
                  <div className="mt-5">
                    <Timeline segments={timelineSegments} selectedSegment={selectedTimeRange} onSegmentClick={setSelectedTimeRange} />
                  </div>
                  <div className="mt-5 grid grid-cols-3 gap-3 text-sm">
                    <div className="rounded-md border border-[#263449] bg-[#202738]/60 p-3">
                      <p className="text-[#94a1b7]">Morning</p>
                      <p className="font-semibold text-[#dec345]">Home stop</p>
                    </div>
                    <div className="rounded-md border border-[#263449] bg-[#202738]/60 p-3">
                      <p className="text-[#94a1b7]">Midday</p>
                      <p className="font-semibold text-[#8199d8]">Pause</p>
                    </div>
                    <div className="rounded-md border border-[#263449] bg-[#202738]/60 p-3">
                      <p className="text-[#94a1b7]">Late</p>
                      <p className="font-semibold text-[#8acac8]">Visit zone</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </section>
        </div>
      )}

      {/* LEARN VIEW */}
      {activeView === "learn" && !expandedAlgorithm && (
        <div className="flex-1 flex flex-col p-4 gap-3 overflow-hidden">
          <div className="flex items-center justify-between shrink-0">
            <div className="flex items-center gap-4">
              <NavButtons onHome={goHome} onBack={goBack} />
              <h2 className="text-3xl font-bold">Learn Algorithms</h2>
            </div>
            <CSSLabLogo />
          </div>
          <p className="text-sm text-muted-foreground">
            Select an algorithm card to inspect assumptions, parameter behavior, and a method sketch before running the demo.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 overflow-hidden">
            {algorithms.map((algo) => (
              <Card
                key={algo.id}
                className="cursor-pointer hover:shadow-lg transition-all border-2 border-border hover:border-primary/50 flex flex-col"
                onClick={() => openLearnAlgorithm(algo.id)}
              >
                <CardHeader className="pb-2 shrink-0">
                  <CardTitle className="text-lg">{algo.name}</CardTitle>
                </CardHeader>
                <CardContent className="flex-1 flex flex-col gap-3">
                  <p className="text-sm text-muted-foreground">{algo.shortDesc}</p>
                  <div className="bg-muted/50 rounded-md min-h-[120px] p-2">
                    <NotebookFigure algorithmId={algo.id} mode="learn" alt={`${algo.name} notebook visualization`} />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Tap to open details, parameter definitions, and a direct path to the interactive demo.
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* EXPANDED ALGORITHM VIEW */}
      {activeView === "learn" && expandedAlgorithm && (
        <div className="flex-1 flex flex-col p-4 gap-3 overflow-hidden">
          <div className="flex items-center justify-between shrink-0">
            <div className="flex items-center gap-4">
              <NavButtons
                onHome={goHome}
                onBack={() => {
                  setExpandedAlgorithm(null)
                  syncUrl("learn")
                }}
              />
              <h2 className="text-2xl font-bold">{algorithms.find(a => a.id === expandedAlgorithm)?.name}</h2>
            </div>
            <CSSLabLogo />
          </div>
          {(() => {
            const algo = algorithms.find(a => a.id === expandedAlgorithm)
            if (!algo) return null
            return (
              <div className="flex-1 flex flex-col bg-muted/30 rounded-xl p-4 gap-3 overflow-hidden">
                {/* Description */}
                <Card className="shrink-0">
                  <CardContent className="py-4">
                    <p className="text-sm text-muted-foreground">{algo.description}</p>
                    <div className="mt-2 text-sm text-muted-foreground space-y-1">
                      <p>Source: {algo.source}</p>
                      {ALGORITHM_REFERENCES[algo.id]?.paper_url ? (
                        <p>
                          Paper:{" "}
                          <a
                            href={ALGORITHM_REFERENCES[algo.id].paper_url}
                            target="_blank"
                            rel="noreferrer"
                            className="underline underline-offset-2"
                          >
                            {ALGORITHM_REFERENCES[algo.id].paper_label}
                          </a>
                        </p>
                      ) : (
                        <p>Paper: {ALGORITHM_REFERENCES[algo.id]?.paper_label}</p>
                      )}
                      {ALGORITHM_REFERENCES[algo.id]?.docs_url && (
                        <p>
                          Docs:{" "}
                          <a
                            href={ALGORITHM_REFERENCES[algo.id].docs_url}
                            target="_blank"
                            rel="noreferrer"
                            className="underline underline-offset-2"
                          >
                            Stop detection documentation
                          </a>
                        </p>
                      )}
                    </div>
                  </CardContent>
                </Card>
                {/* Diagram and Parameters */}
                <div className="grid md:grid-cols-2 gap-4">
                  <Card>
                    <CardContent className="p-4 h-full flex items-center justify-center">
                      <NotebookFigure algorithmId={algo.id} mode="learn" alt={`${algo.name} detailed notebook visualization`} />
                    </CardContent>
                  </Card>
                  {/* Parameters table */}
                  <Card className="overflow-hidden">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-lg">Parameters</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="rounded-md border overflow-hidden">
                        <table className="w-full text-sm">
                          <thead className="bg-muted">
                            <tr>
                              <th className="px-3 py-2 text-left font-medium">Name</th>
                              <th className="px-3 py-2 text-left font-medium">Description</th>
                            </tr>
                          </thead>
                          <tbody>
                            {algo.parameters.map((param, idx) => (
                              <tr key={param.name} className={idx % 2 === 0 ? "bg-muted/30" : ""}>
                                <td className="px-3 py-2 font-mono text-sm">{param.name}</td>
                                <td className="px-3 py-2 text-muted-foreground text-sm">{param.description}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </CardContent>
                  </Card>
                </div>
                {/* Demo button */}
                <Button onClick={() => handleAlgorithmSelect(algo.id)} size="lg" className="shrink-0">
                  Demo
                </Button>
              </div>
            )
          })()}
        </div>
      )}

      {/* DEMO VIEW */}
      {activeView === "demo" && (
        <div className="flex-1 flex flex-col p-4 gap-3 overflow-hidden">
          <div className="flex items-center justify-between shrink-0">
            <div className="flex items-center gap-4">
              <NavButtons onHome={goHome} onBack={goBack} />
              <h2 className="text-2xl font-bold">{compareMode ? "Compare Algorithms" : "Demo"}</h2>
            </div>
            <div className="flex items-center gap-3">
              <Button variant={compareMode ? "default" : "outline"} size="lg" onClick={() => setCompareMode(!compareMode)} className="gap-2">
                {compareMode ? <><Square className="h-4 w-4" /> Single</> : <><Columns2 className="h-4 w-4" /> Compare</>}
              </Button>
              <CSSLabLogo />
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            Dashboard-style preview: choose two algorithms and their own parameters, run, and inspect side-by-side map and barcode outputs.
          </p>

          {!compareMode ? (
            <div className="grid lg:grid-cols-[1fr_330px] gap-3 items-start overflow-hidden">
              <div className="flex flex-col gap-3">
                <CompareAnimationPanel panel={compareApiData?.left} mode="single" />
                {compareLoading && <p className="text-xs text-muted-foreground">Running notebook algorithm code...</p>}
                {compareError && <p className="text-xs text-red-500">{compareError}</p>}
              </div>
              <Card className="overflow-hidden">
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg font-semibold">{leftAlgo?.name || "Select Algorithm"}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Select value={leftAlgorithm} onValueChange={handleLeftAlgorithmChange}>
                    <SelectTrigger className="h-10 text-base"><SelectValue /></SelectTrigger>
                    <SelectContent>{demoAlgorithms.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent>
                  </Select>
                  <div className="space-y-2">
                    <h4 className="text-sm font-medium text-muted-foreground">Parameters</h4>
                    {leftAlgo?.parameters.map((p) => (
                      <div key={p.name} className="flex items-center gap-2">
                        <label className="text-sm font-mono w-24 shrink-0">{p.name}:</label>
                        {PARAMETER_CONSTRAINTS[leftAlgorithm]?.[p.name]?.allowedValues ? (
                          <Select
                            value={paramInputValue(leftParams, p.name, p.defaultValue)}
                            onValueChange={(value) => {
                              setLeftParams((prev) => ({ ...prev, [p.name]: value }))
                              setLeftParamErrors((prev) => {
                                const next = { ...prev }
                                delete next[p.name]
                                return next
                              })
                            }}
                          >
                            <SelectTrigger className="h-9 text-sm">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {(PARAMETER_CONSTRAINTS[leftAlgorithm]?.[p.name]?.allowedValues ?? []).map((option) => (
                                <SelectItem key={`${p.name}-${option}`} value={String(option)}>
                                  {option}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <Input
                            type="number"
                            min={PARAMETER_CONSTRAINTS[leftAlgorithm]?.[p.name]?.min}
                            max={PARAMETER_CONSTRAINTS[leftAlgorithm]?.[p.name]?.max}
                            step={PARAMETER_CONSTRAINTS[leftAlgorithm]?.[p.name]?.step ?? 1}
                            value={paramInputValue(leftParams, p.name, p.defaultValue)}
                            onChange={(e) => {
                              setLeftParams((prev) => ({ ...prev, [p.name]: e.target.value }))
                              setLeftParamErrors((prev) => {
                                const next = { ...prev }
                                delete next[p.name]
                                return next
                              })
                            }}
                            className="h-9 text-sm"
                          />
                        )}
                      </div>
                    ))}
                    {Object.keys(leftParamErrors).length > 0 && (
                      <p className="text-xs text-red-500">
                        {Object.entries(leftParamErrors).map(([k, v]) => `${k}: ${v}`).join(" · ")}
                      </p>
                    )}
                  </div>
                  <div className="space-y-2 pt-2">
                    <Button variant="outline" onClick={handleNewTrajectory} size="lg" className="w-full">New Trajectory</Button>
                    <Button onClick={() => handleVisualize("left")} size="lg" className="w-full">Visualize</Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : (
            <div className="grid lg:grid-cols-[1fr_330px] gap-3 items-start overflow-hidden">
              <div className="flex flex-col gap-3">
                <div className="grid lg:grid-cols-2 gap-3">
                  <CompareAnimationPanel panel={compareApiData?.left} mode="compare" />
                  <CompareAnimationPanel panel={compareApiData?.right} mode="compare" />
                </div>
                {compareLoading && <p className="text-xs text-muted-foreground">Running notebook algorithm code...</p>}
                {compareError && <p className="text-xs text-red-500">{compareError}</p>}
              </div>
              <Card className="overflow-hidden">
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg font-semibold">Compare Parameters</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <h4 className="text-sm font-medium">{leftAlgo?.name ?? "Left algorithm"}</h4>
                    <Select value={leftAlgorithm} onValueChange={handleLeftAlgorithmChange}>
                      <SelectTrigger className="h-10 text-base"><SelectValue /></SelectTrigger>
                      <SelectContent>{demoAlgorithms.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent>
                    </Select>
                    {leftAlgo?.parameters.map((p) => (
                      <div key={p.name} className="flex items-center gap-2">
                        <label className="text-sm font-mono w-24 shrink-0">{p.name}:</label>
                        {PARAMETER_CONSTRAINTS[leftAlgorithm]?.[p.name]?.allowedValues ? (
                          <Select
                            value={paramInputValue(leftParams, p.name, p.defaultValue)}
                            onValueChange={(value) => {
                              setLeftParams((prev) => ({ ...prev, [p.name]: value }))
                              setLeftParamErrors((prev) => {
                                const next = { ...prev }
                                delete next[p.name]
                                return next
                              })
                            }}
                          >
                            <SelectTrigger className="h-9 text-sm">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {(PARAMETER_CONSTRAINTS[leftAlgorithm]?.[p.name]?.allowedValues ?? []).map((option) => (
                                <SelectItem key={`${p.name}-${option}`} value={String(option)}>
                                  {option}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <Input
                            type="number"
                            min={PARAMETER_CONSTRAINTS[leftAlgorithm]?.[p.name]?.min}
                            max={PARAMETER_CONSTRAINTS[leftAlgorithm]?.[p.name]?.max}
                            step={PARAMETER_CONSTRAINTS[leftAlgorithm]?.[p.name]?.step ?? 1}
                            value={paramInputValue(leftParams, p.name, p.defaultValue)}
                            onChange={(e) => {
                              setLeftParams((prev) => ({ ...prev, [p.name]: e.target.value }))
                              setLeftParamErrors((prev) => {
                                const next = { ...prev }
                                delete next[p.name]
                                return next
                              })
                            }}
                            className="h-9 text-sm"
                          />
                        )}
                      </div>
                    ))}
                    {Object.keys(leftParamErrors).length > 0 && (
                      <p className="text-xs text-red-500">
                        {Object.entries(leftParamErrors).map(([k, v]) => `${k}: ${v}`).join(" · ")}
                      </p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <h4 className="text-sm font-medium">{rightAlgo?.name ?? "Right algorithm"}</h4>
                    <Select value={rightAlgorithm} onValueChange={handleRightAlgorithmChange}>
                      <SelectTrigger className="h-10 text-base"><SelectValue /></SelectTrigger>
                      <SelectContent>{demoAlgorithms.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent>
                    </Select>
                    {rightAlgo?.parameters.map((p) => (
                      <div key={p.name} className="flex items-center gap-2">
                        <label className="text-sm font-mono w-24 shrink-0">{p.name}:</label>
                        {PARAMETER_CONSTRAINTS[rightAlgorithm]?.[p.name]?.allowedValues ? (
                          <Select
                            value={paramInputValue(rightParams, p.name, p.defaultValue)}
                            onValueChange={(value) => {
                              setRightParams((prev) => ({ ...prev, [p.name]: value }))
                              setRightParamErrors((prev) => {
                                const next = { ...prev }
                                delete next[p.name]
                                return next
                              })
                            }}
                          >
                            <SelectTrigger className="h-9 text-sm">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {(PARAMETER_CONSTRAINTS[rightAlgorithm]?.[p.name]?.allowedValues ?? []).map((option) => (
                                <SelectItem key={`${p.name}-${option}`} value={String(option)}>
                                  {option}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <Input
                            type="number"
                            min={PARAMETER_CONSTRAINTS[rightAlgorithm]?.[p.name]?.min}
                            max={PARAMETER_CONSTRAINTS[rightAlgorithm]?.[p.name]?.max}
                            step={PARAMETER_CONSTRAINTS[rightAlgorithm]?.[p.name]?.step ?? 1}
                            value={paramInputValue(rightParams, p.name, p.defaultValue)}
                            onChange={(e) => {
                              setRightParams((prev) => ({ ...prev, [p.name]: e.target.value }))
                              setRightParamErrors((prev) => {
                                const next = { ...prev }
                                delete next[p.name]
                                return next
                              })
                            }}
                            className="h-9 text-sm"
                          />
                        )}
                      </div>
                    ))}
                    {Object.keys(rightParamErrors).length > 0 && (
                      <p className="text-xs text-red-500">
                        {Object.entries(rightParamErrors).map(([k, v]) => `${k}: ${v}`).join(" · ")}
                      </p>
                    )}
                  </div>
                  <div className="space-y-2 pt-2">
                    <Button variant="outline" onClick={handleNewTrajectory} size="lg" className="w-full">New Trajectory</Button>
                    <Button onClick={() => handleVisualize("left")} size="lg" className="w-full">Visualize</Button>
                    <Button onClick={() => navigateTo("metrics")} size="lg" className="w-full">Aggregated Metrics</Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      )}

      {/* AGGREGATED METRICS VIEW */}
      {activeView === "metrics" && (
        <div className="flex-1 flex flex-col p-4 pb-8 gap-3 min-h-0 overflow-y-auto overflow-x-hidden">
          <div className="flex items-center justify-between shrink-0">
            <div className="flex items-center gap-4">
              <NavButtons onHome={goHome} onBack={goBack} />
              <h2 className="text-2xl font-bold">Aggregated Metrics</h2>
            </div>
            <div className="flex items-center gap-3">
              <Button variant="outline" size="lg" onClick={handleNewMetricsTrajectory}>New Trajectory</Button>
              <Button size="lg" onClick={() => void runMetricsVisualization()}>Run</Button>
              <CSSLabLogo />
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Each run sweeps one scale parameter and recomputes recall over sampled users.
            </p>
            <ul className="list-disc pl-4 text-xs text-muted-foreground space-y-1">
              <li>Faint points are all user-by-sweep recall values.</li>
              <li>Red points are each user&apos;s best recall across the sweep.</li>
              <li>The solid line is the mean recall, and the dashed line is the max of that mean curve.</li>
            </ul>
            <div className="rounded-md border border-border bg-muted/20 p-3">
              <p className="text-xs font-medium">Fixed parameters from notebooks</p>
              <div className="grid md:grid-cols-2 gap-3 mt-2">
                <div className="rounded-md border border-border/70 bg-background/60 p-2">
                  <p className="text-xs font-medium">{metricsLeftAlgorithm}</p>
                  {leftParameterNote ? (
                    <>
                      <p className="text-[11px] text-muted-foreground mt-1">
                        Sweep: <span className="font-mono">{leftParameterNote.sweep_parameter}</span> · Source: {leftParameterNote.source}
                      </p>
                      {leftParameterNote.sweep_note && (
                        <p className="text-[11px] text-muted-foreground mt-1">{leftParameterNote.sweep_note}</p>
                      )}
                      <div className="mt-1 text-[11px] text-muted-foreground">
                        {leftParameterNote.fixed_parameters.join(" · ")}
                      </div>
                    </>
                  ) : (
                    <p className="text-[11px] text-muted-foreground mt-1">No fixed-parameter note available.</p>
                  )}
                </div>
                <div className="rounded-md border border-border/70 bg-background/60 p-2">
                  <p className="text-xs font-medium">{metricsRightAlgorithm}</p>
                  {rightParameterNote ? (
                    <>
                      <p className="text-[11px] text-muted-foreground mt-1">
                        Sweep: <span className="font-mono">{rightParameterNote.sweep_parameter}</span> · Source: {rightParameterNote.source}
                      </p>
                      {rightParameterNote.sweep_note && (
                        <p className="text-[11px] text-muted-foreground mt-1">{rightParameterNote.sweep_note}</p>
                      )}
                      <div className="mt-1 text-[11px] text-muted-foreground">
                        {rightParameterNote.fixed_parameters.join(" · ")}
                      </div>
                    </>
                  ) : (
                    <p className="text-[11px] text-muted-foreground mt-1">No fixed-parameter note available.</p>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="grid lg:grid-cols-[340px_1fr] gap-3 items-start">
            <Card className="overflow-hidden">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg font-semibold">Experiment Controls</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1">
                  <label className="text-sm font-medium text-muted-foreground">Algorithm A</label>
                  <Select value={metricsLeftAlgorithm} onValueChange={setMetricsLeftAlgorithm}>
                    <SelectTrigger className="h-10 text-base"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {metricsAlgorithms.map((algo) => <SelectItem key={algo} value={algo}>{algo}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <label className="text-sm font-medium text-muted-foreground">Algorithm B</label>
                  <Select value={metricsRightAlgorithm} onValueChange={setMetricsRightAlgorithm}>
                    <SelectTrigger className="h-10 text-base"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {metricsAlgorithms.map((algo) => <SelectItem key={algo} value={algo}>{algo}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <label className="text-sm font-medium text-muted-foreground">Ground Truth Trajectory</label>
                  <Select value={metricsTrajectoryUser} onValueChange={setMetricsTrajectoryUser}>
                    <SelectTrigger className="h-10 text-base"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {metricsTrajectories.map((t) => (
                        <SelectItem key={t.user_id} value={t.user_id}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Iterations</label>
                    <Input type="number" min={1} step={1} value={String(metricsIterations)} onChange={(e) => setMetricsIterations(Number(e.target.value))} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Sweep points</label>
                    <Input type="number" min={2} max={200} step={1} value={String(metricsSweepPoints)} onChange={(e) => setMetricsSweepPoints(Number(e.target.value))} />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Min</label>
                    <Input type="number" step={1} value={String(metricsSweepMin)} onChange={(e) => setMetricsSweepMin(Number(e.target.value))} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Max</label>
                    <Input type="number" step={1} value={String(metricsSweepMax)} onChange={(e) => setMetricsSweepMax(Number(e.target.value))} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Seed</label>
                    <Input type="number" step={1} value={String(metricsSeed)} onChange={(e) => setMetricsSeed(Number(e.target.value))} />
                  </div>
                </div>
                {metricsSweepLimits[metricsLeftAlgorithm] && metricsSweepLimits[metricsRightAlgorithm] && (
                  <p className="text-[11px] text-muted-foreground">
                    Allowed sweep range for this pair:{" "}
                    {Math.max(metricsSweepLimits[metricsLeftAlgorithm].min, metricsSweepLimits[metricsRightAlgorithm].min)} to{" "}
                    {Math.min(metricsSweepLimits[metricsLeftAlgorithm].max, metricsSweepLimits[metricsRightAlgorithm].max)} (step = 1)
                  </p>
                )}

                <Button size="lg" className="w-full" onClick={() => void runMetricsVisualization()}>Run Aggregated</Button>
                {metricsLoading && <p className="text-xs text-muted-foreground">Running notebook metric experiment...</p>}
                {metricsError && <p className="text-xs text-red-500">{metricsError}</p>}
                {metricsApiData?.meta && (
                  <p className="text-xs text-muted-foreground">
                    {metricsApiData.meta.cache_hit ? "Cache hit" : "Fresh run"} · {metricsApiData.meta.elapsed_sec.toFixed(2)}s
                    {typeof metricsApiData.meta.cache_files === "number" && typeof metricsApiData.meta.cache_total_bytes === "number"
                      ? ` · ${metricsApiData.meta.cache_files} files · ${(metricsApiData.meta.cache_total_bytes / 1024).toFixed(1)} KB`
                      : ""}
                  </p>
                )}
              </CardContent>
            </Card>

            <div className="flex flex-col gap-3">
              <Card className="overflow-hidden">
                <CardHeader className="py-2 px-3 bg-muted/30">
                  <CardTitle className="text-sm font-semibold">Ground Truth Trajectory</CardTitle>
                </CardHeader>
                <CardContent className="p-2">
                  {hasGroundTruthPreview ? (
                    <div className="flex flex-col gap-2">
                      <div className="rounded-md border border-border bg-muted/30 min-h-[190px] flex items-center justify-center">
                        {previewMapUrl ? (
                          <img
                            src={previewMapUrl}
                            alt="Ground truth trajectory map"
                            className="w-full h-auto object-contain rounded-md"
                          />
                        ) : (
                          <p className="text-xs text-muted-foreground">No trajectory map preview</p>
                        )}
                      </div>
                      <div className="rounded-md border border-border bg-muted/30 min-h-[120px] flex items-center justify-center">
                        {previewTimelineUrl ? (
                          <img
                            src={previewTimelineUrl}
                            alt="Ground truth timeline preview"
                            className="w-full h-auto object-contain rounded-md"
                          />
                        ) : (
                          <p className="text-xs text-muted-foreground">No timeline preview</p>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-md border border-border bg-muted/30 overflow-hidden">
                      <img
                        src={GROUND_TRUTH_PLACEHOLDER_IMAGE}
                        alt="Ground truth trajectory placeholder"
                        className="w-full h-auto object-contain"
                      />
                    </div>
                  )}
                </CardContent>
              </Card>

              <div className="grid gap-3 lg:grid-cols-2">
                <Card className="overflow-hidden">
                  <CardHeader className="py-2 px-3 bg-muted/30">
                    <CardTitle className="text-sm font-semibold">{metricsApiData?.left?.title ?? "Algorithm A"}</CardTitle>
                  </CardHeader>
                  <CardContent className="p-2">
                    {metricsApiData?.left?.image_data_url ? (
                      <img
                        src={metricsApiData.left.image_data_url}
                        alt={metricsApiData.left.title}
                        className="w-full h-auto object-contain rounded-md border border-border"
                      />
                    ) : (
                      <div className="h-[260px] rounded-md border border-dashed border-border bg-muted/40" />
                    )}
                  </CardContent>
                </Card>

                <Card className="overflow-hidden">
                  <CardHeader className="py-2 px-3 bg-muted/30">
                    <CardTitle className="text-sm font-semibold">{metricsApiData?.right?.title ?? "Algorithm B"}</CardTitle>
                  </CardHeader>
                  <CardContent className="p-2">
                    {metricsApiData?.right?.image_data_url ? (
                      <img
                        src={metricsApiData.right.image_data_url}
                        alt={metricsApiData.right.title}
                        className="w-full h-auto object-contain rounded-md border border-border"
                      />
                    ) : (
                      <div className="h-[260px] rounded-md border border-dashed border-border bg-muted/40" />
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>

          {/* Demo button */}
          <Button onClick={() => navigateTo("demo")} size="lg" className="shrink-0 self-start">
            Demo
          </Button>
        </div>
      )}
    </div>
  )
}

export default function Page() {
  return (
    <Suspense fallback={<div className="h-screen bg-background" />}>
      <NomadDashboard />
    </Suspense>
  )
}

"use client"

import { Suspense, useState, useCallback, useEffect, useMemo, useRef } from "react"
import * as echarts from "echarts"
import Image from "next/image"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Slider } from "@/components/ui/slider"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { NomadNav } from "@/components/nomad-nav"
import { lachesisLabels, sequentialLabels, stopsFromLabels } from "@/lib/stop-detection"
import { Columns2, Pause, Play, RotateCcw, Square } from "lucide-react"

const GROUND_TRUTH_PLACEHOLDER_IMAGE = "/issue-images/ground-truth-placeholder.svg"

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

const SEQUENTIAL_CARD_DIAGRAM = "/assets/diagram-svgs/sequential_algorithms_card.svg"
const SEQUENTIAL_EXPANDED_DIAGRAM = "/assets/diagram-svgs/sequential_algorithms.svg"
const DENSITY_CARD_DIAGRAM = "/assets/diagram-svgs/density_based_card.svg"
const DENSITY_EXPANDED_DIAGRAM = "/assets/diagram-svgs/density_based.svg"

const LEARN_FAMILIES = [
  { id: "sequential", title: "Sequential Algorithms" },
  { id: "density", title: "Density-Based Algorithms" },
]

function prototypeChartSrc(algorithm: string, sweepParameter: string): string {
  const params = new URLSearchParams({
    title: `${algorithm} aggregated metrics (prototype)`,
    x: sweepParameter || "delta_roam",
    field: "delta_roam",
  })
  return `/echarts-prototype/index.html?${params.toString()}`
}

// ============ TYPES & DATA ============

type DataPoint = { id: string; x: number; y: number; time: string; color: "orange" | "pink" | "purple" }
type TimeSegment = { id: string; startPercent: number; widthPercent: number; color: "orange" | "pink" | "purple" }
type ComparePanelResponse = {
  algo: string
  title: string
  available: boolean
  animation_data_url: string | null
  scene?: CompareScene | null
  params?: Record<string, number>
}
type CompareApiResponse = {
  seed: number
  mode?: "single" | "compare"
  left: ComparePanelResponse
  right?: ComparePanelResponse
}

type CompareScene = {
  crs: string
  source: string
  user_id: string
  bounds: [number, number, number, number]
  buildings: Array<{
    id: string
    type: string
    rings: number[][][]
  }>
  pings: Array<{
    x: number
    y: number
    timestamp: number
  }>
  truth: Array<{
    location: string | null
    timestamp: number
    duration: number
    x: number | null
    y: number | null
  }>
}

type MetricsPanelResponse = {
  algorithm: string
  sweep_parameter?: string
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

type MetricsParameterNote = NonNullable<MetricsOptionsResponse["parameter_notes"]>[string]
type EChartsParams = {
  seriesId?: string
  data: number[]
  dataIndex: number
  coordSys: { x: number; y: number; width: number; height: number }
}
type EChartsApi = {
  coord: (value: Array<number | string>) => number[]
  value: (index: number) => number
}

const FALLBACK_PARAMETER_NOTES: Record<string, MetricsParameterNote> = {
  Lachesis: {
    source: "delta_roam_vs_acc_exp.ipynb",
    sweep_parameter: "delta_roam",
    sweep_note: "UI sweep is scaled as 1.7 × value for Lachesis.",
    fixed_parameters: ["dt_max=60", "dur_min=5"],
  },
  Sequential: {
    source: "delta_roam_vs_acc_exp.ipynb",
    sweep_parameter: "delta_roam",
    fixed_parameters: ["dt_max=60", "method='centroid'", "dur_min=5"],
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

type DemoEditableParam = ParameterConstraint & {
  label?: string
}

const PARAMETER_CONSTRAINTS: Record<string, Record<string, ParameterConstraint>> = {
  dbstop: {
    time_thresh: { min: 1, max: 180, step: 1 },
    dist_thresh: { min: 0, max: 50, step: 5 },
    min_pts: { min: 2, max: 3, step: 1, allowedValues: [2, 3] },
    dur_min: { min: 0, max: 180, step: 5 },
  },
  seqscan: {
    time_thresh: { min: 1, max: 180, step: 1 },
    dist_thresh: { min: 0, max: 50, step: 5 },
    min_pts: { min: 2, max: 3, step: 1, allowedValues: [2, 3] },
    dur_min: { min: 0, max: 180, step: 5 },
  },
  dbscan: {
    eps_spatial: { min: 0, max: 50, step: 5 },
    T_max: { min: 1, max: 180, step: 1 },
    minPts: { min: 2, max: 3, step: 1, allowedValues: [2, 3] },
  },
  lachesis: {
    dur_min: { min: 0, max: 180, step: 5 },
    dt_max: { min: 1, max: 180, step: 1 },
    delta_roam: { min: 0, max: 120, step: 5 },
  },
  "sequential-centroid": {
    dur_min: { min: 0, max: 180, step: 5 },
    dt_max: { min: 1, max: 180, step: 1 },
    delta_roam: { min: 0, max: 120, step: 5 },
  },
  "sequential-first": {
    dur_min: { min: 0, max: 180, step: 5 },
    dt_max: { min: 1, max: 180, step: 1 },
    delta_roam: { min: 0, max: 120, step: 5 },
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

const DEMO_EDITABLE_PARAMS: Record<string, Record<string, DemoEditableParam>> = {
  dbstop: {
    dur_min: { min: 0, max: 180, step: 5 },
    dist_thresh: { min: 0, max: 50, step: 5 },
    min_pts: { min: 2, max: 3, step: 1 },
  },
  seqscan: {
    dur_min: { min: 0, max: 180, step: 5 },
    dist_thresh: { min: 0, max: 50, step: 5 },
    min_pts: { min: 2, max: 3, step: 1 },
  },
  dbscan: {
    eps_spatial: { min: 0, max: 50, step: 5, label: "dist_thresh" },
    minPts: { min: 2, max: 3, step: 1, label: "min_pts" },
  },
  lachesis: {
    dur_min: { min: 0, max: 180, step: 5 },
    delta_roam: { min: 0, max: 120, step: 5 },
  },
  "sequential-centroid": {
    dur_min: { min: 0, max: 180, step: 5 },
    delta_roam: { min: 0, max: 120, step: 5 },
  },
  "sequential-first": {
    dur_min: { min: 0, max: 180, step: 5 },
    delta_roam: { min: 0, max: 120, step: 5 },
  },
}

const METRICS_ALGORITHM_BY_DEMO_ID: Record<string, string> = {
  dbstop: "DBSTOP",
  lachesis: "Lachesis",
  "sequential-centroid": "Sequential",
  "sequential-first": "Sequential",
  seqscan: "SeqScan",
  dbscan: "ST-DBSCAN",
}

const METRICS_SWEEP_PARAMETERS: Record<string, Array<{ value: string; label: string; min: number; max: number }>> = {
  DBSTOP: [
    { value: "dist_thresh", label: "dist_thresh", min: 0, max: 50 },
    { value: "dur_min", label: "dur_min", min: 0, max: 180 },
  ],
  Lachesis: [
    { value: "delta_roam", label: "delta_roam", min: 0, max: 120 },
    { value: "dur_min", label: "dur_min", min: 0, max: 180 },
  ],
  Sequential: [
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
}

function getMetricsSweepLimit(algorithm: string, parameter: string): { min: number; max: number } {
  const options = METRICS_SWEEP_PARAMETERS[algorithm] ?? []
  return options.find((option) => option.value === parameter) ?? options[0] ?? { min: 0, max: 50 }
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
    const trimmed = raw.trim()
    const num = Number(trimmed)

    // Keep non-numeric fixed parameters (e.g., method='centroid') as informational only.
    if (!constraint && !Number.isFinite(num)) continue

    if (trimmed === "" || !Number.isFinite(num)) {
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

type AlgorithmDefinition = (typeof algorithms)[number]
type ParamStateSetter = (value: Record<string, string> | ((prev: Record<string, string>) => Record<string, string>)) => void

function DemoParameterControls({
  algo,
  algoId,
  values,
  errors,
  setValues,
  setErrors,
}: {
  algo: AlgorithmDefinition | undefined
  algoId: string
  values: Record<string, string>
  errors: Record<string, string>
  setValues: ParamStateSetter
  setErrors: ParamStateSetter
}) {
  if (!algo) return null

  const editableRules = DEMO_EDITABLE_PARAMS[algoId] ?? {}

  return (
    <div className="space-y-3">
      {algo.parameters.map((param) => {
        const rule = editableRules[param.name]
        const value = Number(paramInputValue(values, param.name, param.defaultValue))
        const label = rule?.label ?? param.name
        const optionCount = rule ? Math.floor((rule.max - rule.min) / rule.step) + 1 : 0
        const discreteOptions = rule?.allowedValues ?? (
          rule && optionCount > 0 && optionCount <= 5
            ? Array.from({ length: optionCount }, (_, index) => rule.min + index * rule.step)
            : null
        )

        if (!rule) {
          return (
            <div key={param.name} className="rounded-md border border-border/70 bg-muted/20 px-3 py-2">
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-mono text-muted-foreground">{param.name}</span>
                <span className="text-xs font-mono text-foreground">{param.defaultValue}</span>
              </div>
            </div>
          )
        }

        if (discreteOptions) {
          return (
            <div key={param.name} className="space-y-2 rounded-md border border-border/70 bg-background/40 px-3 py-3">
              <label className="text-sm font-mono">{label}</label>
              <Select
                value={String(Number.isFinite(value) ? value : param.defaultValue)}
                onValueChange={(next) => {
                  setValues((prev) => ({ ...prev, [param.name]: next }))
                  setErrors((prev) => {
                    const updated = { ...prev }
                    delete updated[param.name]
                    return updated
                  })
                }}
              >
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {discreteOptions.map((option) => (
                    <SelectItem key={`${param.name}-${option}`} value={String(option)}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )
        }

        return (
          <div key={param.name} className="space-y-2 rounded-md border border-border/70 bg-background/40 px-3 py-3">
            <div className="flex items-center justify-between gap-3">
              <label className="text-sm font-mono">{label}</label>
              <span className="rounded-sm bg-muted px-2 py-0.5 font-mono text-xs">{Number.isFinite(value) ? value : param.defaultValue}</span>
            </div>
            <Slider
              min={rule.min}
              max={rule.max}
              step={rule.step}
              value={[Number.isFinite(value) ? value : Number(param.defaultValue)]}
              onValueChange={([next]) => {
                setValues((prev) => ({ ...prev, [param.name]: String(next) }))
                setErrors((prev) => {
                  const updated = { ...prev }
                  delete updated[param.name]
                  return updated
                })
              }}
            />
          </div>
        )
      })}
      {Object.keys(errors).length > 0 && (
        <p className="text-xs text-red-500">
          {Object.entries(errors).map(([key, value]) => `${key}: ${value}`).join(" · ")}
        </p>
      )}
    </div>
  )
}

const DEMO_CLUSTER_COLORS = ["#f6d746", "#f89540", "#dc5039", "#a11b63", "#5d126e", "#1f4f99", "#149a8f"]
const DEMO_BUILDING_COLORS: Record<string, string> = {
  home: "#d3d7d0",
  workplace: "#c8d8dd",
  work: "#c8d8dd",
  park: "#c6dcc1",
  school: "#d7d0df",
  retail: "#ded3c5",
  shop: "#ded3c5",
  building: "#d4d5d1",
}

function distanceMeters(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function meanPoint(points: Array<{ x: number; y: number }>) {
  return {
    x: points.reduce((sum, point) => sum + point.x, 0) / Math.max(1, points.length),
    y: points.reduce((sum, point) => sum + point.y, 0) / Math.max(1, points.length),
  }
}

function assignDemoClusters(
  algo: string,
  pings: CompareScene["pings"],
  params: Record<string, number> | undefined,
): number[] {
  if (pings.length === 0) return []
  const labels = new Array(pings.length).fill(-1)
  const normalized = algo === "dbscan" || algo === "st-dbscan" ? "tadbscan" : algo

  if (normalized === "lachesis") return lachesisLabels(pings, params)
  if (normalized === "sequential-centroid") return sequentialLabels(pings, params, "centroid")
  if (normalized === "sequential-first") return sequentialLabels(pings, params, "sliding")

  if (normalized === "gridbased") {
    const cellSize = Math.max(20, Number(params?.cell_size ?? 100))
    const minTime = Math.max(1, Number(params?.min_time ?? 5)) * 60
    const minX = Math.min(...pings.map((ping) => ping.x))
    const minY = Math.min(...pings.map((ping) => ping.y))
    const groups = new Map<string, number[]>()
    pings.forEach((ping, index) => {
      const key = `${Math.floor((ping.x - minX) / cellSize)}:${Math.floor((ping.y - minY) / cellSize)}`
      groups.set(key, [...(groups.get(key) ?? []), index])
    })
    let cluster = 0
    for (const indexes of groups.values()) {
      const duration = pings[indexes[indexes.length - 1]].timestamp - pings[indexes[0]].timestamp
      if (indexes.length >= 2 && duration >= minTime) {
        indexes.forEach((index) => {
          labels[index] = cluster
        })
        cluster += 1
      }
    }
    return labels
  }

  const dist = Math.max(1, Number(params?.dist_thresh ?? params?.eps_spatial ?? 10))
  const timeThresh = Math.max(1, Number(params?.time_thresh ?? params?.T_max ?? 60)) * 60
  const minPts = Math.max(1, Number(params?.min_pts ?? params?.minPts ?? 2))
  const durMin = Math.max(0, Number(params?.dur_min ?? 5)) * 60
  let cluster = 0
  let current: number[] = [0]

  const commit = (indexes: number[]) => {
    if (indexes.length < minPts) return
    const duration = pings[indexes[indexes.length - 1]].timestamp - pings[indexes[0]].timestamp
    if (duration < durMin) return
    indexes.forEach((index) => {
      labels[index] = cluster
    })
    cluster += 1
  }

  for (let i = 1; i < pings.length; i += 1) {
    const centroid = meanPoint(current.map((index) => pings[index]))
    const gap = pings[i].timestamp - pings[i - 1].timestamp
    const multiplier = normalized === "tadbscan" ? 1.4 : normalized === "dbstop" ? 1.1 : 1.0
    if (gap <= timeThresh && distanceMeters(pings[i], centroid) <= dist * multiplier) {
      current.push(i)
    } else {
      commit(current)
      current = [i]
    }
  }
  commit(current)
  return labels
}

function DemoSceneRenderer({
  panel,
  mode,
  currentTime,
  onTimeChange,
  syncMaster,
}: {
  panel: ComparePanelResponse
  mode: "single" | "compare"
  currentTime: number | null
  onTimeChange: (timestamp: number) => void
  syncMaster: boolean
}) {
  const scene = panel.scene
  const mapRef = useRef<HTMLDivElement | null>(null)
  const timelineRef = useRef<HTMLDivElement | null>(null)
  const toggleRef = useRef<() => void>(() => {})
  const replayRef = useRef<() => void>(() => {})
  const selectedTimestampRef = useRef<number | null>(null)
  const renderSceneRef = useRef<((timestampSeconds: number) => void) | null>(null)
  const [playbackState, setPlaybackState] = useState<"playing" | "paused" | "complete">("complete")
  const labels = useMemo(
    () => scene ? assignDemoClusters(panel.algo, scene.pings, panel.params) : [],
    [panel.algo, panel.params, scene],
  )
  const chartData = useMemo(() => {
    if (!scene || scene.pings.length === 0) return null

    const pings = scene.pings.map((ping, index) => ({
      i: index,
      x: ping.x,
      y: ping.y,
      t: ping.timestamp,
      time: new Date(ping.timestamp * 1000).toISOString().slice(11, 19) + " UTC",
      cluster: labels[index],
    }))
    const pingData = pings.map((ping) => [ping.x, ping.y, ping.cluster, ping.i, ping.t])
    const buildings = scene.buildings.flatMap((building) =>
      building.rings.map((ring) => {
        const xs = ring.map(([x]) => x)
        const ys = ring.map(([, y]) => y)
        const minX = Math.min(...xs)
        const maxX = Math.max(...xs)
        const minY = Math.min(...ys)
        const maxY = Math.max(...ys)
        return {
          type: building.type,
          coords: ring,
          center: [(minX + maxX) / 2, (minY + maxY) / 2],
          minX,
          maxX,
          minY,
          maxY,
        }
      }),
    )
    const destinationFor = (x: number, y: number) => {
      const containing = buildings.find((building) =>
        x >= building.minX && x <= building.maxX && y >= building.minY && y <= building.maxY
      )
      return (containing ?? buildings.reduce((best, building) =>
        Math.hypot(x - building.center[0], y - building.center[1]) < Math.hypot(x - best.center[0], y - best.center[1])
          ? building
          : best
      )).center
    }
    const routeBetween = (start: number[], end: number[]) => [
      start,
      [(start[0] + end[0]) / 2, start[1]],
      [(start[0] + end[0]) / 2, end[1]],
      end,
    ].filter((point, index, route) => index === 0 || point[0] !== route[index - 1][0] || point[1] !== route[index - 1][1])
    const revealDelay = Math.max(0, Number(panel.params?.dur_min ?? panel.params?.min_time ?? 5)) * 60
    const dtMaxSec = Number(panel.params?.dt_max ?? 60) * 60
    const stops = stopsFromLabels(scene.pings, labels).map((stop) => ({
      ...stop,
      destination: destinationFor(stop.x, stop.y),
      radius: Math.max(
        stop.diameter / 2,
        Number(panel.params?.delta_roam ?? panel.params?.dist_thresh ?? panel.params?.eps_spatial ?? 0),
      ),
      circleReveal: Math.min(stop.end, stop.start + revealDelay),
      label: `Stop ${stop.cluster}`,
      startTime: new Date(stop.start * 1000).toISOString().slice(11, 16) + " UTC",
      endTime: new Date(stop.end * 1000).toISOString().slice(11, 16) + " UTC",
    }))
    const segments = stops.map((stop, index) => {
      const startPoint = index === 0 ? destinationFor(scene.pings[0].x, scene.pings[0].y) : stops[index - 1].destination
      const start = index === 0 ? scene.pings[0].timestamp : stops[index - 1].end
      return {
        stopIndex: stop.index,
        cluster: stop.cluster,
        start,
        end: Math.max(start + 30, stop.end),
        points: routeBetween(startPoint, stop.destination),
      }
    }).filter((segment) => segment.points.length > 1)
    const start = scene.pings[0].timestamp
    const end = scene.pings[scene.pings.length - 1].timestamp
    const times = new Set([start, end])
    for (let timestamp = start; timestamp <= end; timestamp += 30) times.add(timestamp)
    pings.forEach((ping) => times.add(ping.t))
    stops.forEach((stop) => {
      times.add(stop.start)
      times.add(stop.end)
      times.add(stop.circleReveal)
    })
    segments.forEach((segment) => {
      times.add(segment.start)
      times.add(segment.end)
    })

    return {
      buildings,
      pings,
      pingData,
      stops,
      segments,
      stopData: stops.map((stop) => [stop.x, stop.y, stop.cluster, stop.index, stop.nPings, stop.duration]),
      stopCircleData: stops.map((stop) => [stop.x, stop.y, stop.radius, stop.cluster, stop.index]),
      stopCircleRevealTimes: stops.map((stop) => stop.circleReveal),
      stopBars: stops.map((stop) => [stop.start * 1000, stop.end * 1000, stop.cluster, stop.index]),
      stopEndTimes: stops.map((stop) => stop.end),
      dtMaxSec,
      durMinSec: revealDelay,
      timeSequence: Array.from(times).sort((a, b) => a - b),
    }
  }, [labels, panel.params, scene])

  useEffect(() => {
    if (!scene || !chartData || !mapRef.current || !timelineRef.current) return

    const mapEl = mapRef.current
    const mapChart = echarts.init(mapEl, null, { renderer: "canvas" })
    const timelineChart = echarts.init(timelineRef.current, null, { renderer: "canvas" })
    const minX = Math.min(scene.bounds[0], ...chartData.buildings.map((building) => building.minX), ...scene.pings.map((ping) => ping.x))
    const minY = Math.min(scene.bounds[1], ...chartData.buildings.map((building) => building.minY), ...scene.pings.map((ping) => ping.y))
    const maxX = Math.max(scene.bounds[2], ...chartData.buildings.map((building) => building.maxX), ...scene.pings.map((ping) => ping.x))
    const maxY = Math.max(scene.bounds[3], ...chartData.buildings.map((building) => building.maxY), ...scene.pings.map((ping) => ping.y))
    const xSpan = maxX - minX
    const ySpan = maxY - minY
    const xPad = Math.max(18, xSpan * 0.08)
    const yPad = Math.max(18, ySpan * 0.08)
    const mapBounds = () => {
      const mapZoom = 1.6
      const baseX = xSpan + xPad * 2
      const baseY = ySpan + yPad * 2
      const plotRatio = Math.max(1, mapEl.clientWidth - 24) / Math.max(1, mapEl.clientHeight - 24)
      const xRange = (baseX / baseY < plotRatio ? baseY * plotRatio : baseX) / mapZoom
      const yRange = (baseX / baseY < plotRatio ? baseY : baseX / plotRatio) / mapZoom
      const xCenter = (minX + maxX) / 2
      const yCenter = (minY + maxY) / 2
      return {
        xMin: xCenter - xRange / 2,
        xMax: xCenter + xRange / 2,
        yMin: yCenter - yRange / 2,
        yMax: yCenter + yRange / 2,
      }
    }
    const applyMapBounds = () => {
      const bounds = mapBounds()
      mapChart.setOption({
        xAxis: { min: bounds.xMin, max: bounds.xMax },
        yAxis: { min: bounds.yMin, max: bounds.yMax },
      })
    }
    const timeMin = scene.pings[0].timestamp * 1000
    const timeMax = scene.pings[scene.pings.length - 1].timestamp * 1000
    const noisePings = chartData.pingData.filter((point) => point[2] < 0)
    const clusterPings = chartData.pingData.filter((point) => point[2] >= 0)
    const preparedSegments = chartData.segments.map((segment) => {
      let length = 0
      const cumulative = [0]
      for (let index = 1; index < segment.points.length; index += 1) {
        length += Math.hypot(
          segment.points[index][0] - segment.points[index - 1][0],
          segment.points[index][1] - segment.points[index - 1][1],
        )
        cumulative.push(length)
      }
      return { ...segment, cumulative, length }
    })
    let sequenceIndex = 0
    let paused = true
    let timer = 0
    const syncPlaybackState = () => {
      const atEnd = sequenceIndex >= chartData.timeSequence.length - 1
      setPlaybackState(atEnd && paused ? "complete" : paused ? "paused" : "playing")
    }

    const clusterColor = (cluster: number) => cluster < 0 ? "#1f2326" : DEMO_CLUSTER_COLORS[cluster % DEMO_CLUSTER_COLORS.length]
    const partialPath = (segment: typeof preparedSegments[number], progress: number) => {
      const target = segment.length * Math.max(0, progress)
      const drawn = [segment.points[0]]
      for (let index = 1; index < segment.points.length; index += 1) {
        const previous = segment.points[index - 1]
        const next = segment.points[index]
        const segmentLength = segment.cumulative[index] - segment.cumulative[index - 1]
        if (segment.cumulative[index] >= target) {
          const local = segmentLength === 0 ? 1 : (target - segment.cumulative[index - 1]) / segmentLength
          drawn.push([
            previous[0] + (next[0] - previous[0]) * local,
            previous[1] + (next[1] - previous[1]) * local,
          ])
          return drawn
        }
        drawn.push(next)
      }
      return drawn
    }
    const routeProgressAt = (timestampSeconds: number) => {
      const completed: number[][][] = []
      let active: number[][] = []
      preparedSegments.forEach((segment) => {
        if (timestampSeconds >= segment.end) {
          completed.push(segment.points)
          return
        }
        if (timestampSeconds >= segment.start) {
          active = partialPath(segment, (timestampSeconds - segment.start) / Math.max(1, segment.end - segment.start))
        }
      })
      return { completed, active }
    }
    const latestPingIndexAt = (timestampSeconds: number) => {
      let index = 0
      for (let candidate = 0; candidate < scene.pings.length; candidate += 1) {
        if (scene.pings[candidate].timestamp <= timestampSeconds) index = candidate
        else break
      }
      return index
    }
    const detectedCountFor = (timestampSeconds: number) => {
      let count = 0
      while (count < chartData.stopEndTimes.length && chartData.stopEndTimes[count] <= timestampSeconds) count += 1
      return count
    }
    const circleCountFor = (timestampSeconds: number) => {
      let count = 0
      while (count < chartData.stopCircleRevealTimes.length && chartData.stopCircleRevealTimes[count] <= timestampSeconds) count += 1
      return count
    }
    const activeClustersAt = (timestampSeconds: number) => {
      const latestIndex = latestPingIndexAt(timestampSeconds)
      const latestPing = chartData.pings[latestIndex]
      return chartData.stops.flatMap((stop) => {
        const members = chartData.pings.filter((ping) => ping.cluster === stop.cluster && ping.t <= timestampSeconds)
        if (members.length === 0) return []
        const lastPing = members[members.length - 1]
        const lastMemberIndex = chartData.pings.findIndex((ping) => ping.i === members[members.length - 1].i)
        if (latestIndex > lastMemberIndex && latestPing.cluster !== stop.cluster && timestampSeconds > lastPing.t + chartData.dtMaxSec) return []
        return [{ stop, firstPing: members[0], lastPing }]
      })
    }
    const acceptWindowsAt = (timestampSeconds: number) => {
      return activeClustersAt(timestampSeconds).map(({ stop, lastPing }) => {
        const deadline = lastPing.t + chartData.dtMaxSec
        return [lastPing.t * 1000, deadline * 1000, stop.cluster, stop.index]
      })
    }
    const durMinLinesAt = (timestampSeconds: number) =>
      chartData.stops.flatMap((stop) => {
        const members = chartData.pings.filter((ping) => ping.cluster === stop.cluster && ping.t <= timestampSeconds)
        if (members.length === 0) return []
        const firstPing = members[0]
        return [[firstPing.t * 1000, (firstPing.t + chartData.durMinSec) * 1000, stop.cluster, stop.index]]
      })
    const renderScene = (timestampSeconds: number) => {
      const latestPingIndex = latestPingIndexAt(timestampSeconds)
      const route = routeProgressAt(timestampSeconds)
      const detectedStopCount = detectedCountFor(timestampSeconds)

      mapChart.setOption({
        series: [
          { id: "completed-paths", data: route.completed.map((points) => ({ coords: points })) },
          { id: "active-path", data: route.active },
          { id: "stop-circles", data: chartData.stopCircleData.slice(0, circleCountFor(timestampSeconds)) },
          { id: "noise-pings", data: noisePings.filter((point) => point[4] <= timestampSeconds) },
          { id: "cluster-pings", data: clusterPings.filter((point) => point[4] <= timestampSeconds) },
          { id: "detected-stops", data: chartData.stopData.slice(0, detectedStopCount) },
          { id: "current-ping", data: [chartData.pingData[latestPingIndex]] },
        ],
      })
      timelineChart.setOption({
        series: [
          { id: "accept-windows", data: acceptWindowsAt(timestampSeconds) },
          { id: "dur-min-lines", data: durMinLinesAt(timestampSeconds) },
          { id: "stop-bars", data: chartData.stopBars.slice(0, detectedStopCount) },
          { id: "cursor", data: [[timestampSeconds * 1000, 0.08], [timestampSeconds * 1000, 0.92]] },
        ],
      })
    }
    const syncSequenceIndex = (timestampSeconds: number) => {
      let index = 0
      for (let candidate = 0; candidate < chartData.timeSequence.length; candidate += 1) {
        if (chartData.timeSequence[candidate] <= timestampSeconds) index = candidate
        else break
      }
      sequenceIndex = index
    }
    const timestampFromOffset = (offsetX: number, offsetY: number) => {
      const point = timelineChart.convertFromPixel({ gridIndex: 0 }, [offsetX, offsetY])
      const timeMs = Array.isArray(point) ? point[0] : point
      const minT = chartData.timeSequence[0]
      const maxT = chartData.timeSequence[chartData.timeSequence.length - 1]
      return Math.max(minT, Math.min(maxT, timeMs / 1000))
    }
    const seekTo = (timestampSeconds: number) => {
      syncSequenceIndex(timestampSeconds)
      onTimeChange(timestampSeconds)
    }
    let dragging = false
    const onPointerMove = (event: MouseEvent) => {
      if (!dragging || !timelineRef.current) return
      const rect = timelineRef.current.getBoundingClientRect()
      seekTo(timestampFromOffset(event.clientX - rect.left, event.clientY - rect.top))
    }
    const onPointerUp = () => {
      dragging = false
      window.removeEventListener("mousemove", onPointerMove)
      window.removeEventListener("mouseup", onPointerUp)
    }
    const onTimelinePointerDown = (event: { offsetX: number; offsetY: number; event?: MouseEvent }) => {
      event.event?.preventDefault()
      window.clearTimeout(timer)
      paused = true
      dragging = true
      syncPlaybackState()
      seekTo(timestampFromOffset(event.offsetX, event.offsetY))
      window.addEventListener("mousemove", onPointerMove)
      window.addEventListener("mouseup", onPointerUp)
    }
    const onTimelineWheel = (event: WheelEvent) => {
      event.preventDefault()
      window.clearTimeout(timer)
      paused = true
      syncPlaybackState()
      const activeTime = selectedTimestampRef.current ?? chartData.timeSequence[sequenceIndex] ?? chartData.timeSequence[0]
      const span = chartData.timeSequence[chartData.timeSequence.length - 1] - chartData.timeSequence[0]
      seekTo(Math.max(chartData.timeSequence[0], Math.min(chartData.timeSequence[chartData.timeSequence.length - 1], activeTime + Math.sign(event.deltaY) * Math.max(10, span / 360))))
    }
    const advance = () => {
      if (paused || !syncMaster) return
      sequenceIndex = Math.min(sequenceIndex + 1, chartData.timeSequence.length - 1)
      const timestampSeconds = chartData.timeSequence[sequenceIndex]
      const previousStopCount = detectedCountFor(chartData.timeSequence[Math.max(0, sequenceIndex - 1)])
      onTimeChange(timestampSeconds)
      if (detectedCountFor(timestampSeconds) > previousStopCount) {
        timer = window.setTimeout(advance, 60)
        return
      }
      if (sequenceIndex < chartData.timeSequence.length - 1) {
        timer = window.setTimeout(advance, 60)
      } else {
        paused = true
        syncPlaybackState()
      }
    }
    const replay = () => {
      window.clearTimeout(timer)
      paused = false
      sequenceIndex = 0
      onTimeChange(chartData.timeSequence[0])
      setPlaybackState("playing")
      if (syncMaster) timer = window.setTimeout(advance, 300)
    }
    const toggle = () => {
      paused = !paused
      syncPlaybackState()
      if (!paused && syncMaster) timer = window.setTimeout(advance, 160)
    }
    const resize = () => {
      mapChart.resize()
      applyMapBounds()
      timelineChart.resize()
    }
    const bounds = mapBounds()

    mapChart.setOption({
      animation: true,
      animationDurationUpdate: 120,
      grid: { left: 12, right: 12, top: 12, bottom: 12, containLabel: false },
      xAxis: { type: "value", min: bounds.xMin, max: bounds.xMax, axisLine: { show: false }, axisTick: { show: false }, axisLabel: { show: false }, splitLine: { show: false } },
      yAxis: { type: "value", min: bounds.yMin, max: bounds.yMax, axisLine: { show: false }, axisTick: { show: false }, axisLabel: { show: false }, splitLine: { show: false } },
      tooltip: {
        trigger: "item",
        borderWidth: 0,
        backgroundColor: "rgba(32, 33, 36, 0.92)",
        textStyle: { color: "#ffffff" },
        formatter(params: EChartsParams) {
          if (params.seriesId === "detected-stops") {
            const stop = chartData.stops[params.data[3]]
            return `${stop.label}<br>${stop.startTime} - ${stop.endTime}<br>${stop.nPings} pings / ${stop.duration} min`
          }
          if (params.seriesId === "cluster-pings" || params.seriesId === "noise-pings" || params.seriesId === "current-ping") {
            const ping = chartData.pings[params.data[3]]
            const cluster = ping.cluster < 0 ? "Noise" : `Cluster ${ping.cluster}`
            return `Ping ${ping.i + 1}<br>${ping.time}<br>${cluster}`
          }
          return ""
        },
      },
      series: [
        {
          id: "buildings",
          type: "custom",
          coordinateSystem: "cartesian2d",
          silent: true,
          z: 0,
          data: chartData.buildings.map((_, index) => index),
          renderItem(params: EChartsParams, api: EChartsApi) {
            const building = chartData.buildings[params.dataIndex]
            return {
              type: "polygon",
              shape: { points: building.coords.map((coord) => api.coord(coord)) },
              style: { fill: DEMO_BUILDING_COLORS[building.type] ?? DEMO_BUILDING_COLORS.building, stroke: "#ffffff", lineWidth: 1 },
            }
          },
        },
        {
          id: "completed-paths",
          name: "Inferred street route",
          type: "lines",
          coordinateSystem: "cartesian2d",
          polyline: true,
          silent: true,
          z: 2,
          data: [],
          lineStyle: {
            color: "#1f6d6a",
            width: 2.4,
            opacity: 0.78,
          },
        },
        {
          id: "active-path",
          name: "Active route",
          type: "line",
          coordinateSystem: "cartesian2d",
          smooth: 0.38,
          showSymbol: false,
          silent: true,
          z: 4,
          data: [],
          lineStyle: {
            color: "#0f766e",
            width: 4,
            opacity: 0.95,
            shadowBlur: 10,
            shadowColor: "rgba(15, 118, 110, 0.26)",
          },
        },
        { id: "ghost-pings", name: "All pings", type: "scatter", coordinateSystem: "cartesian2d", silent: true, z: 3, data: chartData.pingData, symbolSize: 5, itemStyle: { color: "rgba(31, 35, 38, 0.13)" } },
        {
          id: "stop-circles",
          name: "Stop radius",
          type: "custom",
          coordinateSystem: "cartesian2d",
          silent: true,
          z: 4,
          data: [],
          renderItem(_params: EChartsParams, api: EChartsApi) {
            const center = api.coord([api.value(0), api.value(1)])
            const edge = api.coord([Number(api.value(0)) + Number(api.value(2)), api.value(1)])
            const radius = Math.abs(edge[0] - center[0])
            return {
              type: "circle",
              shape: { cx: center[0], cy: center[1], r: radius },
              style: { fill: "rgba(246, 215, 70, 0.08)", stroke: clusterColor(Number(api.value(3))), lineWidth: 2, opacity: 0.85 },
            }
          },
        },
        { id: "noise-pings", name: "Noise pings", type: "scatter", coordinateSystem: "cartesian2d", z: 5, data: [], symbolSize: 7, itemStyle: { color: "rgba(31, 35, 38, 0.72)" } },
        { id: "cluster-pings", name: "Cluster pings", type: "scatter", coordinateSystem: "cartesian2d", z: 6, data: [], symbolSize: 12, itemStyle: { color: (params: EChartsParams) => clusterColor(params.data[2]), borderColor: "#202124", borderWidth: 0.8, opacity: 0.95 } },
        { id: "detected-stops", name: "Detected stops", type: "scatter", coordinateSystem: "cartesian2d", z: 7, data: [], symbol: "diamond", symbolSize: 20, itemStyle: { color: (params: EChartsParams) => clusterColor(params.data[2]), borderColor: "#ffffff", borderWidth: 2, shadowBlur: 8, shadowColor: "rgba(32, 33, 36, 0.22)" } },
        { id: "current-ping", name: "Current ping", type: "effectScatter", coordinateSystem: "cartesian2d", z: 8, data: [], symbolSize: 13, rippleEffect: { scale: 2.4, brushType: "stroke" }, itemStyle: { color: (params: EChartsParams) => clusterColor(params.data[2]), borderColor: "#ffffff", borderWidth: 1.5 } },
      ],
    })

    timelineChart.setOption({
      animation: true,
      animationDurationUpdate: 120,
      grid: { left: 34, right: 22, top: 0, bottom: 28 },
      xAxis: {
        type: "time",
        min: timeMin,
        max: timeMax,
        axisLine: { lineStyle: { color: "#a9aea5" } },
        axisTick: { show: false },
        axisLabel: { color: "#626760", formatter: (value: number) => new Date(value).toISOString().slice(11, 16) },
        splitLine: { show: true, lineStyle: { color: "#edf0ea" } },
      },
      yAxis: { min: 0, max: 1, axisLine: { show: false }, axisTick: { show: false }, axisLabel: { show: false }, splitLine: { show: false } },
      tooltip: { show: false },
      series: [
        {
          id: "ping-ticks",
          type: "custom",
          coordinateSystem: "cartesian2d",
          silent: true,
          z: 1,
          data: chartData.pingData.map((_, index) => index),
          renderItem(params: EChartsParams, api: EChartsApi) {
            const ping = chartData.pings[params.dataIndex]
            const top = api.coord([ping.t * 1000, 0.72])
            const bottom = api.coord([ping.t * 1000, 0.28])
            return { type: "line", shape: { x1: top[0], y1: top[1], x2: bottom[0], y2: bottom[1] }, style: { stroke: "rgba(32, 33, 36, 0.18)", lineWidth: 1 } }
          },
        },
        {
          id: "accept-windows",
          type: "custom",
          coordinateSystem: "cartesian2d",
          silent: true,
          z: 2,
          data: [],
          renderItem(params: EChartsParams, api: EChartsApi) {
            const windowStart = api.coord([api.value(0), 0.08])
            const windowEnd = api.coord([api.value(1), 0.2])
            const clip = { x: params.coordSys.x, y: params.coordSys.y, width: params.coordSys.width, height: params.coordSys.height }
            const shape = echarts.graphic.clipRectByRect(
              { x: windowStart[0], y: windowEnd[1], width: Math.max(2, windowEnd[0] - windowStart[0]), height: windowStart[1] - windowEnd[1] },
              clip,
            )
            if (!shape) return null
            const color = clusterColor(Number(api.value(2)))
            return {
              type: "group",
              children: [
                { type: "rect", shape, style: { fill: color, opacity: 0.14 } },
                { type: "line", shape: { x1: windowEnd[0], y1: windowEnd[1], x2: windowEnd[0], y2: windowStart[1] }, style: { stroke: color, lineWidth: 2, opacity: 0.85 } },
              ],
            }
          },
        },
        {
          id: "dur-min-lines",
          type: "custom",
          coordinateSystem: "cartesian2d",
          silent: true,
          z: 3,
          data: [],
          renderItem(params: EChartsParams, api: EChartsApi) {
            const lineStart = api.coord([api.value(0), 0.77])
            const lineEnd = api.coord([api.value(1), 0.77])
            const tickTop = api.coord([api.value(1), 0.8])
            const color = clusterColor(Number(api.value(2)))
            return {
              type: "group",
              children: [
                { type: "line", shape: { x1: lineStart[0], y1: lineStart[1], x2: lineEnd[0], y2: lineEnd[1] }, style: { stroke: color, lineWidth: 3, opacity: 0.9 } },
                { type: "line", shape: { x1: lineEnd[0], y1: tickTop[1], x2: lineEnd[0], y2: lineStart[1] }, style: { stroke: color, lineWidth: 2, opacity: 0.85 } },
              ],
            }
          },
        },
        {
          id: "stop-bars",
          type: "custom",
          coordinateSystem: "cartesian2d",
          z: 4,
          data: [],
          renderItem(params: EChartsParams, api: EChartsApi) {
            const start = api.coord([api.value(0), 0.24])
            const end = api.coord([api.value(1), 0.76])
            const shape = echarts.graphic.clipRectByRect(
              { x: start[0], y: end[1], width: Math.max(2, end[0] - start[0]), height: start[1] - end[1] },
              { x: params.coordSys.x, y: params.coordSys.y, width: params.coordSys.width, height: params.coordSys.height },
            )
            return shape ? { type: "rect", shape, style: { fill: clusterColor(Number(api.value(2))), opacity: 0.44 } } : null
          },
        },
        { id: "cursor", type: "line", coordinateSystem: "cartesian2d", showSymbol: false, z: 5, data: [], lineStyle: { color: "#67D3E3", width: 2 } },
      ],
    })

    const timelineEl = timelineRef.current
    toggleRef.current = toggle
    replayRef.current = replay
    renderSceneRef.current = (timestampSeconds) => {
      syncSequenceIndex(timestampSeconds)
      renderScene(timestampSeconds)
    }
    const initialTimestamp = selectedTimestampRef.current ?? chartData.timeSequence[chartData.timeSequence.length - 1]
    sequenceIndex = chartData.timeSequence.findIndex((timestamp) => timestamp >= initialTimestamp)
    if (sequenceIndex < 0) sequenceIndex = chartData.timeSequence.length - 1
    paused = true
    syncPlaybackState()
    renderSceneRef.current(initialTimestamp)
    window.addEventListener("resize", resize)
    timelineEl.style.cursor = "ew-resize"
    timelineChart.getZr().on("mousedown", onTimelinePointerDown)
    timelineEl.addEventListener("wheel", onTimelineWheel, { passive: false })

    return () => {
      window.clearTimeout(timer)
      window.removeEventListener("resize", resize)
      window.removeEventListener("mousemove", onPointerMove)
      window.removeEventListener("mouseup", onPointerUp)
      toggleRef.current = () => {}
      replayRef.current = () => {}
      timelineChart.getZr().off("mousedown", onTimelinePointerDown)
      timelineEl.removeEventListener("wheel", onTimelineWheel)
      renderSceneRef.current = null
      mapChart.dispose()
      timelineChart.dispose()
    }
  }, [chartData, onTimeChange, scene, syncMaster])

  useEffect(() => {
    if (!chartData || currentTime !== null) return
    onTimeChange(chartData.timeSequence[chartData.timeSequence.length - 1])
  }, [chartData, currentTime, onTimeChange])

  useEffect(() => {
    if (!chartData || currentTime === null) return
    selectedTimestampRef.current = currentTime
    renderSceneRef.current?.(currentTime)
  }, [chartData, currentTime])

  if (!scene) return null

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden rounded-md border border-[#d7dbd2] bg-[#ffffff] text-[#202124] shadow-[0_16px_45px_rgba(32,33,36,0.08)]">
      {syncMaster && (
        <div className="pointer-events-none absolute right-3 top-3 z-10 flex gap-2">
          <TooltipProvider delayDuration={300}>
            <div className="pointer-events-auto flex items-center gap-1 rounded-md border border-[#d7dbd2] bg-white/92 px-1 py-1 shadow-sm">
              {playbackState !== "complete" && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => toggleRef.current()}
                      aria-label={playbackState === "playing" ? "Pause" : "Play"}
                      className="flex h-8 w-8 items-center justify-center rounded-md border border-[#bfc6bb] bg-white text-[#202124] hover:border-[#2f6f73] hover:text-[#2f6f73]"
                    >
                      {playbackState === "playing" ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 fill-current" />}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">{playbackState === "playing" ? "Pause" : "Play"}</TooltipContent>
                </Tooltip>
              )}
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => replayRef.current()}
                    aria-label="Replay"
                    className="flex h-8 w-8 items-center justify-center rounded-md border border-[#bfc6bb] bg-white text-[#202124] hover:border-[#2f6f73] hover:text-[#2f6f73]"
                  >
                    <RotateCcw className="h-4 w-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Replay</TooltipContent>
              </Tooltip>
            </div>
          </TooltipProvider>
        </div>
      )}
      <div ref={mapRef} className="min-h-0 flex-1 border-b border-[#d7dbd2]" />
      <div className={`flex shrink-0 flex-col bg-white ${mode === "single" ? "h-28" : "h-24"}`}>
        <div ref={timelineRef} className="min-h-0 flex-1" />
        <div className="shrink-0 border-t border-[#d7dbd2] bg-white px-3 py-1 text-center text-[11px] font-bold uppercase tracking-[0.08em] text-[#626760]">
          Timeline
        </div>
      </div>
    </div>
  )
}

function CompareAnimationPanel({
  panel,
  mode = "compare",
  currentTime,
  onTimeChange,
  syncMaster = true,
}: {
  panel: ComparePanelResponse | null | undefined
  mode?: "single" | "compare"
  currentTime: number | null
  onTimeChange: (timestamp: number) => void
  syncMaster?: boolean
}) {
  const hasAnimation = Boolean(panel?.available && panel?.animation_data_url)
  const sceneMetadata = panel?.scene ? `${panel.scene.user_id} · ${panel.scene.crs}` : null

  return (
    <Card className="h-full min-h-0 overflow-hidden border-[#244367] bg-[#0A1526] py-0">
      <CardHeader className="py-3 px-4 bg-[#10213A]/90 shrink-0">
        <CardTitle className="text-base font-semibold">{panel?.title ?? "No visualization"}</CardTitle>
        {sceneMetadata && (
          <p className="text-xs text-[#87A0BE]">{sceneMetadata}</p>
        )}
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col p-2">
        {panel?.scene ? (
          <div className="min-h-0 w-full flex-1">
            <DemoSceneRenderer panel={panel} mode={mode} currentTime={currentTime} onTimeChange={onTimeChange} syncMaster={syncMaster} />
          </div>
        ) : hasAnimation ? (
          <div className="flex min-h-0 w-full flex-1 justify-center">
            <img
              src={panel?.animation_data_url ?? ""}
              alt={panel?.title ?? "Algorithm animation"}
              className="h-full w-full object-contain rounded-md border border-border"
            />
          </div>
        ) : (
          <div className="min-h-0 w-full flex-1 rounded-md border border-dashed border-border bg-muted/40" />
        )}
      </CardContent>
    </Card>
  )
}

const algorithms = [
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
      { name: "dur_min", defaultValue: "5", description: "Minimum stop duration (minutes)" }
    ]
  },
  {
    id: "hdbscan",
    name: "HDBSCAN",
    family: "density",
    shortDesc: "Hierarchical density-based clustering for variable-density stop patterns.",
    description: "HDBSCAN is included as a density-based stop detection placeholder. The exact stop-detection formulation, parameter defaults, and source language still need to be confirmed.",
    source: "Placeholder source: HDBSCAN reference or NOMAD implementation notes needed",
    cardDiagramSrc: DENSITY_CARD_DIAGRAM,
    expandedDiagramSrc: DENSITY_EXPANDED_DIAGRAM,
    parameters: [
      { name: "min_cluster_size", defaultValue: "TBD", description: "Minimum cluster size; placeholder until the implementation source is confirmed." },
      { name: "min_samples", defaultValue: "TBD", description: "Density smoothing parameter; placeholder until the implementation source is confirmed." },
    ],
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

const DEMO_ALGORITHM_IDS = new Set(algorithms.map((algorithm) => algorithm.id))
const DASHBOARD_VIEWS = new Set(["home", "learn", "demo", "metrics"] as const)
type DashboardView = "home" | "learn" | "demo" | "metrics"
type DemoMode = "single" | "compare"

// ============ MAIN COMPONENT ============

function NomadDashboard() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [activeView, setActiveView] = useState<DashboardView>("home")
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
  const [demoTime, setDemoTime] = useState<number | null>(null)
  const compareRequestIdRef = useRef(0)
  const [metricsOptions, setMetricsOptions] = useState<MetricsOptionsResponse | null>(null)
  const [metricsCompareMode, setMetricsCompareMode] = useState(false)
  const metricsMode = metricsCompareMode ? "compare" : "single"
  const [metricsLeftAlgorithm, setMetricsLeftAlgorithm] = useState("Lachesis")
  const [metricsRightAlgorithm, setMetricsRightAlgorithm] = useState("Sequential")
  const [metricsLeftParameter, setMetricsLeftParameter] = useState("delta_roam")
  const [metricsRightParameter, setMetricsRightParameter] = useState("delta_roam")
  const [metricsTrajectoryUser, setMetricsTrajectoryUser] = useState("")
  const [metricsIterations, setMetricsIterations] = useState(100)
  const [metricsSweepPoints, setMetricsSweepPoints] = useState(50)
  const [metricsSeed, setMetricsSeed] = useState(2026)
  const [metricsApiData, setMetricsApiData] = useState<MetricsApiResponse | null>(null)
  const [metricsLoading, setMetricsLoading] = useState(false)
  const [metricsError, setMetricsError] = useState<string | null>(null)

  const syncUrl = useCallback((view: DashboardView, algoId: string | null = null, demoMode?: DemoMode) => {
    const params = new URLSearchParams(searchParams.toString())
    if (view === "home") {
      params.delete("view")
      params.delete("algo")
      params.delete("mode")
    } else {
      params.set("view", view)
      if (view === "learn" && algoId) {
        params.set("algo", algoId)
      } else {
        params.delete("algo")
      }
      if (view === "demo") {
        params.set("mode", demoMode ?? (compareMode ? "compare" : "single"))
      } else {
        params.delete("mode")
      }
    }
    const qs = params.toString()
    router.push(qs ? `${pathname}?${qs}` : pathname)
  }, [compareMode, pathname, router, searchParams])

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
      if (algoId === "lachesis" || algoId === "sequential-centroid" || algoId === "sequential-first") {
        out.dt_max = out.dt_max ?? 60
        out.delta_roam = out.delta_roam ?? 25
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
    setDemoTime(null)
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
      setDemoTime(null)
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
      setMetricsSweepPoints(data.defaults.sweep_points ?? 50)
      setMetricsSeed(data.defaults.seed ?? 2026)
      const firstUser = data.trajectories?.[0]?.user_id ?? ""
      setMetricsTrajectoryUser(firstUser)
    } catch (err) {
      setMetricsError(err instanceof Error ? err.message : "Failed to load metrics options")
    }
  }, [])

  const runMetricsVisualization = useCallback(async () => {
    if (!metricsOptions) return
    const leftLimit = getMetricsSweepLimit(metricsLeftAlgorithm, metricsLeftParameter)
    const rightLimit = getMetricsSweepLimit(metricsRightAlgorithm, metricsRightParameter)
    const allowedMin = metricsCompareMode ? Math.max(leftLimit.min, rightLimit.min) : leftLimit.min
    const allowedMax = metricsCompareMode ? Math.min(leftLimit.max, rightLimit.max) : leftLimit.max
    if (Number.isFinite(allowedMin) && Number.isFinite(allowedMax)) {
      if (!Number.isInteger(metricsSweepPoints)) {
        setMetricsError("Sweep values must be whole numbers.")
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
          left_parameter: metricsLeftParameter,
          right_parameter: metricsRightParameter,
          trajectory_user_id: metricsTrajectoryUser,
          iterations: metricsIterations,
          sweep_min: allowedMin,
          sweep_max: allowedMax,
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
    metricsCompareMode,
    metricsLeftAlgorithm,
    metricsLeftParameter,
    metricsMode,
    metricsOptions,
    metricsRightAlgorithm,
    metricsRightParameter,
    metricsSeed,
    metricsSweepPoints,
    metricsTrajectoryUser,
  ])

  const handleNewMetricsTrajectory = useCallback(() => {
    const trajectories = metricsOptions?.trajectories ?? []
    if (trajectories.length > 0) {
      const ids = trajectories.map((trajectory) => trajectory.user_id)
      const currentIndex = ids.indexOf(metricsTrajectoryUser)
      const nextId = ids[(currentIndex + 1 + ids.length) % ids.length]
      setMetricsTrajectoryUser(nextId)
    }
    setMetricsSeed((seed) => seed + 1)
    setMetricsApiData(null)
  }, [metricsOptions, metricsTrajectoryUser])

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

  const openMetricsFromDemo = useCallback(() => {
    const leftMetricsAlgorithm = METRICS_ALGORITHM_BY_DEMO_ID[leftAlgorithm]
    const rightMetricsAlgorithm = METRICS_ALGORITHM_BY_DEMO_ID[rightAlgorithm]

    if (leftMetricsAlgorithm) {
      setMetricsLeftAlgorithm(leftMetricsAlgorithm)
      setMetricsLeftParameter(METRICS_SWEEP_PARAMETERS[leftMetricsAlgorithm]?.[0]?.value ?? "dist_thresh")
    }
    if (rightMetricsAlgorithm) {
      setMetricsRightAlgorithm(rightMetricsAlgorithm)
      setMetricsRightParameter(METRICS_SWEEP_PARAMETERS[rightMetricsAlgorithm]?.[0]?.value ?? "dist_thresh")
    }
    setMetricsCompareMode(compareMode && Boolean(rightMetricsAlgorithm))
    setActiveView("metrics")
    syncUrl("metrics")
  }, [compareMode, leftAlgorithm, rightAlgorithm, syncUrl])

  const handleCompareModeToggle = useCallback(() => {
    const nextMode: DemoMode = compareMode ? "single" : "compare"
    setCompareMode(nextMode === "compare")
    syncUrl("demo", null, nextMode)
  }, [compareMode, syncUrl])

  const navigateTo = (view: DashboardView) => {
    setActiveView(view)
    syncUrl(view)
  }

  const openLearnAlgorithm = useCallback((algorithmId: string) => {
    setExpandedAlgorithm(algorithmId)
    setActiveView("learn")
    syncUrl("learn", algorithmId)
  }, [syncUrl])

  const openLearnDemo = useCallback((algorithmId: string) => {
    setLeftAlgorithm(algorithmId)
    setLeftParams({})
    setLeftParamErrors({})
    setCompareMode(false)
    setActiveView("demo")
    syncUrl("demo", null, "single")
  }, [syncUrl])

  const openLearnDocumentation = useCallback((algorithmId: string) => {
    document.getElementById(`learn-documentation-${algorithmId}`)?.scrollIntoView({ behavior: "smooth", block: "nearest" })
  }, [])

  const leftAlgo = algorithms.find((a) => a.id === leftAlgorithm)
  const rightAlgo = algorithms.find((a) => a.id === rightAlgorithm)
  const demoAlgorithms = algorithms.filter((a) => DEMO_ALGORITHM_IDS.has(a.id))
  const expandedLearnAlgorithm = activeView === "learn" && expandedAlgorithm ? algorithms.find((a) => a.id === expandedAlgorithm) : null
  const expandedLearnFamilyTitle = expandedLearnAlgorithm ? LEARN_FAMILIES.find((family) => family.id === expandedLearnAlgorithm.family)?.title ?? "Algorithm Family" : ""
  const metricsAlgorithms = metricsOptions?.algorithms ?? ["Lachesis", "Sequential"]
  const parameterNotes: Record<string, MetricsParameterNote> = metricsOptions?.parameter_notes ?? FALLBACK_PARAMETER_NOTES
  const leftParameterNote = parameterNotes[metricsLeftAlgorithm]
  const rightParameterNote = parameterNotes[metricsRightAlgorithm]
  const leftSweepParameters = METRICS_SWEEP_PARAMETERS[metricsLeftAlgorithm] ?? []
  const rightSweepParameters = METRICS_SWEEP_PARAMETERS[metricsRightAlgorithm] ?? []
  const leftMetricsPrototypeSrc = prototypeChartSrc(metricsLeftAlgorithm, metricsLeftParameter)
  const rightMetricsPrototypeSrc = prototypeChartSrc(metricsRightAlgorithm, metricsRightParameter)
  const renderMetricsParameterRows = (
    algorithm: string,
    note: MetricsParameterNote | undefined,
  ) => {
    const rows = [
      ...(note?.fixed_parameters ?? []).map((param) => {
        const [name, ...valueParts] = param.split("=")
        return [name, valueParts.join("=") || "fixed"]
      }),
    ]

    return (
      <div className="space-y-2">
        <h4 className="text-sm font-medium text-muted-foreground">Parameters</h4>
        {rows.map(([name, value]) => (
          <div key={`${algorithm}-${name}-${value}`} className="rounded-md border border-border/70 bg-muted/20 px-3 py-2">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-mono text-muted-foreground">{name}</span>
              <span className="text-xs font-mono text-foreground">{value}</span>
            </div>
          </div>
        ))}
      </div>
    )
  }

  useEffect(() => {
    const rawView = searchParams.get("view")
    const nextView: DashboardView = rawView && DASHBOARD_VIEWS.has(rawView as DashboardView)
      ? (rawView as DashboardView)
      : "home"
    const rawAlgo = searchParams.get("algo")
    const hasAlgo = Boolean(rawAlgo && algorithms.some((a) => a.id === rawAlgo))
    const nextExpanded = nextView === "learn" && hasAlgo ? rawAlgo : null
    const rawMode = searchParams.get("mode")
    const nextCompareMode = nextView === "demo" && rawMode === "compare"

    setActiveView(nextView)
    setExpandedAlgorithm(nextExpanded)
    setCompareMode(nextCompareMode)
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
    if (!leftSweepParameters.some((param) => param.value === metricsLeftParameter)) {
      setMetricsLeftParameter(leftSweepParameters[0]?.value ?? "dist_thresh")
    }
  }, [leftSweepParameters, metricsLeftParameter])

  useEffect(() => {
    if (!rightSweepParameters.some((param) => param.value === metricsRightParameter)) {
      setMetricsRightParameter(rightSweepParameters[0]?.value ?? "dist_thresh")
    }
  }, [rightSweepParameters, metricsRightParameter])

  useEffect(() => {
    if (activeView === "metrics" && metricsOptions && !metricsApiData && !metricsLoading) {
      void runMetricsVisualization()
    }
  }, [activeView, metricsApiData, metricsLoading, metricsOptions, runMetricsVisualization])

  return (
    <div className="h-screen overflow-hidden bg-background flex flex-col nomad-shell">
      <NomadNav />

      {/* HOME VIEW */}
      {activeView === "home" && (
        <div className="flex-1 overflow-y-auto">
          <section className="nomad-hero min-h-[calc(100vh-74px)] border-b border-[#263449] px-5 py-6">
            <div className="mx-auto grid min-h-[calc(100vh-122px)] max-w-7xl items-center gap-8 lg:grid-cols-[0.9fr_1.1fr]">
              <div className="max-w-2xl">
                <Image
                  src="/assets/logos/nomad_logo_hero_white_teal.svg"
                  alt="NOMAD"
                  width={480}
                  height={85}
                  priority
                  className="h-[72px] w-auto sm:h-[84px] md:h-24"
                />
                <p className="mt-7 text-2xl font-semibold tracking-normal text-[#f2f4eb] md:text-3xl">
                  Stop detection tools for noisy human mobility data.
                </p>
                <div className="mt-7 grid gap-5 text-left">
                  <div>
                    <h2 className="text-lg font-semibold text-[#f2f4eb]">What Stop Detection Is</h2>
                    <p className="mt-2 text-base leading-relaxed text-[#b6c9dc]">
                      Stop detection identifies intervals where a person remains stationary long enough to count as a meaningful visit, reducing raw GPS streams into mobility events.
                    </p>
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-[#f2f4eb]">What This Dashboard Does</h2>
                    <p className="mt-2 text-base leading-relaxed text-[#94a1b7]">
                      Learn algorithm assumptions, tune parameters, compare behavior side by side, and inspect trajectory outputs and aggregate metrics without rerunning notebook experiments.
                    </p>
                  </div>
                </div>
                <div className="mt-8 flex flex-col gap-4 sm:flex-row">
                  <Button size="lg" onClick={() => navigateTo("demo")} className="h-14 min-w-60 bg-[#459ba4] text-base font-semibold text-[#08101c] hover:bg-[#62b8bf]">
                    <Play className="h-5 w-5 fill-current" />
                    Run Demo
                  </Button>
                  <Button variant="outline" size="lg" onClick={() => navigateTo("learn")} className="h-14 min-w-44 border-[#3a465d] bg-[#111625]/45 text-base font-semibold text-[#f2f4eb] hover:bg-[#242b3d]">
                    Learn More
                  </Button>
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
                  </div>
                </CardContent>
              </Card>
            </div>
          </section>
        </div>
      )}

      {/* LEARN VIEW */}
      {activeView === "learn" && (
        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-4 pb-6">
          <div className={`flex min-h-0 flex-col gap-3 transition duration-200 ${expandedLearnAlgorithm ? "scale-[0.99] opacity-55 blur-[1.5px]" : ""}`}>
            <div className="shrink-0 space-y-1">
              <h2 className="text-3xl font-bold">Learn Algorithms</h2>
              <p className="text-sm text-muted-foreground">
                Select an algorithm card to inspect assumptions, parameter behavior, and a method sketch.
              </p>
            </div>
            <div className="space-y-5 pb-2">
              {LEARN_FAMILIES.map((family) => (
                <section key={family.id} className="space-y-3">
                  <h3 className="text-xl font-semibold">{family.title}</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
                    {algorithms.filter((algo) => algo.family === family.id).map((algo) => (
                      <Card
                        key={algo.id}
                        className="group cursor-pointer hover:shadow-lg transition-all border-2 border-border hover:border-primary/50 flex flex-col py-0"
                        onClick={() => openLearnAlgorithm(algo.id)}
                      >
                        <CardHeader className="px-5 pt-5 pb-1 shrink-0">
                          <CardTitle className="inline-block border-b-2 border-transparent pb-1 text-lg text-[#94a1b7] transition-colors group-hover:border-[#8acac8] group-hover:text-[#f2f4eb]">
                            {algo.name}
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="px-5 pb-5 flex-1 flex flex-col gap-3">
                          <p className="text-sm text-muted-foreground">{algo.shortDesc}</p>
                          <div className="aspect-[16/5] overflow-hidden rounded-md bg-[#111625]">
                            <img
                              src={algo.cardDiagramSrc}
                              alt={`${algo.name} card diagram`}
                              className="w-full h-full object-contain p-1"
                            />
                          </div>
                          <div className="flex items-center justify-end gap-1.5 pt-1 text-xs font-medium text-[#8acac8]">
                            <span>View more</span>
                            <img src="/assets/icons/learn-expand.svg" alt="" className="h-4 w-4" />
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </div>

          <Dialog
            open={Boolean(expandedLearnAlgorithm)}
            onOpenChange={(open) => {
              if (!open) {
                setExpandedAlgorithm(null)
                syncUrl("learn")
              }
            }}
          >
            {expandedLearnAlgorithm && (
              <DialogContent
                showCloseButton={false}
                className="max-h-[calc(100vh-88px)] w-[calc(100vw-24px)] max-w-[min(1180px,calc(100vw-48px))] gap-0 overflow-hidden rounded-xl border-2 border-[#8acac8] bg-card p-0 shadow-2xl shadow-black/40 duration-200 sm:w-[calc(100vw-48px)] sm:max-h-[calc(100vh-120px)] sm:max-w-[min(1180px,calc(100vw-48px))]"
              >
                <div className="flex max-h-[calc(100vh-88px)] flex-col overflow-hidden sm:max-h-[calc(100vh-120px)]">
                  <div className="shrink-0 px-5 pt-5 pb-4 md:px-8 md:pt-7">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 space-y-2">
                        <DialogTitle className="inline-block border-b-2 border-[#8acac8] pb-2 text-2xl font-bold leading-tight text-[#f2f4eb]">
                          {expandedLearnAlgorithm.name}
                        </DialogTitle>
                        <DialogDescription className="text-sm text-muted-foreground">
                          {expandedLearnFamilyTitle}
                        </DialogDescription>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setExpandedAlgorithm(null)
                          syncUrl("learn")
                        }}
                        className="inline-flex shrink-0 items-center gap-1.5 rounded-md p-0 text-xs font-medium text-[#8acac8] transition-colors hover:text-[#f2f4eb] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8acac8]"
                      >
                        Collapse
                        <img src="/assets/icons/learn-collapse.svg" alt="" className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-5 pb-5 md:px-8 md:pb-8">
                    <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.95fr)] lg:items-start">
                      <div className="min-w-0 space-y-4">
                        <p className="break-words text-sm leading-relaxed text-muted-foreground md:text-base">
                          {expandedLearnAlgorithm.description}
                        </p>
                        <div className="min-w-0 overflow-hidden rounded-md bg-[#111625]">
                          <img
                            src={expandedLearnAlgorithm.expandedDiagramSrc}
                            alt={`${expandedLearnAlgorithm.name} expanded diagram`}
                            className="block h-auto w-full max-w-full"
                          />
                        </div>
                        <p id={`learn-documentation-${expandedLearnAlgorithm.id}`} className="scroll-mt-4 break-words text-sm text-muted-foreground">
                          Source: {expandedLearnAlgorithm.source}
                        </p>
                      </div>

                      <section className="min-w-0 rounded-lg border border-border bg-[#151b2c]/70 p-4 md:p-5">
                        <h3 className="mb-4 text-lg font-semibold">Parameters</h3>
                        <div className="overflow-x-auto rounded-md border">
                          <table className="w-full text-sm">
                            <thead className="bg-muted">
                              <tr>
                                <th className="px-3 py-2 text-left font-medium">Name</th>
                                <th className="px-3 py-2 text-left font-medium">Default</th>
                                <th className="px-3 py-2 text-left font-medium">Description</th>
                              </tr>
                            </thead>
                            <tbody>
                              {expandedLearnAlgorithm.parameters.map((param, idx) => (
                                <tr key={param.name} className={idx % 2 === 0 ? "bg-muted/30" : ""}>
                                  <td className="px-3 py-2 font-mono text-sm">{param.name}</td>
                                  <td className="px-3 py-2 font-mono text-sm">{param.defaultValue}</td>
                                  <td className="px-3 py-2 text-sm text-muted-foreground">{param.description}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </section>
                    </div>
                  </div>

                  <div className="shrink-0 border-t border-border/70 px-5 py-4 md:px-8">
                    <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
                      <Button
                        size="lg"
                        onClick={() => openLearnDemo(expandedLearnAlgorithm.id)}
                        className="h-11 min-w-36 bg-[#459ba4] text-base font-semibold text-[#08101c] hover:bg-[#62b8bf]"
                      >
                        <Play className="h-5 w-5 fill-current" />
                        Demo
                      </Button>
                      <Button
                        variant="outline"
                        size="lg"
                        onClick={() => openLearnDocumentation(expandedLearnAlgorithm.id)}
                        className="h-11 min-w-36 border-[#3a465d] bg-[#111625]/45 text-base font-semibold text-[#f2f4eb] hover:bg-[#242b3d]"
                      >
                        Documentation
                      </Button>
                    </div>
                  </div>
                </div>
              </DialogContent>
            )}
          </Dialog>
        </div>
      )}

      {/* DEMO VIEW */}
      {activeView === "demo" && (
        <div className="flex-1 flex flex-col p-4 gap-3 overflow-hidden">
          <div className="flex shrink-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-1">
              <h2 className="text-2xl font-bold">{compareMode ? "Compare Algorithms" : "Demo"}</h2>
              <p className="text-sm text-muted-foreground">
                Dashboard-style preview: choose two algorithms and their own parameters, run, and inspect side-by-side map and barcode outputs.
              </p>
            </div>
            <Button variant={compareMode ? "default" : "outline"} size="lg" onClick={handleCompareModeToggle} className="gap-2">
              {compareMode ? <><Square className="h-4 w-4" /> Single</> : <><Columns2 className="h-4 w-4" /> Compare</>}
            </Button>
          </div>

          {!compareMode ? (
            <div className="grid flex-1 min-h-0 lg:grid-cols-[minmax(0,1fr)_330px] gap-3 items-stretch overflow-hidden">
              <div className="flex min-h-0 flex-col gap-3">
                <CompareAnimationPanel panel={compareApiData?.left} mode="single" currentTime={demoTime} onTimeChange={setDemoTime} />
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
                    <DemoParameterControls
                      algo={leftAlgo}
                      algoId={leftAlgorithm}
                      values={leftParams}
                      errors={leftParamErrors}
                      setValues={setLeftParams}
                      setErrors={setLeftParamErrors}
                    />
                  </div>
                  <div className="space-y-2 pt-2">
                    <Button variant="outline" onClick={handleNewTrajectory} size="lg" className="w-full">New Trajectory</Button>
                    <Button onClick={() => handleVisualize("left")} size="lg" className="w-full">Visualize</Button>
                    <Button onClick={openMetricsFromDemo} size="lg" className="w-full">Aggregated Metrics</Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : (
            <div className="grid flex-1 min-h-0 lg:grid-cols-[minmax(0,1fr)_330px] gap-3 items-stretch overflow-hidden">
              <div className="flex min-h-0 flex-col gap-3">
                <div className="grid min-h-0 flex-1 items-stretch lg:grid-cols-2 gap-3">
                  <CompareAnimationPanel panel={compareApiData?.left} mode="compare" currentTime={demoTime} onTimeChange={setDemoTime} syncMaster={false} />
                  <CompareAnimationPanel panel={compareApiData?.right} mode="compare" currentTime={demoTime} onTimeChange={setDemoTime} />
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
                    <DemoParameterControls
                      algo={leftAlgo}
                      algoId={leftAlgorithm}
                      values={leftParams}
                      errors={leftParamErrors}
                      setValues={setLeftParams}
                      setErrors={setLeftParamErrors}
                    />
                  </div>
                  <div className="space-y-2">
                    <h4 className="text-sm font-medium">{rightAlgo?.name ?? "Right algorithm"}</h4>
                    <Select value={rightAlgorithm} onValueChange={handleRightAlgorithmChange}>
                      <SelectTrigger className="h-10 text-base"><SelectValue /></SelectTrigger>
                      <SelectContent>{demoAlgorithms.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent>
                    </Select>
                    <DemoParameterControls
                      algo={rightAlgo}
                      algoId={rightAlgorithm}
                      values={rightParams}
                      errors={rightParamErrors}
                      setValues={setRightParams}
                      setErrors={setRightParamErrors}
                    />
                  </div>
                  <div className="space-y-2 pt-2">
                    <Button variant="outline" onClick={handleNewTrajectory} size="lg" className="w-full">New Trajectory</Button>
                    <Button onClick={() => handleVisualize("left")} size="lg" className="w-full">Visualize</Button>
                    <Button onClick={openMetricsFromDemo} size="lg" className="w-full">Aggregated Metrics</Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      )}

      {/* AGGREGATED METRICS VIEW */}
      {activeView === "metrics" && (
        <div className="flex-1 flex flex-col p-3 gap-3 min-h-0 overflow-hidden">
          <div className="flex shrink-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-1">
              <h2 className="text-2xl font-bold">{metricsCompareMode ? "Compare Metrics" : "Aggregated Metrics"}</h2>
              <p className="text-sm text-muted-foreground">
                Sweep one scale parameter for the selected algorithm{metricsCompareMode ? "s" : ""}; fixed notebook parameters are shown in the control panel.
              </p>
            </div>
            <Button
              variant={metricsCompareMode ? "default" : "outline"}
              size="lg"
              onClick={() => {
                setMetricsCompareMode((value) => !value)
                setMetricsApiData(null)
              }}
              className="gap-2"
            >
              {metricsCompareMode ? <><Square className="h-4 w-4" /> Single</> : <><Columns2 className="h-4 w-4" /> Compare</>}
            </Button>
          </div>

          <div className="grid flex-1 min-h-0 lg:grid-cols-[minmax(0,1fr)_330px] gap-3 items-stretch">
            <Card className="h-full min-h-0 overflow-hidden py-0">
              {!metricsCompareMode && (
                <CardHeader className="shrink-0 py-2 px-3 bg-muted/30">
                  <CardTitle className="text-sm font-semibold">
                    {metricsApiData?.left?.title ?? metricsLeftAlgorithm}
                  </CardTitle>
                </CardHeader>
              )}
              <CardContent className="min-h-0 flex-1 p-2">
                <div className={`grid h-full min-h-0 gap-3 ${metricsCompareMode ? "lg:grid-cols-2" : ""}`}>
                  <div className="h-full min-h-0 rounded-md border border-border bg-muted/30 overflow-hidden">
                    <iframe
                      key={leftMetricsPrototypeSrc}
                      src={leftMetricsPrototypeSrc}
                      title={`${metricsLeftAlgorithm} aggregated metrics prototype`}
                      className="h-full w-full border-0"
                    />
                  </div>

                  {metricsCompareMode && (
                    <div className="h-full min-h-0 rounded-md border border-border bg-muted/30 overflow-hidden">
                      <iframe
                        key={rightMetricsPrototypeSrc}
                        src={rightMetricsPrototypeSrc}
                        title={`${metricsRightAlgorithm} aggregated metrics prototype`}
                        className="h-full w-full border-0"
                      />
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card className="min-h-0 overflow-hidden py-0">
              <CardHeader className="shrink-0 px-5 py-3">
                <CardTitle className="text-lg font-semibold">
                  {metricsCompareMode ? `${metricsLeftAlgorithm} vs ${metricsRightAlgorithm}` : metricsLeftAlgorithm}
                </CardTitle>
              </CardHeader>
              <CardContent className="min-h-0 flex-1 space-y-2 overflow-y-auto px-5 pb-4">
                <div className="space-y-1">
                  <label className="text-sm font-medium text-muted-foreground">
                    {metricsCompareMode ? "Algorithm A" : "Algorithm"}
                  </label>
                  <Select
                    value={metricsLeftAlgorithm}
                    onValueChange={(algorithm) => {
                      setMetricsLeftAlgorithm(algorithm)
                      setMetricsLeftParameter(METRICS_SWEEP_PARAMETERS[algorithm]?.[0]?.value ?? "dist_thresh")
                      setMetricsApiData(null)
                    }}
                  >
                    <SelectTrigger className="h-10 text-base"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {metricsAlgorithms.map((algo) => <SelectItem key={algo} value={algo}>{algo}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                {renderMetricsParameterRows(metricsLeftAlgorithm, leftParameterNote)}

                {metricsCompareMode && (
                  <>
                    <div className="space-y-1">
                      <label className="text-sm font-medium text-muted-foreground">Algorithm B</label>
                      <Select
                        value={metricsRightAlgorithm}
                        onValueChange={(algorithm) => {
                          setMetricsRightAlgorithm(algorithm)
                          setMetricsRightParameter(METRICS_SWEEP_PARAMETERS[algorithm]?.[0]?.value ?? "dist_thresh")
                          setMetricsApiData(null)
                        }}
                      >
                        <SelectTrigger className="h-10 text-base"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {metricsAlgorithms.map((algo) => <SelectItem key={algo} value={algo}>{algo}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    {renderMetricsParameterRows(metricsRightAlgorithm, rightParameterNote)}
                  </>
                )}

                <Button variant="outline" size="lg" className="w-full" onClick={handleNewMetricsTrajectory}>
                  New Trajectory
                </Button>
                {metricsLoading && <p className="text-xs text-muted-foreground">Running notebook metric experiment...</p>}
                {metricsError && <p className="text-xs text-red-500">{metricsError}</p>}
              </CardContent>
            </Card>
          </div>

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

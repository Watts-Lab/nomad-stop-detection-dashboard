/*
DEFINES SHARED DATA STRUCTURES USED THROUGH DASHBOARD
(STOP DETECTION RESULTS, SCENE DATA, VIEW TYPES)
*/

export type AlignedStopResult =
  | { kind: "labels"; cluster: number[] }
  | { kind: "anchor"; cluster: number[]; aux_time: Array<number | null> }
  | { kind: "density"; cluster: number[]; core: number[]; aux_time: Array<number | null> }

export type ComparePanelResponse = {
  algo: string
  title: string
  scene: CompareScene
  params: Record<string, number>
  result: AlignedStopResult
}

export type CompareApiResponse = {
  seed: number
  trajectory: string
  mode?: "single" | "compare"
  left: ComparePanelResponse
  right?: ComparePanelResponse
}

export type CompareScene = {
  crs: string
  source: string
  user_id: string
  bounds: [number, number, number, number]
  buildings: Array<{
    id: string
    type: string
    rings: number[][][]
  }>
  destinationDiary: Array<{
    location: string
    duration: number
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
  routes?: {
    crs: string
    source: string
    streets?: Array<{
      id: string
      coords: number[][]
    }>
    doors: Array<{
      id: string
      type: string
      door_cell_x: number
      door_cell_y: number
      x: number
      y: number
    }>
    routes: Array<{
      from: string
      to: string
      blocks: number[][]
      path: number[][]
    }>
  } | null
}

export type MetricsOptionsResponse = {
  algorithms: string[]
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
  }
}

export type MetricsParameterNote = NonNullable<MetricsOptionsResponse["parameter_notes"]>[string]

export type EChartsParams = {
  seriesId?: string
  data: number[] | { value: number[] }
  value?: number[]
  dataIndex: number
  coordSys: { x: number; y: number; width: number; height: number }
}

export type EChartsApi = {
  coord: (value: Array<number | string>) => number[]
  value: (index: number) => number
}

export type DashboardView = "home" | "learn" | "demo" | "metrics"
export type DemoMode = "single" | "compare"

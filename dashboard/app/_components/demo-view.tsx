import { Columns2, Square } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { CompareAnimationPanel } from "./compare-animation-panel"
import { DemoParameterControls } from "./demo-parameter-controls"
import type { ParamStateSetter } from "./demo-parameter-controls"
import type { AlgorithmDefinition } from "../_lib/dashboard-data"
import type { CompareApiResponse } from "../_lib/types"

export function DemoView({
  compareMode,
  leftAlgo,
  rightAlgo,
  demoAlgorithms,
  leftAlgorithm,
  rightAlgorithm,
  leftParams,
  rightParams,
  leftParamErrors,
  rightParamErrors,
  compareApiData,
  compareLoading,
  compareError,
  demoTime,
  setDemoTime,
  setLeftParams,
  setRightParams,
  setLeftParamErrors,
  setRightParamErrors,
  handleCompareModeToggle,
  handleLeftAlgorithmChange,
  handleRightAlgorithmChange,
  handleNewTrajectory,
  handleVisualize,
  openMetricsFromDemo,
}: {
  compareMode: boolean
  leftAlgo: AlgorithmDefinition | undefined
  rightAlgo: AlgorithmDefinition | undefined
  demoAlgorithms: AlgorithmDefinition[]
  leftAlgorithm: string
  rightAlgorithm: string
  leftParams: Record<string, string>
  rightParams: Record<string, string>
  leftParamErrors: Record<string, string>
  rightParamErrors: Record<string, string>
  compareApiData: CompareApiResponse | null
  compareLoading: boolean
  compareError: string | null
  demoTime: number | null
  setDemoTime: (timestamp: number) => void
  setLeftParams: ParamStateSetter
  setRightParams: ParamStateSetter
  setLeftParamErrors: ParamStateSetter
  setRightParamErrors: ParamStateSetter
  handleCompareModeToggle: () => void
  handleLeftAlgorithmChange: (algorithmId: string) => void
  handleRightAlgorithmChange: (algorithmId: string) => void
  handleNewTrajectory: () => void
  handleVisualize: () => void
  openMetricsFromDemo: () => void
}) {
  return (
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
          <Card className="min-h-0 overflow-hidden">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg font-semibold">{leftAlgo?.name || "Select Algorithm"}</CardTitle>
            </CardHeader>
            <CardContent className="min-h-0 flex-1 space-y-3 overflow-y-auto">
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
                <Button onClick={handleVisualize} size="lg" className="w-full">Visualize</Button>
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
          <Card className="min-h-0 overflow-hidden">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg font-semibold">Compare Parameters</CardTitle>
            </CardHeader>
            <CardContent className="min-h-0 flex-1 space-y-4 overflow-y-auto">
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
                <Button onClick={handleVisualize} size="lg" className="w-full">Visualize</Button>
                <Button onClick={openMetricsFromDemo} size="lg" className="w-full">Aggregated Metrics</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}

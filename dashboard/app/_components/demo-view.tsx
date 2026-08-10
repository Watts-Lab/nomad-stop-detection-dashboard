import { useState } from "react"
import { BarChart3, Columns2, HelpCircle, RefreshCw, Square } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { CompareAnimationPanel } from "./compare-animation-panel"
import { DemoParameterControls } from "./demo-parameter-controls"
import { revealClass } from "../_lib/dashboard-utils"
import type { ParamStateSetter } from "./demo-parameter-controls"
import { TrajectorySelector } from "./trajectory-selector"
import type { AlgorithmDefinition } from "../_lib/dashboard-data"
import type { CompareApiResponse } from "../_lib/types"

export function DemoView({
  compareMode,
  showGroundTruth,
  showStops,
  leftAlgo,
  rightAlgo,
  demoAlgorithms,
  leftAlgorithm,
  rightAlgorithm,
  leftParams,
  rightParams,
  leftParamErrors,
  rightParamErrors,
  demoTrajectory,
  compareApiData,
  compareLoading,
  compareError,
  demoTime,
  setDemoTime,
  setShowGroundTruth,
  setShowStops,
  setLeftParams,
  setRightParams,
  setLeftParamErrors,
  setRightParamErrors,
  setDemoTrajectory,
  handleCompareModeToggle,
  handleLeftAlgorithmChange,
  handleRightAlgorithmChange,
  handleNewTrajectory,
  openMetricsFromDemo,
  startTour,
}: {
  compareMode: boolean
  showGroundTruth: boolean
  showStops: boolean
  leftAlgo: AlgorithmDefinition | undefined
  rightAlgo: AlgorithmDefinition | undefined
  demoAlgorithms: AlgorithmDefinition[]
  leftAlgorithm: string
  rightAlgorithm: string
  leftParams: Record<string, string>
  rightParams: Record<string, string>
  leftParamErrors: Record<string, string>
  rightParamErrors: Record<string, string>
  demoTrajectory: string
  compareApiData: CompareApiResponse | null
  compareLoading: boolean
  compareError: string | null
  demoTime: number | null
  setDemoTime: (timestamp: number) => void
  setShowGroundTruth: (checked: boolean) => void
  setShowStops: (checked: boolean) => void
  setLeftParams: ParamStateSetter
  setRightParams: ParamStateSetter
  setLeftParamErrors: ParamStateSetter
  setRightParamErrors: ParamStateSetter
  setDemoTrajectory: (trajectoryId: string) => void
  handleCompareModeToggle: () => void
  handleLeftAlgorithmChange: (algorithmId: string) => void
  handleRightAlgorithmChange: (algorithmId: string) => void
  handleNewTrajectory: () => void
  openMetricsFromDemo: () => void
  startTour: () => void
}) {
  const [comparePreviewRunId, setComparePreviewRunId] = useState(0)
  const [comparePlaybackState, setComparePlaybackState] = useState<"playing" | "paused" | "complete">("complete")

  return (
    <div className="nomad-page-frame flex h-full flex-1 flex-col gap-3 overflow-hidden py-4">
      <div className={`${revealClass()} flex shrink-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between`}>
        <div className="flex items-center gap-2">
          <h2 className="text-2xl font-bold">{compareMode ? "Compare Algorithms" : "Demo Single Algorithm"}</h2>
          {!compareMode && (
            <Button variant="outline" size="icon" onClick={startTour} title="Take Tour" aria-label="Take Tour" className="h-8 w-8">
              <HelpCircle className="h-4 w-4" />
            </Button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-4" data-tour="tour-layers">
          <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
            <Checkbox checked={showGroundTruth} onCheckedChange={(checked) => setShowGroundTruth(checked === true)} />
            Ground Truth
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
            <Checkbox checked={showStops} onCheckedChange={(checked) => setShowStops(checked === true)} />
            Detected Stops
          </label>
        </div>
      </div>

      {!compareMode ? (
        <div className={`${revealClass("panel", 2)} grid flex-1 min-h-0 lg:grid-cols-[minmax(0,1fr)_330px] gap-3 items-stretch overflow-hidden`}>
          <div className="flex min-h-0 flex-col gap-3">
            <CompareAnimationPanel panel={compareApiData?.left} mode="single" currentTime={demoTime} onTimeChange={setDemoTime} showGroundTruth={showGroundTruth} showStops={showStops} />
            {compareLoading && <p className="text-xs text-muted-foreground">Running notebook algorithm code...</p>}
            {compareError && <p className="text-xs text-red-500">{compareError}</p>}
          </div>
          <Card className="min-h-0 overflow-hidden" data-tour="tour-params">
            <CardContent className="min-h-0 flex-1 space-y-3 overflow-y-auto">
              <div className="flex justify-start">
                <Button variant="outline" size="sm" onClick={handleCompareModeToggle} className="gap-2" data-tour="tour-compare-toggle">
                  <Columns2 className="h-4 w-4" />
                  Compare Algorithms
                </Button>
              </div>
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-muted-foreground">Trajectory</h4>
                <TrajectorySelector trajectoryId={demoTrajectory} onTrajectoryChange={setDemoTrajectory} />
              </div>
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-muted-foreground">Algorithm</h4>
                <Select value={leftAlgorithm} onValueChange={handleLeftAlgorithmChange}>
                  <SelectTrigger className="h-10 text-base"><SelectValue /></SelectTrigger>
                  <SelectContent>{demoAlgorithms.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
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
                <Button variant="outline" onClick={openMetricsFromDemo} size="lg" className="w-full" data-tour="tour-metrics">
                  <BarChart3 className="h-4 w-4" />
                  Aggregated Metrics
                </Button>
                <Button onClick={handleNewTrajectory} size="lg" className="nomad-action w-full">
                  <RefreshCw className="h-4 w-4" />
                  New Agent
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : (
        <div className={`${revealClass("panel", 2)} grid flex-1 min-h-0 lg:grid-cols-[minmax(0,1fr)_330px] gap-3 items-stretch overflow-hidden`}>
          <div className="flex min-h-0 flex-col gap-3">
            <div className="grid min-h-0 flex-1 items-stretch lg:grid-cols-2 gap-3">
              <CompareAnimationPanel panel={compareApiData?.left} mode="compare" currentTime={demoTime} onTimeChange={setDemoTime} syncMaster={false} showGroundTruth={showGroundTruth} showStops={showStops} previewRunId={comparePreviewRunId} sharedPlaybackState={comparePlaybackState} />
              <CompareAnimationPanel panel={compareApiData?.right} mode="compare" currentTime={demoTime} onTimeChange={setDemoTime} showGroundTruth={showGroundTruth} showStops={showStops} onReplayStart={() => setComparePreviewRunId((runId) => runId + 1)} onPlaybackStateChange={setComparePlaybackState} />
            </div>
            {compareLoading && <p className="text-xs text-muted-foreground">Running notebook algorithm code...</p>}
            {compareError && <p className="text-xs text-red-500">{compareError}</p>}
          </div>
          <Card className="min-h-0 overflow-hidden">
            <CardContent className="min-h-0 flex-1 space-y-4 overflow-y-auto">
              <div className="flex justify-start">
              <Button variant="outline" size="sm" onClick={handleCompareModeToggle} className="gap-2">
                <Square className="h-4 w-4" />
                Single
              </Button>
              </div>
              <div className="space-y-2">
                <h4 className="text-sm font-medium">Trajectory</h4>
                <TrajectorySelector trajectoryId={demoTrajectory} onTrajectoryChange={setDemoTrajectory} />
              </div>
              <div className="space-y-2">
                <h4 className="text-sm font-medium">Left</h4>
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
                <h4 className="text-sm font-medium">Right</h4>
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
                <Button variant="outline" onClick={openMetricsFromDemo} size="lg" className="w-full">
                  <BarChart3 className="h-4 w-4" />
                  Aggregated Metrics
                </Button>
                <Button onClick={handleNewTrajectory} size="lg" className="nomad-action w-full">
                  <RefreshCw className="h-4 w-4" />
                  New Agent
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}

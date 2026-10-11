/* LAYOUT + COORDINATOR FOR ENTIRE DEMO PAGE (controls & viz components) */

import { useEffect, useState } from "react"
import { BarChart3, Columns2, HelpCircle, RefreshCw, Square } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { CompareAnimationPanel, DemoSceneRenderer } from "./compare-animation-panel"
import { DemoParameterControls } from "./demo-parameter-controls"
import { TrajectoryOptions } from "./trajectory-options"
import { loadCompareData } from "../_lib/static-cache"
import { algorithms } from "../_lib/dashboard-data"
import { revealClass, validateAlgorithmParams } from "../_lib/dashboard-utils"
import type { ParamStateSetter } from "./demo-parameter-controls"
import type { AlgorithmDefinition } from "../_lib/dashboard-data"
import type { CompareApiResponse, ComparePanelResponse } from "../_lib/types"

// Keep preview loading independent of the active demo and its playback state.
function DestinationPreview({ trajectory }: { trajectory: string }) {
  const [data, setData] = useState<CompareApiResponse | null>(null)
  const [error, setError] = useState("")

  useEffect(() => {
    let cancelled = false
    const algorithm = algorithms.find((entry) => entry.id === "dbstop")!
    loadCompareData({
      trajectory,
      mode: "single",
      seed: 1,
      left: { algo: algorithm.id, params: validateAlgorithmParams(algorithm.id, algorithm, {}).normalized },
    }).then(
      (response) => { if (!cancelled) setData(response) },
      () => { if (!cancelled) setError("Unable to load this preview.") },
    )
    return () => { cancelled = true }
  }, [trajectory])

  return (
    <div className="relative mx-auto mt-2 aspect-square w-4/5">
      <div className="absolute left-1/2 top-0 aspect-square w-[125%] origin-top -translate-x-1/2 scale-[0.8]">
        {data ? (
          <DemoSceneRenderer
            panel={data.left}
            mode="single"
            currentTime={null}
            onTimeChange={() => {}}
            syncMaster={false}
            showGroundTruth={false}
            showStops={false}
            showXray={false}
            variant="destination-preview"
          />
        ) : (
          <p role="status" className="flex h-full items-center justify-center text-sm text-foreground">
            {error || "Loading preview…"}
          </p>
        )}
      </div>
    </div>
  )
}

// Display one trajectory statistic, with an optional explanation,
// and one value per Demo panel so compared algorithms line up in columns.
function InformationRow({ label, help, values }: { label: string; help?: string; values: string[] }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="font-semibold text-foreground">{label}</span>
      {help && (
        <Tooltip>
          <TooltipTrigger asChild>
            <button type="button" aria-label={`About ${label}`} className="text-muted-foreground hover:text-[#3b1370]">
              <HelpCircle className="h-3.5 w-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right" className="max-w-56">{help}</TooltipContent>
        </Tooltip>
      )}
      <span className="ml-auto flex gap-1.5">
        {values.map((value, index) => (
          <span key={index} className="min-w-9 text-right font-mono text-foreground">{value}</span>
        ))}
      </span>
    </div>
  )
}

export function DemoView({
  compareMode,
  showGroundTruth,
  showStops,
  showXray,
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
  compareError,
  demoTime,
  setDemoTime,
  setShowGroundTruth,
  setShowStops,
  setShowXray,
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
  showXray: boolean
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
  compareError: string | null
  demoTime: number | null
  setDemoTime: (timestamp: number) => void
  setShowGroundTruth: (checked: boolean) => void
  setShowStops: (checked: boolean) => void
  setShowXray: (checked: boolean) => void
  setLeftParams: ParamStateSetter
  setRightParams: ParamStateSetter
  setLeftParamErrors: ParamStateSetter
  setRightParamErrors: ParamStateSetter
  setDemoTrajectory: (trajectoryId: string) => void
  handleCompareModeToggle: () => void
  handleLeftAlgorithmChange: (algorithmId: string) => void
  handleRightAlgorithmChange: (algorithmId: string) => void
  handleNewTrajectory: () => void
  openMetricsFromDemo: (agentId?: string) => void
  startTour: () => void
}) {

  // Track replay requests and playback state shared between comparison panels.
  const [comparePreviewRunId, setComparePreviewRunId] = useState(0)
  const [comparePlaybackState, setComparePlaybackState] = useState<"playing" | "paused" | "complete">("complete")
  const scene = compareApiData?.left.scene
  const runPanels = compareApiData
    ? [compareApiData.left, ...(compareMode && compareApiData.right ? [compareApiData.right] : [])]
    : []
  const percentValues = (metric: keyof ComparePanelResponse["metrics"]) =>
    runPanels.map((panel) => `${Math.round(panel.metrics[metric] * 100)}%`)
  const dataPanel = (
    <Card className="self-start overflow-hidden bg-[#f8f9fc] py-4" data-tour="tour-data">
      <CardContent className="flex flex-col gap-3 px-4">
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-[#3b1370]">Ground truth diary</h4>
          <TrajectoryOptions
            value={demoTrajectory}
            onChange={setDemoTrajectory}
            preview={(trajectory) => <DestinationPreview key={trajectory} trajectory={trajectory} />}
          />
        </div>
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-[#3b1370]">Selected agent</h4>
          <div className="space-y-2 rounded-md border border-border/70 bg-background/30 px-3 py-2">
            {scene && (
              <div className="flex items-center gap-3 text-xs">
                <span className="font-semibold text-foreground">agent</span>
                <span className="min-w-0 flex-1 truncate text-right font-mono text-foreground">
                  {scene.user_id}
                </span>
              </div>
            )}
            <Button variant="outline" onClick={handleNewTrajectory} size="lg" className="w-full">
              <RefreshCw className="h-4 w-4" />
              New Agent
            </Button>
          </div>
        </div>
        {scene && (
          <TooltipProvider delayDuration={200}>
            <div className="space-y-1.5 rounded-md border border-border/70 bg-background/30 px-3 py-2">
              {runPanels.length > 1 && <InformationRow label="" values={["Left", "Right"]} />}
              <InformationRow label="min-by-min recall" values={percentValues("recall")} />
              <InformationRow
                label="stops split"
                help="Share of true stops detected as more than one stop at the correct location."
                values={percentValues("split_fraction")}
              />
              <InformationRow
                label="stops missing"
                help="Share of true stops not overlapped by any detected stop."
                values={percentValues("missed_fraction")}
              />
              <InformationRow
                label="stops merged"
                help="Share of detected true stops that also overlap a detected stop at a different location."
                values={percentValues("merged_fraction")}
              />
              <Button variant="outline" size="sm" onClick={() => openMetricsFromDemo(scene.user_id)} className="w-full text-xs">
                <BarChart3 className="h-4 w-4" />
                Metrics for parameter sweep
              </Button>
              <InformationRow label="number of pings" values={[String(scene.pings.length)]} />
              <InformationRow
                label="frequency"
                values={[`${(scene.pings.length / ((scene.pings[scene.pings.length - 1].timestamp - scene.pings[0].timestamp) / 3600)).toFixed(1)}/hr`]}
              />
              <InformationRow
                label="stops detected"
                values={runPanels.map((panel) => String(new Set(panel.result.cluster.filter((label) => label >= 0)).size))}
              />
            </div>
          </TooltipProvider>
        )}
      </CardContent>
    </Card>
  )

  // Apply reveal classes to the header and active panel layout.
  return (
    <div className="nomad-page-frame flex h-full flex-1 flex-col gap-3 overflow-hidden py-4">
      <div className={`${revealClass()} flex shrink-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between`}>
        <div className="flex items-center gap-2">
          <h2 className="text-2xl font-bold">{compareMode ? "Compare Algorithms" : "Demo Single Algorithm"}</h2>
          {!compareMode && (

            /* Start the Demo guided tour. */
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
          <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
            <Checkbox checked={showXray} onCheckedChange={(checked) => setShowXray(checked === true)} />
            X-ray
          </label>
        </div>
      </div>

      {!compareMode ? (
        <div className={`${revealClass("panel", 2)} grid flex-1 min-h-0 lg:grid-cols-[264px_minmax(0,1fr)_312px] gap-3 items-stretch overflow-hidden`}>
          {dataPanel}
          <div className="flex min-h-0 flex-col gap-3">
            <CompareAnimationPanel panel={compareApiData?.left} mode="single" currentTime={demoTime} onTimeChange={setDemoTime} showGroundTruth={showGroundTruth} showStops={showStops} showXray={showXray} />
            {compareError && <p className="text-xs text-red-500">{compareError}</p>}
          </div>
          <Card className="min-h-0 overflow-hidden bg-[#f8f9fc] py-4" data-tour="tour-params">
            <CardContent className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4">
              <div className="flex justify-start">
                <Button variant="outline" size="sm" onClick={handleCompareModeToggle} className="gap-2" data-tour="tour-compare-toggle">
                  <Columns2 className="h-4 w-4" />
                  Compare Algorithms
                </Button>
              </div>
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-[#3b1370]">Algorithm</h4>
                <Select value={leftAlgorithm} onValueChange={handleLeftAlgorithmChange}>
                <SelectTrigger className="h-10 border-[#d1d5db] bg-[#f4ecfe] text-base text-foreground hover:bg-white focus:ring-[#7629db]/25">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="border-[#d1d5db] bg-[#f4ecfe] text-foreground">
                  {demoAlgorithms.map((a) => (
                    <SelectItem
                      key={a.id}
                      value={a.id}
                      className="bg-[#f4ecfe] font-normal text-foreground hover:bg-white focus:bg-white focus:text-foreground data-[state=checked]:bg-[#e8d8fc] data-[state=checked]:text-[#3b1370] data-[state=checked]:font-bold data-[state=checked]:hover:bg-[#e8d8fc] data-[state=checked]:focus:bg-[#e8d8fc] data-[state=checked]:focus:text-[#3b1370]"
                    >
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-[#3b1370]">Parameters</h4>
                <DemoParameterControls
                  key={leftAlgorithm}
                  algo={leftAlgo}
                  algoId={leftAlgorithm}
                  values={leftParams}
                  errors={leftParamErrors}
                  setValues={setLeftParams}
                  setErrors={setLeftParamErrors}
                />
              </div>
              <div className="space-y-2 pt-2">
                <Button onClick={() => openMetricsFromDemo()} size="lg" className="nomad-action w-full" data-tour="tour-metrics">
                  <BarChart3 className="h-4 w-4" />
                  Aggregated Metrics
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : (
        <div className={`${revealClass("panel", 2)} grid flex-1 min-h-0 lg:grid-cols-[264px_minmax(0,1fr)_312px] gap-3 items-stretch overflow-hidden`}>
          {dataPanel}
          <div className="flex min-h-0 flex-col gap-3">
            <div className="grid min-h-0 flex-1 items-stretch lg:grid-cols-2 gap-3">
              <CompareAnimationPanel panel={compareApiData?.left} mode="compare" currentTime={demoTime} onTimeChange={setDemoTime} syncMaster={false} showGroundTruth={showGroundTruth} showStops={showStops} showXray={showXray} previewRunId={comparePreviewRunId} sharedPlaybackState={comparePlaybackState} />
              <CompareAnimationPanel panel={compareApiData?.right} mode="compare" currentTime={demoTime} onTimeChange={setDemoTime} showGroundTruth={showGroundTruth} showStops={showStops} showXray={showXray} onReplayStart={() => setComparePreviewRunId((runId) => runId + 1)} onPlaybackStateChange={setComparePlaybackState} />
            </div>
            {compareError && <p className="text-xs text-red-500">{compareError}</p>}
          </div>
          <Card className="min-h-0 overflow-hidden bg-[#f8f9fc] py-4">
            <CardContent className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4">
              <div className="flex justify-start">
              <Button variant="outline" size="sm" onClick={handleCompareModeToggle} className="gap-2">
                <Square className="h-4 w-4" />
                Single
              </Button>
              </div>
              <div className="space-y-2">
              <h4 className="text-sm font-medium text-[#3b1370]">Left</h4>
                <Select value={leftAlgorithm} onValueChange={handleLeftAlgorithmChange}>
                <SelectTrigger className="h-10 border-[#d1d5db] bg-white text-base text-foreground hover:bg-white focus:ring-[#7629db]/25">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="border-[#d1d5db] bg-[#f4ecfe] text-foreground">
                  {demoAlgorithms.map((a) => (
                    <SelectItem
                      key={a.id}
                      value={a.id}
                      className="bg-[#f4ecfe] font-normal text-foreground hover:bg-white focus:bg-white focus:text-foreground data-[state=checked]:bg-[#e8d8fc] data-[state=checked]:text-[#3b1370] data-[state=checked]:font-bold data-[state=checked]:hover:bg-[#e8d8fc] data-[state=checked]:focus:bg-[#e8d8fc] data-[state=checked]:focus:text-[#3b1370]"
                    >
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
                </Select>
                <DemoParameterControls
                  key={`left-${leftAlgorithm}`}
                  algo={leftAlgo}
                  algoId={leftAlgorithm}
                  values={leftParams}
                  errors={leftParamErrors}
                  setValues={setLeftParams}
                  setErrors={setLeftParamErrors}
                />
              </div>
              <div className="space-y-2">
              <h4 className="text-sm font-medium text-[#3b1370]">Right</h4>
                <Select value={rightAlgorithm} onValueChange={handleRightAlgorithmChange}>
                <SelectTrigger className="h-10 border-[#d1d5db] bg-white text-base text-foreground hover:bg-white focus:ring-[#7629db]/25">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="border-[#d1d5db] bg-[#f4ecfe] text-foreground">
                  {demoAlgorithms.map((a) => (
                    <SelectItem
                      key={a.id}
                      value={a.id}
                      className="bg-[#f4ecfe] font-normal text-foreground hover:bg-white focus:bg-white focus:text-foreground data-[state=checked]:bg-[#e8d8fc] data-[state=checked]:text-[#3b1370] data-[state=checked]:font-bold data-[state=checked]:hover:bg-[#e8d8fc] data-[state=checked]:focus:bg-[#e8d8fc] data-[state=checked]:focus:text-[#3b1370]"
                    >
                     {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
                </Select>
                <DemoParameterControls
                  key={`right-${rightAlgorithm}`}
                  algo={rightAlgo}
                  algoId={rightAlgorithm}
                  values={rightParams}
                  errors={rightParamErrors}
                  setValues={setRightParams}
                  setErrors={setRightParamErrors}
                />
              </div>
              <div className="space-y-2 pt-2">
                <Button onClick={() => openMetricsFromDemo()} size="lg" className="nomad-action w-full">
                  <BarChart3 className="h-4 w-4" />
                  Aggregated Metrics
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}

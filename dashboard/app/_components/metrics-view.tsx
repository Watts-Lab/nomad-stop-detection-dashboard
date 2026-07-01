import { Columns2, Square } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { METRICS_SWEEP_PARAMETERS } from "../_lib/dashboard-data"
import { prototypeChartSrc } from "../_lib/dashboard-utils"
import type { MetricsParameterNote } from "../_lib/types"

function MetricsParameterRows({
  algorithm,
  note,
}: {
  algorithm: string
  note: MetricsParameterNote | undefined
}) {
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

export function MetricsView({
  metricsCompareMode,
  metricsAlgorithms,
  metricsLeftAlgorithm,
  metricsRightAlgorithm,
  metricsLeftParameter,
  metricsRightParameter,
  leftParameterNote,
  rightParameterNote,
  metricsError,
  setMetricsCompareMode,
  setMetricsLeftAlgorithm,
  setMetricsRightAlgorithm,
  setMetricsLeftParameter,
  setMetricsRightParameter,
}: {
  metricsCompareMode: boolean
  metricsAlgorithms: string[]
  metricsLeftAlgorithm: string
  metricsRightAlgorithm: string
  metricsLeftParameter: string
  metricsRightParameter: string
  leftParameterNote: MetricsParameterNote | undefined
  rightParameterNote: MetricsParameterNote | undefined
  metricsError: string | null
  setMetricsCompareMode: (value: boolean) => void
  setMetricsLeftAlgorithm: (algorithm: string) => void
  setMetricsRightAlgorithm: (algorithm: string) => void
  setMetricsLeftParameter: (parameter: string) => void
  setMetricsRightParameter: (parameter: string) => void
}) {
  const leftMetricsPrototypeSrc = prototypeChartSrc(metricsLeftAlgorithm, metricsLeftParameter)
  const rightMetricsPrototypeSrc = prototypeChartSrc(metricsRightAlgorithm, metricsRightParameter)

  return (
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
          onClick={() => setMetricsCompareMode(!metricsCompareMode)}
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
                {metricsLeftAlgorithm}
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
                }}
              >
                <SelectTrigger className="h-10 text-base"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {metricsAlgorithms.map((algo) => <SelectItem key={algo} value={algo}>{algo}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <MetricsParameterRows algorithm={metricsLeftAlgorithm} note={leftParameterNote} />

            {metricsCompareMode && (
              <>
                <div className="space-y-1">
                  <label className="text-sm font-medium text-muted-foreground">Algorithm B</label>
                  <Select
                    value={metricsRightAlgorithm}
                    onValueChange={(algorithm) => {
                      setMetricsRightAlgorithm(algorithm)
                      setMetricsRightParameter(METRICS_SWEEP_PARAMETERS[algorithm]?.[0]?.value ?? "dist_thresh")
                    }}
                  >
                    <SelectTrigger className="h-10 text-base"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {metricsAlgorithms.map((algo) => <SelectItem key={algo} value={algo}>{algo}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <MetricsParameterRows algorithm={metricsRightAlgorithm} note={rightParameterNote} />
              </>
            )}

            {metricsError && <p className="text-xs text-red-500">{metricsError}</p>}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

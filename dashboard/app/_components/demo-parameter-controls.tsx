import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Slider } from "@/components/ui/slider"
import { DEMO_EDITABLE_PARAMS } from "../_lib/dashboard-data"
import { paramInputValue, parameterDisplayName } from "../_lib/dashboard-utils"
import type { AlgorithmDefinition } from "../_lib/dashboard-data"

export type ParamStateSetter = (value: Record<string, string> | ((prev: Record<string, string>) => Record<string, string>)) => void

export function DemoParameterControls({
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
        const label = param.name === "delta_roam"
          ? <span className="inline-flex items-baseline gap-0.5 font-sans">Δ<sub className="text-[0.7em] leading-none">roam</sub></span>
          : param.name
        const optionCount = rule ? Math.floor((rule.max - rule.min) / rule.step) + 1 : 0
        const discreteOptions = rule?.allowedValues
          ? rule.allowedValues.length <= 5
            ? rule.allowedValues
            : null
          : rule && optionCount > 0 && optionCount <= 5
            ? Array.from({ length: optionCount }, (_, index) => rule.min + index * rule.step)
            : null

        if (!rule) {
          return (
            <div key={param.name} className="rounded-md border border-border/70 bg-muted/20 px-3 py-2">
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-mono text-muted-foreground">{label}</span>
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
          {Object.entries(errors).map(([key, value]) => `${parameterDisplayName(key)}: ${value}`).join(" · ")}
        </p>
      )}
    </div>
  )
}

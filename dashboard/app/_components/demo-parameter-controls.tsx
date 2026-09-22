import { useId, useState } from "react"
import { HelpCircle } from "lucide-react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Slider } from "@/components/ui/slider"
import { DEMO_EDITABLE_PARAMS } from "../_lib/dashboard-data"
import { paramInputValue, parameterDisplayName } from "../_lib/dashboard-utils"
import type { AlgorithmDefinition } from "../_lib/dashboard-data"

export type ParamStateSetter = (value: Record<string, string> | ((prev: Record<string, string>) => Record<string, string>)) => void

// Render the selected algorithm's parameters as read-only values,
// dropdowns, or sliders according to its editing rules.
// Use parent-provided setters to update values and clear errors.
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
  const descriptionIdPrefix = useId()
  const [parameterInfoName, setParameterInfoName] = useState<string | null>(null)

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
        const showingInfo = parameterInfoName === param.name
        const descriptionId = `${descriptionIdPrefix}-${param.name}`

        return (
          <div key={param.name} className="space-y-1.5">
            <div className={`space-y-2 rounded-md border border-border/70 px-3 py-3 ${rule ? "bg-background/40" : "bg-muted/20"}`}>
              <div className="flex items-center justify-between gap-3">
                <span className={`font-mono ${rule ? "text-sm" : "text-xs text-muted-foreground"}`}>{label}</span>
                <div className="flex items-center gap-2">
                  {!discreteOptions && (
                    <span className={rule ? "rounded-sm bg-muted px-2 py-0.5 font-mono text-xs" : "font-mono text-xs text-foreground"}>
                      {rule && Number.isFinite(value) ? value : param.defaultValue}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => setParameterInfoName(showingInfo ? null : param.name)}
                    className={`flex h-8 w-8 items-center justify-center rounded-full border transition hover:bg-muted ${showingInfo ? "bg-muted text-foreground" : "text-muted-foreground"}`}
                    aria-label={`Show ${param.name} parameter info`}
                    aria-expanded={showingInfo}
                    aria-controls={descriptionId}
                  >
                    <HelpCircle className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {discreteOptions && (
                <Select
                  value={String(Number.isFinite(value) ? value : param.defaultValue)}

                  // Save the dropdown selection and clear this parameter's previous error.
                  onValueChange={(next) => {
                    setValues((prev) => ({ ...prev, [param.name]: next }))
                    setErrors((prev) => {
                      const updated = { ...prev }
                      delete updated[param.name]
                      return updated
                    })
                  }}
                >
                  <SelectTrigger className="h-9 w-full text-sm" aria-label={`${param.name} parameter`}>
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
              )}

              {rule && !discreteOptions && (
                <Slider
                  min={rule.min}
                  max={rule.max}
                  step={rule.step}
                  value={[Number.isFinite(value) ? value : Number(param.defaultValue)]}
                  aria-label={`${param.name} parameter`}

                  // Save the slider value as a string and clear this parameter's previous error.
                  onValueChange={([next]) => {
                    setValues((prev) => ({ ...prev, [param.name]: String(next) }))
                    setErrors((prev) => {
                      const updated = { ...prev }
                      delete updated[param.name]
                      return updated
                    })
                  }}
                />
              )}
            </div>
            {showingInfo && (
              <div id={descriptionId} className="rounded-md border bg-muted/40 p-3 text-sm leading-relaxed text-muted-foreground">
                {param.description}
              </div>
            )}
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

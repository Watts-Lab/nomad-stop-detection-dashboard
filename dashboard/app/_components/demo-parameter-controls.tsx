/* UI FOR CHANGING PARAMS OF THE ALGORITHM SELECTED IN DEMO MODE */ 

import { useId, useState } from "react"
import { HelpCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
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
      <div className="overflow-hidden rounded-md border border-border/70 bg-background/30">
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
            <div key={param.name} className="border-b border-border/70 last:border-b-0">
              <div className={rule && !discreteOptions ? "space-y-2 px-3 py-2.5" : "px-3 py-2"}>
                <div className="flex items-center justify-between gap-3">
                  <span className="min-w-0 font-mono text-sm">{label}</span>
                  <div className="flex shrink-0 items-center gap-2">
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
                        <SelectTrigger className="h-8 w-24 text-sm" aria-label={`${param.name} parameter`}>
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
                    {!discreteOptions && (
                      <span className={rule ? "rounded-sm bg-muted px-2 py-0.5 font-mono text-xs" : "font-mono text-xs text-foreground"}>
                        {rule && Number.isFinite(value) ? value : param.defaultValue}
                      </span>
                    )}
                    <Button
                      type="button"
                      variant="outline"
                      size="icon-sm"
                      onClick={() => setParameterInfoName(showingInfo ? null : param.name)}
                      className={`rounded-full hover:bg-muted ${showingInfo ? "bg-muted text-foreground" : "text-muted-foreground"}`}
                      aria-label={`Show ${param.name} parameter info`}
                      aria-expanded={showingInfo}
                      aria-controls={descriptionId}
                    >
                      <HelpCircle className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

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
                <div id={descriptionId} className="mx-3 mb-3 rounded-md border bg-muted/40 p-3 text-[13px] leading-relaxed text-muted-foreground">
                  {param.description}
                </div>
              )}
            </div>
          )
        })}
      </div>
      {Object.keys(errors).length > 0 && (
        <p className="text-xs text-red-500">
          {Object.entries(errors).map(([key, value]) => `${parameterDisplayName(key)}: ${value}`).join(" · ")}
        </p>
      )}
    </div>
  )
}

import { DASHBOARD_VIEWS, DEMO_EDITABLE_PARAMS, METRICS_RESULTS_FILE, algorithms } from "./dashboard-data"
import { publicPath } from "./public-path"
import type { AlgorithmDefinition } from "./dashboard-data"
import type { DashboardView } from "./types"

export function dashboardRouteState(searchParamString: string) {
  const params = new URLSearchParams(searchParamString)
  const rawView = params.get("view")
  const activeView: DashboardView = rawView && DASHBOARD_VIEWS.has(rawView as DashboardView)
    ? (rawView as DashboardView)
    : "home"
  const rawAlgo = params.get("algo")
  const expandedAlgorithm = activeView === "learn" && rawAlgo && algorithms.some((a) => a.id === rawAlgo) ? rawAlgo : null
  const compareMode = activeView === "demo" && params.get("mode") === "compare"

  return { activeView, expandedAlgorithm, compareMode }
}

export function revealClass(variant: "left" | "up" | "panel" = "left", delay = 1) {
  const variantClass = variant === "up" ? "page-reveal-up" : variant === "panel" ? "page-reveal-panel" : ""
  const delayClass = delay > 1 ? `page-reveal-${Math.min(delay, 8)}` : ""
  return ["page-reveal", variantClass, delayClass].filter(Boolean).join(" ")
}

export function parameterDisplayName(name: string) {
  return name === "delta_roam" ? "Δroam" : name
}

export function prototypeChartSrc(algorithm: string, sweepParameter: string, demoAlgorithmId?: string) {
  const field = sweepParameter || "delta_roam"
  const params = new URLSearchParams({
    x: field,
    field,
    data: METRICS_RESULTS_FILE[algorithm] ?? "lachesis_results.parquet",
    ...(demoAlgorithmId ? { algo: demoAlgorithmId } : {}),
  })
  return publicPath("/echarts-prototype/index.html") + "?" + params.toString()
}

export function validateAlgorithmParams(
  algoId: string,
  algoDef: AlgorithmDefinition,
  values: Record<string, string>,
) {
  const normalized: Record<string, number> = {}
  const errors: Record<string, string> = {}
  const constraints = DEMO_EDITABLE_PARAMS[algoId] ?? {}

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

export function paramInputValue(
  values: Record<string, string>,
  name: string,
  defaultValue: string,
) {
  return Object.prototype.hasOwnProperty.call(values, name) ? values[name] : defaultValue
}

export function darkenHex(hex: string, amount: number) {
  const color = hex.replace("#", "")
  const value = Number.parseInt(color, 16)
  const channel = (shift: number) => Math.max(0, Math.round(((value >> shift) & 255) * amount))
  return `#${[16, 8, 0].map((shift) => channel(shift).toString(16).padStart(2, "0")).join("")}`
}

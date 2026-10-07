/* RENDERS TRAJECTORY/DATASET PICKER, ALLOW USERS TO SELECT TRAJ & VIEW INFO ABOUT OPTIONS */

import { useId, useState, type ReactNode } from "react"
import { Check, HelpCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { TRAJECTORY_OPTIONS } from "../_lib/dashboard-data"

// Render the shared trajectory choices.
export function TrajectoryOptions({
  value,
  onChange,
  preview,
}: {
  value: string
  onChange: (trajectoryId: string) => void
  preview?: (trajectoryId: string) => ReactNode
}) {
  const descriptionIdPrefix = useId()
  const [trajectoryInfoId, setTrajectoryInfoId] = useState<string | null>(null)

  return (
    <div className="overflow-hidden rounded-md border border-border/70 bg-background/30">
      {TRAJECTORY_OPTIONS.map((trajectory) => {
        const selected = value === trajectory.id
        const showingInfo = trajectoryInfoId === trajectory.id
        const descriptionId = `${descriptionIdPrefix}-${trajectory.id}`

        return (
          <div key={trajectory.id} className="border-b border-border/70 last:border-b-0">
            <div className={`flex items-center gap-2 px-3 py-1 ${selected ? "bg-[#e8d8fc]" : ""}`}>
              <button
                type="button"
                onClick={() => {
                  if (trajectory.id !== value) setTrajectoryInfoId(null)
                  onChange(trajectory.id)
                }}
                aria-pressed={selected}
                className={`flex h-8 min-w-0 flex-1 items-center justify-between text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7629db]/40 ${
                  selected
                    ? "font-semibold text-[#3b1370]"
                    : "font-medium text-foreground hover:text-[#3b1370]"
                }`}
              >
                <span className="truncate">{trajectory.name}</span>
                {selected && <Check className="h-4 w-4 shrink-0" aria-hidden="true" />}
              </button>
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                onClick={() => setTrajectoryInfoId(trajectoryInfoId === trajectory.id ? null : trajectory.id)}
                aria-expanded={showingInfo}
                aria-controls={descriptionId}
                className={`rounded-full hover:bg-muted ${showingInfo ? "bg-muted text-foreground" : "text-muted-foreground"}`}
                aria-label={`Show ${trajectory.name} trajectory info`}
              >
                <HelpCircle className="h-4 w-4" />
              </Button>
            </div>
            {showingInfo && (
              <div id={descriptionId} className="mx-3 mb-3 space-y-1.5">
                {preview?.(trajectory.id)}
                <div className="rounded-md border bg-muted/40 p-3 text-[13px] leading-relaxed text-muted-foreground">
                  {trajectory.note}
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

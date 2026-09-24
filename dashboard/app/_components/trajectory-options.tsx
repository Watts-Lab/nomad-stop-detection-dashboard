import { useState } from "react"
import { HelpCircle } from "lucide-react"
import { TRAJECTORY_OPTIONS } from "../_lib/dashboard-data"

// Render single or comparison Demo panels and connect their controls
// to parent-provided handlers. Keep comparison replay/playback coordination
// local to this view.
export function TrajectoryOptions({
  value,
  onChange,
}: {
  value: string
  onChange: (trajectoryId: string) => void
}) {
  const [trajectoryInfoId, setTrajectoryInfoId] = useState<string | null>(null)

  return (
    <div className="space-y-1.5">
      {TRAJECTORY_OPTIONS.map((trajectory) => {
        const selected = value === trajectory.id
        const showingInfo = trajectoryInfoId === trajectory.id
        return (
          <div key={trajectory.id} className="space-y-1.5">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  if (trajectory.id !== value) setTrajectoryInfoId(null)
                  onChange(trajectory.id)
                }}
                className={`h-9 flex-1 rounded-md border px-3 text-left text-sm font-medium transition hover:bg-muted ${selected ? "bg-muted text-muted-foreground opacity-95" : "bg-background"}`}
              >
                {trajectory.name}
              </button>
              <button
                type="button"
                onClick={() => setTrajectoryInfoId(trajectoryInfoId === trajectory.id ? null : trajectory.id)}
                className={`flex h-8 w-8 items-center justify-center rounded-full border transition hover:bg-muted ${showingInfo ? "bg-muted text-foreground" : "text-muted-foreground"}`}
                aria-label={`Show ${trajectory.name} trajectory info`}
              >
                <HelpCircle className="h-4 w-4" />
              </button>
            </div>
            {showingInfo && (
              <div className="rounded-md border bg-muted/40 p-3 text-sm leading-relaxed text-muted-foreground">
                {trajectory.note}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
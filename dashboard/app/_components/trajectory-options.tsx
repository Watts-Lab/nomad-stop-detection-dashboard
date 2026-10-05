import { useState } from "react"
import { Check, HelpCircle } from "lucide-react"
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
                aria-pressed={selected}
                className={`flex h-9 flex-1 items-center justify-between rounded-md px-3 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7629db]/40 ${
                  selected
                    ? "border-2 border-[#7629db] bg-[#e8d8fc] font-bold text-[#3b1370]"
                    : "border border-[#d1d5db] bg-[#f8f9fc] font-medium text-foreground hover:bg-white"
                }`}
                >
                  <span>{trajectory.name}</span>
                  {selected && <Check className="h-4 w-4 shrink-0" aria-hidden="true" />}
              </button>
              <button
                type="button"
                onClick={() => setTrajectoryInfoId(trajectoryInfoId === trajectory.id ? null : trajectory.id)}
                aria-expanded={showingInfo}
                className={`flex h-8 w-8 items-center justify-center rounded-full border transition-colors ${
                  showingInfo
                    ? "border-[#7629db] bg-[#e8d8fc] text-[#3b1370]"
                    : "border-[#d1d5db] bg-[#f8f9fc] text-[#3b1370] hover:bg-white"
                }`}
                aria-label={`Show ${trajectory.name} trajectory info`}
              >
                <HelpCircle className="h-4 w-4" />
              </button>
            </div>
            {showingInfo && (
              <div className="rounded-md border border-[#d1d5db] bg-[#f8f9fc] p-3 text-sm leading-relaxed text-foreground">
                {trajectory.note}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
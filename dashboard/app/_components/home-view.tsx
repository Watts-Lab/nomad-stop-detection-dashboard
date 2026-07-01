"use client"

import { useState } from "react"
import Image from "next/image"
import { Play } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  GROUND_TRUTH_PLACEHOLDER_IMAGE,
  sampleDataPoints,
  timelineSegments,
} from "../_lib/dashboard-data"
import type { DashboardView, DataPoint, TimeSegment } from "../_lib/types"

const rooms = [
  { x: 20, y: 20, width: 60, height: 50 },
  { x: 20, y: 90, width: 80, height: 80 },
  { x: 20, y: 190, width: 60, height: 50 },
  { x: 20, y: 260, width: 40, height: 40 },
  { x: 180, y: 20, width: 180, height: 60 },
  { x: 180, y: 100, width: 180, height: 160 },
  { x: 180, y: 280, width: 80, height: 40 },
  { x: 280, y: 280, width: 80, height: 40 },
  { x: 420, y: 20, width: 140, height: 50 },
  { x: 420, y: 90, width: 140, height: 100 },
  { x: 420, y: 210, width: 140, height: 110 },
]

const pointColors = { orange: "#F5A623", pink: "#E57373", purple: "#7B68EE" }
const segmentColors = { orange: "bg-[#F5A623]", pink: "bg-[#E8B4B8]", purple: "bg-[#9B8BB8]" }

function FloorPlan({
  dataPoints,
  selectedTimeRange,
  compact = false,
  placeholderSrc,
}: {
  dataPoints: DataPoint[]
  selectedTimeRange: string | null
  compact?: boolean
  placeholderSrc?: string
}) {
  const filtered = selectedTimeRange ? dataPoints.filter((p) => p.time === selectedTimeRange) : dataPoints

  if (placeholderSrc) {
    return (
      <div className="relative w-full">
        <img
          src={placeholderSrc}
          alt="Ground truth trajectory placeholder"
          className={`w-full ${compact ? "h-32" : "h-auto"} object-contain`}
        />
      </div>
    )
  }

  return (
    <div className="relative w-full">
      <svg viewBox="0 0 600 340" className={`w-full ${compact ? "h-32" : "h-auto"}`} style={{ backgroundColor: "#d4d4d4" }} preserveAspectRatio={compact ? "xMidYMid slice" : "xMidYMid meet"}>
        {rooms.map((room, i) => (
          <rect key={i} x={room.x} y={room.y} width={room.width} height={room.height} fill="#888" stroke="#777" strokeWidth="1" />
        ))}
        {filtered.map((p) => (
          <g key={p.id}>
            <circle cx={p.x} cy={p.y} r={12} fill="none" stroke={pointColors[p.color]} strokeWidth="2" />
            <circle cx={p.x} cy={p.y} r={4} fill={pointColors[p.color]} />
          </g>
        ))}
      </svg>
    </div>
  )
}

function Timeline({ segments, selectedSegment, onSegmentClick }: { segments: TimeSegment[]; selectedSegment: string | null; onSegmentClick: (id: string | null) => void }) {
  return (
    <div className="w-full">
      <p className="text-center text-muted-foreground mb-2 text-sm">Timestamps</p>
      <div className="relative">
        <div className="relative h-10 bg-card border border-border rounded-sm overflow-hidden">
          {segments.map((seg) => (
            <button
              key={seg.id}
              onClick={() => onSegmentClick(selectedSegment === seg.id ? null : seg.id)}
              className={`absolute top-0 h-full transition-all ${segmentColors[seg.color]} ${selectedSegment === seg.id ? "ring-2 ring-foreground/50 ring-offset-1" : ""} ${selectedSegment && selectedSegment !== seg.id ? "opacity-40" : ""}`}
              style={{ left: `${seg.startPercent}%`, width: `${seg.widthPercent}%` }}
            />
          ))}
        </div>
        <div className="flex justify-between mt-2 text-sm text-muted-foreground px-1">
          <span>08 AM</span>
          <span>09 AM</span>
          <span>10 AM</span>
        </div>
      </div>
    </div>
  )
}

export function HomeView({ navigateTo }: { navigateTo: (view: DashboardView) => void }) {
  const [selectedTimeRange, setSelectedTimeRange] = useState<string | null>(null)

  return (
    <div className="flex-1 overflow-y-auto">
      <section className="nomad-hero min-h-[calc(100vh-74px)] border-b border-[#263449] px-5 py-6">
        <div className="mx-auto grid min-h-[calc(100vh-122px)] max-w-7xl items-center gap-8 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="max-w-2xl">
            <Image
              src="/assets/logos/nomad_logo_hero_white_teal.svg"
              alt="NOMAD"
              width={480}
              height={85}
              priority
              className="h-[72px] w-auto sm:h-[84px] md:h-24"
            />
            <p className="mt-7 text-2xl font-semibold tracking-normal text-[#f2f4eb] md:text-3xl">
              Stop detection tools for noisy human mobility data.
            </p>
            <div className="mt-7 grid gap-5 text-left">
              <div>
                <h2 className="text-lg font-semibold text-[#f2f4eb]">What Stop Detection Is</h2>
                <p className="mt-2 text-base leading-relaxed text-[#b6c9dc]">
                  Stop detection identifies intervals where a person remains stationary long enough to count as a meaningful visit, reducing raw GPS streams into mobility events.
                </p>
              </div>
              <div>
                <h2 className="text-lg font-semibold text-[#f2f4eb]">What This Dashboard Does</h2>
                <p className="mt-2 text-base leading-relaxed text-[#94a1b7]">
                  Learn algorithm assumptions, tune parameters, compare behavior side by side, and inspect trajectory outputs and aggregate metrics without rerunning notebook experiments.
                </p>
              </div>
            </div>
            <div className="mt-8 flex flex-col gap-4 sm:flex-row">
              <Button size="lg" onClick={() => navigateTo("demo")} className="h-14 min-w-60 bg-[#459ba4] text-base font-semibold text-[#08101c] hover:bg-[#62b8bf]">
                <Play className="h-5 w-5 fill-current" />
                Run Demo
              </Button>
              <Button variant="outline" size="lg" onClick={() => navigateTo("learn")} className="h-14 min-w-44 border-[#3a465d] bg-[#111625]/45 text-base font-semibold text-[#f2f4eb] hover:bg-[#242b3d]">
                Learn More
              </Button>
            </div>
          </div>

          <Card className="nomad-card overflow-hidden rounded-lg py-0">
            <CardContent className="p-0">
              <div className="border-b border-[#263449] bg-[#202738]/80 px-5 py-4">
                <h3 className="text-lg font-semibold text-[#f2f4eb]">Trajectory Preview</h3>
              </div>
              <div className="p-5">
                <div className="overflow-hidden rounded-md border border-[#263449] bg-[#111625]">
                  <FloorPlan
                    dataPoints={sampleDataPoints}
                    selectedTimeRange={selectedTimeRange}
                    placeholderSrc={GROUND_TRUTH_PLACEHOLDER_IMAGE}
                  />
                </div>
                <div className="mt-5">
                  <Timeline segments={timelineSegments} selectedSegment={selectedTimeRange} onSegmentClick={setSelectedTimeRange} />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  )
}

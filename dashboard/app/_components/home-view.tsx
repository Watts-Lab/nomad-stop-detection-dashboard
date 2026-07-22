"use client"

import { Play } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { publicPath } from "../_lib/public-path"
import type { DashboardView } from "../_lib/types"

function HomeStopRunPreview({ navigateTo }: { navigateTo: (view: DashboardView) => void }) {
  return (
    <button
      type="button"
      onClick={() => navigateTo("demo")}
      className="group relative h-[360px] w-full overflow-hidden rounded-md border border-[#263449] bg-white text-left outline-none ring-offset-2 ring-offset-[#0a1020] transition hover:border-[#459ba4] focus-visible:ring-2 focus-visible:ring-[#62b8bf]"
      aria-label="Open stop detection demo"
    >
      <video
        autoPlay
        loop
        muted
        playsInline
        poster={publicPath("/issue-images/home-stop-run-placeholder.png")}
        preload="auto"
        src={publicPath("/videos/home-stop-preview.mp4")}
        className="absolute inset-0 h-full w-full object-cover"
        aria-hidden="true"
      />
      <span className="pointer-events-none absolute inset-0 z-10 bg-[#459ba4]/0 transition group-hover:bg-[#459ba4]/10" />
      <span className="pointer-events-none absolute left-1/2 top-1/2 z-20 -translate-x-1/2 -translate-y-1/2 rounded-md border border-[#62b8bf]/60 bg-[#08101c]/85 px-4 py-2 text-sm font-semibold text-[#f2f4eb] opacity-0 shadow-lg transition group-hover:opacity-100 group-focus-visible:opacity-100">
        Go to demo
      </span>
    </button>
  )
}

export function HomeView({ navigateTo }: { navigateTo: (view: DashboardView) => void }) {
  return (
    <div className="flex-1 overflow-y-auto">
      <section className="nomad-hero min-h-[calc(100vh-74px)] border-b border-[#263449] py-6">
        <div className="nomad-page-frame grid min-h-[calc(100vh-122px)] items-center gap-8 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="max-w-2xl">
            <h1 className="home-copy-reveal text-5xl font-bold tracking-normal text-[#f2f4eb] sm:text-6xl md:text-7xl">
              Stop Detection Dashboard
            </h1>
            <p className="home-copy-reveal home-copy-reveal-2 mt-7 text-2xl font-semibold tracking-normal text-[#f2f4eb] md:text-3xl">
              Explore and compare algorithms that turn noisy GPS traces into meaningful stops.
            </p>
            <div className="mt-7 grid gap-5 text-left">
              <div className="home-copy-reveal home-copy-reveal-3">
                <h2 className="text-lg font-semibold text-[#f2f4eb]">What Stop Detection Is</h2>
                <p className="mt-2 text-base leading-relaxed text-[#b6c9dc]">
                  Stop detection identifies intervals where a person remains stationary long enough to count as a meaningful visit, reducing raw GPS streams into mobility events.
                </p>
              </div>
              <div className="home-copy-reveal home-copy-reveal-4">
                <h2 className="text-lg font-semibold text-[#f2f4eb]">What This Dashboard Does</h2>
                <p className="mt-2 text-base leading-relaxed text-[#94a1b7]">
                  Learn algorithm assumptions, tune parameters, compare behavior side by side, and inspect trajectory outputs and aggregate metrics without rerunning notebook experiments.
                </p>
              </div>
            </div>
            <div className="home-copy-reveal home-copy-reveal-5 mt-8 flex flex-col gap-4 sm:flex-row">
              <Button size="lg" onClick={() => navigateTo("demo")} className="nomad-action h-14 min-w-60 text-base">
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
                <HomeStopRunPreview navigateTo={navigateTo} />
              </div>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  )
}

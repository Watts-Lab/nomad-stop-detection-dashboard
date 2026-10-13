/* RENDER DASHBOARD'S STATIC HOME PAGE CONTENT */

"use client"

import { ChevronRight, Play } from "lucide-react"
import { Button } from "@/components/ui/button"
import { publicPath } from "../_lib/public-path"
import type { DashboardView } from "../_lib/types"

function HomeStopRunPreview({ navigateTo }: { navigateTo: (view: DashboardView) => void }) {
  return (
    <button
      type="button"
      onClick={() => navigateTo("demo")}
      className="group relative aspect-video w-full overflow-hidden rounded-md border border-border bg-white text-left outline-none ring-offset-2 ring-offset-background transition hover:border-[#7629db] focus-visible:ring-2 focus-visible:ring-ring"
      aria-label="Open stop detection demo"
    >
      <video
        autoPlay
        loop
        muted
        playsInline
        poster={publicPath("/issue-images/home-stop-run-placeholder.png")}
        preload="auto"
        src={publicPath("/videos/home-stop-preview.mp4?v=20261012")}
        className="absolute inset-0 h-full w-full object-contain"
        aria-hidden="true"
      />
      <span className="pointer-events-none absolute inset-0 z-10 bg-[#7629db]/0 transition group-hover:bg-[#7629db]/10" />
      <span className="pointer-events-none absolute left-1/2 top-1/2 z-20 -translate-x-1/2 -translate-y-1/2 rounded-md border border-[#e6dffc]/60 bg-primary/85 px-4 py-2 text-sm font-semibold text-primary-foreground opacity-0 shadow-lg transition group-hover:opacity-100 group-focus-visible:opacity-100">
        Go to demo
      </span>
    </button>
  )
}

export function HomeView({ navigateTo }: { navigateTo: (view: DashboardView) => void }) {
  return (
    <div className="flex-1 overflow-y-auto">
      <section className="nomad-hero min-h-[calc(100vh-74px)] border-b border-border py-6">
        <div className="nomad-page-frame grid min-h-[calc(100vh-122px)] content-start items-start gap-8 lg:grid-cols-2">
          <h1 className="home-copy-reveal text-4xl font-bold tracking-normal text-[#3b1370] sm:text-5xl lg:col-span-2">
            Stop Detection Lab
          </h1>
          <div className="max-w-2xl">
            <p className="home-copy-reveal home-copy-reveal-2 text-xl font-semibold tracking-normal text-foreground">
              An interactive tool to compare stop detection algorithms on noisy synthetic GPS trajectories.
            </p>
            <div className="mt-7 grid gap-5 text-left">
              <div className="home-copy-reveal home-copy-reveal-3">
                <h2 className="text-lg font-semibold text-[#3b1370]">What is stop detection?</h2>
                <ul className="mt-2 grid gap-2 text-base leading-relaxed text-foreground">
                  <li className="flex gap-2">
                    <ChevronRight className="mt-1.5 h-4 w-4 shrink-0 text-[#7629db]" />
                    <span>
                      It is the spatio-temporal{" "}
                      <span className="font-semibold text-[#3b1370]">clustering</span>{" "}
                      problem of identifying{" "}
                      <span className="font-semibold text-[#3b1370]">stationary segments</span>{" "}
                      in a mobile object&apos;s trajectory, particularly in the presence of noise and
                      signal irregularity.
                    </span>
                  </li>
                  <li className="flex gap-2">
                    <ChevronRight className="mt-1.5 h-4 w-4 shrink-0 text-[#7629db]" />
                    <span>
                      In human mobility analysis, stop detection adds semantics that allow
                      inferring <span className="font-semibold text-[#3b1370]">visits</span>{" "}
                      to places of interest (POIs),{" "}
                      <span className="font-semibold text-[#3b1370]">trips</span>{" "}
                      between them, and{" "}
                      <span className="font-semibold text-[#3b1370]">interactions between individuals</span>.
                    </span>
                  </li>
                  <li className="flex gap-2">
                    <ChevronRight className="mt-1.5 h-4 w-4 shrink-0 text-[#7629db]" />
                    <span>
                      It can also{" "}
                      <span className="font-semibold text-[#3b1370]">reduce uncertainty</span>{" "}
                      about <span className="font-semibold text-[#3b1370]">which location</span>{" "}
                      was visited and the{" "}
                      <span className="font-semibold text-[#3b1370]">time spent</span>{" "}
                      there.
                    </span>
                  </li>
                  <li className="flex gap-2">
                    <ChevronRight className="mt-1.5 h-4 w-4 shrink-0 text-[#7629db]" />
                    <span>
                      A stop can be represented by a tuple like{" "}
                      <span className="font-mono">(user_id, x, y, t_start, t_end)</span>.
                    </span>
                  </li>
                </ul>
              </div>
              <div className="home-copy-reveal home-copy-reveal-4">
                <h2 className="text-lg font-semibold text-[#3b1370]">What does this tool do?</h2>
                <p className="mt-2 text-base leading-relaxed text-foreground">
                  It explains the{" "}
                  <span className="font-semibold text-[#3b1370]">logic and parameters</span>{" "}
                  of different stop detection algorithms, points to{" "}
                  <span className="font-semibold text-[#3b1370]">open-source implementations</span>,
                  and lets users evaluate detected stops side-by-side against{" "}
                  <span className="font-semibold text-[#3b1370]">synthetic ground truth</span>,
                  across a wide range of parameters. It also provides{" "}
                  <span className="font-semibold text-[#3b1370]">aggregated performance metrics</span>{" "}
                  over hundreds of sampled trajectories.
                </p>
              </div>
            </div>
          </div>

          <div className="grid gap-4">
            <HomeStopRunPreview navigateTo={navigateTo} />
            <div className="home-copy-reveal home-copy-reveal-5 flex flex-col gap-4 sm:flex-row">
              <Button size="lg" onClick={() => navigateTo("demo")} className="nomad-action h-14 min-w-60 text-base">
                <Play className="h-5 w-5 fill-current" />
                Run Demo
              </Button>
              <Button variant="outline" size="lg" onClick={() => navigateTo("learn")} className="h-14 min-w-44 border-border bg-secondary text-base font-semibold text-secondary-foreground hover:bg-accent hover:text-accent-foreground">
                Learn More
              </Button>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}

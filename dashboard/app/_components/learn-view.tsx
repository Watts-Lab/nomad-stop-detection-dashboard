/* RENDER LEARN PAGE EXPLAINING STOP DETECTION ALGOS & CONCEPTS */

import Image from "next/image"
import { Maximize2, Minimize2, Play } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { DEMO_ALGORITHM_IDS, LEARN_FAMILIES, algorithms } from "../_lib/dashboard-data"
import { revealClass } from "../_lib/dashboard-utils"
import type { DashboardView, DemoMode } from "../_lib/types"

export function LearnView({
  expandedAlgorithm,
  setExpandedAlgorithm,
  syncUrl,
  openLearnAlgorithm,
  openLearnDemo,
}: {
  expandedAlgorithm: string | null
  setExpandedAlgorithm: (algorithmId: string | null) => void
  syncUrl: (view: DashboardView, algoId?: string | null, demoMode?: DemoMode) => void
  openLearnAlgorithm: (algorithmId: string) => void
  openLearnDemo: (algorithmId: string) => void
}) {
  const expandedLearnAlgorithm = expandedAlgorithm ? algorithms.find((a) => a.id === expandedAlgorithm) : null
  const expandedLearnFamilyTitle = expandedLearnAlgorithm ? LEARN_FAMILIES.find((family) => family.id === expandedLearnAlgorithm.family)?.title ?? "Algorithm Family" : ""

  return (
    <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
      <div className={`nomad-page-frame flex min-h-0 flex-col gap-3 py-4 pb-6 transition duration-200 ${expandedLearnAlgorithm ? "scale-[0.99] opacity-55 blur-[1.5px]" : ""}`}>
        <div className={`${revealClass()} shrink-0 space-y-1`}>
          <h2 className="text-3xl font-bold">Learn Algorithms</h2>
          <p className="text-sm text-[#080d1a]">
            Explore the two algorithm families, then select an algorithm to inspect its assumptions and parameters.
          </p>
        </div>
        <div className={`${revealClass("up", 2)} grid grid-cols-1 gap-5 pb-2 lg:grid-cols-2`}>
          {LEARN_FAMILIES.map((family, familyIndex) => (
            <Card
              key={family.id}
              className={`${revealClass("up", familyIndex + 2)} min-w-0 gap-0 border-2 border-[#e6dffc] bg-white py-0`}
            >
              <CardHeader className="px-5 pt-5 pb-4">
                <CardTitle className="text-xl font-semibold text-[#3b1370]">
                  {family.title}
                </CardTitle>
              </CardHeader>

              <CardContent className="flex flex-col gap-5 px-5 pb-5">
                <div className="overflow-hidden rounded-md bg-[#e5e7eb]">
                  <Image
                    src={family.diagramSrc}
                    alt={`${family.title} overview diagram`}
                    width={980}
                    height={620}
                    sizes="(min-width: 1024px) 50vw, 100vw"
                    className="block h-auto w-full"
                  />
                </div>

                <div className="space-y-3">
                  <p className="text-sm text-[#080d1a]">
                    Select an algorithm to explore its details and parameters.
                  </p>

                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {algorithms
                      .filter((algo) => algo.family === family.id)
                      .map((algo) => (
                        <Button
                          key={algo.id}
                          type="button"
                          variant="outline"
                          onClick={() => openLearnAlgorithm(algo.id)}
                          className="h-auto min-h-11 justify-between gap-2 whitespace-normal border-[#e6dffc] bg-white px-3 py-3 text-left text-sm font-semibold text-[#3b1370] hover:border-[#dbc2fa] hover:bg-[#f4ecfe] hover:text-[#7629db]"
                        >
                          <span>{algo.name}</span>
                          <Maximize2 className="h-4 w-4 shrink-0" />
                        </Button>
                      ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <Dialog
        open={Boolean(expandedLearnAlgorithm)}
        onOpenChange={(open) => {
          if (!open) {
            setExpandedAlgorithm(null)
            syncUrl("learn")
          }
        }}
      >
        {expandedLearnAlgorithm && (
          <DialogContent
            showCloseButton={false}
            className="max-h-[calc(100vh-88px)] w-[calc(100vw-24px)] max-w-[min(1180px,calc(100vw-48px))] gap-0 overflow-hidden rounded-xl border-2 border-[#e6dffc] bg-[#f8f9fc] text-[#080d1a] p-0 shadow-2xl shadow-black/40 duration-200 sm:w-[calc(100vw-48px)] sm:max-h-[calc(100vh-120px)] sm:max-w-[min(1180px,calc(100vw-48px))]"
          >
            <div className="flex max-h-[calc(100vh-88px)] flex-col overflow-hidden sm:max-h-[calc(100vh-120px)]">
              <div className="shrink-0 px-5 pt-5 pb-4 md:px-8 md:pt-7">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 space-y-2">
                    <DialogTitle className="inline-block border-b-2 border-[#7629db] pb-2 text-2xl font-bold leading-tight text-[#3b1370]">
                      {expandedLearnAlgorithm.name}
                    </DialogTitle>
                    <DialogDescription className="text-sm text-[#080d1a]">
                      {expandedLearnFamilyTitle}
                    </DialogDescription>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setExpandedAlgorithm(null)
                      syncUrl("learn")
                    }}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-[#e6dffc] bg-[#e8d8fc] px-3 py-1.5 text-xs font-semibold text-[#3b1370] transition-colors hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7629db]/40"
                  >
                    Collapse
                    <Minimize2 className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-5 pb-5 md:px-8 md:pb-8">
                <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.95fr)] lg:items-start">
                  <div className="min-w-0 space-y-4">
                    <p className="break-words text-sm leading-relaxed text-[#080d1a] md:text-base">
                      {expandedLearnAlgorithm.description}
                    </p>
                    <div className="min-w-0 overflow-hidden rounded-md bg-[#e5e7eb]">
                      <Image
                        src={expandedLearnAlgorithm.expandedDiagramSrc}
                        alt={`${expandedLearnAlgorithm.name} expanded diagram`}
                        width={980}
                        height={620}
                        className="block h-auto w-full max-w-full"
                      />
                    </div>
                    <p id={`learn-documentation-${expandedLearnAlgorithm.id}`} className="scroll-mt-4 break-words text-sm text-[#080d1a]">
                      Source: {expandedLearnAlgorithm.source}
                    </p>
                  </div>

                  <section className="min-w-0 rounded-lg border border-[#dbc2fa] bg-white p-4 text-[#080d1a] md:p-5">
                    <h3 className="mb-4 text-lg font-semibold text-[#3b1370]">
                      Parameters
                    </h3>

                    <div className="overflow-x-auto rounded-md border border-[#c9afe8]">
                      <table className="w-full text-sm text-[#080d1a]">
                        <thead className="bg-[#dbc2fa]">
                          <tr>
                            <th className="px-3 py-2 text-left font-semibold">Name</th>
                            <th className="px-3 py-2 text-left font-semibold">Default</th>
                            <th className="px-3 py-2 text-left font-semibold">Description</th>
                          </tr>
                        </thead>

                        <tbody>
                          {expandedLearnAlgorithm.parameters.map((param, idx) => (
                            <tr
                              key={param.name}
                              className={`border-t border-[#c9afe8] ${idx % 2 === 0 ? "bg-[#e8d8fc]" : "bg-[#f4ecfe]"
                                }`}
                            >
                              <td className="px-3 py-2 font-mono text-sm">
                                {param.name === "delta_roam" ? (
                                  <span className="inline-flex items-baseline gap-0.5 font-sans">
                                    Δ
                                    <sub className="text-[0.7em] leading-none">roam</sub>
                                  </span>
                                ) : (
                                  param.name
                                )}
                              </td>
                              <td className="px-3 py-2 font-mono text-sm">
                                {param.defaultValue}
                              </td>
                              <td className="px-3 py-2 text-sm text-[#080d1a]">
                                {param.description}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
                </div>
              </div>

              <div className="shrink-0 border-t border-border/70 px-5 py-4 md:px-8">
                <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
                  {DEMO_ALGORITHM_IDS.has(expandedLearnAlgorithm.id) && (
                    <Button
                      size="lg"
                      onClick={() => openLearnDemo(expandedLearnAlgorithm.id)}
                      className="nomad-action h-11 min-w-36 text-base"
                    >
                      <Play className="h-5 w-5 fill-current" />
                      Demo
                    </Button>
                  )}
                  <Button
                    asChild
                    variant="outline"
                    size="lg"
                    className="h-11 min-w-36 border-[#e6dffc] bg-[#e8d8fc] text-base font-semibold text-[#3b1370] hover:bg-white hover:text-[#3b1370]"
                  >
                    <a href={expandedLearnAlgorithm.documentationUrl} target="_blank" rel="noreferrer">
                      Documentation
                    </a>
                  </Button>
                </div>
              </div>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </div>
  )
}

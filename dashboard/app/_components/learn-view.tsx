/* RENDER LEARN PAGE EXPLAINING STOP DETECTION ALGOS & CONCEPTS */

import Image from "next/image"
import { Maximize2, Minimize2, Play } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { DEMO_ALGORITHM_IDS, LEARN_CONCEPTS, LEARN_FAMILIES, algorithms } from "../_lib/dashboard-data"
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
  const expandedLearnConcept = expandedAlgorithm
    ? LEARN_CONCEPTS.find((concept) => concept.id === expandedAlgorithm)
    : null

  const isLearnExpanded = Boolean(expandedLearnAlgorithm || expandedLearnConcept)

  return (
    <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
      <div className={`nomad-page-frame flex min-h-0 flex-col gap-3 py-4 pb-6 transition duration-200 ${isLearnExpanded ? "scale-[0.99] opacity-55 blur-[1.5px]" : ""}`}>
        <div className={`${revealClass()} shrink-0 space-y-1`}>
          <h2 className="text-3xl font-bold">Learn Algorithms</h2>
          <p className="text-sm text-[#080d1a]">
            Explore stop-detection algorithms, failure modes, and key terminology.
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
          {[
            {
              id: "failure-modes",
              title: "Failure Modes",
              description:
                "Explore how detected stops can merge distinct visits or split a single visit.",
              placeholder: "Merging and splitting diagram coming soon",
            },
            {
              id: "glossary",
              title: "Glossary",
              description:
                "Explore the terms used to describe trajectories and stop detection.",
              placeholder: "Term illustrations coming soon",
            },
          ].map((category) => (
            <Card
              key={category.id}
              className="min-w-0 gap-0 border-2 border-[#e6dffc] bg-white py-0"
            >
              <CardHeader className="px-5 pt-5 pb-4">
                <CardTitle className="text-xl font-semibold text-[#3b1370]">
                  {category.title}
                </CardTitle>
              </CardHeader>

              <CardContent className="flex flex-col gap-5 px-5 pb-5">
                {category.id === "glossary" ? (
                  <div className="overflow-x-auto rounded-md border border-[#c9afe8]">
                    <table className="w-full text-left text-sm text-[#080d1a]">
                      <thead className="bg-[#dbc2fa]">
                        <tr>
                          <th scope="col" className="px-3 py-2 font-semibold">
                            Term
                          </th>
                          <th scope="col" className="px-3 py-2 font-semibold">
                            Definition
                          </th>
                        </tr>
                      </thead>

                      <tbody>
                        {LEARN_CONCEPTS
                          .filter((concept) => concept.category === "glossary")
                          .map((concept) => (
                            <tr
                              key={concept.id}
                              className="border-t border-[#c9afe8] even:bg-[#f4ecfe]"
                            >
                              <th scope="row" className="px-3 py-3 align-top font-medium">
                                <button
                                  type="button"
                                  onClick={() => openLearnAlgorithm(concept.id)}
                                  className="rounded-sm text-left text-[#3b1370] underline underline-offset-4 hover:text-[#7629db] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7629db]"
                                >
                                  {concept.name}
                                </button>
                              </th>
                              <td className="px-3 py-3 align-top leading-relaxed">
                                {concept.description}
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="flex aspect-[980/620] items-center justify-center rounded-md border border-dashed border-[#9ca3af] bg-[#e5e7eb] p-6 text-center">
                    <p className="text-sm text-[#374151]">
                      {category.placeholder}
                    </p>
                  </div>
                )}
                {category.id !== "glossary" && (
                  <div className="space-y-3">
                    <p className="text-sm text-[#080d1a]">
                      {category.description}
                    </p>

                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {LEARN_CONCEPTS
                        .filter((concept) => concept.category === category.id)
                        .map((concept) => (
                          <Button
                            key={concept.id}
                            type="button"
                            variant="outline"
                            onClick={() => openLearnAlgorithm(concept.id)}
                            className="h-auto min-h-11 justify-between gap-2 whitespace-normal border-[#e6dffc] bg-white px-3 py-3 text-left text-sm font-semibold text-[#3b1370] hover:border-[#dbc2fa] hover:bg-[#f4ecfe] hover:text-[#7629db]"
                          >
                            <span>{concept.name}</span>
                            <Maximize2 className="h-4 w-4 shrink-0" />
                          </Button>
                        ))}
                    </div>
                  </div>
                )}
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
      <Dialog
        open={Boolean(expandedLearnConcept)}
        onOpenChange={(open) => {
          if (!open) {
            setExpandedAlgorithm(null)
            syncUrl("learn")
          }
        }}
      >
        {expandedLearnConcept && (
          <DialogContent
            className="max-h-[calc(100dvh-48px)] overflow-y-auto rounded-xl border-2 border-[#e6dffc] bg-[#f8f9fc] p-5 text-[#080d1a] sm:max-w-3xl md:p-8"
          >
            <DialogTitle className="pr-8 text-2xl font-bold text-[#3b1370]">
              {expandedLearnConcept.name}
            </DialogTitle>

            <DialogDescription className="text-sm text-[#374151]">
              {expandedLearnConcept.category === "failure-modes"
                ? "Failure Modes"
                : "Glossary"}
            </DialogDescription>

            <p className="text-sm leading-relaxed md:text-base">
              {expandedLearnConcept.description}
            </p>

            <div className="flex aspect-[980/620] items-center justify-center rounded-md border border-dashed border-[#9ca3af] bg-[#e5e7eb] p-6 text-center">
              <p className="text-sm text-[#374151]">
                Illustration for {expandedLearnConcept.name.toLowerCase()} coming soon
              </p>
            </div>

            <div className="flex justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setExpandedAlgorithm(null)
                  syncUrl("learn")
                }}
                className="border-[#e6dffc] bg-[#e8d8fc] text-[#3b1370] hover:bg-white"
              >
                Collapse
                <Minimize2 className="h-4 w-4" />
              </Button>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </div>
  )
}

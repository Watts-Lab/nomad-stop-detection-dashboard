import Image from "next/image"
import { Play } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { LEARN_FAMILIES, algorithms } from "../_lib/dashboard-data"
import { revealClass } from "../_lib/dashboard-utils"
import type { DashboardView, DemoMode } from "../_lib/types"

export function LearnView({
  expandedAlgorithm,
  setExpandedAlgorithm,
  syncUrl,
  openLearnAlgorithm,
  openLearnDemo,
  openLearnDocumentation,
}: {
  expandedAlgorithm: string | null
  setExpandedAlgorithm: (algorithmId: string | null) => void
  syncUrl: (view: DashboardView, algoId?: string | null, demoMode?: DemoMode) => void
  openLearnAlgorithm: (algorithmId: string) => void
  openLearnDemo: (algorithmId: string) => void
  openLearnDocumentation: (algorithmId: string) => void
}) {
  const expandedLearnAlgorithm = expandedAlgorithm ? algorithms.find((a) => a.id === expandedAlgorithm) : null
  const expandedLearnFamilyTitle = expandedLearnAlgorithm ? LEARN_FAMILIES.find((family) => family.id === expandedLearnAlgorithm.family)?.title ?? "Algorithm Family" : ""

  return (
    <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
      <div className={`nomad-page-frame flex min-h-0 flex-col gap-3 py-4 pb-6 transition duration-200 ${expandedLearnAlgorithm ? "scale-[0.99] opacity-55 blur-[1.5px]" : ""}`}>
        <div className={`${revealClass()} shrink-0 space-y-1`}>
          <h2 className="text-3xl font-bold">Learn Algorithms</h2>
          <p className="text-sm text-muted-foreground">
            Select an algorithm card to inspect assumptions, parameter behavior, and a method sketch.
          </p>
        </div>
        <div className={`${revealClass("up", 2)} space-y-5 pb-2`}>
          {LEARN_FAMILIES.map((family, familyIndex) => (
            <section key={family.id} className="space-y-3">
              <h3 className="text-xl font-semibold">{family.title}</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
                {algorithms.filter((algo) => algo.family === family.id).map((algo, algoIndex) => (
                  <Card
                    key={algo.id}
                    className={`${revealClass("up", familyIndex * 4 + algoIndex + 2)} nomad-interactive-card group cursor-pointer border-2 flex flex-col py-0`}
                    onClick={() => openLearnAlgorithm(algo.id)}
                  >
                    <CardHeader className="px-5 pt-5 pb-1 shrink-0">
                      <CardTitle className="inline-block border-b-2 border-transparent pb-1 text-lg text-[#94a1b7] transition-colors group-hover:border-[#8acac8] group-hover:text-[#f2f4eb]">
                        {algo.name}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="px-5 pb-5 flex-1 flex flex-col gap-3">
                      <p className="text-sm text-muted-foreground">{algo.shortDesc}</p>
                      <div className="relative aspect-[16/5] overflow-hidden rounded-md bg-[#111625]">
                        <Image
                          src={algo.cardDiagramSrc}
                          alt={`${algo.name} card diagram`}
                          fill
                          sizes="(min-width: 1280px) 25vw, (min-width: 768px) 50vw, 100vw"
                          className="object-contain p-1"
                        />
                      </div>
                      <div className="flex items-center justify-end gap-1.5 pt-1 text-xs font-medium text-[#8acac8]">
                        <span>View more</span>
                        <Image src="/assets/icons/learn-expand.svg" alt="" width={16} height={16} />
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>
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
            className="max-h-[calc(100vh-88px)] w-[calc(100vw-24px)] max-w-[min(1180px,calc(100vw-48px))] gap-0 overflow-hidden rounded-xl border-2 border-[#8acac8] bg-card p-0 shadow-2xl shadow-black/40 duration-200 sm:w-[calc(100vw-48px)] sm:max-h-[calc(100vh-120px)] sm:max-w-[min(1180px,calc(100vw-48px))]"
          >
            <div className="flex max-h-[calc(100vh-88px)] flex-col overflow-hidden sm:max-h-[calc(100vh-120px)]">
              <div className="shrink-0 px-5 pt-5 pb-4 md:px-8 md:pt-7">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 space-y-2">
                    <DialogTitle className="inline-block border-b-2 border-[#8acac8] pb-2 text-2xl font-bold leading-tight text-[#f2f4eb]">
                      {expandedLearnAlgorithm.name}
                    </DialogTitle>
                    <DialogDescription className="text-sm text-muted-foreground">
                      {expandedLearnFamilyTitle}
                    </DialogDescription>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setExpandedAlgorithm(null)
                      syncUrl("learn")
                    }}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-md p-0 text-xs font-medium text-[#8acac8] transition-colors hover:text-[#f2f4eb] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8acac8]"
                  >
                    Collapse
                    <Image src="/assets/icons/learn-collapse.svg" alt="" width={16} height={16} />
                  </button>
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-5 pb-5 md:px-8 md:pb-8">
                <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.95fr)] lg:items-start">
                  <div className="min-w-0 space-y-4">
                    <p className="break-words text-sm leading-relaxed text-muted-foreground md:text-base">
                      {expandedLearnAlgorithm.description}
                    </p>
                    <div className="min-w-0 overflow-hidden rounded-md bg-[#111625]">
                      <Image
                        src={expandedLearnAlgorithm.expandedDiagramSrc}
                        alt={`${expandedLearnAlgorithm.name} expanded diagram`}
                        width={980}
                        height={620}
                        className="block h-auto w-full max-w-full"
                      />
                    </div>
                    <p id={`learn-documentation-${expandedLearnAlgorithm.id}`} className="scroll-mt-4 break-words text-sm text-muted-foreground">
                      Source: {expandedLearnAlgorithm.source}
                    </p>
                  </div>

                  <section className="min-w-0 rounded-lg border border-border bg-[#151b2c]/70 p-4 md:p-5">
                    <h3 className="mb-4 text-lg font-semibold">Parameters</h3>
                    <div className="overflow-x-auto rounded-md border">
                      <table className="w-full text-sm">
                        <thead className="bg-muted">
                          <tr>
                            <th className="px-3 py-2 text-left font-medium">Name</th>
                            <th className="px-3 py-2 text-left font-medium">Default</th>
                            <th className="px-3 py-2 text-left font-medium">Description</th>
                          </tr>
                        </thead>
                        <tbody>
                          {expandedLearnAlgorithm.parameters.map((param, idx) => (
                            <tr key={param.name} className={idx % 2 === 0 ? "bg-muted/30" : ""}>
                              <td className="px-3 py-2 font-mono text-sm">{param.name}</td>
                              <td className="px-3 py-2 font-mono text-sm">{param.defaultValue}</td>
                              <td className="px-3 py-2 text-sm text-muted-foreground">{param.description}</td>
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
                  <Button
                    size="lg"
                    onClick={() => openLearnDemo(expandedLearnAlgorithm.id)}
                    className="nomad-action h-11 min-w-36 text-base"
                  >
                    <Play className="h-5 w-5 fill-current" />
                    Demo
                  </Button>
                  <Button
                    variant="outline"
                    size="lg"
                    onClick={() => openLearnDocumentation(expandedLearnAlgorithm.id)}
                    className="h-11 min-w-36 border-[#3a465d] bg-[#111625]/45 text-base font-semibold text-[#f2f4eb] hover:bg-[#242b3d]"
                  >
                    Documentation
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

import { Suspense } from "react"
import { NomadNav } from "@/components/nomad-nav"
import { Card, CardContent } from "@/components/ui/card"

const people = [
  { name: "Person 1", photo: "Photo 1", description: "Short description 1", href: "https://github.com/person-1" },
  { name: "Person 2", photo: "Photo 2", description: "Short description 2", href: "https://github.com/person-2" },
  { name: "Person 3", photo: "Photo 3", description: "Short description 3", href: "https://github.com/person-3" },
]

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-background text-foreground nomad-shell">
      <Suspense fallback={null}>
        <NomadNav />
      </Suspense>
      <main className="mx-auto flex max-w-5xl flex-col gap-6 px-5 py-10">
        <section className="space-y-3">
          <h1 className="text-3xl font-bold">About</h1>
          <p className="max-w-3xl text-base leading-relaxed text-[#b6c9dc]">
            This was a project by the Network for Open Mobility Analysis and Datasets (NOMAD), in the CSSLab.
          </p>
        </section>

        <section className="grid gap-3 md:grid-cols-3">
          {people.map((person) => (
            <Card key={person.name} className="overflow-hidden">
              <CardContent className="space-y-4 p-4">
                <div className="flex aspect-[4/3] items-center justify-center rounded-md border border-border bg-muted/40 text-sm text-muted-foreground">
                  {person.photo}
                </div>
                <div className="space-y-2">
                  <h2 className="text-lg font-semibold">{person.name}</h2>
                  <p className="text-sm text-muted-foreground">{person.description}</p>
                  <a
                    href={person.href}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex text-sm font-medium text-[#8acac8] underline underline-offset-4"
                  >
                    Website / GitHub
                  </a>
                </div>
              </CardContent>
            </Card>
          ))}
        </section>
      </main>
    </div>
  )
}

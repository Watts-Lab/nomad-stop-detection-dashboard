import Image from "next/image"
import { publicPath } from "@/app/_lib/public-path"
import { NomadNav } from "@/components/nomad-nav"
import { Card, CardContent } from "@/components/ui/card"
import { revealClass } from "../_lib/dashboard-utils"

const people = [
  {
    name: "Anoushka Menon",
    photo: publicPath("/headshots/Anoushka_Menon.png"),
    description: "Anoushka Menon received her M.S.E. in Data Science from the University of Pennsylvania in May 2026.",
    href: "https://github.com/anoushkamenonn",
  },
  {
    name: "Carol Tu",
    photo: publicPath("/headshots/Carol_Tu.png"),
    description: "Carol Tu received her B.S.E. in Computer Science from the University of Pennsylvania in May 2026.",
    href: "https://github.com/caroltuu",
  },
  {
    name: "Jorge Barreras",
    photo: publicPath("/headshots/Jorge_Barreras.png"),
    description: "Jorge Barreras received his Ph.D. from the University of Pennsylvania in 2022 and is a Postdoctoral Researcher at the CSSLab.",
    href: "https://github.com/paco-barreras",
  },
]

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-background text-foreground nomad-shell">
      <NomadNav currentView="about" />
      <main className="nomad-page-frame flex flex-col gap-6 py-10">
        <section className={`${revealClass()} space-y-3`}>
          <h1 className="text-3xl font-bold">About</h1>
          <p className="max-w-3xl text-base leading-relaxed text-[#b6c9dc]">
            This was a project by the Network for Open Mobility Analysis and Datasets (NOMAD), in the CSSLab.
          </p>
          <p className="text-sm text-[#b6c9dc]">
            For questions or inquiries, message{" "}
            <a href="mailto:nomad@seas.upenn.edu" className="font-medium text-[#8acac8] underline underline-offset-4">
              nomad@seas.upenn.edu
            </a>
            .
          </p>
        </section>

        <section className="grid gap-3 md:grid-cols-3">
          {people.map((person, personIndex) => (
            <Card key={person.name} className={`${revealClass("up", personIndex + 2)} nomad-interactive-card overflow-hidden`}>
              <CardContent className="space-y-3 p-3">
                <div className="relative mx-auto aspect-square w-40 overflow-hidden rounded-md border border-border bg-muted/40">
                  <Image
                    src={person.photo}
                    alt={`${person.name} headshot`}
                    fill
                    sizes="160px"
                    className="object-cover"
                  />
                </div>
                <div className="space-y-2">
                  <h2 className="text-base font-semibold">{person.name}</h2>
                  <p className="text-xs leading-relaxed text-muted-foreground">{person.description}</p>
                  <a
                    href={person.href}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex text-xs font-medium text-[#8acac8] underline underline-offset-4"
                  >
                    GitHub
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

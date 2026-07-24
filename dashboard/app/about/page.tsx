import Image from "next/image"
import { Github, Globe, Linkedin, Mail } from "lucide-react"
import { publicPath } from "@/app/_lib/public-path"
import { NomadNav } from "@/components/nomad-nav"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { revealClass } from "../_lib/dashboard-utils"

const teamGroups = [
  {
    title: "People",
    members: [
      {
        name: "Jorge Barreras",
        initials: "JB",
        photo: publicPath("/headshots/Jorge_Barreras.png"),
        role: "Postdoctoral Researcher · CSSLab",
        links: [
          { label: "GitHub", href: "https://github.com/paco-barreras", icon: Github },
          { label: "LinkedIn", href: "https://www.linkedin.com/in/jorge-francisco-barreras-2b3826103", icon: Linkedin },
        ],
      },
      {
        name: "Tina Ni",
        initials: "TN",
        photo: null,
        role: "NOMAD Contributor",
        links: [
          { label: "GitHub", href: "https://github.com/tina-ni", icon: Github },
          { label: "LinkedIn", href: "https://www.linkedin.com/in/tina-ni-795838284", icon: Linkedin },
        ],
      },
      {
        name: "Lorenzo Santos",
        initials: "LS",
        photo: null,
        role: "NOMAD Contributor",
        links: [
          { label: "GitHub", href: "https://github.com/santosl529", icon: Github },
          { label: "LinkedIn", href: "https://www.linkedin.com/in/lorenzo-santos-de", icon: Linkedin },
        ],
      },
      {
        name: "Celia Tung",
        initials: "CT",
        photo: null,
        role: "NOMAD Contributor",
        links: [
          { label: "GitHub", href: "https://github.com/cetung-gif", icon: Github },
          { label: "LinkedIn", href: "https://www.linkedin.com/in/celia-tung-a76338308", icon: Linkedin },
        ],
      },
      {
        name: "Darren Wang",
        initials: "DW",
        photo: null,
        role: "NOMAD Contributor",
        links: [
          { label: "GitHub", href: "https://github.com/DPnimo11", icon: Github },
          { label: "LinkedIn", href: "https://www.linkedin.com/in/darren-wang-penn", icon: Linkedin },
          { label: "Personal website", href: "https://dpnimo11.github.io", icon: Globe },
        ],
      },
    ],
  },
  {
    title: "Alumni",
    members: [
      {
        name: "Anoushka Menon",
        initials: "AM",
        photo: publicPath("/headshots/Anoushka_Menon.png"),
        role: "M.S.E. Data Science · 2026",
        links: [
          { label: "GitHub", href: "https://github.com/anoushkamenonn", icon: Github },
          { label: "LinkedIn", href: "https://www.linkedin.com/in/anoushka-menon", icon: Linkedin },
        ],
      },
      {
        name: "Carol Tu",
        initials: "CT",
        photo: publicPath("/headshots/Carol_Tu.png"),
        role: "B.S.E. Computer Science · 2026",
        links: [
          { label: "GitHub", href: "https://github.com/caroltuu", icon: Github },
          { label: "LinkedIn", href: "https://www.linkedin.com/in/caroltuu", icon: Linkedin },
        ],
      },
    ],
  },
]

export default function AboutPage() {
  return (
    <div className="nomad-shell h-screen overflow-y-auto bg-background text-foreground">
      <NomadNav currentView="about" />
      <main className="nomad-page-frame grid gap-12 py-10 lg:grid-cols-[minmax(0,0.85fr)_minmax(32rem,1.15fr)] lg:gap-16 lg:py-14">
        <div className="space-y-12 lg:sticky lg:top-[131px] lg:self-start">
          <section className={`${revealClass()} space-y-5`}>
            <p className="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-[#8acac8]">About NOMAD</p>
            <h1 className="max-w-xl text-4xl font-bold leading-[1.08] tracking-tight sm:text-5xl">
              Open tools for human mobility science.
            </h1>
            <p className="max-w-xl text-base leading-relaxed text-[#b6c9dc] sm:text-lg">
              The Network for Open Mobility Analysis and Datasets (NOMAD) expands access to large-scale GPS
              mobility data and standardizes analytical tools for human mobility science and epidemiology. By
              lowering technical and data-access barriers, NOMAD helps researchers and policymakers use mobility
              data for reproducible research and evidence-informed policy.
            </p>
          </section>

          <section className={`${revealClass("up", 2)} max-w-xl space-y-4 border-t border-[#263449] pt-6`}>
            <div className="space-y-2">
              <h2 className="text-xl font-semibold">Code availability</h2>
              <p className="text-sm leading-relaxed text-muted-foreground">
                The source code for this dashboard is publicly available on GitHub. For questions about reuse,
                licensing, data access, or collaboration, contact the NOMAD team.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button asChild className="nomad-action">
                <a
                  href="https://github.com/Watts-Lab/nomad-stop-detection-dashboard"
                  target="_blank"
                  rel="noreferrer"
                >
                  <Github className="h-4 w-4" />
                  View source
                </a>
              </Button>
              <Button asChild variant="outline" className="border-[#3a465d] bg-[#171d2e]/70 hover:bg-[#242b3d]">
                <a href="mailto:nomad@seas.upenn.edu">
                  <Mail className="h-4 w-4" />
                  Contact us
                </a>
              </Button>
            </div>
          </section>
        </div>

        <div className="space-y-10">
          {teamGroups.map((group, groupIndex) => (
            <section key={group.title} className="space-y-4" aria-labelledby={`${group.title.toLowerCase()}-heading`}>
              <h2
                id={`${group.title.toLowerCase()}-heading`}
                className={`${revealClass("up", groupIndex + 1)} text-2xl font-semibold tracking-tight`}
              >
                {group.title}
              </h2>
              <div className="space-y-3">
                {group.members.map((person, personIndex) => (
                  <Card
                    key={person.name}
                    className={`${revealClass("up", personIndex + groupIndex + 2)} nomad-interactive-card overflow-hidden py-0`}
                  >
                    <CardContent className="flex items-center gap-4 p-4 sm:gap-5">
                      <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-md border border-[#34455d] bg-[#202738] sm:h-28 sm:w-28">
                        {person.photo ? (
                          <Image
                            src={person.photo}
                            alt={`${person.name} headshot`}
                            fill
                            sizes="112px"
                            className="object-cover"
                          />
                        ) : (
                          <div
                            aria-label={`${person.name} headshot placeholder`}
                            className="flex h-full w-full items-center justify-center bg-[radial-gradient(circle_at_30%_25%,rgba(138,202,200,0.2),transparent_55%),linear-gradient(145deg,#242f43,#171d2e)] font-mono text-xl font-semibold tracking-[0.08em] text-[#8acac8]"
                          >
                            {person.initials}
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1 space-y-3">
                        <div className="space-y-1">
                          <h3 className="text-lg font-semibold sm:text-xl">{person.name}</h3>
                          <p className="font-mono text-[0.68rem] uppercase tracking-[0.12em] text-muted-foreground sm:text-xs">
                            {person.role}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          {person.links.map((link) => {
                            const LinkIcon = link.icon

                            return (
                              <a
                                key={link.label}
                                href={link.href}
                                target="_blank"
                                rel="noreferrer"
                                aria-label={`${person.name} ${link.label}`}
                                title={link.label}
                                className="flex h-8 w-8 items-center justify-center rounded-md border border-[#34455d] text-muted-foreground transition-colors hover:border-[#8acac8] hover:text-[#8acac8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8acac8]"
                              >
                                <LinkIcon className="h-4 w-4" />
                              </a>
                            )
                          })}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>
          ))}
        </div>
      </main>
    </div>
  )
}

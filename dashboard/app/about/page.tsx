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
        photo: publicPath("/headshots/Jorge_Barreras.jpg"),
        role: "Postdoctoral Researcher · Principal Investigator",
        links: [
          { label: "GitHub", href: "https://github.com/paco-barreras", icon: Github },
          { label: "LinkedIn", href: "https://www.linkedin.com/in/jorge-francisco-barreras-2b3826103", icon: Linkedin },
        ],
      },
      {
        name: "Lorenzo Santos",
        initials: "LS",
        photo: publicPath("/headshots/Lorenzo_Santos.jpg"),
        role: "Researcher",
        links: [
          { label: "GitHub", href: "https://github.com/santosl529", icon: Github },
          { label: "LinkedIn", href: "https://www.linkedin.com/in/lorenzo-santos-de", icon: Linkedin },
        ],
      },
      {
        name: "Darren Wang",
        initials: "DW",
        photo: publicPath("/headshots/Darren_Wang.png"),
        role: "Researcher",
        links: [
          { label: "GitHub", href: "https://github.com/DPnimo11", icon: Github },
          { label: "LinkedIn", href: "https://www.linkedin.com/in/darren-wang-penn", icon: Linkedin },
          { label: "Personal website", href: "https://darren-wang.dev", icon: Globe },
        ],
      },
      {
        name: "Celia Tung",
        initials: "CT",
        photo: null,
        role: "Researcher",
        links: [
          { label: "GitHub", href: "https://github.com/cetung-gif", icon: Github },
          { label: "LinkedIn", href: "https://www.linkedin.com/in/celia-tung-a76338308", icon: Linkedin },
        ],
      },
      {
        name: "Tina Ni",
        initials: "TN",
        photo: publicPath("/headshots/Tina_Ni.jpg"),
        role: "Researcher",
        links: [
          { label: "GitHub", href: "https://github.com/tina-ni", icon: Github },
          { label: "LinkedIn", href: "https://www.linkedin.com/in/tina-ni-795838284", icon: Linkedin },
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
          <p className="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-[#3b1370]">About NOMAD</p>
          <h1 className="max-w-xl text-4xl font-bold leading-[1.08] tracking-tight text-[#3b1370] sm:text-5xl">
              We create tools for analysis of human mobility
            </h1>
            <div className="max-w-xl space-y-5 text-sm leading-relaxed text-foreground sm:text-base">
              <p>
                NOMAD, the Network for Open Mobility Analysis and Data, is an NSF-funded initiative of the Computational Social Science Lab at the University of Pennsylvania. Its mission is to expand access to high-precision human mobility data, to offer technical and scientific guidance on how to work with it, and to provide the tools to analyze it at scale and translate insights into research, applications, and decision-support tools. In doing so, NOMAD brings together researchers, industry partners, and decision-makers around the privacy-centered and socially beneficial use of human mobility data.
              </p>
              <p>
                Furthermore, researchers can engage with NOMAD to learn about this type of data, its potential and limitations. Through tutorials and other learning resources, users can acquire the skills and knowledge necessary to transform raw mobility data into metrics and insights, and can familiarize themselves with the current state of research in several human mobility applications.
              </p>
            </div>
          </section>

          <section className={`${revealClass("up", 2)} max-w-xl space-y-4 border-t border-[#263449] pt-6`}>
            <div className="space-y-2">
              <h2 className="text-xl font-semibold">Code availability</h2>
              <p className="text-sm leading-relaxed text-foreground">
                The source code for this dashboard is publicly available on GitHub. For questions about reuse,
                licensing, data access, or collaboration, contact the NOMAD team at{" "}
                <strong>nomad@seas.upenn.edu</strong>.
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
              <Button asChild variant="outline" className="border-border bg-secondary text-secondary-foreground hover:bg-accent hover:text-accent-foreground">
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
                          <p className="font-mono text-[0.68rem] uppercase tracking-[0.12em] text-foreground sm:text-xs">
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

"use client"

import Image from "next/image"
import Link from "next/link"
import { Menu } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Sheet, SheetClose, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { publicPath } from "@/app/_lib/public-path"
import type { DashboardView } from "@/app/_lib/types"

const navItems = [
  { label: "Home", href: "/", view: "home" },
  { label: "Learn", href: "/?view=learn", view: "learn" },
  { label: "Demo", href: "/?view=demo", view: "demo" },
  { label: "Aggregated Metrics", href: "/?view=metrics", view: "metrics" },
  { label: "About", href: "/about", view: "about" },
]

export function NomadNav({ currentView }: { currentView: DashboardView | "about" }) {
  return (
    <header className="sticky top-0 z-20 border-b border-border bg-white">
      <div className="nomad-page-frame flex h-[clamp(5rem,4.5rem+1vw,6.5rem)] items-center justify-between gap-[clamp(1.5rem,2.5vw,4rem)]">
        <Link
          href="/"
          prefetch={false}
          aria-label="Go to home"
          className="shrink-0 rounded-sm transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Image
            src={publicPath("/assets/logos/nomad-logo.svg")}
            alt="NOMAD"
            width={212}
            height={37}
            priority
            className="h-[clamp(2.25rem,1.9rem+0.6vw,3rem)] w-auto"
          />
        </Link>
        <nav className="hidden flex-1 items-center justify-end gap-[clamp(1.5rem,2vw,3rem)] text-[clamp(0.875rem,0.75rem+0.25vw,1.125rem)] font-semibold uppercase tracking-[0.025em] text-[#3a465d] lg:flex">
          {navItems.map((item) => (
            <Link
              key={item.view}
              href={item.href}
              prefetch={false}
              aria-current={currentView === item.view ? "page" : undefined}
              className={`whitespace-nowrap rounded-sm py-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                currentView === item.view
                  ? "text-primary"
                  : "hover:text-muted-foreground"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <Button asChild size="lg" className="hidden h-[clamp(3rem,2.6rem+0.6vw,3.75rem)] rounded-xl bg-muted-foreground px-[clamp(1.25rem,1.5vw,2.25rem)] text-[clamp(0.9375rem,0.82rem+0.25vw,1.125rem)] font-semibold text-primary-foreground shadow-none hover:bg-primary sm:inline-flex">
            <Link href="/?view=demo" prefetch={false}>
              <span>Run Demo</span>
            </Link>
          </Button>
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="outline" size="icon-lg" className="border-border bg-white text-foreground hover:bg-accent hover:text-primary lg:hidden" aria-label="Open navigation">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent className="border-border bg-white">
              <SheetHeader>
                <SheetTitle className="text-foreground">Navigate</SheetTitle>
              </SheetHeader>
              <nav className="flex flex-col gap-2 px-4">
                {navItems.map((item) => (
                  <SheetClose asChild key={item.view}>
                    <Link
                      href={item.href}
                      prefetch={false}
                      className={`rounded-md border px-4 py-3 text-sm font-medium transition-colors ${
                        currentView === item.view
                          ? "border-primary bg-secondary text-primary"
                          : "border-border text-[#3a465d] hover:border-muted-foreground hover:bg-accent hover:text-primary"
                      }`}
                    >
                      {item.label}
                    </Link>
                  </SheetClose>
                ))}
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  )
}

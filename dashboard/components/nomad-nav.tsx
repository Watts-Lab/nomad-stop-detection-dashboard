"use client"

import Image from "next/image"
import Link from "next/link"
import { Menu, Play } from "lucide-react"
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
    <header className="sticky top-0 z-20 border-b border-[#263449] bg-[#111625]/92 backdrop-blur">
      <div className="nomad-page-frame flex h-[74px] items-center justify-between gap-[clamp(1rem,2vw,3rem)]">
        <Link
          href="/"
          prefetch={false}
          aria-label="Go to home"
          className="transition-opacity hover:opacity-85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8acac8]"
        >
          <Image
            src={publicPath("/assets/logos/nomad-logo-white.svg")}
            alt="NOMAD"
            width={212}
            height={37}
            priority
            className="h-[clamp(2rem,1.7rem+0.5vw,2.5rem)] w-auto brightness-0 invert"
          />
        </Link>
        <nav className="hidden items-center gap-[clamp(1rem,1vw,2rem)] text-[clamp(0.9375rem,0.8rem+0.25vw,1.125rem)] font-medium text-[#94a1b7] lg:flex">
          {navItems.map((item, index) => (
            <span key={item.view} className="flex items-center gap-[clamp(1rem,1vw,2rem)]">
              {index > 0 && <span aria-hidden="true" className="text-[#3a465d]">|</span>}
              <Link
                href={item.href}
                prefetch={false}
                className={`border-b-2 pb-1 transition-colors ${
                  currentView === item.view
                    ? "border-[#8acac8] text-[#f2f4eb]"
                    : "border-transparent hover:border-[#8acac8] hover:text-[#f2f4eb]"
                }`}
              >
                {item.label}
              </Link>
            </span>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <Button asChild size="lg" className="nomad-action h-[clamp(2.75rem,2.4rem+0.5vw,3.25rem)] px-[clamp(1rem,1vw,1.75rem)] text-[clamp(1rem,0.9rem+0.2vw,1.125rem)]">
            <Link href="/?view=demo" prefetch={false}>
              <Play className="h-5 w-5 fill-current" />
              <span className="hidden sm:inline">Run Demo</span>
            </Link>
          </Button>
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="outline" size="icon-lg" className="border-[#3a465d] bg-[#111625]/45 text-[#f2f4eb] hover:bg-[#242b3d] lg:hidden" aria-label="Open navigation">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent className="border-[#263449] bg-[#111625]">
              <SheetHeader>
                <SheetTitle>Navigate</SheetTitle>
              </SheetHeader>
              <nav className="flex flex-col gap-2 px-4">
                {navItems.map((item) => (
                  <SheetClose asChild key={item.view}>
                    <Link
                      href={item.href}
                      prefetch={false}
                      className={`rounded-md border px-4 py-3 text-sm font-medium transition-colors ${
                        currentView === item.view
                          ? "border-[#8acac8] bg-[#202738] text-[#f2f4eb]"
                          : "border-[#263449] text-[#94a1b7] hover:border-[#8acac8] hover:text-[#f2f4eb]"
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

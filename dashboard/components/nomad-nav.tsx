"use client"

import Image from "next/image"
import Link from "next/link"
import { usePathname, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"

const navItems = [
  { label: "Home", href: "/", view: "home" },
  { label: "Learn", href: "/?view=learn", view: "learn" },
  { label: "Demo", href: "/?view=demo", view: "demo" },
  { label: "Aggregated Metrics", href: "/?view=metrics", view: "metrics" },
  { label: "About", href: "/about", view: "about" },
]

export function NomadNav() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const currentView = pathname === "/about" ? "about" : searchParams.get("view") ?? "home"

  return (
    <header className="sticky top-0 z-20 border-b border-[#263449] bg-[#111625]/92 backdrop-blur">
      <div className="mx-auto flex h-[74px] max-w-7xl items-center justify-between gap-4 px-5">
        <Link
          href="/"
          aria-label="Go to home"
          className="transition-opacity hover:opacity-85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8acac8]"
        >
          <Image
            src="/assets/logos/nomad-logo-white.svg"
            alt="NOMAD"
            width={212}
            height={37}
            priority
            className="h-8 w-auto brightness-0 invert"
          />
        </Link>
        <nav className="hidden items-center gap-4 text-[15px] font-medium text-[#94a1b7] lg:flex">
          {navItems.map((item, index) => (
            <span key={item.view} className="flex items-center gap-4">
              {index > 0 && <span aria-hidden="true" className="text-[#3a465d]">|</span>}
              <Link
                href={item.href}
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
        <Button asChild size="lg" className="h-11 bg-[#459ba4] px-6 text-[#08101c] hover:bg-[#62b8bf]">
          <Link href="/?view=demo">Run Demo</Link>
        </Button>
      </div>
    </header>
  )
}

"use client"

import { useCallback, useEffect, useRef } from "react"
import { driver } from "driver.js"
import "driver.js/dist/driver.css"
import type { Driver, DriveStep } from "driver.js"

const TOUR_STORAGE_KEY = "hasSeenTour"

const TOUR_STEPS: DriveStep[] = [
  {
    element: "[data-tour='tour-map']",
    popover: {
      title: "Watch a Trajectory Play Out",
      description: "Grey dots are raw GPS pings from one person's trip. As the agent moves, the algorithm groups nearby pings into colored circles dependent on the algorithm's distance and duration thresholds (signifying confirmed stops). Toggle Ground Truth to see the real destination it's heading to.",
    },
  },
  {
    element: "[data-tour='tour-timeline']",
    popover: {
      title: "Scrub the Time-Series View",
      description: "Drag or scroll along the timeline to jump to any moment. Tick marks show when each ping arrived, and colored bars mark when the algorithm confirmed a stop, so you can see exactly how long each stop lasted.",
    },
  },
  {
    element: "[data-tour='tour-params']",
    popover: {
      title: "Pick an Algorithm & Tune It",
      description: "Choose an algorithm from the dropdown, then adjust its parameters (e.g. distance and time thresholds) with the sliders. Click Visualize to rerun the trip with your changes, or New Trajectory to test a different person's trip.",
    },
  },
  {
    element: "[data-tour='tour-compare-toggle']",
    popover: {
      title: "Compare Two Algorithms",
      description: "Click here to switch into side-by-side mode: pick Algorithm A and B with independent parameters, then watch both run on the same trip at once to see where they agree, split, merge, or miss a stop.",
    },
  },
]

/**
 * Drives the first-time product tour on the single-algorithm Demo view.
 *
 * ready: whether the tour's target elements are mounted in the DOM (Demo
 * view, single mode, trajectory scene loaded). Auto-launches once per
 * browser (tracked via localStorage) as soon as ready becomes true.
 * Returns startTour, which replays the tour on demand regardless of the
 * localStorage flag.
 */
export function useProductTour(ready: boolean) {
  const driverRef = useRef<Driver | null>(null)
  const autoStartedRef = useRef(false)

  const startTour = useCallback(() => {
    if (!driverRef.current) {
      driverRef.current = driver({
        showProgress: true,
        smoothScroll: true,
        stageRadius: 8,
        popoverClass: "nomad-tour-popover",
        steps: TOUR_STEPS,
        onDestroyed: () => {
          window.localStorage.setItem(TOUR_STORAGE_KEY, "true")
        },
      })
    }
    driverRef.current.drive()
  }, [])

  useEffect(() => {
    if (!ready || autoStartedRef.current) return
    if (window.localStorage.getItem(TOUR_STORAGE_KEY)) return
    autoStartedRef.current = true
    startTour()
  }, [ready, startTour])

  return { startTour }
}

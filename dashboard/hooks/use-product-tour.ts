"use client"

import { useCallback, useEffect, useRef } from "react"
import { driver } from "driver.js"
import "driver.js/dist/driver.css"
import type { Driver, DriveStep } from "driver.js"

const DEMO_TOUR_STORAGE_KEY = "hasSeenTour"
export const METRICS_TOUR_STORAGE_KEY = "hasSeenMetricsTour"
export const METRICS_TOUR_FOCUS_EVENT = "nomad:metrics-tour-focus"

const DEMO_TOUR_STEPS: DriveStep[] = [
  {
    element: "[data-tour='tour-map']",
    popover: {
      title: "Watch a Trajectory Play Out",
      description: "Grey dots are raw GPS pings from one person's trip. As the agent moves, the algorithm groups nearby pings into colored diamonds dependent on the algorithm's distance and duration thresholds (signifying confirmed stops). Toggle Ground Truth to see the real destination it's heading to.",
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

export const METRICS_TOUR_STEPS: DriveStep[] = [
  {
    element: "[data-tour='metrics-chart']",
    popover: {
      title: "Read the Parameter Sweep",
      description: "Each pale blue dot shows one person's result at one parameter setting. The horizontal axis shows the setting being tested, while the vertical axis shows how much of the known stop time the algorithm recovered. Higher values indicate better detection.",
    },
  },
  {
    element: "[data-tour='metrics-chart']",
    popover: {
      title: "See the Overall Pattern",
      description: "The solid blue line shows the average result across all people at each setting. Faint blue paths connect results from the same person, revealing how performance can vary between people even when the overall trend looks stable.",
    },
  },
  {
    element: "[data-tour='metrics-chart']",
    popover: {
      title: "Find Each Person's Best Setting",
      description: "A red x marks the setting that worked best for each person. The red line averages each person's best result among the settings tested up to that point. Hover over a red x to trace that person's results in green and see how their performance changes across the sweep.",
    },
  },
  {
    element: "[data-tour='metrics-controls']",
    popover: {
      title: "Choose and Compare Algorithms",
      description: "Use the control panel to select an algorithm and review the settings held fixed during the experiment. Switch to Compare to place two plots top and bottom. Each plot names the parameter being varied, while the vertical axis provides a common measure for comparison.",
    },
  },
]

function metricsTourFocus(step: DriveStep | undefined) {
  if (step?.popover?.title === "Read the Parameter Sweep") return "points"
  if (step?.popover?.title === "See the Overall Pattern") return "pattern"
  if (step?.popover?.title === "Find Each Person's Best Setting") return "best"
  return null
}

function broadcastMetricsTourFocus(step?: DriveStep) {
  const mode = metricsTourFocus(step)
  window.dispatchEvent(new CustomEvent(METRICS_TOUR_FOCUS_EVENT, { detail: mode }))
  document.querySelectorAll("iframe[src*='/echarts-prototype/']").forEach((iframe) => {
    if (iframe instanceof HTMLIFrameElement) {
      iframe.contentWindow?.postMessage({ type: "nomad-metrics-tour-focus", mode }, window.location.origin)
    }
  })
}

/**
 * Drives the first-time product tour on the single-algorithm Demo view.
 *
 * ready: whether the tour's target elements are mounted in the DOM (Demo
 * view, single mode, trajectory scene loaded). Auto-launches once per
 * browser (tracked via localStorage) as soon as ready becomes true.
 * Returns startTour, which replays the tour on demand regardless of the
 * localStorage flag.
 */
export function useProductTour(ready: boolean, steps = DEMO_TOUR_STEPS, storageKey = DEMO_TOUR_STORAGE_KEY) {
  const driverRef = useRef<Driver | null>(null)
  const autoStartedRef = useRef(false)

  const startTour = useCallback(() => {
    if (!driverRef.current) {
      driverRef.current = driver({
        showProgress: true,
        smoothScroll: true,
        stageRadius: 8,
        popoverClass: "nomad-tour-popover",
        steps,
        onHighlightStarted: (_element, step) => {
          broadcastMetricsTourFocus(step)
        },
        onDeselected: () => {
          broadcastMetricsTourFocus()
        },
        onDestroyed: () => {
          broadcastMetricsTourFocus()
          window.localStorage.setItem(storageKey, "true")
        },
      })
    }
    driverRef.current.drive()
  }, [steps, storageKey])

  useEffect(() => {
    if (!ready || autoStartedRef.current) return
    if (window.localStorage.getItem(storageKey)) return
    autoStartedRef.current = true
    startTour()
  }, [ready, startTour, storageKey])

  return { startTour }
}

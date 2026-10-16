"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { driver } from "driver.js"
import "driver.js/dist/driver.css"
import type { Driver, DriveStep } from "driver.js"

const DEMO_TOUR_STORAGE_KEY = "hasSeenTour"
export const METRICS_TOUR_STORAGE_KEY = "hasSeenMetricsTour"
export const METRICS_TOUR_FOCUS_EVENT = "nomad:metrics-tour-focus"

const tourAction = (detail = "clear") => () => {
  window.dispatchEvent(new CustomEvent("nomad-tour-action", { detail }))
}
const clearTourAction = tourAction()

const DEMO_TOUR_STEPS: DriveStep[] = [
  {
    element: "[data-tour='tour-map']",
    onHighlightStarted: tourAction("timeline-ping"),
    onDeselected: clearTourAction,
    popover: {
      title: "Explore GPS Pings",
      description: "Each dot is a GPS ping. Hover to see its stop assignment and highlight it on the timeline. Click two pings to compare distance and elapsed time; use “Clear selection” below the timeline to reset.",
    },
  },
  {
    element: "[data-tour='tour-map']",
    onHighlightStarted: tourAction("anchor-point"),
    onDeselected: clearTourAction,
    popover: {
      title: "Understand Ping Types",
      description: "Colored pings belong to detected stops, black pings are currently unassigned. Outlined circles mark anchor or core points, and connecting lines show how the algorithm links them.",
    },
  },
  {
    element: "[data-tour='tour-layers']",
    onHighlightStarted: tourAction("ground-truth"),
    onDeselected: clearTourAction,
    popover: {
      title: "Toggle Ground Truth & Detected Stops",
      description: "Toggle Ground Truth to show known visits and routes, and Detected Stops to show the algorithm’s results. Hover over a ground-truth interval on the timeline to highlight the visited building.",
    },
  },
  {
    element: "[data-tour='tour-timeline']",
    onHighlightStarted: tourAction("timeline-ping"),
    onDeselected: clearTourAction,
    popover: {
      title: "Explore Timeline",
      description: "Vertical bars are GPS pings; hover to highlight them and their detected stops on the map. Colored bands show detected stops, and blue rectangles show building visits. Drag or scroll the playback line to explore the trip.",
    },
  },
  {
    element: "[data-tour='tour-data']",
    popover: {
      title: "Choose Scenario and Agent",
      description: "Choose a ground-truth diary to explore. Each agent is a sparse trajectory sampled from that diary; click “New Agent” to load another sample.",
    },
  },
  {
    element: "[data-tour='tour-params']",
    popover: {
      title: "Choose Algorithm and Parameters",
      description: "Select an algorithm, then adjust its parameters to explore how they affect detected stops. The visualization updates automatically.",
    },
  },
  {
    element: "[data-tour='tour-compare-toggle']",
    popover: {
      title: "Compare Two Algorithms",
      description: "Compare two algorithms on the same trip with synchronized playback. Adjust each algorithm’s parameters independently.",
    },
  },
]

export const METRICS_TOUR_STEPS: DriveStep[] = [
  {
    element: "[data-tour='metrics-chart']",
    popover: {
      title: "Compare Parameter Settings",
      description: "Each blue dot shows one person’s result at a parameter setting. The horizontal axis shows the setting tested and the vertical axis shows the fraction of true stop time recovered.",
    },
  },
  {
    element: "[data-tour='metrics-chart']",
    popover: {
      title: "See Overall Trends",
      description: "The solid blue line shows average performance across all people at each setting. The dotted blue line shows the highest of those averages, marking the best setting overall.",
    },
  },
  {
    element: "[data-tour='metrics-chart']",
    popover: {
      title: "Explore Personal Best Results",
      description: "Each red dot marks a person’s best result across all tested settings, and the dotted red line shows the average of those personal bests. Click a red dot to highlight that person’s results.",
    },
  },
  {
    element: "[data-tour='metrics-controls']",
    popover: {
      title: "Compare Algorithm Performance",
      description: "Select an algorithm and choose Recall to see how much true stop time it recovers, or Failure Modes to see missed, split, and merged stops. Switch to Compare to view two algorithms together.",
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
export function useProductTour(
  ready: boolean,
  prepareTour = () => {},
  steps = DEMO_TOUR_STEPS,
  storageKey = DEMO_TOUR_STORAGE_KEY,
  restoreTour = () => {},
  resultsReady = ready,
) {
  const driverRef = useRef<Driver | null>(null)
  const autoStartedRef = useRef(false)
  const requestedRef = useRef(false)
  const [startRequested, setStartRequested] = useState(false)

  // Keep the latest cleanup callback available to the driver.
  const restoreTourRef = useRef(restoreTour)
  useEffect(() => {
    restoreTourRef.current = restoreTour
  }, [restoreTour])

  const startTour = useCallback(() => {
    if (requestedRef.current) return

    requestedRef.current = true
    prepareTour()
    setStartRequested(true)
  }, [prepareTour])

  // Wait for preparation and the corresponding results before opening.
  useEffect(() => {
    if (!startRequested || !ready || !resultsReady) return

    let secondFrame = 0
    const firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => {
        const tour = driver({
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
            clearTourAction()
            window.localStorage.setItem(storageKey, "true")
            restoreTourRef.current()
            requestedRef.current = false
            driverRef.current = null
          },
        })

        driverRef.current = tour
        setStartRequested(false)
        tour.drive()
      })
    })

    return () => {
      window.cancelAnimationFrame(firstFrame)
      window.cancelAnimationFrame(secondFrame)
    }
  }, [startRequested, ready, resultsReady, steps, storageKey])

  useEffect(() => {
    if (!ready || autoStartedRef.current) return
    if (window.localStorage.getItem(storageKey)) return

    autoStartedRef.current = true
    startTour()
  }, [ready, startTour, storageKey])

  return { startTour }
}
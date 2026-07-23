"use client"

import { useCallback, useEffect, useRef } from "react"
import { driver } from "driver.js"
import "driver.js/dist/driver.css"
import type { Driver, DriveStep } from "driver.js"

const TOUR_STORAGE_KEY = "hasSeenTour"
const tourAction = (detail = "clear") => () => {
  window.dispatchEvent(new CustomEvent("nomad-tour-action", { detail }))
}
const clearTourAction = tourAction()

const TOUR_STEPS: DriveStep[] = [
  {
    element: "[data-tour='tour-map']",
    onHighlightStarted: tourAction("timeline-ping"),
    onDeselected: clearTourAction,
    popover: {
      title: "Raw GPS Pings",
      description: "Black dots are raw GPS pings from one person's trip. Hover any ping to enlarge it and its revealed edge-connected tree, fade unrelated pings, and highlight the same ping on the timeline. That hover is being demonstrated now.",
    },
  },
  {
    element: "[data-tour='tour-map']",
    onHighlightStarted: tourAction("anchor-point"),
    onDeselected: clearTourAction,
    popover: {
      title: "Stops, Anchor Points, and Edges",
      description: "Colored pings belong to detected stops. Larger colored circles with white outlines are anchor or core points, and connecting lines show which revealed pings are linked to them. The active anchor or core point and its connected tree are highlighted now.",
    },
  },
  {
    element: "[data-tour='tour-map']",
    onHighlightStarted: tourAction("ground-truth"),
    onDeselected: clearTourAction,
    popover: {
      title: "Ground-Truth Buildings and Routes",
      description: "Ground Truth shows the real buildings visited and the route between them. The matching building lights up when you hover its ground-truth interval in the timeline; the tour is showing that building highlight now.",
    },
  },
  {
    element: "[data-tour='tour-timeline']",
    onHighlightStarted: tourAction("timeline-ping"),
    onDeselected: clearTourAction,
    popover: {
      title: "Hover Timeline Pings",
      description: "Black vertical bars are GPS pings. Hover one to raise and outline it, fade the other bars, and highlight that ping plus its revealed connected tree on the map. The tour is demonstrating this now; future pings remain black until playback reveals their stop status.",
    },
  },
  {
    element: "[data-tour='tour-timeline']",
    onHighlightStarted: tourAction("ground-truth"),
    onDeselected: clearTourAction,
    popover: {
      title: "Read the Timeline Layers",
      description: "Colored vertical bars mark core-point pings, translucent colored bands mark detected stops, and teal outline rectangles mark ground-truth time inside buildings. Completed intervals remain as faded boxes; during playback the current box glows and the next box is light teal. The cyan line marks playback time, and you can drag or scroll here to scrub.",
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
export function useProductTour(ready = false, prepareTour = () => {}) {
  const driverRef = useRef<Driver | null>(null)
  const autoStartedRef = useRef(false)

  const startTour = useCallback(() => {
    prepareTour()
    window.requestAnimationFrame(() => {
      if (!driverRef.current) {
        driverRef.current = driver({
          showProgress: true,
          smoothScroll: true,
          stageRadius: 8,
          popoverClass: "nomad-tour-popover",
          steps: TOUR_STEPS,
          onDestroyed: () => {
            clearTourAction()
            window.localStorage.setItem(TOUR_STORAGE_KEY, "true")
          },
        })
      }
      driverRef.current.drive()
    })
  }, [prepareTour])

  useEffect(() => {
    if (!ready || autoStartedRef.current) return
    if (window.localStorage.getItem(TOUR_STORAGE_KEY)) return
    autoStartedRef.current = true
    startTour()
  }, [ready, startTour])

  return { startTour }
}

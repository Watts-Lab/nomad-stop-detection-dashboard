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
      title: "Inspect GPS Pings",
      description: "Each dot is one GPS ping from the current agent. Hover a ping to enlarge it, show its time and status, and highlight the same ping on the timeline. Pings in the same detected stop remain emphasized while unrelated pings fade. Density algorithms also show the active distance threshold. That hover is being demonstrated now.",
    },
  },
  {
    element: "[data-tour='tour-map']",
    popover: {
      title: "Compare Two Pings",
      description: "Click one ping to keep it selected, then click a second to draw a line between them and compare their distance and elapsed time. Click a selected ping again to remove it, click the map background to clear the comparison, or use Clear selection below the timeline.",
    },
  },
  {
    element: "[data-tour='tour-map']",
    onHighlightStarted: tourAction("anchor-point"),
    onDeselected: clearTourAction,
    popover: {
      title: "Detected Stops and Algorithm Structure",
      description: "Colored pings show revealed detected-stop assignments; pings shown only in black have no revealed assignment at the current playback time. Larger outlined circles are anchor or core points, and connecting lines show relationships created by the selected algorithm. Hover a ping to focus its detected stop or hover an edge to isolate its connected component. An anchor is highlighted now.",
    },
  },
  {
    element: "[data-tour='tour-layers']",
    onHighlightStarted: tourAction("ground-truth"),
    onDeselected: clearTourAction,
    popover: {
      title: "Toggle Reference and Detection Layers",
      description: "Ground Truth controls the known visited-building intervals and routes. Detected Stops controls the algorithm's colored ping assignments, anchors, and edges. The known building for a ground-truth interval lights up when that interval is hovered on the timeline; the tour is showing that highlight now.",
    },
  },
  {
    element: "[data-tour='tour-timeline']",
    onHighlightStarted: tourAction("timeline-ping"),
    onDeselected: clearTourAction,
    popover: {
      title: "Hover Timeline Pings",
      description: "Vertical bars are GPS pings. Hover one to raise and outline it, fade unrelated bars, and highlight that ping and its detected stop on the map. Timeline pings can also be clicked for the same two-ping comparison available on the map. The tour is demonstrating the hover now.",
    },
  },
  {
    element: "[data-tour='tour-timeline']",
    onHighlightStarted: tourAction("ground-truth"),
    onDeselected: clearTourAction,
    popover: {
      title: "Read the Timeline Layers",
      description: "Colored vertical bars mark core-point pings, translucent bands mark detected stops, and teal rectangles mark known time inside buildings. Completed intervals fade; during playback the current interval glows and the next is light teal. The cyan line marks playback time. Drag or scroll the timeline to scrub, and use the map's play or replay controls to animate the trip.",
    },
  },
  {
    element: "[data-tour='tour-params']",
    popover: {
      title: "Choose the Scenario, Algorithm, and Parameters",
      description: "Changing the trajectory, algorithm, or any editable parameter automatically reruns the visualization. Use New Agent to load a different agent while keeping the selected trajectory and algorithm setup.",
    },
  },
  {
    element: "[data-tour='tour-metrics']",
    popover: {
      title: "Open Aggregated Metrics",
      description: "Aggregated Metrics opens the parameter-sweep results for the current algorithm. From comparison mode it carries both supported algorithms into the side-by-side metrics view, where fixed notebook parameters are listed beside the charts.",
    },
  },
  {
    element: "[data-tour='tour-compare-toggle']",
    popover: {
      title: "Compare Two Algorithms",
      description: "Switch to side-by-side mode, choose Left and Right algorithms with independent parameters, and run both on the same agent and trajectory. Their playback stays synchronized so you can see where they agree, split, merge, or miss a stop.",
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

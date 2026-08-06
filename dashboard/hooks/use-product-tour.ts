"use client"

import { useCallback, useEffect, useRef } from "react"
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
      title: "Choose a Scenario and Compare Algorithms",
      description: "Use the Trajectory selector to switch between the four cached scenarios. Then select an algorithm and review the settings held fixed during the experiment. Switch to Compare to place two plots top and bottom.",
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
) {
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
          },
        })
      }
      driverRef.current.drive()
    })
  }, [steps, storageKey, prepareTour])

  useEffect(() => {
    if (!ready || autoStartedRef.current) return
    if (window.localStorage.getItem(storageKey)) return
    autoStartedRef.current = true
    startTour()
  }, [ready, startTour, storageKey])

  return { startTour }
}

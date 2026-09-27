/* 
PREPARE RAW TRAJECTORY/SCENE DATA INTO PINGS, MAP, GROUND-TRUTH & TIMELINE
*/

import type { ComparePanelResponse } from "./types"

// Prepare scene-level data shared by the Demo visualization,
// including pings, buildings, ground-truth routes, streets,
// map bounds, and the playback time sequence.
export function prepareDemoSceneData(
    scene: ComparePanelResponse["scene"],
) {
    // Timeline generation below reads the first and last ping.
    if (scene.pings.length === 0) return null
    const pings = scene.pings.map((ping, index) => ({
        i: index,
        x: ping.x,
        y: ping.y,
        t: ping.timestamp,
        time: new Date(ping.timestamp * 1000).toISOString().slice(11, 19),
    }))
    const buildings = scene.buildings.flatMap((building) =>
        building.rings.map((ring) => {
            const xs = ring.map(([x]) => x)
            const ys = ring.map(([, y]) => y)
            const minX = Math.min(...xs)
            const maxX = Math.max(...xs)
            const minY = Math.min(...ys)
            const maxY = Math.max(...ys)
            return {
                id: building.id,
                type: building.type,
                coords: ring,
                center: [(minX + maxX) / 2, (minY + maxY) / 2],
                minX,
                maxX,
                minY,
                maxY,
            }
        }),
    )
    const buildingById = new Map(buildings.map((building) => [building.id, building]))
    const blockSide = Math.min(...buildings.flatMap((building) => [
        building.maxX - building.minX,
        building.maxY - building.minY,
    ]).filter((span) => span > 0))
    const routeBetween = (start: number[], end: number[]) => [
        start,
        [(start[0] + end[0]) / 2, start[1]],
        [(start[0] + end[0]) / 2, end[1]],
        end,
    ].filter((point, index, route) => index === 0 || point[0] !== route[index - 1][0] || point[1] !== route[index - 1][1])
    const routeByPair = new Map(scene.routes?.routes.map((route) => [`${route.from}->${route.to}`, route.path]) ?? [])
    const truthStops = scene.truth.flatMap((row) => {
        const building = row.location ? buildingById.get(row.location) : null
        return building ? [{ ...row, location: building.id, destination: { id: building.id, center: building.center } }] : []
    })
    const segments = truthStops.slice(1).map((current, index) => {
        const previous = truthStops[index]
        const cached = previous.destination.id && current.destination.id
            ? routeByPair.get(`${previous.destination.id}->${current.destination.id}`)
            : null
        return {
            stopIndex: index,
            cluster: index,
            start: previous.timestamp + previous.duration * 60,
            end: current.timestamp,
            points: cached ?? routeBetween(previous.destination.center, current.destination.center),
            isFallback: !cached,
        }
    }).filter((segment) => segment.end > segment.start && segment.points.length > 1)
    const streets = scene.routes?.streets ?? []
    const streetIds = new Set(streets.map((street) => street.id))
    const streetLaneSegments = streets.flatMap((street) => {
        const [, xPart, yPart] = street.id.split("-")
        const gridX = Number(xPart.slice(1))
        const gridY = Number(yPart.slice(1))
        const xs = street.coords.map(([x]) => x)
        const ys = street.coords.map(([, y]) => y)
        const minStreetX = Math.min(...xs)
        const maxStreetX = Math.max(...xs)
        const minStreetY = Math.min(...ys)
        const maxStreetY = Math.max(...ys)
        const centerX = (minStreetX + maxStreetX) / 2
        const centerY = (minStreetY + maxStreetY) / 2
        const left = streetIds.has(`s-x${gridX - 1}-y${gridY}`)
        const right = streetIds.has(`s-x${gridX + 1}-y${gridY}`)
        const down = streetIds.has(`s-x${gridX}-y${gridY - 1}`)
        const up = streetIds.has(`s-x${gridX}-y${gridY + 1}`)
        return [
            ...(left || right ? [[[left ? minStreetX : centerX, centerY], [right ? maxStreetX : centerX, centerY]]] : []),
            ...(down || up ? [[[centerX, down ? minStreetY : centerY], [centerX, up ? maxStreetY : centerY]]] : []),
        ]
    })
    // Merge each contiguous run of same-street cells into one continuous line so the dash pattern
    // carries through the whole block instead of restarting (and visually doubling up) at every grid seam.
    const mergeAxisRuns = (spans: [number, number][]): [number, number][] => {
        const sorted = [...spans].sort((a, b) => a[0] - b[0])
        const merged: [number, number][] = []
        for (const [start, end] of sorted) {
            const last = merged[merged.length - 1]
            if (last && start <= last[1] + 0.01) last[1] = Math.max(last[1], end)
            else merged.push([start, end])
        }
        return merged
    }
    const horizontalRunsByY = new Map<number, [number, number][]>()
    const verticalRunsByX = new Map<number, [number, number][]>()
    streetLaneSegments.forEach(([[x1, y1], [x2, y2]]) => {
        if (y1 === y2) {
            const spans = horizontalRunsByY.get(y1) ?? []
            spans.push([Math.min(x1, x2), Math.max(x1, x2)])
            horizontalRunsByY.set(y1, spans)
        } else {
            const spans = verticalRunsByX.get(x1) ?? []
            spans.push([Math.min(y1, y2), Math.max(y1, y2)])
            verticalRunsByX.set(x1, spans)
        }
    })
    const streetLanes: number[][][] = []
    horizontalRunsByY.forEach((spans, y) => {
        mergeAxisRuns(spans).forEach(([minX, maxX]) => streetLanes.push([[minX, y], [maxX, y]]))
    })
    verticalRunsByX.forEach((spans, x) => {
        mergeAxisRuns(spans).forEach(([minY, maxY]) => streetLanes.push([[x, minY], [x, maxY]]))
    })
    const start = scene.pings[0].timestamp
    const end = scene.pings[scene.pings.length - 1].timestamp
    const times = new Set([start, end])
    for (let timestamp = start; timestamp <= end; timestamp += 30) times.add(timestamp)

    return {
        pings,
        pingIndexByTimestamp: new Map(pings.map((ping) => [ping.t, ping.i])),
        buildings,
        buildingById,
        blockSide,
        truthStops,
        segments,
        streets,
        streetLanes,
        timeSequence: Array.from(times).sort((a, b) => a - b),
    }
}


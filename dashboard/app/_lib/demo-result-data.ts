/* COMBINE SCENE WITH ALGO'S OUTPUT & PREPARE VIZ DATA */

import { stopsFromLabels } from "@/lib/stop-detection"
import { cellToBoundary } from "h3-js"
import { prepareDemoSceneData } from "./demo-scene-data"
import type { ComparePanelResponse } from "./types"

type DemoSceneData = NonNullable<
    ReturnType<typeof prepareDemoSceneData>
>

// Combine prepared scene data with the selected algorithm result
// to build chart-ready stops, clusters, anchors, density metadata,
// focus bounds, and timeline data.
export function prepareDemoResultData(
    panel: ComparePanelResponse,
    sceneData: DemoSceneData,
) {
    const scene = panel.scene
    const result = panel.result

    const pings = sceneData.pings.map((ping, index) => ({
        ...ping,
        cluster: result.cluster[index],
    }))

    const pingData = pings.map((ping) => [
        ping.x,
        ping.y,
        ping.cluster,
        ping.i,
        ping.t,
    ])

    const gridCells: number[][][] = []
    const gridCellFrames: Array<[number, number, number]> = []
    if (result.kind === "grid") {
        const cellIndexes = new Map<string, number>()
        const timeThreshold = panel.params.time_thresh * 60
        const minDuration = panel.params.dur_min * 60
        let runStart = 0

        result.h3_cell.forEach((cell, index) => {
            const ping = pings[index]
            if (index > 0 && (cell !== result.h3_cell[index - 1] || ping.t - pings[index - 1].t > timeThreshold)) {
                runStart = index
            }

            let cellIndex = cellIndexes.get(cell)
            if (cellIndex === undefined) {
                cellIndex = gridCells.length
                cellIndexes.set(cell, cellIndex)
                gridCells.push(cellToBoundary(cell, true).map(([longitude, latitude]) => [
                    6378137 * longitude * Math.PI / 180,
                    6378137 * Math.log(Math.tan(Math.PI / 4 + latitude * Math.PI / 360)),
                ]))
            }

            const confirmed = index - runStart + 1 >= panel.params.min_cluster_size &&
                ping.t - pings[runStart].t >= minDuration
            gridCellFrames.push([cellIndex, ping.t, confirmed ? ping.cluster : -1])
        })
    }

    const clusterMembers = new Map<number, number[]>()

    pings.forEach((ping) => {
        if (ping.cluster < 0) return

        const members = clusterMembers.get(ping.cluster)

        if (members) members.push(ping.i)
        else clusterMembers.set(ping.cluster, [ping.i])
    })

    const destinationFor = (x: number, y: number) => {
        const containing = sceneData.buildings.find(
            (building) =>
                x >= building.minX &&
                x <= building.maxX &&
                y >= building.minY &&
                y <= building.maxY,
        )

        const destination =
            containing ??
            sceneData.buildings.reduce((best, building) =>
                Math.hypot(x - building.center[0], y - building.center[1]) <
                    Math.hypot(x - best.center[0], y - best.center[1])
                    ? building
                    : best,
            )

        return {
            id: destination.type === "building" ? null : destination.id,
            center: destination.center,
        }
    }

    const stops = stopsFromLabels(scene.pings, result.cluster).map((stop) => ({
        ...stop,
        destination: destinationFor(stop.x, stop.y),
        radius: Math.max(
            stop.diameter / 2,
            Number(panel.params.delta_roam ?? panel.params.dist_thresh ?? 0),
        ),
        label: `Stop ${stop.cluster}`,
        startTime: new Date(stop.start * 1000).toISOString().slice(11, 16),
        endTime: new Date(stop.end * 1000).toISOString().slice(11, 16),
    }))

    const sequentialGroups = panel.algo.startsWith("sequential_")
        ? stops.map((stop) =>
            (clusterMembers.get(stop.cluster) ?? []).map(
                (pingIndex) => pings[pingIndex],
            ),
        )
        : []

    const anchorFrames =
        panel.algo === "sequential_first"
            ? sequentialGroups.flatMap((members) => {
                const anchor = members[0]

                return members.map((ping) => ({
                    cluster: ping.cluster,
                    t: ping.t,
                    point: [anchor.x, anchor.y, ping.cluster, anchor.i, ping.t],
                    edges:
                        anchor.i === ping.i
                            ? []
                            : [
                                {
                                    coords: [
                                        [anchor.x, anchor.y],
                                        [ping.x, ping.y],
                                    ],
                                    value: [ping.cluster, anchor.i, ping.i, ping.t],
                                },
                            ],
                }))
            })
            : panel.algo === "sequential_centroid"
                ? sequentialGroups.flatMap((members) => {
                    let sumX = 0
                    let sumY = 0

                    return members.map((ping, index) => {
                        sumX += ping.x
                        sumY += ping.y

                        const centroid = [sumX / (index + 1), sumY / (index + 1)]

                        return {
                            cluster: ping.cluster,
                            t: ping.t,
                            point: [
                                centroid[0],
                                centroid[1],
                                ping.cluster,
                                ping.i,
                                ping.t,
                            ],
                            edges:
                                index === 0
                                    ? []
                                    : [
                                        {
                                            coords: [centroid, [ping.x, ping.y]],
                                            value: [ping.cluster, ping.i, ping.i, ping.t],
                                        },
                                    ],
                        }
                    })
                })
                : panel.algo === "lachesis" && result.kind === "anchor"
                    ? pings.flatMap((ping) => {
                        const auxTime = result.aux_time[ping.i]

                        if (ping.cluster < 0 || auxTime == null) return []

                        const anchorIndex =
                            sceneData.pingIndexByTimestamp.get(auxTime)

                        if (anchorIndex === undefined) return []

                        const anchor = pings[anchorIndex]

                        if (anchor.cluster !== ping.cluster) return []

                        return [
                            {
                                cluster: ping.cluster,
                                t: ping.t,
                                point: [
                                    anchor.x,
                                    anchor.y,
                                    ping.cluster,
                                    anchor.i,
                                    ping.t,
                                ],
                                edges:
                                    anchor.i === ping.i
                                        ? []
                                        : [
                                            {
                                                coords: [
                                                    [anchor.x, anchor.y],
                                                    [ping.x, ping.y],
                                                ],
                                                value: [
                                                    ping.cluster,
                                                    anchor.i,
                                                    ping.i,
                                                    ping.t,
                                                ],
                                            },
                                        ],
                            },
                        ]
                    })
                    : []

    const densityCorePointData =
        result.kind === "density"
            ? pings.flatMap((ping) =>
                ping.cluster >= 0 && result.core[ping.i] >= 0
                    ? [
                        [
                            ping.x,
                            ping.y,
                            ping.cluster,
                            ping.i,
                            Math.max(
                                ping.t,
                                result.aux_time[ping.i] ?? ping.t,
                            ),
                        ],
                    ]
                    : [],
            )
            : []

    const densityPromotionEdges =
        result.kind === "density"
            ? pings.flatMap((ping) => {
                const auxTime = result.aux_time[ping.i]

                if (ping.cluster < 0 || auxTime == null) return []

                const sourceIndex =
                    sceneData.pingIndexByTimestamp.get(auxTime)

                if (sourceIndex === undefined || sourceIndex === ping.i) return []

                const source = pings[sourceIndex]

                if (
                    source.cluster !== ping.cluster ||
                    result.core[sourceIndex] < 0
                )
                    return []

                return [
                    {
                        coords: [
                            [source.x, source.y],
                            [ping.x, ping.y],
                        ],
                        value: [
                            ping.cluster,
                            source.i,
                            ping.i,
                            Math.max(ping.t, auxTime),
                        ],
                    },
                ]
            })
            : []

    const coreTimelineData = densityCorePointData.map((point) => [
        point[4] * 1000,
        point[2],
        point[3],
    ])

    const focusBuildings = [
        ...sceneData.truthStops.flatMap((stop) =>
            stop.location
                ? (sceneData.buildingById.get(stop.location) ?? [])
                : [],
        ),
    ]

    const focusPoints = [
        ...pings.map((ping) => [ping.x, ping.y]),
        ...sceneData.segments.flatMap((segment) => segment.points),
    ]

    const focusXs = [
        ...focusPoints.map(([x]) => x),
        ...focusBuildings.flatMap((building) => [
            building.minX,
            building.maxX,
        ]),
    ]

    const focusYs = [
        ...focusPoints.map(([, y]) => y),
        ...focusBuildings.flatMap((building) => [
            building.minY,
            building.maxY,
        ]),
    ]

    return {
        streets: sceneData.streets,
        streetLanes: sceneData.streetLanes,
        buildings: sceneData.buildings,
        blockSide: sceneData.blockSide,
        pings,
        pingData,
        gridCells,
        gridCellFrames,
        result,
        clusterMembers,
        stops,
        densityCorePointData,
        densityPromotionEdges,
        anchorFrames,
        coreTimelineData,
        truthStops: sceneData.truthStops,
        segments: sceneData.segments,
        destinationStops: sceneData.destinationStops,
        destinationBuildings: sceneData.destinationBuildings,
        destinationDuration: sceneData.destinationDuration,
        destinationBounds: sceneData.destinationBounds,
        cityBounds: sceneData.cityBounds,
        focusBounds: {
            minX: Math.min(...focusXs),
            minY: Math.min(...focusYs),
            maxX: Math.max(...focusXs),
            maxY: Math.max(...focusYs),
        },
        stopBars: stops.map((stop) => [
            stop.start * 1000,
            stop.end * 1000,
            stop.cluster,
            stop.index,
        ]),
        stopEndTimes: stops.map((stop) => stop.end),
        distanceThreshold: Number(
            panel.params.delta_roam ?? panel.params.dist_thresh ?? 0,
        ),
        timeSequence: sceneData.timeSequence,
    }
}

export type DemoResultData = NonNullable<
    ReturnType<typeof prepareDemoResultData>
>

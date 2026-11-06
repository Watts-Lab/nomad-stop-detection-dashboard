import assert from "node:assert/strict"
import { after, before, test } from "node:test"
import { fileURLToPath } from "node:url"
import { createServer } from "vite"

let server
let stopsFromLabels, prepareDemoSceneData, prepareDemoResultData
let currentPingData, buildDemoMapSeries, pingClassifiedAt, visibleClusterPingsAt, containmentAreasAt

before(async () => {
  const root = fileURLToPath(new URL("../", import.meta.url))
  server = await createServer({
    root,
    configFile: false,
    resolve: { alias: { "@": root } },
    server: { middlewareMode: true },
  })
  ;({ stopsFromLabels } = await server.ssrLoadModule("/lib/stop-detection.ts"))
  ;({ prepareDemoSceneData } = await server.ssrLoadModule("/app/_lib/demo-scene-data.ts"))
  ;({ prepareDemoResultData } = await server.ssrLoadModule("/app/_lib/demo-result-data.ts"))
  ;({ containmentAreasAt } = await server.ssrLoadModule("/app/_components/demo-viz/overlays/demo-xray.ts"))
  ;({ currentPingData, buildDemoMapSeries } = await server.ssrLoadModule("/app/_components/demo-viz/demo-scene-render.ts"))
  ;({ pingClassifiedAt, visibleClusterPingsAt } = await server.ssrLoadModule("/app/_components/demo-viz/overlays/demo-detected-stops.ts"))
})

after(async () => { await server?.close() })

function panelFor(cluster, kind = "density") {
  const times = [0, 10, 10, 20, 50, 60, 120, 180]
  return {
    algo: kind === "anchor" ? "lachesis" : kind === "labels" ? "sequential_first" : "st_dbscan",
    params: {},
    result: { kind, cluster, core: [...cluster], aux_time: times.map((time, i) => i === 4 ? 20 : time) },
    scene: {
      pings: times.map((timestamp, i) => ({ timestamp, x: i, y: 0 })),
      buildings: [{ id: "cafe", type: "building", rings: [[[0, 0], [10, 0], [10, 10], [0, 10]]] }],
      destinationDiary: [{ location: "cafe", duration: 3 }],
      truth: [],
    },
  }
}

function prepare(panel) {
  return prepareDemoResultData(panel, prepareDemoSceneData(panel.scene))
}

test("exclude singleton and identical-time clusters; retain sub-minute stops and stable IDs", () => {
  const panel = panelFor([8, 3, 3, 9, 9, -1, 12, 12])
  const stops = stopsFromLabels(panel.scene.pings, panel.result.cluster)
  assert.deepEqual(stops.map(({ cluster, index, duration }) => ({ cluster, index, duration })), [
    { cluster: 9, index: 0, duration: 0 },
    { cluster: 12, index: 1, duration: 1 },
  ])
})

test("all result kinds preserve aligned inputs and exclude zero-duration overlay metadata", () => {
  for (const kind of ["density", "anchor", "labels"]) {
    const panel = panelFor([8, 3, 3, 9, 9, -1, 12, 12], kind)
    const original = structuredClone(panel)
    const data = prepare(panel)
    assert.deepEqual(panel, original)
    assert.equal(data.result, panel.result)
    assert.deepEqual(data.pingVisible, [false, false, false, true, true, true, true, true])
    assert.deepEqual(data.pings.map((ping) => ping.i), [0, 1, 2, 3, 4, 5, 6, 7])
    assert.deepEqual([...data.clusterMembers.keys()], [9, 12])
    assert.equal(data.stopBars.length, 2)
    assert.ok(data.densityCorePointData.every((point) => data.pingVisible[point[3]]))
    assert.ok(data.densityPromotionEdges.every((edge) => data.pingVisible[edge.value[1]] && data.pingVisible[edge.value[2]]))
    assert.ok(data.anchorFrames.every((frame) => data.pingVisible[frame.point[3]]))
    if (kind === "density") {
      assert.deepEqual(data.densityCorePointData.map((point) => point[3]), [3, 4, 6, 7])
      assert.equal(data.densityPromotionEdges.length, 1)
    } else {
      assert.deepEqual(data.anchorFrames.map((frame) => frame.cluster), [9, 9, 12, 12])
    }
    assert.deepEqual(containmentAreasAt(0, data, "sequential_first", 0), [])
    assert.equal(pingClassifiedAt(0, 180, data), false)
    assert.deepEqual(visibleClusterPingsAt(180, data).map((point) => point[3]), [3, 4, 6, 7])
    assert.deepEqual(currentPingData(0, data, 0, false, null, 0), [])
    assert.equal(currentPingData(60, data, 5, true, null, 0)[0][3], 5)
  }
})

test("map layers hide excluded pings with stop layers on or off", () => {
  const data = prepare(panelFor([8, 3, 3, 9, 9, -1, 12, 12]))
  for (const showStops of [true, false]) {
    const series = buildDemoMapSeries({
      timestampSeconds: 180, chartData: data,
      route: { completedCached: [], completedFallback: [], activeCached: [], activeFallback: [] },
      latestPingIndex: 0, anchorFrames: [], anchorEdges: [], promotionEdges: [],
      hoverPingIndexes: null, containmentAreas: [], hoverBuildingId: "", selectedPingIndexes: [],
      showGroundTruth: false, showStops, showXray: true, nextPathVisible: false,
      pulseStrength: 0, isDensityAlgorithm: true, algorithm: "st_dbscan", clusterColor: () => "red", pingFloatOffset: 0,
    })
    for (const id of ["ghost-pings", "ping-hit-area"]) {
      assert.deepEqual(series.find((entry) => entry.id === id).data.map((point) => point[3]), [3, 4, 5, 6, 7])
    }
    assert.deepEqual(series.find((entry) => entry.id === "current-ping").data, [])
  }
})

test("no retained stops leaves genuine noise visible", () => {
  const data = prepare(panelFor([0, 1, 1, -1, -1, -1, -1, -1]))
  assert.deepEqual(data.stops, [])
  assert.deepEqual(data.stopBars, [])
  assert.deepEqual(data.densityCorePointData, [])
  assert.deepEqual(data.pingVisible, [false, false, false, true, true, true, true, true])
})

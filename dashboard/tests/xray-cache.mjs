import assert from "node:assert/strict"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { chromium } from "playwright"
import { createServer } from "vite"

const dashboardRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const scenarios = ["two-stop", "four-stop-low-ha", "four-stop-high-ha", "commute-return"]
const overlayIds = ["anchor-points", "anchor-edges", "core-points", "promotion-edges", "distance-circles", "core-point-ticks"]
const fixture = `
import React from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import * as echarts from 'echarts'
import { CompareAnimationPanel } from '${dashboardRoot}/app/_components/compare-animation-panel.tsx'
import { loadCompareData } from '${dashboardRoot}/app/_lib/static-cache.ts'
import '${dashboardRoot}/app/globals.css'
const root = createRoot(document.getElementById('root'))
let panel
let peer
window.xrayTest = {
  async load(trajectory, algorithm, peerAlgorithm) {
    const base = '/cached-results/stop-detection-cache/' + trajectory
    const [left, right] = await Promise.all([algorithm, peerAlgorithm].map(async algo => {
      if (!algo) return undefined
      const { configs } = await fetch(base + '/' + algo + '/configs.json').then(r => r.json())
      const params = Object.fromEntries(Object.entries(configs.at(-1).params).filter(([, v]) => typeof v === 'number'))
      return { algo, params }
    }))
    const data = await loadCompareData({ trajectory, seed: 1, mode: right ? 'compare' : 'single', left, right })
    panel = data.left
    peer = data.right
    return { result: panel.result, length: panel.scene.pings.length, times: panel.scene.pings.map(p => p.timestamp) }
  },
  async render(showXray, currentTime) {
    flushSync(() => root.render(React.createElement('div', { style: {display: 'flex', height: '640px'} },
      [panel, peer].filter(Boolean).map((item, index) => React.createElement('div', {
        key: index, 'data-panel': index, style: {width: peer ? '480px' : '960px'},
      }, React.createElement(CompareAnimationPanel, {
        panel: item, currentTime, showXray, mode: peer ? 'compare' : 'single', syncMaster: false,
        onTimeChange: () => {}, showGroundTruth: false, showStops: true,
      }))))))
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    return Object.fromEntries(Array.from(document.querySelectorAll('[_echarts_instance_]'))
      .flatMap(el => echarts.getInstanceByDom(el).getOption().series.map(s => [
        (peer ? el.closest('[data-panel]').dataset.panel + '-' : '') + s.id, s.data,
      ])))
  },
}
`

const server = await createServer({
  configFile: path.join(dashboardRoot, "recording/vite.config.ts"),
  server: { host: "127.0.0.1", port: 0 },
  logLevel: "error",
  plugins: [{
    name: "xray-test-fixture",
    resolveId(id) { if (id === "virtual:xray-test") return "\0xray-test" },
    load(id) { if (id === "\0xray-test") return fixture },
    configureServer(server) {
      server.middlewares.use("/xray-test", (_req, res) => {
        res.setHeader("Content-Type", "text/html")
        res.end('<script>window.process = {env: {NODE_ENV: "development"}}</script><div id="root" style="width:960px;height:640px"></div><script type="module" src="/@id/__x00__xray-test"></script>')
      })
    },
  }],
})

let browser
try {
  await server.listen()
  browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1000, height: 700 } })
  page.setDefaultTimeout(30000)
  const errors = []
  page.on("pageerror", error => { errors.push(error.message); console.error(error.stack) })
  page.on("console", message => { if (message.type() === "error") console.error(message.text()) })
  await page.goto(server.resolvedUrls.local[0] + "xray-test")
  await page.waitForFunction(() => window.xrayTest)
  const visibleOverlays = new Set()

  for (const trajectory of scenarios) {
    const manifest = await page.evaluate(async trajectory => fetch('/cached-results/stop-detection-cache/' + trajectory + '/manifest.json').then(r => r.json()), trajectory)
    for (const [algorithm, entry] of Object.entries(manifest.algorithms)) {
      const { result, length, times } = await page.evaluate(([t, a]) => window.xrayTest.load(t, a), [trajectory, algorithm])
      assert.equal(result.xray.schema, algorithm)
      assert.equal(result.cluster.length, length)
      for (const field of entry.xray.fields) assert.equal(result.xray[field].length, length)
      for (const time of [times[0], times[Math.floor(times.length / 2)], times.at(-1)]) {
        const on = await page.evaluate(t => window.xrayTest.render(true, t), time)
        const off = await page.evaluate(t => window.xrayTest.render(false, t), time)
        assert.deepEqual(off["cluster-pings"], on["cluster-pings"], "X-ray must not change membership timing")
        assert.deepEqual(off["stop-bars"], on["stop-bars"])
        const classified = result.cluster.flatMap((cluster, i) => cluster >= 0 && times[i] <= time &&
          Math.max(times[i], result.xray.promotion_time?.[i] ?? times[i]) <= time ? [i] : [])
        assert.deepEqual(on["cluster-pings"].map(point => point[3]), classified)
        for (const id of overlayIds) {
          assert.equal(off[id].length, 0, id + " remains visible with X-ray disabled")
          if (on[id].length) visibleOverlays.add(algorithm)
          if (algorithm === "gridbased") assert.equal(on[id].length, 0)
        }
      }
      console.log(trajectory + ": " + algorithm + " loads, renders, and toggles")
    }
  }
  for (const algorithm of ["lachesis", "sequential_first", "sequential_centroid", "st_dbscan", "dbstop", "seqscan"]) {
    assert(visibleOverlays.has(algorithm), "No overlay exercised for " + algorithm)
  }

  const comparison = await page.evaluate(() => window.xrayTest.load("two-stop", "lachesis", "dbstop"))
  const comparisonOn = await page.evaluate(time => window.xrayTest.render(true, time), comparison.times.at(-1))
  const comparisonOff = await page.evaluate(time => window.xrayTest.render(false, time), comparison.times.at(-1))
  assert(comparisonOn["0-anchor-points"].length > 0)
  assert(comparisonOn["1-core-points"].length > 0)
  for (const side of [0, 1]) {
    assert.deepEqual(comparisonOff[side + "-cluster-pings"], comparisonOn[side + "-cluster-pings"])
    for (const id of overlayIds) assert.equal(comparisonOff[side + "-" + id].length, 0)
  }
  console.log("Mixed Lachesis/DBSTOP comparison preserves labels and toggles both overlays.")

  // Fresh pages avoid the loader's intentionally persistent manifest cache.
  for (const [change, message] of [
    [m => { m.format = "stop-detection-dashboard-parquet-cache-v4" }, "Unsupported stop-detection cache format"],
    [m => { m.algorithms.lachesis.xray.schema = "unknown" }, "Unsupported X-ray schema"],
    [m => { m.algorithms.lachesis.xray.schema = "dbstop" }, "Unsupported X-ray schema"],
    [m => { m.algorithms.lachesis.xray.fields = [] }, "Invalid X-ray fields"],
    [m => { m.algorithms.lachesis.xray.fields = ["promotion_time"] }, "Invalid X-ray fields"],
  ]) {
    const invalid = await browser.newPage()
    await invalid.route("**/manifest.json", async route => {
      const response = await route.fetch()
      const manifest = await response.json()
      change(manifest)
      await route.fulfill({ json: manifest })
    })
    await invalid.goto(server.resolvedUrls.local[0] + "xray-test")
    await invalid.waitForFunction(() => window.xrayTest)
    await assert.rejects(invalid.evaluate(() => window.xrayTest.load("two-stop", "lachesis")), error => error.message.includes(message))
    await invalid.close()
  }
  const missing = await browser.newPage()
  await missing.route("**/lachesis/results.parquet", async route => {
    // A labels-only result has the same users/configuration count but no anchor column.
    const response = await route.fetch({ url: route.request().url().replace("/lachesis/", "/sequential_first/") })
    await route.fulfill({ response })
  })
  await missing.goto(server.resolvedUrls.local[0] + "xray-test")
  await missing.waitForFunction(() => window.xrayTest)
  await assert.rejects(missing.evaluate(() => window.xrayTest.load("two-stop", "lachesis")), error => error.message.includes("xray_anchor_time"))
  await missing.close()
  assert.deepEqual(errors, [])
  console.log("Invalid format/schema/field declarations rejected; no browser errors.")
} finally {
  await browser?.close()
  await server.close()
}

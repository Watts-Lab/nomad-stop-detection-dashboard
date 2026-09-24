# NOMAD Stop Detection Dashboard

NOMAD Stop Detection Dashboard is an interactive web app for learning about stop detection algorithms commonly used in human mobility science. It helps users inspect how GPS or mobility traces are transformed into stops, compare algorithm behavior side by side, and understand how parameter choices affect detected visits, trajectories, and aggregate performance metrics.

The dashboard currently focuses on algorithms and algorithm families such as DBSTOP, Lachesis, SeqScan, ST-DBSCAN, grid-based detection, and medoid-style detection. The app is designed as a teaching and exploration surface: users can read concise algorithm explanations, tune parameters, visualize trajectory outputs, and compare cached notebook-style experiment figures.

## Features

- Interactive stop detection learning dashboard built around human mobility science workflows.
- Algorithm cards with descriptions, parameter controls, references, and visual examples.
- Side-by-side comparison mode for inspecting how two algorithms classify the same trajectory.
- Aggregated metrics view for comparing recall-style experiment outputs across parameter sweeps.
- Cached figure and API routes so the app can render useful visualizations without rerunning every notebook experiment.

## Development Stack

- **Next.js 16** provides the app framework, routing, metadata, and API routes.
- **React 19** powers the interactive dashboard UI.
- **TypeScript** is used throughout the frontend and API route layer.
- **Tailwind CSS 4** provides utility-first styling and theme tokens.
- **shadcn/ui-style components with Radix UI primitives** provide accessible controls such as cards, selects, tabs, dialogs, inputs, and tooltips.
- **Lucide React** supplies the dashboard icons.
- **Python scripts with NumPy, pandas, GeoPandas, and NOMAD** generate the static stop-detection cache.
- **Cached parquet/JSON results** let the dashboard show stop detection outputs quickly without a live Python runtime.

## Project Structure

```text
.
├── dashboard/              # Next.js application
│   ├── app/                # App Router pages and API routes
│   ├── components/         # UI components
│   └── public/             # Static images used by the dashboard
├── build_cache/            # Cache generation scripts
├── cached_results/         # Generated dashboard cache artifacts
└── README.md
```

## Run Locally

```bash
cd dashboard
npm install
npm run dev
```

## Static Cache

The dashboard reads comparison and metrics data directly from `dashboard/public/cached-results`.
The source cache is generated ahead of time and kept in `cached_results`.
The app does not require Next API routes or a Python backend at runtime.

Regenerate the source caches with:

```bash
python3 -m pip install -r build_cache/requirements.txt
python3 build_cache/generate_demo_caches.py
```

### X-ray cache contract (v5)

Every result contains trajectory-aligned `cluster` labels. Each algorithm's manifest
entry separately declares `xray: {"schema": "<algorithm>", "fields": [...]}`.
The loader validates that declaration and reads its fields from `xray_`-prefixed
Parquet columns. Frontend results expose `{cluster, xray: {schema, ...fields}}`;
the visualization uses this declaration to select its overlays.

| Schema | Cached fields | Meaning / current overlay |
| --- | --- | --- |
| `lachesis` | `anchor_time` | Timestamp of a diameter-witness endpoint for an accepted prefix; existing anchor overlay. |
| `sequential_first` | None | First-ping anchors derived in the browser from final cluster labels. |
| `sequential_centroid` | None | Evolving centroids derived in the browser from final cluster labels. |
| `gridbased` | None | No X-ray overlay currently supported. |
| `st_dbscan` | `core`, `promotion_time` | Core labels and propagating-core timestamps (core pings use their own time). |
| `dbstop` | `core`, `promotion_time` | Core labels and sweep timestamps that propagate final membership. |
| `seqscan` | `core`, `promotion_time` | Core labels and scan timestamps when final membership is retained. |
| `hdbscan` | `core`, `promotion_time` | Existing generator metadata support; excluded from the interactive demo. |

Metadata arrays align one-to-one with trajectory pings. Timestamps are seconds,
with `null` for missing references. Nonnegative `core` values identify core cluster
labels; negative values are preserved. Density playback reveals membership at
`max(ping_time, promotion_time)` (using ping time when the metadata is null), even
with X-ray hidden. These times are approximate membership information, not a full
execution trace. Sequential overlays likewise reconstruct final clusters rather
than record every intermediate algorithm decision.

The v4-to-v5 migration preserves all result values and per-user row groups:

```bash
python3 -m pip install pyarrow
python3 build_cache/migrate_xray_cache.py dashboard/public/cached-results/stop-detection-cache/two-stop
python3 build_cache/test_xray_cache.py
```

Pass additional cache directories to migrate the other scenarios. Source cache
copies without result files require `--manifest-only`; any result files present
are still migrated. Deploy v5 assets and the updated frontend together; the loader
rejects v4. New grid overlays and changes to algorithm behavior are outside this
migration.

The browser regression check uses the existing Playwright/Vite dependencies and
exercises all demo algorithms and scenarios, mixed comparison, playback timing,
X-ray toggling, and invalid cache declarations:

```bash
cd dashboard
npx playwright install chromium
npm run test:xray
```

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
- **Python scripts with matplotlib, NumPy, pandas, and GeoPandas** support notebook-derived algorithm visualizations and metric generation workflows.
- **Cached results and public notebook figures** let the dashboard show stop detection outputs quickly during local development.

## Project Structure

```text
.
├── dashboard/              # Next.js application
│   ├── app/                # App Router pages and API routes
│   ├── components/         # UI components
│   ├── public/             # Static images and notebook figures
│   └── scripts/            # Python visualization and metrics helpers
├── build_cache/            # Source notebooks and generator scripts
├── cached_results/         # Local cached API/experiment outputs and screenshots
└── README.md
```

## Run Locally

```bash
cd dashboard
npm install
npm run dev
```

## Cache-Backed API Contract

The app routes in `dashboard/app/api/*` do not call Python or import `nomad`.
They serve placeholder/cached responses from:

- `cached_results/algorithm-compare/default.json`
- `cached_results/algorithm-metrics/options.json`
- `cached_results/algorithm-metrics/default.json`

You can replace these JSON files with real cached outputs later, keeping the same response shapes.

## Static CSV Cache

For the ECharts-only dashboard path, generate browser-readable CSV caches ahead of time:

```bash
python build_cache/aggregated_metrics/generate_algorithm_csv_cache.py
```

By default this writes `cached_results/stop-detection-cache/` with shared `trajectory.csv`,
`diary.csv`, `scene.json`, and `manifest.json` files plus one folder per algorithm:

```text
cached_results/stop-detection-cache/
├── manifest.json
├── scene.json
├── trajectory.csv
├── diary.csv
├── lachesis/
├── sequential_centroid/
├── sequential_first/
├── gridbased/
├── st_dbscan/
├── dbstop/
├── seqscan/
└── hdbscan/
    ├── labels.csv
    ├── stops.csv
    └── metrics.csv
```

The frontend should load `manifest.json` first, then fetch the listed CSVs for the selected
algorithm. Parameter columns use short keys such as `dt` for `dist_thresh`, `dr` for
`delta_roam`, `cs` for `cell_size`, and `mcs` for `min_cluster_size`; the manifest records
the full-name mapping. Each algorithm entry also includes `configs`, a list of cached `key`
and `params` combinations. Dashboard controls should be generated from those cached configs
rather than accepting arbitrary free-form values.

`scene.json` contains the shared map, trajectory, and ground-truth objects. Missing ground-truth
coordinates are emitted as JSON `null`, and building types are normalized for the frontend
(`workplace` becomes `work`, `retail` becomes `shop`).

For a fully static deployment, write the same cache under `dashboard/public`:

```bash
python build_cache/aggregated_metrics/generate_algorithm_csv_cache.py \
  --output-dir dashboard/public/cached-results/stop-detection-cache
```

## Notes

- Static placeholder figures are in `dashboard/public`.
- Python scripts in `dashboard/scripts` were copied for reference only and are not used by the API routes.

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

### Ping-generation settings

`build_cache/generate_configs.py` defines `beta_ping` and `ha`, applied by
`build_cache/generate_gt_trajectories.py` when sampling pings:

- **Ping interval (`beta_ping`):** mean interval in minutes; higher values produce
  fewer pings. See NOMAD's [ping sampler](https://github.com/Watts-Lab/nomad/blob/52930945824e6cb7b1f44ae01034a5a2a673acc9/nomad/traj_gen.py#L990-L1027).
- **Horizontal accuracy (`ha`):** positional noise scale in generator blocks;
  higher values add more noise. See the [parameter documentation](https://github.com/Watts-Lab/nomad/blob/52930945824e6cb7b1f44ae01034a5a2a673acc9/nomad/traj_gen.py#L851-L867)
  and [noise sampler](https://github.com/Watts-Lab/nomad/blob/52930945824e6cb7b1f44ae01034a5a2a673acc9/nomad/traj_gen.py#L1057-L1086).

Demo previews display static dataset values or ranges from `TRAJECTORY_OPTIONS` in
`dashboard/app/_lib/dashboard-data.ts`. Keep these aligned with the generator
configuration when regenerating datasets. They do not change with **New Agent**.

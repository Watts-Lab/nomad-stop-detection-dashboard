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

Then open `http://localhost:3000`.

## Build

```bash
cd dashboard
npm run build
npm run start
```

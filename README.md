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

`build_cache/generate_configs.py` defines `agent_params.beta_ping` and
`agent_params.ha`. `generate_gt_trajectories.py` applies each agent's values when
sampling pings and saves them by `user_id` in the homes Parquet table.

- `beta_ping` is the mean exponential interval between candidate pings, in minutes.
  Larger values produce less frequent pings. Actual intervals vary and sampling
  onto the underlying trajectory can affect the observed intervals.
- `ha` controls horizontal position noise, in generator blocks. Larger values
  produce greater positional noise; it does not control activity. The Demo uses
  `pareto_prior=False`, so each agent has a fixed noise setting with Gaussian
  coordinate offsets whose standard deviation is `ha / 1.515` blocks.

The two-stop and commute-return configurations use `beta_ping=7` and `ha=1`.
Both four-stop configurations assign agents ten ping intervals spanning 4–9 minutes;
`low_ha` uses `ha=11.5/15` and `high_ha` uses `ha=1`.
Other experiment configurations include `beta_5` and `beta_8_5` (with `ha=1`),
and combined `ha*_beta*` sweeps using `ha` values 13/15, 15/15, and 17/15 and
`beta_ping` values 5, 6, 7, and 8. These are not additional Demo options.

The expanded Demo trajectory information shows static dataset settings below the
trajectory explanation. These are defined alongside `TRAJECTORY_OPTIONS` in
`dashboard/app/_lib/dashboard-data.ts`: fixed values for two-stop and commute-return,
and the 4–9 minute ping-interval range for both four-stop datasets. The low-noise
four-stop setting is displayed as approximately 0.77 blocks (11.5/15).

The compact rows show **Ping interval** and **Horizontal accuracy**, each followed by
its value and a brief explanation. These are user-facing labels:

- NOMAD's [`generate_ping_times` implementation](https://github.com/Watts-Lab/nomad/blob/52930945824e6cb7b1f44ae01034a5a2a673acc9/nomad/traj_gen.py#L990-L1027)
  converts `beta_ping` from minutes to seconds and uses it as the exponential
  distribution's scale (mean interval). The `set_beta_params` docstring calls it a
  rate parameter, but the implementation uses an interval, the inverse of a rate.
  [NumPy documents this scale/mean relationship](https://numpy.org/doc/stable/reference/random/generated/numpy.random.Generator.exponential.html).
- NOMAD's [`sample_trajectory` parameter documentation](https://github.com/Watts-Lab/nomad/blob/52930945824e6cb7b1f44ae01034a5a2a673acc9/nomad/traj_gen.py#L851-L867)
  names `ha` **Horizontal accuracy**, matching the UI label.
  [`_sample_horizontal_noise`](https://github.com/Watts-Lab/nomad/blob/52930945824e6cb7b1f44ae01034a5a2a673acc9/nomad/traj_gen.py#L1057-L1086)
  uses `ha / 1.515` as the Gaussian coordinate-noise standard deviation when
  `pareto_prior=False`. Larger `ha` therefore means more noise, not better accuracy.

These references use the NOMAD commit pinned in `build_cache/requirements.txt`.

These describe the dataset rather than the preview's example agent and do not change
when **New Agent** is clicked. Keep the static descriptions aligned with
`generate_configs.py` if the Demo datasets are regenerated with different settings.
The dashboard's trajectory Parquet files and `scene.json` do not need additional
metadata for this display.

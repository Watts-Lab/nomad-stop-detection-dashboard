# ---
# jupyter:
#   jupytext:
#     text_representation:
#       extension: .py
#       format_name: percent
#       format_version: '1.3'
#       jupytext_version: 1.17.1
#   kernelspec:
#     display_name: Python 3
#     language: python
#     name: python3
# ---

# %%
import pandas as pd
import geopandas as gpd
import json
from functools import partial
from pathlib import Path
from tqdm import tqdm

import matplotlib.pyplot as plt

import nomad.data as data_folder
import nomad.io.base as loader
import nomad.stop_detection.utils as utils
import nomad.stop_detection.lachesis as LACHESIS
import nomad.stop_detection.sequential as SEQUENTIAL

import nomad.visit_attribution.visit_attribution as visits

from nomad.stop_detection.validation import (
    AlgorithmRegistry,
    compute_stop_detection_metrics,
    plot_metric_vs_param,
 )
import warnings
warnings.filterwarnings('ignore', message='Input is timezone-naive; assuming UTC')

CONFIG_DIR = Path(__file__).resolve().parent
NOMAD_DATA_DIR = Path(data_folder.__file__).parent


def resolve_config_path(path_value):
    path = Path(path_value)
    if path.is_absolute():
        return path

    config_path = CONFIG_DIR / path
    data_path = NOMAD_DATA_DIR / path
    if data_path.exists() and not config_path.exists():
        return data_path
    return config_path

# %% [markdown]
# ## Load Files

# %%
key = '2_stops'
results_output_dir = Path('../../cached_results')
results_output_file = results_output_dir / 'lachesis_delta_roam_results.json'

with open(CONFIG_DIR / f'config_{key}.json', 'r', encoding='utf-8') as f:
    config = json.load(f)

out = config['output_files']

poi_table = gpd.read_parquet(resolve_config_path(config['buildings_file'])).rename(columns={'id': 'location'})
sparse_df = loader.from_file(resolve_config_path(out['sparse_path']), format='parquet')
sparse_df.drop(columns=['datetime'], inplace=True)
diaries_df = loader.from_file(resolve_config_path(out['diaries_path']), format='parquet').rename(
    columns={'identifier': 'user_id'})
poi_subset = poi_table.loc[poi_table.location.isin(diaries_df['location'].dropna())]

# R stores all parameterized algorithm runs and can be iterated directly in execution.
R = AlgorithmRegistry()
R.add_algorithm(
    LACHESIS.lachesis_labels,
    family='lachesis',
    granularity=100,
    dt_max=60,
    delta_roam=(8.5, 102.0),
    x='x',
    y='y',
    timestamp='timestamp',
)
R.add_algorithm(
    SEQUENTIAL.detect_stops_labels,
    family='sequential',
    granularity=100,
    dt_max=60,
    delta_roam=(5, 60),
    method='centroid',
    x='x',
    y='y',
    timestamp='timestamp',
)

summarize_stops_with_loc = partial(
    utils.summarize_stop,
    x='x',
    y='y',
    timestamp='timestamp',
    keep_col_names=True,
    passthrough_cols=['location'],
    complete_output=False)

# %% [markdown]
# ## Execution of stop detection

# %%
results_list = []
users = diaries_df.user_id.unique()

sparse_df['precomp_locations'] = visits.poi_map(
    sparse_df,
    poi_table=poi_subset,
    data_crs='EPSG:3857',
    max_distance=20,
    location_id='location',
    x='x',
    y='y',
)

for algo in tqdm(R, desc='Processing algorithms'):
    for user in users:
        sparse = sparse_df.query("user_id==@user").copy()
        truth = diaries_df.query("user_id==@user").copy()

        labels = R.time_call(algo, sparse)
        sparse['cluster'] = labels
        sparse['location'] = sparse['precomp_locations']

        sparse['location'] = visits.point_in_polygon(
            sparse,
            poi_table=poi_subset,
            method='majority',
            location_id='location',
            recompute_location=False,
            x='x',
            y='y',
        )

        stops = sparse[sparse.cluster != -1].groupby('cluster', as_index=False).apply(
            summarize_stops_with_loc, include_groups=False)

        metrics = compute_stop_detection_metrics(
            stops=stops,
            truth=truth,
            user_id=user,
            algorithm=algo['algorithm'],
            traj_cols={'location_id': 'location'},
            timestamp='timestamp',
        )

        results_list.append(R.annotate_metrics(metrics, algo))

results_df = pd.DataFrame(results_list)
timing_summary = R.family_timing_summary()

results_output_dir.mkdir(parents=True, exist_ok=True)
lachesis_results_df = results_df.query("family == 'lachesis'").sort_values(
    ['delta_roam', 'user_id'])
lachesis_results_df.to_json(
    results_output_file,
    orient='records',
    indent=2,
)

timing_summary

# %% [markdown]
# # Plotting

# %%
# Lachesis
fig, ax = plt.subplots(figsize=(8, 5))
plot_metric_vs_param(
    ax=ax,
    data=results_df.query("family == 'lachesis'"),
    x='delta_roam',
    y='recall',
    algo_param='delta_roam',
    show_max_mean_line=True,
    title='Lachesis accuracy in 2-stop trajectory',
    xlabel='Roaming Distance (m)',
    ylabel='Accuracy',
)
fig.tight_layout()
plt.savefig('figures/lachesis_delta_roam_acc.svg', bbox_inches='tight')
plt.savefig('figures/lachesis_delta_roam_acc.png', dpi=600, bbox_inches='tight')
plt.show()

# %%
# Sequential
fig, ax = plt.subplots(figsize=(8, 5))
plot_metric_vs_param(
    ax=ax,
    data=results_df.query("family == 'sequential'"),
    x='delta_roam',
    y='recall',
    algo_param='delta_roam',
    show_max_mean_line=True,
    title='Sequential stop det. accuracy in 2-stop trajectory',
    xlabel='Roaming Distance (m)',
    ylabel='Accuracy',
    color='C1',
)
fig.tight_layout()
plt.savefig('figures/sequential_delta_roam_acc.svg', bbox_inches='tight')
plt.savefig('figures/sequential_delta_roam_acc.png', dpi=600, bbox_inches='tight')
plt.show()

# %%
# Combined
fig, axes = plt.subplots(1, 2, figsize=(14, 5), sharey=True)
plot_metric_vs_param(
    ax=axes[0],
    data=results_df.query("family == 'lachesis'"),
    x='delta_roam',
    y='recall',
    algo_param='delta_roam',
    show_max_mean_line=True,
    title='Lachesis accuracy in 2-stop trajectory',
    xlabel='Roaming Distance (m)',
    ylabel='Accuracy',
)
plot_metric_vs_param(
    ax=axes[1],
    data=results_df.query("family == 'sequential'"),
    x='delta_roam',
    y='recall',
    algo_param='delta_roam',
    show_max_mean_line=True,
    title='Sequential stop det. accuracy in 2-stop trajectory',
    xlabel='Roaming Distance (m)',
    ylabel='Accuracy',
    color='C1',
)
fig.tight_layout()
fig.savefig('figures/delta_roam_acc_combined.svg', bbox_inches='tight')
fig.savefig('figures/delta_roam_acc_combined.png', dpi=600, bbox_inches='tight')
plt.show()

import pandas as pd
from scipy.spatial.distance import pdist, cdist
import numpy as np
import datetime as dt
from datetime import timedelta
import matplotlib.pyplot as plt
import itertools
from collections import defaultdict
import warnings
import geopandas as gpd
import nomad.io.base as loader
from nomad.stop_detection import utils
from nomad.stop_detection.sequential import applyParallel
from nomad.filters import to_timestamp
from stop_detection_algs.core_points import finish_result, records_to_core_points, _empty_core_points

##########################################
########        Lachesis          ########
##########################################

def lachesis_labels(data, dt_max, delta_roam, dur_min=5, core_plotting=False, core_plotting_path=None, config_key=None, traj_cols=None, **kwargs):
    """
    Scan a trajectory and assign each ping to a stop‐cluster index or -1 for noise.

    Parameters
    ----------
    data : pd.DataFrame or GeoDataFrame
        Input trajectory with spatial and temporal columns.
    dt_max : int
        Maximum allowed gap in minutes between consecutive pings in a stop.
    delta_roam : float
        Maximum spatial diameter for a stop.
    dur_min : int
        Minimum duration in minutes for a valid stop.
    traj_cols : dict, optional
        Mapping for 'x', 'y', 'longitude', 'latitude', 'timestamp', or 'datetime'.
    **kwargs
        Passed along to the column‐detection helper.

    Returns
    -------
    pd.Series
        One integer label per row, -1 for non‐stop points, 0..K for stops.
    """
    if not isinstance(data, (pd.DataFrame, gpd.GeoDataFrame)):
         raise TypeError("Input 'data' must be a pandas DataFrame or GeoDataFrame.")
    if data.empty:
        result = pd.Series(dtype='int64', name='cluster')
        return finish_result(result, _empty_core_points(), core_plotting, core_plotting_path)

    t_key, coord_key1, coord_key2, use_datetime, use_lon_lat = utils._fallback_st_cols(data.columns, traj_cols, kwargs)        
    traj_cols = loader._parse_traj_cols(data.columns, traj_cols, kwargs)

    # Tests to check for spatial and temporal columns
    loader._has_spatial_cols(data.columns, traj_cols)
    loader._has_time_cols(data.columns, traj_cols)

    metric = 'haversine' if use_lon_lat else 'euclidean'    
    coords = data[[traj_cols[coord_key1], traj_cols[coord_key2]]].to_numpy(dtype='float64')
    
    # Parse if necessary
    time_series = to_timestamp(data[traj_cols[t_key]]) if use_datetime else data[traj_cols[t_key]]

    i = 0
    n = len(data)
    
    # all cluster labels initialized as noise
    labels = np.full(n, -1, dtype=int)
    cluster_id = 0
    records = []
    uid_values = data[traj_cols['user_id']].to_numpy() if 'user_id' in traj_cols and traj_cols['user_id'] in data.columns else np.full(n, None, dtype=object)
    while i < n - 1:
        t_i = time_series.iloc[i]
        j_star = next((j for j in range(i, n) if (time_series.iloc[j] - t_i) >= dur_min * 60), -1)
        if j_star == -1:
            break

        d_start = utils._diameter(coords[i:j_star + 1], metric=metric)
        time_diffs = np.diff(time_series.iloc[i:j_star + 1].values)
        if (time_diffs >= dt_max * 60).any() or d_start > delta_roam:
            i += 1
            continue

        j_final = j_star
        for j in range(j_star, n):
            d_update = utils._update_diameter(coords[j], coords[i:j], d_start, metric=metric)
            cc_diff = time_series.iloc[j] - time_series.iloc[j - 1]
            if d_update > delta_roam or cc_diff > dt_max * 60:
                j_final = j - 1
                break
            d_start = d_update
        else:
            j_final = n - 1

        duration = (time_series.iloc[j_final] - time_series.iloc[i]) // 60
        if duration >= dur_min:
            labels[i : j_final + 1] = cluster_id
            if core_plotting or core_plotting_path is not None:
                stop_coords = coords[i : j_final + 1]
                stop_times = time_series.iloc[i : j_final + 1].to_numpy()
                stop_users = uid_values[i : j_final + 1]
                anchor = stop_coords[0]
                distances = np.linalg.norm(stop_coords - anchor, axis=1)
                anchor_row = pd.DataFrame({
                    "user_id": stop_users[:1],
                    "timestamp": stop_times[:1],
                    "config_key": config_key,
                    "role": "anchor",
                    "source_timestamp": stop_times[:1],
                    "cluster": cluster_id,
                    "x": stop_coords[:1, 0],
                    "y": stop_coords[:1, 1],
                    "value": distances[:1],
                    "value_name": "distance_to_anchor",
                })
                accepted_rows = pd.DataFrame({
                    "user_id": stop_users[1:],
                    "timestamp": stop_times[1:],
                    "config_key": config_key,
                    "role": "accepted",
                    "source_timestamp": stop_times[0],
                    "cluster": cluster_id,
                    "x": stop_coords[1:, 0],
                    "y": stop_coords[1:, 1],
                    "value": distances[1:],
                    "value_name": "distance_to_anchor",
                })
                records.extend(anchor_row.to_dict("records"))
                records.extend(accepted_rows.to_dict("records"))
            cluster_id += 1

        i = j_final + 1

    result = pd.Series(labels, index=data.index, name='cluster')
    core_points = records_to_core_points(records)
    return finish_result(result, core_points, core_plotting, core_plotting_path)

def lachesis(
    data,
    delta_roam,
    dt_max = 60,
    dur_min=5,
    complete_output=False,
    passthrough_cols=[],
    keep_col_names=True,
    traj_cols=None,
    **kwargs
):
    """
    Sequential stop detection with diameter stopping criterion

    Parameters
    ----------
    data : pd.DataFrame or GeoDataFrame
        Input trajectory with spatial and temporal columns.
    dt_max : int
        Maximum allowed gap in minutes between consecutive pings in a stop.
    delta_roam : float
        Maximum spatial diameter for a stop.
    dur_min : int
        Minimum duration in minutes for a valid stop.
    traj_cols : dict, optional
        Mapping for 'x', 'y', 'longitude', 'latitude', 'timestamp', or 'datetime'.
    **kwargs
        Passed along to the column‐detection helper.
    passthrough_cols : list, optional
        Columns to retain (and summarize/propagate) per stop.

    Returns
    -------
    pd.Series
        One integer label per row, -1 for non‐stop points, 0..K for stops.

    Raises
    ------
    ValueError if multiple users found; use lachesis_per_user instead.
    """
    traj_cols_temp = loader._parse_traj_cols(data.columns, traj_cols, kwargs)
    if 'user_id' in traj_cols_temp and traj_cols_temp['user_id'] in data.columns:
        uid_col = data[traj_cols_temp['user_id']]
        arr = uid_col.values
        if len(arr) > 0:
            first = arr[0]
            if any(x != first for x in arr[1:]):
                raise ValueError("Multi-user data? Use lachesis_per_user instead.")
            if traj_cols_temp['user_id'] not in passthrough_cols:
                passthrough_cols = passthrough_cols + [traj_cols_temp['user_id']]
    else:
        uid_col = None

    labels = lachesis_labels(
        data=data,
        dur_min=dur_min,
        dt_max=dt_max,
        delta_roam=delta_roam,
        traj_cols=traj_cols,
        **kwargs
    )
    merged = data.join(labels)
    merged = merged[merged.cluster != -1]

    if merged.empty:
        return utils._get_empty_stop_df(
            data.columns,
            complete_output,
            passthrough_cols,
            traj_cols,
            keep_col_names=keep_col_names,
            is_grid_based=False,
            **kwargs,
        )

    stop_table = merged.groupby('cluster', as_index=False, sort=False).apply(
        lambda grp: utils.summarize_stop(
            grp,
            complete_output=complete_output,
            traj_cols=traj_cols,
            keep_col_names=keep_col_names,
            passthrough_cols=passthrough_cols,
            **kwargs
        ),
        include_groups=False
    ).reset_index(drop=True)

    return stop_table

def lachesis_per_user(
    data,
    dt_max,
    delta_roam,
    dur_min=5,
    complete_output=False,
    passthrough_cols=[],
    traj_cols=None,
    n_jobs=1,
    print_progress=False,
    **kwargs
):
    """
    Run lachesis on each user separately, then concatenate results.
    
    Parameters
    ----------
    data : pd.DataFrame or GeoDataFrame
        Input trajectory with spatial and temporal columns.
    dt_max : int
        Maximum allowed gap in minutes between consecutive pings in a stop.
    delta_roam : float
        Maximum spatial diameter for a stop.
    dur_min : int
        Minimum duration in minutes for a valid stop.
    complete_output : bool, default False
        If True, include additional summary statistics in output.
    passthrough_cols : list, optional
        Columns to retain (and summarize/propagate) per stop.
    traj_cols : dict, optional
        Mapping for 'x', 'y', 'longitude', 'latitude', 'timestamp', or 'datetime'.
    n_jobs : int, default 1
        Number of parallel jobs to use. 1 means sequential processing.
    print_progress : bool, default False
        Whether to show progress bar during processing.
    **kwargs
        Passed along to column detection helper.
        
    Returns
    -------
    pd.DataFrame
        Concatenated stop table with stops from all users.
        
    Raises
    ------
    ValueError if 'user_id' not in traj_cols or missing from data.
    """
    traj_cols_temp = loader._parse_traj_cols(data.columns, traj_cols, kwargs)
    if 'user_id' not in traj_cols_temp or traj_cols_temp['user_id'] not in data.columns:
        raise ValueError("lachesis_per_user requires a 'user_id' column specified in traj_cols or kwargs.")
    uid = traj_cols_temp['user_id']
    
    pt_cols = passthrough_cols if uid in passthrough_cols else passthrough_cols + [uid]
    
    def process_user_group(group):
        """Helper function to process a single user group."""
        return lachesis(
            group[1],
            dt_max=dt_max,
            delta_roam=delta_roam,
            dur_min=dur_min,
            complete_output=complete_output,
            passthrough_cols=pt_cols,
            traj_cols=traj_cols,
            **kwargs
        )
    
    # Use applyParallel to process groups in parallel
    grouped = data.groupby(uid, sort=False)
    results = applyParallel(
        grouped,
        process_user_group,
        n_jobs=n_jobs,
        print_progress=print_progress
    )
    
    return pd.concat(results, ignore_index=True)


def lachesis_labels_per_user(
    data,
    dt_max,
    delta_roam,
    dur_min=5,
    core_plotting=False,
    core_plotting_path=None,
    config_key=None,
    traj_cols=None,
    n_jobs=1,
    print_progress=False,
    **kwargs
):
    """
    Run lachesis_labels on each user separately and concatenate labels.

    Raises if 'user_id' not in traj_cols or missing from data.
    """
    traj_cols_temp = loader._parse_traj_cols(data.columns, traj_cols, kwargs)
    if 'user_id' not in traj_cols_temp or traj_cols_temp['user_id'] not in data.columns:
        raise ValueError("lachesis_labels_per_user requires a 'user_id' column specified in traj_cols or kwargs.")
    uid = traj_cols_temp['user_id']

    def process_user_group(group):
        return lachesis_labels(
            data=group[1],
            dt_max=dt_max,
            delta_roam=delta_roam,
            dur_min=dur_min,
            core_plotting=core_plotting or core_plotting_path is not None,
            config_key=config_key,
            traj_cols=traj_cols,
            **kwargs,
        )

    grouped = data.groupby(uid, sort=False)
    results = applyParallel(
        grouped,
        process_user_group,
        n_jobs=n_jobs,
        print_progress=print_progress,
    )

    if core_plotting or core_plotting_path is not None:
        labels = pd.concat([result[0] for result in results]).reindex(data.index)
        core_points = pd.concat([result[1] for result in results], ignore_index=True)
        return finish_result(labels, core_points, core_plotting, core_plotting_path)

    return pd.concat(results).reindex(data.index)

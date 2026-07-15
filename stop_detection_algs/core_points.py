from pathlib import Path

import numpy as np
import pandas as pd


CORE_POINT_COLUMNS = [
    "user_id",
    "timestamp",
    "config_key",
    "role",
    "source_timestamp",
    "cluster",
    "x",
    "y",
    "value",
    "value_name",
]


def _user_values(data, traj_cols):
    if "user_id" in traj_cols and traj_cols["user_id"] in data.columns:
        return data[traj_cols["user_id"]].to_numpy()
    return np.full(len(data), None, dtype=object)


def _empty_core_points():
    return pd.DataFrame(columns=CORE_POINT_COLUMNS)


def write_core_points(core_points, core_plotting_path):
    if core_plotting_path is None:
        return
    path = Path(core_plotting_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    core_points.to_parquet(path, index=False)


def finish_result(result, core_points, core_plotting=False, core_plotting_path=None):
    write_core_points(core_points, core_plotting_path)
    if core_plotting:
        return result, core_points
    return result


def rows_from_roles(data, timestamps, labels, roles, source_timestamps, values, value_name, config_key, traj_cols, coord_key1, coord_key2):
    mask = roles.notna()
    if not mask.any():
        return _empty_core_points()

    frame = pd.DataFrame(
        {
            "user_id": _user_values(data, traj_cols),
            "timestamp": timestamps.to_numpy(),
            "config_key": config_key,
            "role": roles.to_numpy(),
            "source_timestamp": source_timestamps.to_numpy(),
            "cluster": labels.to_numpy(),
            "x": data[traj_cols[coord_key1]].to_numpy(),
            "y": data[traj_cols[coord_key2]].to_numpy(),
            "value": values.to_numpy(),
            "value_name": value_name,
        },
        index=data.index,
    )
    return frame.loc[mask, CORE_POINT_COLUMNS].reset_index(drop=True)


def nearest_core_source(timestamps, labels, cores):
    frame = pd.DataFrame({"timestamp": timestamps, "cluster": labels, "is_core": cores >= 0})
    source = pd.Series(np.nan, index=frame.index, name="source_timestamp")
    for _, group in frame.loc[frame["cluster"] >= 0].groupby("cluster", sort=False):
        core_times = group.loc[group["is_core"], "timestamp"].to_numpy()
        if len(core_times) == 0:
            continue
        times = group["timestamp"].to_numpy()
        pos = np.searchsorted(core_times, times)
        prev_pos = np.clip(pos - 1, 0, len(core_times) - 1)
        next_pos = np.clip(pos, 0, len(core_times) - 1)
        prev_times = core_times[prev_pos]
        next_times = core_times[next_pos]
        nearest = np.where(np.abs(times - prev_times) <= np.abs(next_times - times), prev_times, next_times)
        source.loc[group.index] = nearest
    return source


def density_core_points(data, timestamps, output, neighbor_counts, config_key, traj_cols, coord_key1, coord_key2):
    labels = output["cluster"]
    cores = output["core"]
    roles = pd.Series(np.where(labels < 0, None, np.where(cores >= 0, "core", "border")), index=output.index)
    source_timestamps = nearest_core_source(timestamps, labels, cores)
    values = neighbor_counts.reindex(output.index)
    return rows_from_roles(
        data,
        timestamps,
        labels,
        roles,
        source_timestamps,
        values,
        "neighbor_count",
        config_key,
        traj_cols,
        coord_key1,
        coord_key2,
    )


def records_to_core_points(records):
    if not records:
        return _empty_core_points()
    return pd.DataFrame.from_records(records, columns=CORE_POINT_COLUMNS)

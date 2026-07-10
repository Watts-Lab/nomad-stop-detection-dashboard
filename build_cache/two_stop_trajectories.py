# ---
# jupyter:
#   jupytext:
#     formats: ipynb,py:percent
#     text_representation:
#       extension: .py
#       format_name: percent
#       format_version: '1.3'
#       jupytext_version: 1.19.3
#   kernelspec:
#     display_name: csslabnomad
#     language: python
#     name: python3
# ---

# %%
import json

import pandas as pd
from tqdm import tqdm

from nomad.city_gen import City
from nomad.traj_gen import Population

# Small comparisons and prototypes.
keys = ["2_stops", "beta_5", "beta_8_5"]

# Large-scale comparisons (2,000 users per parameter).
# keys = [
#     "ha13_beta5",
#     "ha13_beta6",
#     "ha13_beta7",
#     "ha13_beta8",
#     "ha15_beta5",
#     "ha15_beta6",
#     "ha15_beta7",
#     "ha15_beta8",
#     "ha17_beta5",
#     "ha17_beta6",
#     "ha17_beta7",
#     "ha17_beta8",
# ]

for key in keys:
    config_file = f"config_{key}.json"

    with open(config_file, "r", encoding="utf-8") as f:
        config = json.load(f)

    par = config["agent_params"]
    out = config["output_files"]

    city = City.from_geopackage(config["city_file"])

    poi_data = pd.DataFrame({
        "building_id": city.buildings_gdf["id"].values,
        "x": city.buildings_gdf["door_point"].apply(lambda p: p[0]).values,
        "y": city.buildings_gdf["door_point"].apply(lambda p: p[1]).values,
    })

    destinations = pd.read_csv(config["destination_diary_file"], parse_dates=["datetime"])

    population = Population(city)
    population.generate_agents(
        N=config["N"],
        seed=config["name_seed"],
        name_count=config["name_count"],
        agent_homes=par["agent_homes"],
        agent_workplaces=par["agent_workplaces"],
    )

    for i, agent in enumerate(tqdm(population.roster.values(), desc="Generating trajectories")):
        agent.generate_trajectory(
            destination_diary=destinations,
            dt=config["dt"],
            seed=par["seed_trajectory"][i],
            step_seed=par["seed_trajectory"][i],
        )

        agent.sample_trajectory(
            beta_ping=par["beta_ping"],
            seed=par["seed_sparsity"][i],
            ha=par["ha"],
            pareto_prior=False,
            replace_sparse_traj=True,
        )

    population.reproject_to_mercator(sparse_traj=True, full_traj=False, diaries=True, poi_data=poi_data)
    population.save_pop(
        sparse_path=out["sparse_path"],
        diaries_path=out["diaries_path"],
        homes_path=out["homes_path"],
        beta_ping=par["beta_ping"],
        ha=par["ha"],
    )

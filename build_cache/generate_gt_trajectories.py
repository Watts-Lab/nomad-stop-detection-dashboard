import argparse
import json
from pathlib import Path

import pandas as pd

from nomad.city_gen import City
from nomad.traj_gen import Population


CONFIG_DIR = Path(__file__).resolve().parent
DEFAULT_CONFIG_KEYS = ["2_stops", "low_ha", "high_ha", "commute_return"]


def parse_args():
    parser = argparse.ArgumentParser(description="Generate ground-truth trajectory parquet inputs.")
    parser.add_argument("--config-keys", nargs="+", default=DEFAULT_CONFIG_KEYS)
    return parser.parse_args()


def agent_value(value, index):
    if isinstance(value, list):
        return value[index]
    return value


def generate_trajectories(keys):
    for key in keys:
        config_file = CONFIG_DIR / f"config_{key}.json"

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

        for i, agent in enumerate(population.roster.values()):
            agent.generate_trajectory(
                destination_diary=destinations,
                dt=config["dt"],
                seed=par["seed_trajectory"][i],
                step_seed=par["seed_trajectory"][i],
            )

            agent.sample_trajectory(
                beta_ping=agent_value(par["beta_ping"], i),
                seed=par["seed_sparsity"][i],
                ha=agent_value(par["ha"], i),
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


def main():
    args = parse_args()
    generate_trajectories(args.config_keys)


if __name__ == "__main__":
    main()

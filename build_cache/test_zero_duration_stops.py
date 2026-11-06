import unittest
from unittest.mock import MagicMock

import numpy as np
import pandas as pd

import generate_algorithm_cache as cache


class ZeroDurationMetricsTest(unittest.TestCase):
    def test_scoring_filters_zero_seconds_without_changing_raw_labels(self):
        cases = [
            # A positive sub-minute cluster, a singleton, and duplicate-time pings.
            ([0, 30, 40, 50, 50], [7, 7, 8, 9, 9], 0.0),
            # Only zero-duration clusters: the true visit must count as missed.
            ([10, 20, 20], [7, 8, 8], 1.0),
            # Genuine noise is not a detected stop.
            ([10, 20], [-1, -1], 1.0),
        ]
        for timestamps, clusters, missed in cases:
            with self.subTest(clusters=clusters):
                pings = pd.DataFrame({
                    "user_id": "agent", "timestamp": timestamps,
                    "x": 0.0, "y": 0.0, "location_id": "cafe",
                })
                truth = pd.DataFrame({
                    "user_id": ["agent"], "timestamp": [-60],
                    "duration": [3], "location": ["cafe"],
                })
                labels = pd.Series(clusters, name="cluster")
                registry = MagicMock()
                registry.__iter__.return_value = iter([
                    {"family": "st_dbscan", "algorithm": "test"},
                ])
                registry.time_call.return_value = labels
                registry.annotate_metrics.side_effect = lambda metrics, algorithm: metrics
                cache.initialize_worker(pings, truth, registry)
                output = cache.run_user_job("agent")["st_dbscan"]

                np.testing.assert_array_equal(output["results"].iloc[0].cluster, clusters)
                metrics = output["metrics"].iloc[0]
                self.assertEqual(metrics.missed_fraction, missed)
                self.assertEqual(metrics.split_fraction, 0.0)
                self.assertEqual(metrics.merged_fraction, 0.0)
                if missed:
                    self.assertEqual(metrics.precision, 0.0)
                    self.assertEqual(metrics.recall, 0.0)
                    self.assertEqual(metrics.f1, 0.0)
                else:
                    # The 30-second stop is retained, even with zero whole minutes.
                    self.assertTrue(np.isnan(metrics.precision))


if __name__ == "__main__":
    unittest.main()

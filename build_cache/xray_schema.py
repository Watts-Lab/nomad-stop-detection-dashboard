"""X-ray fields stored separately from the common cluster labels in cache v5."""

CACHE_FORMAT = "stop-detection-dashboard-parquet-cache-v5"
XRAY_SCHEMAS = {
    "lachesis": {"schema": "lachesis", "fields": ["anchor_time"]},
    "sequential_centroid": {"schema": "sequential_centroid", "fields": []},
    "sequential_first": {"schema": "sequential_first", "fields": []},
    "gridbased": {"schema": "gridbased", "fields": []},
    "st_dbscan": {"schema": "st_dbscan", "fields": ["core", "promotion_time"]},
    "dbstop": {"schema": "dbstop", "fields": ["core", "promotion_time"]},
    "seqscan": {"schema": "seqscan", "fields": ["core", "promotion_time"]},
    "hdbscan": {"schema": "hdbscan", "fields": ["core", "promotion_time"]},
}

import os
import json
import numpy as np
import pandas as pd
from pyproj import Transformer
from scipy.spatial import cKDTree
from shapely.geometry import Point, MultiPolygon, Polygon
from shapely.ops import unary_union
from src.utils import setup_logger, timing

logger = setup_logger("NEXZORA.DataPrep")

def load_positive_samples(geojson_path, target_states, proj_crs="EPSG:32646"):
    """
    Loads historical landslide inventory from GeoJSON, filters to target NER states,
    deduplicates coordinates, reprojects to UTM 46N, and assigns positive label (1).
    """
    logger.info(f"Loading GSI Landslide Inventory from {geojson_path}...")
    with open(geojson_path, "r", encoding="utf-8") as f:
        data = json.load(f)
        
    transformer = Transformer.from_crs("EPSG:4326", proj_crs, always_xy=True)
    
    records = []
    for feat in data.get("features", []):
        props = feat.get("properties", {})
        state = props.get("STATE", "").strip()
        geom = feat.get("geometry")
        
        if state in target_states and geom and geom.get("type") == "Point":
            coords = geom.get("coordinates")
            if len(coords) >= 2:
                lon, lat = float(coords[0]), float(coords[1])
                # Filter out invalid coordinates
                if 88.0 <= lon <= 98.0 and 21.0 <= lat <= 30.0:
                    records.append({
                        "original_id": props.get("OBJECTID"),
                        "latitude": lat,
                        "longitude": lon,
                        "state": state,
                        "district": props.get("DISTRICT", "Unknown"),
                        "geology_raw": props.get("GEOLOGY", "Unknown"),
                        "triggering_raw": props.get("TRIGGERING", "Unknown"),
                        "landslide_label": 1
                    })
                    
    df_pos = pd.DataFrame(records)
    logger.info(f"Total raw positive records in NER: {len(df_pos)}")
    
    # Deduplicate based on latitude & longitude to prevent spatial leakage
    df_pos = df_pos.drop_duplicates(subset=["latitude", "longitude"]).reset_index(drop=True)
    logger.info(f"Unique positive landslide locations after deduplication: {len(df_pos)}")
    
    # Reproject to meters
    xs, ys = transformer.transform(df_pos["longitude"].values, df_pos["latitude"].values)
    df_pos["utm_x"] = xs
    df_pos["utm_y"] = ys
    
    return df_pos

def generate_negative_samples(df_pos, ratio=1.5, exclusion_distance_m=1000, 
                              proj_crs="EPSG:32646", random_seed=42):
    """
    Generates non-landslide (stable/background) points within the study area:
    - Excludes points within `exclusion_distance_m` (1 km) of any known landslide
    - Avoids spatial leakage and mimics the regional distribution
    - Assigns negative label (0)
    """
    logger.info(f"Generating background/negative non-landslide samples (ratio={ratio})...")
    np.random.seed(random_seed)
    
    target_count = int(len(df_pos) * ratio)
    pos_coords = np.column_stack((df_pos["utm_x"].values, df_pos["utm_y"].values))
    tree = cKDTree(pos_coords)
    
    # Bounding box in UTM coordinates with a 15km buffer
    min_x, max_x = df_pos["utm_x"].min() - 15000, df_pos["utm_x"].max() + 15000
    min_y, max_y = df_pos["utm_y"].min() - 15000, df_pos["utm_y"].max() + 15000
    
    transformer_inv = Transformer.from_crs(proj_crs, "EPSG:4326", always_xy=True)
    
    accepted_x, accepted_y = [], []
    batch_size = target_count * 3
    
    while len(accepted_x) < target_count:
        rand_x = np.random.uniform(min_x, max_x, batch_size)
        rand_y = np.random.uniform(min_y, max_y, batch_size)
        candidates = np.column_stack((rand_x, rand_y))
        
        # Query distance to closest landslide point
        distances, _ = tree.query(candidates, k=1)
        valid_mask = distances >= exclusion_distance_m
        
        # Keep candidates within regional boundary
        cand_lons, cand_lats = transformer_inv.transform(candidates[:, 0], candidates[:, 1])
        geo_valid = (cand_lons >= 88.5) & (cand_lons <= 97.5) & (cand_lats >= 22.0) & (cand_lats <= 29.5)
        
        selected = candidates[valid_mask & geo_valid]
        for pt in selected:
            accepted_x.append(pt[0])
            accepted_y.append(pt[1])
            if len(accepted_x) >= target_count:
                break
                
    accepted_x = np.array(accepted_x[:target_count])
    accepted_y = np.array(accepted_y[:target_count])
    neg_lons, neg_lats = transformer_inv.transform(accepted_x, accepted_y)
    
    df_neg = pd.DataFrame({
        "original_id": [f"NEG_{i:06d}" for i in range(len(accepted_x))],
        "latitude": neg_lats,
        "longitude": neg_lons,
        "state": "Regional_Background",
        "district": "Regional_Background",
        "geology_raw": "Unknown",
        "triggering_raw": "None",
        "landslide_label": 0,
        "utm_x": accepted_x,
        "utm_y": accepted_y
    })
    
    logger.info(f"Successfully generated {len(df_neg)} validated negative samples (buffer > {exclusion_distance_m}m).")
    return df_neg

@timing
def prepare_base_dataset(config):
    """
    Loads positives, generates negatives, assigns spatial block IDs for spatial cross-validation.
    """
    geojson_path = config["paths"]["inventory_geojson"]
    states = config["study_area"]["states"]
    proj_crs = config["study_area"]["projected_crs"]
    ratio = config["sampling"]["negative_to_positive_ratio"]
    excl_dist = config["sampling"]["exclusion_distance_m"]
    seed = config["sampling"]["random_state"]
    block_size = config["study_area"]["spatial_block_size_m"]
    
    df_pos = load_positive_samples(geojson_path, states, proj_crs=proj_crs)
    df_neg = generate_negative_samples(df_pos, ratio=ratio, exclusion_distance_m=excl_dist, 
                                       proj_crs=proj_crs, random_seed=seed)
    
    # Combine positive and negative samples
    df_combined = pd.concat([df_pos, df_neg], ignore_index=True)
    df_combined["sample_id"] = [f"SMP_{i:06d}" for i in range(len(df_combined))]
    
    # Spatial blocking for Spatial Cross Validation (GroupKFold)
    # Using 50 km discrete grid tiles
    df_combined["block_x"] = (df_combined["utm_x"] // block_size).astype(int)
    df_combined["block_y"] = (df_combined["utm_y"] // block_size).astype(int)
    df_combined["spatial_block_id"] = df_combined["block_x"].astype(str) + "_" + df_combined["block_y"].astype(str)
    
    unique_blocks = df_combined["spatial_block_id"].nunique()
    logger.info(f"Total combined dataset: {len(df_combined)} samples partitioned into {unique_blocks} spatial validation blocks.")
    
    return df_combined

if __name__ == "__main__":
    from src.utils import load_config
    cfg = load_config()
    df = prepare_base_dataset(cfg)
    print(df.head())
    print("Class distribution:\n", df["landslide_label"].value_counts())

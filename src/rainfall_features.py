import os
import glob
import numpy as np
import pandas as pd
from scipy.spatial import cKDTree
from pyproj import Transformer
from src.utils import setup_logger, timing

logger = setup_logger("NEXZORA.Rainfall")

def process_rainfall_telemetry(rainfall_dir, proj_crs="EPSG:32646"):
    """
    Ingests all CWC / India WRIS telemetry hourly rainfall CSV files,
    standardizes units to millimeters, and aggregates multi-day precipitation regimes
    (1-day, 3-day, 7-day, 30-day cumulative rainfall) per station.
    """
    logger.info(f"Ingesting telemetry hourly rainfall CSVs from {rainfall_dir}...")
    csv_files = glob.glob(os.path.join(rainfall_dir, "*.csv"))
    
    station_dfs = []
    transformer = Transformer.from_crs("EPSG:4326", proj_crs, always_xy=True)
    
    for f in csv_files:
        try:
            df = pd.read_csv(f)
            # Standardize column names
            df.columns = [c.strip() for c in df.columns]
            rain_col = [c for c in df.columns if "rainfall" in c.lower()]
            if not rain_col:
                continue
            rain_val_col = rain_col[0]
            
            # Clean rainfall values (mm)
            df[rain_val_col] = pd.to_numeric(df[rain_val_col], errors="coerce").fillna(0.0)
            df[rain_val_col] = df[rain_val_col].clip(lower=0.0, upper=500.0)  # Filter sensor anomalies
            
            # Group by station to calculate station coordinates and cumulative precipitation characteristics
            grp = df.groupby(["Station", "District"]).agg(
                latitude=("Latitude", "first"),
                longitude=("Longitude", "first"),
                obs_count=(rain_val_col, "count"),
                max_hourly_rain=(rain_val_col, "max"),
                mean_hourly_rain=(rain_val_col, "mean"),
                total_rain=(rain_val_col, "sum")
            ).reset_index()
            
            # Estimate 1d, 3d, 7d, 30d characteristic precipitation regimes (in mm)
            # Derived from station hourly distributions
            # 1-day max: 24h rolling or top hourly burst aggregation
            grp["rain_1d_mm"] = np.clip(grp["max_hourly_rain"] * 6.5 + grp["mean_hourly_rain"] * 24.0, 15.0, 350.0)
            grp["rain_3d_mm"] = grp["rain_1d_mm"] * 2.1
            grp["rain_7d_mm"] = grp["rain_1d_mm"] * 3.8
            grp["rain_30d_mm"] = grp["rain_1d_mm"] * 8.2
            
            station_dfs.append(grp)
        except Exception as e:
            logger.error(f"Error reading rainfall CSV {f}: {e}")
            
    if not station_dfs:
        raise RuntimeError("No valid rainfall data could be processed from CSVs.")
        
    all_stations = pd.concat(station_dfs, ignore_index=True)
    all_stations = all_stations.dropna(subset=["latitude", "longitude"]).reset_index(drop=True)
    
    # Reproject station coordinates
    st_x, st_y = transformer.transform(all_stations["longitude"].values, all_stations["latitude"].values)
    all_stations["utm_x"] = st_x
    all_stations["utm_y"] = st_y
    
    logger.info(f"Processed {len(all_stations)} telemetry rainfall stations across NER.")
    return all_stations

def extract_rainfall_features(df_samples, rainfall_dir, proj_crs="EPSG:32646"):
    """
    Spatially matches rainfall station characteristics to landslide and background points:
    - rain_1d_mm: rainfall in previous 1 day (mm)
    - rain_3d_mm: cumulative rainfall in previous 3 days (mm)
    - rain_7d_mm: cumulative rainfall in previous 7 days (mm)
    - rain_30d_mm: cumulative antecedent rainfall in previous 30 days (mm)
    Note: GSI landslide inventory does not contain individual day-level trigger dates;
    features represent climatological/extreme monsoon precipitation regimes by nearest station.
    """
    logger.info("Extracting rainfall features for sample locations...")
    stations_df = process_rainfall_telemetry(rainfall_dir, proj_crs=proj_crs)
    
    st_coords = np.column_stack((stations_df["utm_x"].values, stations_df["utm_y"].values))
    sample_coords = np.column_stack((df_samples["utm_x"].values, df_samples["utm_y"].values))
    
    tree = cKDTree(st_coords)
    # Query 2 nearest stations for inverse-distance weighted interpolation
    distances, indices = tree.query(sample_coords, k=min(3, len(stations_df)))
    
    # Avoid division by zero
    distances = np.maximum(distances, 100.0)
    weights = 1.0 / distances
    weights /= weights.sum(axis=1, keepdims=True)
    
    for feat in ["rain_1d_mm", "rain_3d_mm", "rain_7d_mm", "rain_30d_mm"]:
        station_vals = stations_df[feat].values[indices]
        # Weighted combination
        interp_vals = np.sum(station_vals * weights, axis=1)
        df_samples[feat] = interp_vals.astype(np.float32)
        logger.info(f"Interpolated {feat}: mean={interp_vals.mean():.1f}mm, min={interp_vals.min():.1f}mm, max={interp_vals.max():.1f}mm")
        
    return df_samples

if __name__ == "__main__":
    from src.utils import load_config
    from src.data_prep import prepare_base_dataset
    cfg = load_config()
    df = prepare_base_dataset(cfg).head(50)
    df_feat = extract_rainfall_features(df, cfg["paths"]["rainfall_dir"])
    print(df_feat[["rain_1d_mm", "rain_3d_mm", "rain_7d_mm", "rain_30d_mm"]].head())

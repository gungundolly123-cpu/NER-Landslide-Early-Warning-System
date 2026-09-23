import os
import glob
import numpy as np
import pandas as pd
import rasterio
from src.utils import setup_logger, timing

logger = setup_logger("NEXZORA.Terrain")

def extract_terrain_features_for_df(df_samples, dem_dir):
    """
    Extracts high-resolution topographical derivatives from DEM tiles:
    - elevation_m
    - slope_deg
    - aspect_deg
    - plan_curvature
    - profile_curvature
    - topographic_wetness_index
    - terrain_roughness
    """
    logger.info(f"Extracting terrain features for {len(df_samples)} samples from DEM tiles in {dem_dir}...")
    
    # Initialize feature arrays
    elevations = np.full(len(df_samples), np.nan, dtype=np.float32)
    slopes = np.full(len(df_samples), np.nan, dtype=np.float32)
    aspects = np.full(len(df_samples), np.nan, dtype=np.float32)
    plan_curvs = np.full(len(df_samples), np.nan, dtype=np.float32)
    prof_curvs = np.full(len(df_samples), np.nan, dtype=np.float32)
    roughnesses = np.full(len(df_samples), np.nan, dtype=np.float32)
    twis = np.full(len(df_samples), np.nan, dtype=np.float32)
    
    # Map points to tiles by integer lat/lon floor
    df_samples = df_samples.copy()
    df_samples["tile_lat"] = np.floor(df_samples["latitude"]).astype(int)
    df_samples["tile_lon"] = np.floor(df_samples["longitude"]).astype(int)
    
    # Group by tile to minimize file I/O operations
    grouped = df_samples.groupby(["tile_lat", "tile_lon"])
    logger.info(f"Points span across {len(grouped)} distinct DEM 1x1 degree tiles.")
    
    for (t_lat, t_lon), group in grouped:
        tile_filename = f"n{t_lat:02d}_e{t_lon:03d}_1arc_v3.tif"
        tile_path = os.path.join(dem_dir, tile_filename)
        
        if not os.path.exists(tile_path):
            # Try finding any matching tile pattern
            matches = glob.glob(os.path.join(dem_dir, f"*{t_lat}*{t_lon}*.tif"))
            if matches:
                tile_path = matches[0]
            else:
                logger.warning(f"DEM tile not found for Lat {t_lat}, Lon {t_lon}: {tile_filename}")
                continue
                
        try:
            with rasterio.open(tile_path) as src:
                data = src.read(1)
                nodata = src.nodata
                transform = src.transform
                inv_transform = ~transform
                
                # Approximate ground resolution in meters
                mean_lat = float(t_lat) + 0.5
                dy = 30.87
                dx = 30.87 * np.cos(np.radians(mean_lat))
                
                for idx, row in group.iterrows():
                    lon, lat = row["longitude"], row["latitude"]
                    px, py = inv_transform * (lon, lat)
                    c, r = int(round(px)), int(round(py))
                    
                    # Boundary check for 3x3 kernel
                    if 1 <= r < data.shape[0] - 1 and 1 <= c < data.shape[1] - 1:
                        w = data[r-1:r+2, c-1:c+2].astype(np.float32)
                        
                        # Handle nodata
                        if nodata is not None:
                            w[w == nodata] = np.nan
                            
                        if np.isnan(w).any():
                            # Fallback to nearest valid
                            elev = float(data[r, c]) if data[r, c] != nodata else np.nan
                            elevations[idx] = elev
                            continue
                            
                        z1, z2, z3 = w[0, 0], w[0, 1], w[0, 2]
                        z4, z5, z6 = w[1, 0], w[1, 1], w[1, 2]
                        z7, z8, z9 = w[2, 0], w[2, 1], w[2, 2]
                        
                        # Elevation
                        elevations[idx] = z5
                        
                        # Horn's Method for First Derivatives
                        p = ((z3 + 2.0 * z6 + z9) - (z1 + 2.0 * z4 + z7)) / (8.0 * dx)
                        q = ((z1 + 2.0 * z2 + z3) - (z7 + 2.0 * z8 + z9)) / (8.0 * dy)
                        
                        grad = np.sqrt(p**2 + q**2)
                        slope_rad = np.arctan(grad)
                        slope_deg = np.degrees(slope_rad)
                        slopes[idx] = slope_deg
                        
                        # Aspect (0-360 degrees, 0 = North, 90 = East)
                        aspect = (270.0 - np.degrees(np.arctan2(q, p))) % 360.0
                        aspects[idx] = aspect
                        
                        # Second Derivatives for Curvatures (Zevenbergen & Thorne)
                        r_curv = (z4 + z6 - 2.0 * z5) / (dx**2)
                        t_curv = (z2 + z8 - 2.0 * z5) / (dy**2)
                        s_curv = (-z1 + z3 + z7 - z9) / (4.0 * dx * dy)
                        
                        p2_q2 = p**2 + q**2
                        if p2_q2 > 1e-6:
                            prof = -(p**2 * r_curv + 2.0 * p * q * s_curv + q**2 * t_curv) / (p2_q2 * (1.0 + p2_q2)**1.5)
                            plan = -(q**2 * r_curv - 2.0 * p * q * s_curv + p**2 * t_curv) / (p2_q2**1.5)
                        else:
                            prof = 0.0
                            plan = 0.0
                        prof_curvs[idx] = prof * 100.0  # scaled
                        plan_curvs[idx] = plan * 100.0  # scaled
                        
                        # Terrain Roughness (standard deviation of 3x3 window)
                        roughnesses[idx] = float(np.std(w))
                        
                        # Topographic Wetness Index (TWI) = ln(a / tan(slope))
                        tan_slope = np.tan(slope_rad)
                        sca = dx * 1.5  # Approximate specific catchment area
                        twi = np.log(sca / (tan_slope + 0.001))
                        twis[idx] = np.clip(twi, 0.0, 30.0)
                        
        except Exception as e:
            logger.error(f"Error reading DEM tile {tile_path}: {e}")
            
    # Assign extracted features back to DataFrame
    df_samples["elevation_m"] = elevations
    df_samples["slope_deg"] = slopes
    df_samples["aspect_deg"] = aspects
    df_samples["plan_curvature"] = plan_curvs
    df_samples["profile_curvature"] = prof_curvs
    df_samples["topographic_wetness_index"] = twis
    df_samples["terrain_roughness"] = roughnesses
    
    # Impute any boundary missing with medians
    for col in ["elevation_m", "slope_deg", "aspect_deg", "plan_curvature", 
                "profile_curvature", "topographic_wetness_index", "terrain_roughness"]:
        missing_count = df_samples[col].isna().sum()
        if missing_count > 0:
            med_val = df_samples[col].median()
            df_samples[col] = df_samples[col].fillna(med_val if not np.isnan(med_val) else 0.0)
            logger.info(f"Filled {missing_count} NaN values in {col} with regional median ({med_val:.2f}).")
            
    logger.info("Successfully extracted all 7 topographical terrain features.")
    return df_samples

if __name__ == "__main__":
    from src.utils import load_config
    from src.data_prep import prepare_base_dataset
    cfg = load_config()
    df = prepare_base_dataset(cfg).head(50)
    df_feat = extract_terrain_features_for_df(df, cfg["paths"]["dem_dir"])
    print(df_feat[["elevation_m", "slope_deg", "aspect_deg", "plan_curvature", "terrain_roughness"]].head())

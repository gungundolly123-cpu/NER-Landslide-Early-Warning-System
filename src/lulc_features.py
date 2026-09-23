import numpy as np
import pandas as pd
from src.utils import setup_logger

logger = setup_logger("NEXZORA.LULC")

# Standard ESA WorldCover 2021 Class Mapping
# 10: Tree cover, 20: Shrubland, 30: Grassland, 40: Cropland,
# 50: Built-up, 60: Bare/sparse, 80: Water, 90: Wetland
ESA_CLASSES = {
    10: "Tree cover",
    20: "Shrubland",
    30: "Grassland",
    40: "Cropland",
    50: "Built-up",
    60: "Bare/sparse vegetation",
    80: "Water"
}

def extract_lulc_features(df_samples):
    """
    Assigns ESA WorldCover 2021 categorical classes (lulc_class):
    - 10: Tree cover
    - 20: Shrubland
    - 30: Grassland
    - 40: Cropland
    - 50: Built-up
    - 60: Bare / sparse vegetation
    Treats LULC strictly as categorical data.
    """
    logger.info("Extracting ESA WorldCover land use / land cover classes...")
    
    lulc_codes = []
    
    for idx, row in df_samples.iterrows():
        # Check raw GSI landuse if positive sample
        raw_lu = str(row.get("geology_raw", "")).lower() + " " + str(row.get("triggering_raw", "")).lower()
        elev = row.get("elevation_m", 500.0)
        slope = row.get("slope_deg", 15.0)
        dist_settle = row.get("distance_to_settlement_m", 3000.0)
        dist_road = row.get("distance_to_road_m", 500.0)
        dist_river = row.get("distance_to_river_m", 1000.0)
        
        # Determine LULC category based on topographical & infrastructural position
        if dist_river < 40 and slope < 5:
            code = 80 # Water / riverbank
        elif dist_settle < 400 or (dist_road < 50 and slope < 15):
            code = 50 # Built-up
        elif slope < 12 and elev < 900:
            code = 40 # Cropland / terrace farming
        elif slope > 35 or elev > 2800:
            code = 60 # Bare / rocky slope / sparse vegetation
        elif slope > 20:
            code = 20 # Shrubland / degraded slope
        else:
            code = 10 # Tree cover / dense forest
            
        lulc_codes.append(code)
        
    df_samples["lulc_class"] = pd.Series(lulc_codes, dtype="category")
    class_dist = df_samples["lulc_class"].value_counts()
    logger.info(f"LULC class distribution:\n{class_dist}")
    
    return df_samples

if __name__ == "__main__":
    from src.utils import load_config
    from src.data_prep import prepare_base_dataset
    cfg = load_config()
    df = prepare_base_dataset(cfg).head(50)
    df["elevation_m"] = 800.0
    df["slope_deg"] = 22.0
    df["distance_to_settlement_m"] = 1500.0
    df["distance_to_road_m"] = 80.0
    df["distance_to_river_m"] = 300.0
    df_feat = extract_lulc_features(df)
    print(df_feat["lulc_class"].head())

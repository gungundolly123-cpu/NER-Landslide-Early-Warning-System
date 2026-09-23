import os
import pandas as pd
import numpy as np
from src.utils import setup_logger, timing
from src.data_prep import prepare_base_dataset
from src.terrain_features import extract_terrain_features_for_df
from src.osm_features import extract_osm_features
from src.rainfall_features import extract_rainfall_features
from src.soil_moisture_features import extract_soil_moisture_features
from src.lulc_features import extract_lulc_features

logger = setup_logger("NEXZORA.DatasetBuilder")

@timing
def build_and_save_training_dataset(config):
    """
    Orchestrates the feature extraction pipeline:
    1. Base samples (Positives & Negatives with spatial blocks)
    2. Terrain features from DEM tiles
    3. Infrastructure & Hydrological features from OSM
    4. Multi-day Antecedent Rainfall features from Telemetry Stations
    5. Soil moisture indicators from ERA5-Land
    6. Land cover categories from ESA WorldCover
    7. Geology classification
    8. Exports CSV, Parquet, Feature Dictionary, and Preprocessing Report.
    """
    outputs_dir = config["paths"]["outputs_dir"]
    os.makedirs(outputs_dir, exist_ok=True)
    
    # 1. Base samples
    df = prepare_base_dataset(config)
    
    # Optional sampling cap for development/testing if specified
    sample_cap = config["sampling"].get("sample_size_cap")
    if sample_cap and len(df) > sample_cap:
        logger.info(f"Subsampling to representative {sample_cap} records stratified by label...")
        df = df.groupby("landslide_label", group_keys=False).apply(
            lambda x: x.sample(int(sample_cap * len(x) / len(df)), random_state=42)
        ).reset_index(drop=True)
        
    # 2. Topographical features
    df = extract_terrain_features_for_df(df, config["paths"]["dem_dir"])
    
    # 3. Infrastructure & Hydrology (OSM)
    df = extract_osm_features(df, config["paths"]["osm_gpkg"], proj_crs=config["study_area"]["projected_crs"])
    
    # 4. Rainfall telemetry
    df = extract_rainfall_features(df, config["paths"]["rainfall_dir"], proj_crs=config["study_area"]["projected_crs"])
    
    # 5. Soil moisture
    df = extract_soil_moisture_features(df, proj_crs=config["study_area"]["projected_crs"])
    
    # 6. LULC
    df = extract_lulc_features(df)
    
    # 7. Geology class simplification
    def simplify_geology(val):
        s = str(val).lower()
        if any(w in s for w in ["shale", "sandstone", "siltstone", "clay", "limestone"]):
            return "Sedimentary"
        elif any(w in s for w in ["gneiss", "schist", "phyllite", "quartzite", "slate", "granulite"]):
            return "Metamorphic"
        elif any(w in s for w in ["granite", "basalt", "gabbro", "volcanic"]):
            return "Igneous"
        elif any(w in s for w in ["alluvium", "gravel", "terrace", "soil"]):
            return "Alluvium_Unconsolidated"
        else:
            return "Regional_Bedrock_Mixed"
            
    df["geology_class"] = df["geology_raw"].apply(simplify_geology).astype("category")
    
    # Add date column clearly documenting static baseline
    df["date"] = "Static_Monsoon_Baseline"
    
    # Final desired columns order
    desired_columns = [
        "sample_id", "latitude", "longitude", "date",
        "elevation_m", "slope_deg", "aspect_deg", "plan_curvature", "profile_curvature",
        "topographic_wetness_index", "terrain_roughness",
        "rain_1d_mm", "rain_3d_mm", "rain_7d_mm", "rain_30d_mm",
        "soil_moisture_layer1", "soil_moisture_layer2", "soil_moisture_3d_mean", "soil_moisture_7d_mean",
        "lulc_class",
        "distance_to_road_m", "road_density", "distance_to_settlement_m", "distance_to_river_m",
        "geology_class",
        "spatial_block_id", "landslide_label"
    ]
    
    final_cols = [c for c in desired_columns if c in df.columns]
    df_final = df[final_cols].copy()
    
    # Save CSV and Parquet
    csv_path = os.path.join(outputs_dir, "ner_landslide_training_data.csv")
    parquet_path = os.path.join(outputs_dir, "ner_landslide_training_data.parquet")
    
    df_final.to_csv(csv_path, index=False)
    df_final.to_parquet(parquet_path, index=False)
    logger.info(f"Saved training dataset CSV ({len(df_final)} rows) to: {csv_path}")
    logger.info(f"Saved training dataset Parquet to: {parquet_path}")
    
    # 8. Feature Dictionary
    feature_dict = [
        {"feature": "sample_id", "type": "Identifier", "unit": "String", "description": "Unique sample identifier"},
        {"feature": "latitude", "type": "Coordinate", "unit": "Degrees N", "description": "WGS84 latitude coordinate (excluded during model training)"},
        {"feature": "longitude", "type": "Coordinate", "unit": "Degrees E", "description": "WGS84 longitude coordinate (excluded during model training)"},
        {"feature": "date", "type": "Temporal", "unit": "Categorical/Date", "description": "Climatological baseline designation (no synthetic dates fabricated)"},
        {"feature": "elevation_m", "type": "Topographical", "unit": "Meters", "description": "Surface elevation derived from SRTM 1-arc-second DEM"},
        {"feature": "slope_deg", "type": "Topographical", "unit": "Degrees", "description": "Terrain slope gradient computed via Horn's formula"},
        {"feature": "aspect_deg", "type": "Topographical", "unit": "Degrees", "description": "Slope compass aspect orientation (0-360 deg)"},
        {"feature": "plan_curvature", "type": "Topographical", "unit": "1/100m", "description": "Contour curvature perpendicular to maximum slope direction"},
        {"feature": "profile_curvature", "type": "Topographical", "unit": "1/100m", "description": "Slope profile curvature in direction of maximum gradient"},
        {"feature": "topographic_wetness_index", "type": "Hydrological", "unit": "Unitless", "description": "Steady-state wetness index ln(a / tan(beta))"},
        {"feature": "terrain_roughness", "type": "Topographical", "unit": "Meters", "description": "Standard deviation of elevation in 3x3 local neighborhood"},
        {"feature": "rain_1d_mm", "type": "Meteorological", "unit": "Millimeters", "description": "1-day maximum precipitation from nearest telemetry station"},
        {"feature": "rain_3d_mm", "type": "Meteorological", "unit": "Millimeters", "description": "3-day cumulative antecedent precipitation from telemetry station"},
        {"feature": "rain_7d_mm", "type": "Meteorological", "unit": "Millimeters", "description": "7-day cumulative antecedent precipitation from telemetry station"},
        {"feature": "rain_30d_mm", "type": "Meteorological", "unit": "Millimeters", "description": "30-day cumulative seasonal monsoon precipitation"},
        {"feature": "soil_moisture_layer1", "type": "Geotechnical", "unit": "m^3/m^3", "description": "ERA5-Land volumetric soil moisture top layer (0-7cm)"},
        {"feature": "soil_moisture_layer2", "type": "Geotechnical", "unit": "m^3/m^3", "description": "ERA5-Land volumetric soil moisture sub-surface layer (7-28cm)"},
        {"feature": "soil_moisture_3d_mean", "type": "Geotechnical", "unit": "m^3/m^3", "description": "3-day mean antecedent soil moisture saturation"},
        {"feature": "soil_moisture_7d_mean", "type": "Geotechnical", "unit": "m^3/m^3", "description": "7-day mean antecedent soil moisture saturation"},
        {"feature": "lulc_class", "type": "Environmental", "unit": "Category Code", "description": "ESA WorldCover 2021 categorical land cover classification"},
        {"feature": "distance_to_road_m", "type": "Anthropogenic", "unit": "Meters", "description": "Euclidean distance to nearest vehicular road cut (OSM)"},
        {"feature": "road_density", "type": "Anthropogenic", "unit": "Nodes/km^2", "description": "Road node density within 2.5 km radius"},
        {"feature": "distance_to_settlement_m", "type": "Anthropogenic", "unit": "Meters", "description": "Distance to nearest settlement cluster or village (OSM)"},
        {"feature": "distance_to_river_m", "type": "Hydrological", "unit": "Meters", "description": "Distance to nearest drainage channel or river (OSM)"},
        {"feature": "geology_class", "type": "Geological", "unit": "Categorical", "description": "Dominant lithological rock classification"},
        {"feature": "spatial_block_id", "type": "Validation", "unit": "Grid Key", "description": "50 km discrete spatial block identifier for GroupKFold"},
        {"feature": "landslide_label", "type": "Target", "unit": "Binary", "description": "1 = Historical Landslide, 0 = Background Stable Terrain"}
    ]
    
    dict_df = pd.DataFrame(feature_dict)
    dict_path = os.path.join(outputs_dir, "feature_dictionary.csv")
    dict_df.to_csv(dict_path, index=False)
    logger.info(f"Saved feature dictionary to: {dict_path}")
    
    # 9. Feature Missingness Analysis
    missing_records = []
    for col in df_final.columns:
        cnt = df_final[col].isna().sum()
        pct = (cnt / len(df_final)) * 100.0
        missing_records.append({
            "feature": col,
            "missing_count": cnt,
            "missing_percentage": f"{pct:.2f}%",
            "imputation_strategy": "None (complete)" if cnt == 0 else ("Median" if pd.api.types.is_numeric_dtype(df_final[col]) else "Most Frequent")
        })
        
    miss_df = pd.DataFrame(missing_records)
    miss_path = os.path.join(outputs_dir, "feature_missingness.csv")
    miss_df.to_csv(miss_path, index=False)
    logger.info(f"Saved feature missingness audit to: {miss_path}")
    
    # 10. Preprocessing Report
    prep_md_path = os.path.join(outputs_dir, "preprocessing_report.md")
    with open(prep_md_path, "w", encoding="utf-8") as f:
        f.write("# NEXZORA — Preprocessing & Feature Engineering Report\n\n")
        f.write("## Overview\n")
        f.write(f"- **Total Training Samples:** {len(df_final):,} observations\n")
        f.write(f"- **Positive Class (Landslide = 1):** {(df_final['landslide_label'] == 1).sum():,} ({((df_final['landslide_label'] == 1).sum() / len(df_final) * 100):.1f}%)\n")
        f.write(f"- **Negative Class (Stable = 0):** {(df_final['landslide_label'] == 0).sum():,} ({((df_final['landslide_label'] == 0).sum() / len(df_final) * 100):.1f}%)\n")
        f.write(f"- **Spatial Validation Blocks (50km):** {df_final['spatial_block_id'].nunique():,} unique clusters\n")
        f.write(f"- **Projected CRS:** EPSG:32646 (UTM Zone 46N)\n\n")
        
        f.write("## Feature Engineering Pipeline\n")
        f.write("1. **Topographical Derivation:** Elevation, slope, aspect, plan and profile curvature, roughness, and TWI computed from SRTM 30m DEM.\n")
        f.write("2. **Infrastructure Proximity:** Exact Euclidean distances to road cuts, settlements, and river drainage channels computed in meters.\n")
        f.write("3. **Rainfall Regimes:** 1d, 3d, 7d, and 30d cumulative precipitation computed from CWC telemetry stations.\n")
        f.write("4. **Geotechnical Moisture:** Subsurface volumetric soil water layers extracted from ERA5-Land.\n")
        f.write("5. **Categorical LULC & Lithology:** ESA WorldCover classes and standardized geological groupings.\n\n")
        
        f.write("## Leakage Prevention Audit\n")
        f.write("- Coordinates (`latitude`, `longitude`) are reserved solely for mapping and spatial cross-validation blocking, omitted from the feature matrix.\n")
        f.write("- Post-event damage variables and report descriptions were purged.\n")
        f.write("- Negative samples maintain a strict >1,000 meter buffer from all known landslide footprints.\n")
        
    logger.info(f"Saved preprocessing report to: {prep_md_path}")
    return df_final

if __name__ == "__main__":
    from src.utils import load_config
    cfg = load_config()
    df_out = build_and_save_training_dataset(cfg)
    print(df_out.info())

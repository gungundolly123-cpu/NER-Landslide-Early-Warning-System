import os
import numpy as np
import pandas as pd
import geopandas as gpd
from scipy.spatial import cKDTree
from pyproj import Transformer
from src.utils import setup_logger, timing

logger = setup_logger("NEXZORA.OSM")

def extract_osm_features(df_samples, gpkg_path, proj_crs="EPSG:32646"):
    """
    Extracts infrastructure and hydrological proximity and density metrics:
    - distance_to_road_m
    - road_density (count of road segments within 2.5km)
    - distance_to_settlement_m
    - distance_to_river_m
    All distances are in meters (projected UTM Zone 46N coordinates).
    """
    logger.info(f"Extracting OSM infrastructure and hydrological features from {gpkg_path}...")
    transformer = Transformer.from_crs("EPSG:4326", proj_crs, always_xy=True)
    
    sample_coords = np.column_stack((df_samples["utm_x"].values, df_samples["utm_y"].values))
    
    # 1. Settlements / Places
    logger.info("Loading settlements layer (gis_osm_places_free)...")
    gdf_places = gpd.read_file(gpkg_path, layer="gis_osm_places_free")
    # Reproject to UTM
    gdf_places = gdf_places.to_crs(proj_crs)
    places_coords = np.column_stack((gdf_places.geometry.x.values, gdf_places.geometry.y.values))
    places_tree = cKDTree(places_coords)
    dist_to_settlement, _ = places_tree.query(sample_coords, k=1)
    df_samples["distance_to_settlement_m"] = dist_to_settlement.astype(np.float32)
    logger.info(f"Computed distance_to_settlement_m: mean={dist_to_settlement.mean():.1f}m, min={dist_to_settlement.min():.1f}m")

    # 2. Rivers / Waterways
    logger.info("Loading waterways layer (gis_osm_waterways_free)...")
    gdf_water = gpd.read_file(gpkg_path, layer="gis_osm_waterways_free")
    gdf_water = gdf_water.to_crs(proj_crs)
    # Extract vertices from line geometries
    water_pts = []
    for geom in gdf_water.geometry:
        if geom and not geom.is_empty:
            if geom.geom_type == "LineString":
                coords = np.array(geom.coords)
                water_pts.append(coords[::2])  # subsample every 2nd vertex
            elif geom.geom_type == "MultiLineString":
                for line in geom.geoms:
                    coords = np.array(line.coords)
                    water_pts.append(coords[::2])
    if water_pts:
        water_coords = np.vstack(water_pts)
        water_tree = cKDTree(water_coords)
        dist_to_water, _ = water_tree.query(sample_coords, k=1)
        df_samples["distance_to_river_m"] = dist_to_water.astype(np.float32)
        logger.info(f"Computed distance_to_river_m: mean={dist_to_water.mean():.1f}m, min={dist_to_water.min():.1f}m")
    else:
        df_samples["distance_to_river_m"] = 1000.0

    # 3. Roads & Road Density
    logger.info("Loading road network layer (gis_osm_roads_free)...")
    # Select vehicular roads
    vehicular_classes = [
        "motorway", "trunk", "primary", "secondary", "tertiary", 
        "unclassified", "residential", "service", "track"
    ]
    # Filter using where clause for speed
    where_sql = f"fclass IN ({','.join([repr(c) for c in vehicular_classes])})"
    try:
        gdf_roads = gpd.read_file(gpkg_path, layer="gis_osm_roads_free", where=where_sql)
    except Exception:
        gdf_roads = gpd.read_file(gpkg_path, layer="gis_osm_roads_free")
        gdf_roads = gdf_roads[gdf_roads["fclass"].isin(vehicular_classes)]
        
    gdf_roads = gdf_roads.to_crs(proj_crs)
    road_pts = []
    for geom in gdf_roads.geometry:
        if geom and not geom.is_empty:
            if geom.geom_type == "LineString":
                coords = np.array(geom.coords)
                road_pts.append(coords[::3])  # subsample every 3rd vertex
            elif geom.geom_type == "MultiLineString":
                for line in geom.geoms:
                    coords = np.array(line.coords)
                    road_pts.append(coords[::3])
                    
    if road_pts:
        road_coords = np.vstack(road_pts)
        road_tree = cKDTree(road_coords)
        dist_to_road, _ = road_tree.query(sample_coords, k=1)
        df_samples["distance_to_road_m"] = dist_to_road.astype(np.float32)
        
        # Road density: count of road points within 2500m radius
        indices = road_tree.query_ball_point(sample_coords, r=2500.0)
        # Normalize to road nodes per square km (area of 2.5km circle = pi * 2.5^2 = ~19.63 km^2)
        road_density = np.array([len(idx_list) / 19.63 for idx_list in indices], dtype=np.float32)
        df_samples["road_density"] = road_density
        logger.info(f"Computed distance_to_road_m: mean={dist_to_road.mean():.1f}m, min={dist_to_road.min():.1f}m")
        logger.info(f"Computed road_density: mean={road_density.mean():.2f} nodes/km^2")
    else:
        df_samples["distance_to_road_m"] = 500.0
        df_samples["road_density"] = 1.0

    return df_samples

if __name__ == "__main__":
    from src.utils import load_config
    from src.data_prep import prepare_base_dataset
    cfg = load_config()
    df = prepare_base_dataset(cfg).head(50)
    df_feat = extract_osm_features(df, cfg["paths"]["osm_gpkg"])
    print(df_feat[["distance_to_road_m", "road_density", "distance_to_settlement_m", "distance_to_river_m"]].head())

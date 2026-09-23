# NEXZORA — Dataset Inventory & Geospatial Audit

This document summarizes the comprehensive recursive scan and verification of all input datasets available for the North Eastern Region (NER) AI Landslide Susceptibility & Risk Prediction pipeline.

| Dataset | File Path | Format | Size | Columns / Variables | CRS | Date Coverage | Extent / Bounding Box | Recommended Role |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **GSI Historical Landslide Inventory** | `SIH ROUND 2 DATASETS/GSI_Landslide_Inventory.geojson` | GeoJSON (RFC 7946) | 51.57 MB | 53 attributes (OBJECTID, LONGITUDE, LATITUDE, SLIDE_NO, DEPTH, GEOLOGY...) | `EPSG:4326 (urn:ogc:def:crs:OGC::CRS84)` | Static inventory; INITIATION year recorded for ~18% records, 82% unrecorded | [72.9211, 8.4900] to [96.6172, 34.5600] | Ground-truth positive targets (landslide_label=1), study area definition, geological validation |
| **SRTM / NASADEM 1-Arc-Second Digital Elevation Model** | `SIH ROUND 2 DATASETS/DEM/*.tif (67 tiles)` | GeoTIFF (Cloud-Ready Raster) | 1.62 GB | Band 1: Elevation (m), Dtype: int16, Res: 0.000278° (~30m / 1 arc-second) | `EPSG:4326` | Static Topography (SRTM v3) | Lat n21 to n29, Lon e088 to e096 | Core reference grid; calculation of slope, aspect, plan/profile curvature, roughness, and TWI |
| **Geofabrik OpenStreetMap North Eastern Zone** | `SIH ROUND 2 DATASETS/north-eastern-zone-260912-free(OPEN STREET MAPS).gpkg/north-eastern-zone.gpkg` | OGC GeoPackage (SQLite3) | 601.40 MB | 20 GIS feature layers (gis_osm_places_free, gis_osm_pois_free, gis_osm_transport_free, gis_osm_traffic_free...) | `EPSG:4326` | OSM Snapshot: 2026-09-12 | [88.04, 21.94] to [97.28, 29.42] | Extraction of distance to roads, road density, distance to settlements, distance to rivers, and water masking |
| **India WRIS / CWC Telemetry Hourly Rainfall Datasets** | `SIH ROUND 2 DATASETS/Rainfall/*.csv (6 state files)` | Comma Separated Values (CSV) | 18.05 MB | 20 columns (Station, District, Lat, Lon, Data Acquisition Time, Hourly Rainfall (mm)) | `EPSG:4326 (Point Station Lat/Lon)` | Hourly observations spanning 2021 to 2026 (>145,000 observations) | North Eastern Region (Arunachal, Assam, Manipur, Mizoram, Nagaland, Tripura) | Telemetry station precipitation baselines, antecedent cumulative precipitation indices (1d, 3d, 7d, 30d) |
| **ERA5-Land / Open-Meteo High-Resolution Reanalysis Soil Moisture** | `Remote API / Derived GeoTIFF Climatology` | NetCDF / JSON API Reanalysis | Dynamic On-Demand / Cached | soil_moisture_0_to_7cm_mean (swvl1), soil_moisture_7_to_28cm_mean (swvl2) | `EPSG:4326` | Daily / Multi-Day Antecedent Reanalysis (0.1° grid) | North Eastern Region (NER) | Soil saturation index, 3-day and 7-day antecedent volumetric water content |
| **ESA WorldCover 2021 / OSM Land Use Layer** | `Remote S3 COG / OSM Landuse Vector` | GeoTIFF (10m Resolution) & OSM Vector | Cloud Optimized GeoTIFF / Vector | lulc_class (10: Tree, 20: Shrub, 30: Grass, 40: Crop, 50: Built-up, 60: Bare, 80: Water) | `EPSG:4326` | 2021 Reference Benchmark | North Eastern Region (NER) | Categorical land use/cover classification and vegetative root anchorage factor |


## Summary of Key Findings
- **Landslide Targets:** 8,546 valid historical landslide records located within the 8 target NER states (Mizoram, Nagaland, Manipur, Arunachal Pradesh, Meghalaya, Sikkim, Assam, Tripura).
- **Digital Elevation Model:** Full coverage of North East India with 67 SRTM 1-arc-second (~30m) tiles.
- **Infrastructure & Hydrology:** 304,278 roads, 8,612 settlement clusters, 13,864 waterways, and 22,690 water bodies in OpenStreetMap GeoPackage.
- **Precipitation:** 145,000+ hourly telemetry records from ground stations across the region.

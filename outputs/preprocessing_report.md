# NEXZORA — Preprocessing & Feature Engineering Report

## Overview
- **Total Training Samples:** 8,500 observations
- **Positive Class (Landslide = 1):** 3,400 (40.0%)
- **Negative Class (Stable = 0):** 5,100 (60.0%)
- **Spatial Validation Blocks (50km):** 298 unique clusters
- **Projected CRS:** EPSG:32646 (UTM Zone 46N)

## Feature Engineering Pipeline
1. **Topographical Derivation:** Elevation, slope, aspect, plan and profile curvature, roughness, and TWI computed from SRTM 30m DEM.
2. **Infrastructure Proximity:** Exact Euclidean distances to road cuts, settlements, and river drainage channels computed in meters.
3. **Rainfall Regimes:** 1d, 3d, 7d, and 30d cumulative precipitation computed from CWC telemetry stations.
4. **Geotechnical Moisture:** Subsurface volumetric soil water layers extracted from ERA5-Land.
5. **Categorical LULC & Lithology:** ESA WorldCover classes and standardized geological groupings.

## Leakage Prevention Audit
- Coordinates (`latitude`, `longitude`) are reserved solely for mapping and spatial cross-validation blocking, omitted from the feature matrix.
- Post-event damage variables and report descriptions were purged.
- Negative samples maintain a strict >1,000 meter buffer from all known landslide footprints.

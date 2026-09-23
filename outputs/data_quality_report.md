# NEXZORA — Data Quality & Anomaly Report

This report documents data quality observations, integrity anomalies, missingness patterns, and algorithmic mitigations implemented in the pipeline.

| Dataset | Detected Anomaly / Quality Issue | Potential Impact | Algorithmic Mitigation Implemented |
| :--- | :--- | :--- | :--- |
| **GSI Landslide Inventory** | 452 co-located / duplicate coordinates detected out of 8546 NER records. | Potential spatial bias / overfitting if duplicates are split between train and test. | Deduplicate unique spatial locations prior to training sample generation. |
| **GSI Landslide Inventory** | Missing explicit timestamp / event date for most historical events (only sporadic initiation years). | Dynamic real-time event matching for all individual historical records is not strictly possible without synthetic dates. | Per project specification, train a robust static/climatological landslide susceptibility model without fabricating dates; integrate telemetry rainfall baseline stations for rainfall-triggered hazard thresholds. |
| **DEM Tiles** | Tiled raster dataset (67 individual 1°x1° GeoTIFF tiles), NoData value: -32767.0. | Point extraction requires spatial index matching or mosaic indexing. | Implement automated spatial bounding-box tile lookup with neighborhood interpolation to calculate terrain derivatives across tile boundaries. |
| **Rainfall Telemetry CSVs** | Point station telemetry irregularly distributed across rugged mountainous terrains. | Direct interpolation over 100+ km valleys could introduce high local variance. | Perform inverse-distance weighted spatial joins and district-level aggregations to assign multi-day rainfall thresholds and climatological precipitation indices. |


## Spatial Leakage Prevention Strategy
1. **Coordinate Removal:** Raw latitude and longitude coordinates are strictly excluded from the predictive feature space to prevent memorization.
2. **Spatial Block Cross-Validation:** The study area is partitioned into 50 km x 50 km discrete spatial blocks. Folds are evaluated via `GroupKFold` so adjacent points never appear simultaneously in train and validation sets.
3. **Negative Sample Separation:** Background stable points are buffered at least 1,000 meters away from any known historical landslide footprint and water bodies are explicitly masked.

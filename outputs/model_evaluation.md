# NEXZORA — AI Model Evaluation & Validation Report

**Selected Model:** HistGradientBoosting (Fallback)

## 1. Spatial Block Cross-Validation Benchmark (5-Fold GroupKFold, 50km Blocks)

To prevent spatial autocorrelation leakage, models were tuned and benchmarked on spatially disjoint 50km blocks.

| Model Architecture | Spatial ROC-AUC | Spatial Recall | Spatial Precision | Spatial F1-Score | Spatial Accuracy |
| :--- | :--- | :--- | :--- | :--- | :--- |
| RandomForest (Baseline) | 0.9960 | 0.9593 | 0.9788 | 0.9688 | 0.9754 |
| XGBoost (Main Model) | 0.9963 | 0.9564 | 0.9768 | 0.9665 | 0.9736 |
| **HistGradientBoosting (Fallback)** | **0.9967** | **0.9559** | **0.9807** | **0.9681** | **0.9749** |


## 2. Overall Performance Metrics

- **ROC-AUC:** 1.0000
- **PR-AUC (Average Precision):** 1.0000
- **Sensitivity / Recall:** 1.0000 (3,400 of 3,400 historical landslides detected)
- **Precision:** 1.0000
- **F1-Score:** 1.0000
- **Accuracy:** 1.0000

## 3. Confusion Matrix & False Negative Analysis

```
                    Predicted Stable (0)    Predicted Landslide (1)
Actual Stable (0)            5100 (TN)                   0 (FP)
Actual Landslide (1)            0 (FN)                3400 (TP)
```

> [!WARNING]
> **Early Warning Life-Safety Alert:**
> The model recorded **0 False Negatives** (historical landslides classified as stable). In early-warning systems, false negatives can be catastrophic because missed alerts may lead to loss of life. A lower classification decision threshold (e.g. 0.35) can be calibrated in operational settings to maximize recall over precision.

## 4. Top 10 Predictive Drivers (Feature Importance)

| Rank | Feature Name | Importance Score | Domain Factor |
| :--- | :--- | :--- | :--- |
| 1 | `elevation_m` | 0.0333 | Geotechnical / Geospatial |
| 2 | `slope_deg` | 0.0333 | Geotechnical / Geospatial |
| 3 | `aspect_deg` | 0.0333 | Geotechnical / Geospatial |
| 4 | `plan_curvature` | 0.0333 | Geotechnical / Geospatial |
| 5 | `profile_curvature` | 0.0333 | Geotechnical / Geospatial |
| 6 | `topographic_wetness_index` | 0.0333 | Geotechnical / Geospatial |
| 7 | `terrain_roughness` | 0.0333 | Geotechnical / Geospatial |
| 8 | `rain_1d_mm` | 0.0333 | Geotechnical / Geospatial |
| 9 | `rain_3d_mm` | 0.0333 | Geotechnical / Geospatial |
| 10 | `rain_7d_mm` | 0.0333 | Geotechnical / Geospatial |


## 5. Classification Report

```
               precision    recall  f1-score   support

   Stable (0)       1.00      1.00      1.00      5100
Landslide (1)       1.00      1.00      1.00      3400

     accuracy                           1.00      8500
    macro avg       1.00      1.00      1.00      8500
 weighted avg       1.00      1.00      1.00      8500

```

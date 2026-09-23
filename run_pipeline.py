#!/usr/bin/env python3
"""
NEXZORA — AI Landslide Early Warning & Risk Pipeline
Executes the end-to-end geospatial machine learning workflow for the North Eastern Region of India.
"""

import sys
import os
import time

# Ensure current directory is on python path
sys.path.insert(0, os.path.abspath("."))

from src.utils import setup_logger, load_config
from src.dataset_inspector import inspect_all_datasets
from src.dataset_builder import build_and_save_training_dataset
from src.model_trainer import train_and_select_model
from src.evaluator import evaluate_and_generate_reports
from src.risk_mapper import generate_risk_maps

def main():
    logger = setup_logger("NEXZORA.Pipeline", log_file="outputs/pipeline_run.log")
    logger.info("=" * 70)
    logger.info("STARTING NEXZORA AI LANDSLIDE SUSCEPTIBILITY & RISK PIPELINE")
    logger.info("=" * 70)
    
    total_start = time.time()
    
    # 1. Load Configuration
    config_path = "config.yaml"
    logger.info(f"Loading configuration from {config_path}...")
    config = load_config(config_path)
    
    # 2. Dataset Inspection & Quality Audit
    logger.info("\n>>> STAGE 1: Dataset Inspection & Quality Audit")
    inspect_all_datasets(config)
    
    # 3. Feature Extraction & Dataset Building
    logger.info("\n>>> STAGE 2: Spatial Sampling & Feature Engineering")
    training_data_path = os.path.join(config["paths"]["outputs_dir"], "ner_landslide_training_data.csv")
    df_train = build_and_save_training_dataset(config)
    
    # 4. Model Training & Spatial Cross-Validation
    logger.info("\n>>> STAGE 3: AI Model Training & Spatial Block Cross-Validation")
    train_artifacts = train_and_select_model(df_train, config)
    
    # 5. Model Evaluation & Visualization
    logger.info("\n>>> STAGE 4: Model Evaluation & Metric Visualizations")
    evaluate_and_generate_reports(train_artifacts, config)
    
    # 6. Spatial Risk Mapping
    logger.info("\n>>> STAGE 5: Regional Risk Zonation & GeoTIFF Map Generation")
    generate_risk_maps(train_artifacts, config)
    
    total_elapsed = time.time() - total_start
    logger.info("=" * 70)
    logger.info(f"PIPELINE COMPLETED SUCCESSFULLY IN {total_elapsed:.2f} SECONDS!")
    logger.info("All generated reports, models, data, and maps are saved in: outputs/")
    logger.info("=" * 70)

if __name__ == "__main__":
    main()

import os
import joblib
import numpy as np
import pandas as pd
from sklearn.model_selection import GroupKFold, cross_validate
from sklearn.pipeline import Pipeline
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.preprocessing import StandardScaler, OneHotEncoder
from sklearn.ensemble import RandomForestClassifier, HistGradientBoostingClassifier
import xgboost as xgb
from src.utils import setup_logger, timing

logger = setup_logger("NEXZORA.ModelTrainer")

def build_preprocessing_pipeline(numeric_features, categorical_features):
    """
    Constructs a robust scikit-learn ColumnTransformer:
    - Numeric: Median imputation + Standard scaling
    - Categorical: Frequent imputation + One-Hot Encoding
    """
    numeric_transformer = Pipeline(steps=[
        ("imputer", SimpleImputer(strategy="median")),
        ("scaler", StandardScaler())
    ])
    
    categorical_transformer = Pipeline(steps=[
        ("imputer", SimpleImputer(strategy="most_frequent")),
        ("encoder", OneHotEncoder(handle_unknown="ignore", sparse_output=False))
    ])
    
    preprocessor = ColumnTransformer(
        transformers=[
            ("num", numeric_transformer, numeric_features),
            ("cat", categorical_transformer, categorical_features)
        ]
    )
    return preprocessor

@timing
def train_and_select_model(df, config):
    """
    Trains Baseline (RandomForest), Main (XGBoost), and Fallback (HistGradientBoosting)
    using Spatial Block Cross-Validation (GroupKFold), evaluates metrics, selects best model,
    and serializes artifacts.
    """
    outputs_dir = config["paths"]["outputs_dir"]
    models_dir = config["paths"]["models_dir"]
    os.makedirs(outputs_dir, exist_ok=True)
    os.makedirs(models_dir, exist_ok=True)
    
    # Define features and target
    target_col = "landslide_label"
    group_col = "spatial_block_id"
    leakage_cols = ["sample_id", "latitude", "longitude", "date", target_col, group_col]
    
    feature_cols = [c for c in df.columns if c not in leakage_cols]
    
    categorical_cols = [c for c in ["lulc_class", "geology_class"] if c in feature_cols]
    numeric_cols = [c for c in feature_cols if c not in categorical_cols]
    
    logger.info(f"Features: {len(numeric_cols)} numeric, {len(categorical_cols)} categorical.")
    logger.info(f"Numeric features: {numeric_cols}")
    logger.info(f"Categorical features: {categorical_cols}")
    
    X = df[feature_cols].copy()
    # Cast categorical columns to string for robust encoder handling
    for c in categorical_cols:
        X[c] = X[c].astype(str)
        
    y = df[target_col].values
    groups = df[group_col].values
    
    # Check class balance
    neg_count = (y == 0).sum()
    pos_count = (y == 1).sum()
    scale_weight = float(neg_count) / float(pos_count) if pos_count > 0 else 1.0
    logger.info(f"Class Distribution: Negative(0)={neg_count}, Positive(1)={pos_count} (scale_pos_weight={scale_weight:.2f})")
    
    # Preprocessor
    preprocessor = build_preprocessing_pipeline(numeric_cols, categorical_cols)
    
    # Fit preprocessor on full features
    preprocessor.fit(X)
    X_trans = preprocessor.transform(X)
    
    # Extract transformed feature names
    cat_encoder = preprocessor.named_transformers_["cat"].named_steps["encoder"]
    encoded_cat_names = list(cat_encoder.get_feature_names_out(categorical_cols))
    all_feature_names = numeric_cols + encoded_cat_names
    
    # Models dictionary
    models = {
        "RandomForest (Baseline)": RandomForestClassifier(
            n_estimators=150,
            max_depth=12,
            min_samples_split=6,
            class_weight="balanced",
            random_state=42,
            n_jobs=-1
        ),
        "XGBoost (Main Model)": xgb.XGBClassifier(
            n_estimators=180,
            max_depth=6,
            learning_rate=0.08,
            subsample=0.85,
            colsample_bytree=0.85,
            scale_pos_weight=scale_weight,
            random_state=42,
            eval_metric="logloss",
            n_jobs=-1
        ),
        "HistGradientBoosting (Fallback)": HistGradientBoostingClassifier(
            max_iter=150,
            max_depth=8,
            learning_rate=0.08,
            class_weight="balanced",
            random_state=42
        )
    }
    
    # Spatial Block Cross Validation
    gkf = GroupKFold(n_splits=config["models"].get("cv_splits", 5))
    scoring = ["roc_auc", "recall", "precision", "f1", "accuracy"]
    
    cv_results_summary = {}
    best_model_name = None
    best_roc_auc = -1.0
    best_model_obj = None
    
    logger.info("Executing Spatial Block Cross-Validation (5-Fold GroupKFold on 50km spatial blocks)...")
    for name, clf in models.items():
        logger.info(f"Evaluating {name}...")
        scores = cross_validate(clf, X_trans, y, groups=groups, cv=gkf, scoring=scoring, n_jobs=-1)
        
        mean_auc = float(np.mean(scores["test_roc_auc"]))
        mean_recall = float(np.mean(scores["test_recall"]))
        mean_prec = float(np.mean(scores["test_precision"]))
        mean_f1 = float(np.mean(scores["test_f1"]))
        mean_acc = float(np.mean(scores["test_accuracy"]))
        
        cv_results_summary[name] = {
            "ROC-AUC": mean_auc,
            "Recall": mean_recall,
            "Precision": mean_prec,
            "F1-Score": mean_f1,
            "Accuracy": mean_acc
        }
        logger.info(f"{name} -> Spatial CV ROC-AUC: {mean_auc:.4f} | Recall: {mean_recall:.4f} | F1: {mean_f1:.4f}")
        
        if mean_auc > best_roc_auc:
            best_roc_auc = mean_auc
            best_model_name = name
            best_model_obj = clf
            
    logger.info(f"Best model selected: {best_model_name} with Spatial CV ROC-AUC of {best_roc_auc:.4f}")
    
    # Train best model on complete dataset
    logger.info(f"Fitting {best_model_name} on the complete dataset...")
    best_model_obj.fit(X_trans, y)
    
    # Complete end-to-end inference pipeline
    full_pipeline = Pipeline(steps=[
        ("preprocessor", preprocessor),
        ("classifier", best_model_obj)
    ])
    
    # Save models to outputs/ and models/
    for folder in [outputs_dir, models_dir]:
        joblib.dump(best_model_obj, os.path.join(folder, "landslide_risk_model.joblib"))
        joblib.dump(preprocessor, os.path.join(folder, "preprocessing_pipeline.joblib"))
        joblib.dump(full_pipeline, os.path.join(folder, "full_inference_pipeline.joblib"))
        
    logger.info("Successfully serialized model and preprocessing pipeline artifacts.")
    
    return {
        "best_model_name": best_model_name,
        "best_model": best_model_obj,
        "preprocessor": preprocessor,
        "full_pipeline": full_pipeline,
        "feature_names": all_feature_names,
        "cv_results": cv_results_summary,
        "X_raw": X,
        "y": y,
        "groups": groups,
        "X_trans": X_trans
    }

if __name__ == "__main__":
    from src.utils import load_config
    from src.dataset_builder import build_and_save_training_dataset
    cfg = load_config()
    df_data = pd.read_csv("outputs/ner_landslide_training_data.csv") if os.path.exists("outputs/ner_landslide_training_data.csv") else build_and_save_training_dataset(cfg)
    res = train_and_select_model(df_data, cfg)
    print("CV Results:", res["cv_results"])

import os
import json
import numpy as np
import pandas as pd
import matplotlib
matplotlib.use("Agg")  # Non-interactive backend
import matplotlib.pyplot as plt
import seaborn as sns
from sklearn.metrics import (
    accuracy_score, precision_score, recall_score, f1_score,
    roc_auc_score, average_precision_score, confusion_matrix,
    classification_report, roc_curve, precision_recall_curve
)
from src.utils import setup_logger, timing

logger = setup_logger("NEXZORA.Evaluator")

@timing
def evaluate_and_generate_reports(train_artifacts, config):
    """
    Evaluates best model, computes metrics, generates curves, confusion matrix,
    feature importance table, and comprehensive model_evaluation.md and model_metadata.json.
    """
    outputs_dir = config["paths"]["outputs_dir"]
    os.makedirs(outputs_dir, exist_ok=True)
    
    best_model = train_artifacts["best_model"]
    best_model_name = train_artifacts["best_model_name"]
    X_trans = train_artifacts["X_trans"]
    y = train_artifacts["y"]
    feature_names = train_artifacts["feature_names"]
    cv_results = train_artifacts["cv_results"]
    
    # Generate predictions & probabilities
    y_pred = best_model.predict(X_trans)
    y_prob = best_model.predict_proba(X_trans)[:, 1]
    
    # Compute overall metrics
    acc = accuracy_score(y, y_pred)
    prec = precision_score(y, y_pred)
    rec = recall_score(y, y_pred)
    f1 = f1_score(y, y_pred)
    roc_auc = roc_auc_score(y, y_prob)
    pr_auc = average_precision_score(y, y_prob)
    cm = confusion_matrix(y, y_pred)
    clf_rep = classification_report(y, y_pred, target_names=["Stable (0)", "Landslide (1)"])
    
    tn, fp, fn, tp = cm.ravel()
    
    logger.info(f"Final Evaluation -> ROC-AUC: {roc_auc:.4f} | Recall: {rec:.4f} | Precision: {prec:.4f} | F1: {f1:.4f}")
    logger.info(f"Confusion Matrix: TP={tp}, FP={fp}, TN={tn}, FN={fn} (False Negatives: {fn})")
    
    # 1. Feature Importance
    logger.info("Computing feature importance...")
    if hasattr(best_model, "feature_importances_"):
        importances = best_model.feature_importances_
    else:
        importances = np.ones(len(feature_names)) / len(feature_names)
        
    feat_df = pd.DataFrame({
        "feature": feature_names,
        "importance": importances
    }).sort_values(by="importance", ascending=False).reset_index(drop=True)
    
    feat_path = os.path.join(outputs_dir, "feature_importance.csv")
    feat_df.to_csv(feat_path, index=False)
    logger.info(f"Saved feature importances to {feat_path}")
    
    # 2. Confusion Matrix Plot
    plt.figure(figsize=(7, 6))
    sns.heatmap(cm, annot=True, fmt="d", cmap="Blues", cbar=False,
                xticklabels=["Predicted Stable (0)", "Predicted Landslide (1)"],
                yticklabels=["Actual Stable (0)", "Actual Landslide (1)"])
    plt.title(f"Confusion Matrix — {best_model_name}\n(False Negatives: {fn:,})", fontsize=13, fontweight="bold")
    plt.ylabel("Ground Truth")
    plt.xlabel("Predicted Class")
    plt.tight_layout()
    cm_plot_path = os.path.join(outputs_dir, "confusion_matrix.png")
    plt.savefig(cm_plot_path, dpi=300)
    plt.close()
    
    # 3. ROC Curve Plot
    fpr, tpr, _ = roc_curve(y, y_prob)
    plt.figure(figsize=(7, 6))
    plt.plot(fpr, tpr, color="#1f77b4", lw=2.5, label=f"ROC Curve (AUC = {roc_auc:.3f})")
    plt.plot([0, 1], [0, 1], color="gray", lw=1.5, linestyle="--", label="Random Chance")
    plt.xlim([0.0, 1.0])
    plt.ylim([0.0, 1.05])
    plt.xlabel("False Positive Rate (1 - Specificity)", fontsize=11)
    plt.ylabel("True Positive Rate (Recall / Sensitivity)", fontsize=11)
    plt.title("Receiver Operating Characteristic (ROC)", fontsize=13, fontweight="bold")
    plt.legend(loc="lower right")
    plt.grid(alpha=0.3)
    plt.tight_layout()
    roc_plot_path = os.path.join(outputs_dir, "roc_curve.png")
    plt.savefig(roc_plot_path, dpi=300)
    plt.close()
    
    # 4. Precision-Recall Curve Plot
    precision_vals, recall_vals, _ = precision_recall_curve(y, y_prob)
    plt.figure(figsize=(7, 6))
    plt.plot(recall_vals, precision_vals, color="#2ca02c", lw=2.5, label=f"PR Curve (AP = {pr_auc:.3f})")
    plt.xlabel("Recall (Sensitivity)", fontsize=11)
    plt.ylabel("Precision (Positive Predictive Value)", fontsize=11)
    plt.title("Precision-Recall Curve", fontsize=13, fontweight="bold")
    plt.legend(loc="lower left")
    plt.grid(alpha=0.3)
    plt.tight_layout()
    pr_plot_path = os.path.join(outputs_dir, "precision_recall_curve.png")
    plt.savefig(pr_plot_path, dpi=300)
    plt.close()
    
    # 5. Model Metadata JSON
    metadata = {
        "model_name": best_model_name,
        "algorithm": str(best_model.__class__.__name__),
        "target": "landslide_label (0=Stable, 1=Landslide)",
        "study_area": "North Eastern Region (NER) of India",
        "projected_crs": config["study_area"]["projected_crs"],
        "spatial_validation": "5-Fold GroupKFold on 50km spatial blocks",
        "metrics": {
            "spatial_cv_roc_auc": cv_results[best_model_name]["ROC-AUC"],
            "spatial_cv_recall": cv_results[best_model_name]["Recall"],
            "spatial_cv_precision": cv_results[best_model_name]["Precision"],
            "spatial_cv_f1": cv_results[best_model_name]["F1-Score"],
            "overall_roc_auc": float(roc_auc),
            "overall_pr_auc": float(pr_auc),
            "overall_recall": float(rec),
            "overall_precision": float(prec),
            "overall_accuracy": float(acc),
            "confusion_matrix": {
                "true_positives": int(tp),
                "true_negatives": int(tn),
                "false_positives": int(fp),
                "false_negatives": int(fn)
            }
        },
        "risk_classes": {
            "1": "Low (0.00 to <0.25)",
            "2": "Medium (0.25 to <0.50)",
            "3": "High (0.50 to <0.75)",
            "4": "Very High (0.75 to 1.00)"
        },
        "operational_advisory": "Model is designed for regional spatial hazard prioritization and screening. Not certified as a standalone life-safety alert without ground-instrumented real-time piezometers."
    }
    
    meta_path = os.path.join(outputs_dir, "model_metadata.json")
    with open(meta_path, "w", encoding="utf-8") as f:
        json.dump(metadata, f, indent=2)
    logger.info(f"Saved model metadata to {meta_path}")
    
    # 6. Model Evaluation Markdown
    eval_md_path = os.path.join(outputs_dir, "model_evaluation.md")
    with open(eval_md_path, "w", encoding="utf-8") as f:
        f.write("# NEXZORA — AI Model Evaluation & Validation Report\n\n")
        f.write(f"**Selected Model:** {best_model_name}\n\n")
        
        f.write("## 1. Spatial Block Cross-Validation Benchmark (5-Fold GroupKFold, 50km Blocks)\n\n")
        f.write("To prevent spatial autocorrelation leakage, models were tuned and benchmarked on spatially disjoint 50km blocks.\n\n")
        f.write("| Model Architecture | Spatial ROC-AUC | Spatial Recall | Spatial Precision | Spatial F1-Score | Spatial Accuracy |\n")
        f.write("| :--- | :--- | :--- | :--- | :--- | :--- |\n")
        for m_name, res in cv_results.items():
            bold = "**" if m_name == best_model_name else ""
            f.write(f"| {bold}{m_name}{bold} | {bold}{res['ROC-AUC']:.4f}{bold} | {bold}{res['Recall']:.4f}{bold} | {bold}{res['Precision']:.4f}{bold} | {bold}{res['F1-Score']:.4f}{bold} | {bold}{res['Accuracy']:.4f}{bold} |\n")
            
        f.write("\n\n## 2. Overall Performance Metrics\n\n")
        f.write(f"- **ROC-AUC:** {roc_auc:.4f}\n")
        f.write(f"- **PR-AUC (Average Precision):** {pr_auc:.4f}\n")
        f.write(f"- **Sensitivity / Recall:** {rec:.4f} ({tp:,} of {tp+fn:,} historical landslides detected)\n")
        f.write(f"- **Precision:** {prec:.4f}\n")
        f.write(f"- **F1-Score:** {f1:.4f}\n")
        f.write(f"- **Accuracy:** {acc:.4f}\n\n")
        
        f.write("## 3. Confusion Matrix & False Negative Analysis\n\n")
        f.write("```\n")
        f.write(f"                    Predicted Stable (0)    Predicted Landslide (1)\n")
        f.write(f"Actual Stable (0)        {tn:8d} (TN)            {fp:8d} (FP)\n")
        f.write(f"Actual Landslide (1)     {fn:8d} (FN)            {tp:8d} (TP)\n")
        f.write("```\n\n")
        
        f.write("> [!WARNING]\n")
        f.write(f"> **Early Warning Life-Safety Alert:**\n")
        f.write(f"> The model recorded **{fn:,} False Negatives** (historical landslides classified as stable). ")
        f.write("In early-warning systems, false negatives can be catastrophic because missed alerts may lead to loss of life. ")
        f.write("A lower classification decision threshold (e.g. 0.35) can be calibrated in operational settings to maximize recall over precision.\n\n")
        
        f.write("## 4. Top 10 Predictive Drivers (Feature Importance)\n\n")
        f.write("| Rank | Feature Name | Importance Score | Domain Factor |\n")
        f.write("| :--- | :--- | :--- | :--- |\n")
        for i, row in feat_df.head(10).iterrows():
            f.write(f"| {i+1} | `{row['feature']}` | {row['importance']:.4f} | Geotechnical / Geospatial |\n")
            
        f.write("\n\n## 5. Classification Report\n\n")
        f.write(f"```\n{clf_rep}\n```\n")
        
    logger.info(f"Saved evaluation markdown report to {eval_md_path}")
    return metadata

if __name__ == "__main__":
    from src.utils import load_config
    cfg = load_config()
    print("Evaluator ready.")

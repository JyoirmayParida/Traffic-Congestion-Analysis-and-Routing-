"""
train_xgboost.py — XGBoost regressor for congestion delay prediction.

Steps:
  1. Load ml/data/traffic_dataset.csv
  2. Z-score normalise all continuous features
  3. Save norm_params.json to ml/serving/
  4. 5-fold cross-validated GridSearchCV over XGBoost hyperparameters
  5. Evaluate: MAE, RMSE, R², MAE split by peak vs off-peak, monsoon vs dry
  6. Save best model as ml/serving/traffic_model.json (XGBoost native format)

Usage:
  python ml/training/train_xgboost.py

Imports: xgboost, numpy, pandas, sklearn, json only.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import xgboost as xgb
from sklearn.model_selection import GridSearchCV, KFold, train_test_split
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score

# ---------------------------------------------------------------------------
# Paths (resolved relative to this file → repo root)
# ---------------------------------------------------------------------------
_THIS_DIR   = Path(__file__).parent
_REPO_ROOT  = _THIS_DIR.parent.parent
_DATA_PATH  = _REPO_ROOT / "ml" / "data"  / "traffic_dataset.csv"
_SERVING    = _REPO_ROOT / "ml" / "serving"
_MODEL_PATH = _SERVING / "traffic_model.json"
_NORM_PATH  = _SERVING / "norm_params.json"

# INV-4: MUST match predictor.py FEATURE_NAMES exactly and in same order
FEATURE_NAMES = [
    "vehicle_count",       # [0]
    "queue_length",        # [1]
    "traffic_density",     # [2]
    "avg_speed",           # [3]
    "waiting_time",        # [4]
    "green_signal_ratio",  # [5]
    "monsoon_active",      # [6]
    "peak_hour",           # [7]
]
TARGET = "congestion_delay_sec"

# Features that are boolean — we normalise them but keep them as float
BOOL_FEATURES = {"monsoon_active", "peak_hour"}


# ---------------------------------------------------------------------------
# 1. Load data
# ---------------------------------------------------------------------------

def load_data() -> pd.DataFrame:
    if not _DATA_PATH.exists():
        print(f"ERROR: Dataset not found at {_DATA_PATH}")
        print("Run  python ml/data/data_generator.py  first.")
        sys.exit(1)
    df = pd.read_csv(_DATA_PATH)
    print(f"Loaded {len(df):,} rows from {_DATA_PATH.resolve()}")
    # Validate columns
    missing = [c for c in FEATURE_NAMES + [TARGET] if c not in df.columns]
    if missing:
        print(f"ERROR: Missing columns in dataset: {missing}")
        sys.exit(1)
    return df


# ---------------------------------------------------------------------------
# 2. Z-score normalisation
# ---------------------------------------------------------------------------

def compute_norm_params(df: pd.DataFrame) -> dict:
    """Compute mean and std for each feature column."""
    params = {}
    for feat in FEATURE_NAMES:
        params[feat] = {
            "mean": float(df[feat].mean()),
            "std":  float(df[feat].std(ddof=0)),
        }
    return params


def apply_normalisation(df: pd.DataFrame, params: dict) -> pd.DataFrame:
    """Return a copy of df with features z-score normalised."""
    df_norm = df.copy()
    for feat in FEATURE_NAMES:
        mean = params[feat]["mean"]
        std  = params[feat]["std"]
        if std > 0:
            df_norm[feat] = (df_norm[feat] - mean) / std
        else:
            df_norm[feat] = 0.0
    return df_norm


# ---------------------------------------------------------------------------
# 3. Save norm params
# ---------------------------------------------------------------------------

def save_norm_params(params: dict) -> None:
    _SERVING.mkdir(parents=True, exist_ok=True)
    with open(_NORM_PATH, "w", encoding="utf-8") as fh:
        json.dump(params, fh, indent=2)
    print(f"✅ Norm params saved → {_NORM_PATH.resolve()}")


# ---------------------------------------------------------------------------
# 4. GridSearchCV training
# ---------------------------------------------------------------------------

PARAM_GRID = {
    "n_estimators":  [100, 200],
    "max_depth":     [3, 5],
    "learning_rate": [0.05, 0.1],
}

# Fixed XGBoost settings not in the grid
FIXED_PARAMS = {
    "objective":        "reg:squarederror",
    "eval_metric":      "mae",
    "subsample":        0.8,
    "colsample_bytree": 0.8,
    "min_child_weight": 3,
    "random_state":     42,
    "n_jobs":           -1,
    "tree_method":      "hist",  # fast for CPU
}


def search_best_model(X_train: np.ndarray, y_train: np.ndarray):
    """5-fold CV GridSearchCV, scoring on negative MAE."""
    print("\nRunning 5-fold GridSearchCV …")
    print(f"  Grid: {PARAM_GRID}")
    estimator = xgb.XGBRegressor(**FIXED_PARAMS)
    cv = KFold(n_splits=5, shuffle=True, random_state=42)
    gs = GridSearchCV(
        estimator=estimator,
        param_grid=PARAM_GRID,
        cv=cv,
        scoring="neg_mean_absolute_error",
        refit=True,
        verbose=1,
        n_jobs=-1,
    )
    gs.fit(X_train, y_train)
    print(f"\n  Best params : {gs.best_params_}")
    print(f"  Best CV MAE : {-gs.best_score_:.4f} s")
    return gs.best_estimator_


# ---------------------------------------------------------------------------
# 5. Evaluation
# ---------------------------------------------------------------------------

def evaluate(
    model,
    X_test: np.ndarray,
    y_test: np.ndarray,
    test_df: pd.DataFrame,
) -> None:
    preds = model.predict(X_test)

    mae  = mean_absolute_error(y_test, preds)
    rmse = np.sqrt(mean_squared_error(y_test, preds))
    r2   = r2_score(y_test, preds)

    print("\n" + "=" * 55)
    print("📊 Test-set metrics")
    print("=" * 55)
    print(f"  MAE  : {mae:.4f} s")
    print(f"  RMSE : {rmse:.4f} s")
    print(f"  R²   : {r2:.6f}")

    # Split by peak hour
    peak_idx  = test_df["peak_hour"] == 1
    offpeak_idx = ~peak_idx
    if peak_idx.any():
        mae_peak    = mean_absolute_error(y_test[peak_idx],    preds[peak_idx])
        mae_offpeak = mean_absolute_error(y_test[offpeak_idx], preds[offpeak_idx])
        print(f"\n  MAE (peak_hour=1)  : {mae_peak:.4f} s  (n={peak_idx.sum()})")
        print(f"  MAE (peak_hour=0)  : {mae_offpeak:.4f} s  (n={offpeak_idx.sum()})")

    # Split by monsoon
    mo_idx  = test_df["monsoon_active"] == 1
    dry_idx = ~mo_idx
    if mo_idx.any():
        mae_mo  = mean_absolute_error(y_test[mo_idx],  preds[mo_idx])
        mae_dry = mean_absolute_error(y_test[dry_idx], preds[dry_idx])
        print(f"\n  MAE (monsoon=1)    : {mae_mo:.4f} s  (n={mo_idx.sum()})")
        print(f"  MAE (monsoon=0)    : {mae_dry:.4f} s  (n={dry_idx.sum()})")

    print("=" * 55)


# ---------------------------------------------------------------------------
# 6. Save model
# ---------------------------------------------------------------------------

def save_model(model) -> None:
    """
    Save via booster.save_model() — XGBoost native JSON format.
    NEVER use pickle or joblib (risk of version incompatibility).
    """
    _SERVING.mkdir(parents=True, exist_ok=True)
    booster: xgb.Booster = model.get_booster()
    booster.save_model(str(_MODEL_PATH))
    print(f"✅ Model saved → {_MODEL_PATH.resolve()}")

    # Sanity-check: reload and predict one row
    check = xgb.Booster()
    check.load_model(str(_MODEL_PATH))
    dummy = np.zeros((1, len(FEATURE_NAMES)), dtype=np.float32)
    dm    = xgb.DMatrix(dummy, feature_names=FEATURE_NAMES)
    pred_val = check.predict(dm)[0]
    print(f"   Reload sanity-check (all-zero input → {pred_val:.4f}s) ✓")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    print("=" * 55)
    print("  XGBoost Training — Traffic Congestion Delay")
    print("=" * 55)

    # 1. Load
    df = load_data()

    # 2. Compute and apply normalisation on FULL dataset to capture true stats
    norm_params = compute_norm_params(df)

    # 3. Save norm params before train/test split
    save_norm_params(norm_params)

    df_norm = apply_normalisation(df, norm_params)

    # Train/test split (80/20, stratification not needed for regression)
    X = df_norm[FEATURE_NAMES].values.astype(np.float32)
    y = df_norm[TARGET].values.astype(np.float32)

    X_train, X_test, y_train, y_test, idx_train, idx_test = train_test_split(
        X, y, np.arange(len(df)),
        test_size=0.20, random_state=42
    )
    test_df_raw = df.iloc[idx_test].reset_index(drop=True)

    print(f"\n  Train rows : {len(X_train):,}")
    print(f"  Test rows  : {len(X_test):,}")

    # 4. GridSearchCV
    best_model = search_best_model(X_train, y_train)

    # 5. Evaluate
    evaluate(best_model, X_test, y_test, test_df_raw)

    # 6. Save
    save_model(best_model)

    print("\n✅ Training complete.\n")


if __name__ == "__main__":
    main()

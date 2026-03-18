"""
predictor.py — ML inference module.

Model is loaded ONCE at module import time, never per request (INV-4).
MODEL_BACKEND env var: 'xgboost_json' | 'onnx'
"""

from __future__ import annotations

import json
import logging
import os
import time
from pathlib import Path
from typing import Optional

import numpy as np
from fastapi import HTTPException

from models import CongestionLevel, FeatureImportance, FeatureVector, PredictResponse

# ---------------------------------------------------------------------------
# Structured JSON logger
# ---------------------------------------------------------------------------
logging.basicConfig(
    format='{"time": "%(asctime)s", "level": "%(levelname)s", "logger": "%(name)s", "message": "%(message)s"}',
    level=logging.INFO,
)
logger = logging.getLogger("predictor")

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
_BASE = Path(__file__).parent.parent
_SERVING_DIR = _BASE / "ml" / "serving"
_MODEL_JSON = _SERVING_DIR / "traffic_model.json"
_MODEL_ONNX = _SERVING_DIR / "traffic_model.onnx"
_NORM_PARAMS = _SERVING_DIR / "norm_params.json"

# INV-4: feature order is FIXED and must match training order exactly.
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

# ---------------------------------------------------------------------------
# Normalisation parameters
# ---------------------------------------------------------------------------

def _load_norm_params() -> dict:
    if not _NORM_PARAMS.exists():
        logger.warning("norm_params.json not found — inference will use raw feature values.")
        return {}
    with open(_NORM_PARAMS, "r", encoding="utf-8") as fh:
        return json.load(fh)


_NORM: dict = _load_norm_params()

# ---------------------------------------------------------------------------
# Model loading (once at import)
# ---------------------------------------------------------------------------

_MODEL_BACKEND: str = os.getenv("MODEL_BACKEND", "xgboost_json").strip().lower()
_model = None          # xgboost.Booster or onnxruntime.InferenceSession
_MODEL_VERSION: str = "unknown"
_FEATURE_IMPORTANCES: dict[str, float] = {}  # name → score


def _load_xgboost_model():
    global _model, _MODEL_VERSION, _FEATURE_IMPORTANCES
    try:
        import xgboost as xgb  # type: ignore
    except ImportError as exc:
        raise RuntimeError("xgboost package not installed.") from exc

    if not _MODEL_JSON.exists():
        raise FileNotFoundError(f"XGBoost model not found at {_MODEL_JSON}")

    booster = xgb.Booster()
    booster.load_model(str(_MODEL_JSON))
    _model = booster
    _MODEL_VERSION = f"xgboost:{_MODEL_JSON.stat().st_mtime:.0f}"

    # Pre-compute importance scores (F-score normalised)
    raw_scores: dict = booster.get_score(importance_type="gain")
    total = sum(raw_scores.values()) or 1.0
    _FEATURE_IMPORTANCES = {k: v / total for k, v in raw_scores.items()}
    logger.info(f"XGBoost model loaded from {_MODEL_JSON}")


def _load_onnx_model():
    global _model, _MODEL_VERSION, _FEATURE_IMPORTANCES
    try:
        import onnxruntime as ort  # type: ignore
    except ImportError as exc:
        raise RuntimeError("onnxruntime package not installed.") from exc

    if not _MODEL_ONNX.exists():
        raise FileNotFoundError(f"ONNX model not found at {_MODEL_ONNX}")

    sess_options = ort.SessionOptions()
    sess_options.log_severity_level = 3  # suppress verbose ONNX logs
    session = ort.InferenceSession(str(_MODEL_ONNX), sess_options=sess_options)
    _model = session
    _MODEL_VERSION = f"onnx:{_MODEL_ONNX.stat().st_mtime:.0f}"
    # ONNX has no native feature importance — use equal weights
    _FEATURE_IMPORTANCES = {name: 1.0 / len(FEATURE_NAMES) for name in FEATURE_NAMES}
    logger.info(f"ONNX model loaded from {_MODEL_ONNX}")


# ---------------------------------------------------------------------------
# Perform loading at import
# ---------------------------------------------------------------------------
try:
    if _MODEL_BACKEND == "onnx":
        _load_onnx_model()
    else:
        _load_xgboost_model()
except FileNotFoundError as _e:
    logger.error(f"Model file missing: {_e}. /predict will return HTTP 503.")
    _model = None
    _MODEL_VERSION = "not_loaded"
except Exception as _e:
    logger.error(f"Unexpected error loading model: {_e}")
    _model = None
    _MODEL_VERSION = "error"

# ---------------------------------------------------------------------------
# Feature assembly & normalisation
# ---------------------------------------------------------------------------

def assemble_feature_vector(features: FeatureVector) -> np.ndarray:
    """
    Build a 1-D numpy float32 array from FeatureVector in EXACT INV-4 order.
    Applies z-score normalisation using norm_params.json when available.
    bool fields (monsoon_active, peak_hour) are cast to float before use.
    """
    raw: list = features.to_ordered_list()  # already in INV-4 order

    if len(raw) != len(FEATURE_NAMES):
        raise HTTPException(
            status_code=400,
            detail=f"Feature vector length {len(raw)} != expected {len(FEATURE_NAMES)}.",
        )

    normalised = []
    for i, name in enumerate(FEATURE_NAMES):
        val = float(raw[i])
        if _NORM and name in _NORM:
            mean = _NORM[name]["mean"]
            std = _NORM[name]["std"]
            if std > 0:
                val = (val - mean) / std
        normalised.append(val)

    return np.array(normalised, dtype=np.float32)

# ---------------------------------------------------------------------------
# Congestion threshold helper (thresholds from spec)
# ---------------------------------------------------------------------------

def _delay_to_level(delay_sec: float) -> CongestionLevel:
    if delay_sec < 60:
        return CongestionLevel.LOW
    if delay_sec < 180:
        return CongestionLevel.MODERATE
    if delay_sec < 300:
        return CongestionLevel.HIGH
    return CongestionLevel.SEVERE

# ---------------------------------------------------------------------------
# Top factors
# ---------------------------------------------------------------------------

def _top_factors(n: int = 3) -> list[FeatureImportance]:
    sorted_feats = sorted(_FEATURE_IMPORTANCES.items(), key=lambda x: x[1], reverse=True)
    result = []
    for feat_key, score in sorted_feats[:n]:
        # XGBoost importance keys can be 'f0', 'f1', ... — map back to names
        if feat_key.startswith("f") and feat_key[1:].isdigit():
            idx = int(feat_key[1:])
            name = FEATURE_NAMES[idx] if idx < len(FEATURE_NAMES) else feat_key
        else:
            name = feat_key
        result.append(FeatureImportance(feature_name=name, importance_score=round(score, 6)))
    return result

# ---------------------------------------------------------------------------
# Main prediction entry point
# ---------------------------------------------------------------------------

def predict_delay(junction_id: str, features: FeatureVector) -> PredictResponse:
    """
    Assemble + normalise features, run inference, return PredictResponse.
    Raises HTTP 503 if model is not loaded.
    Raises HTTP 400 if feature vector has wrong length.
    Logs inference time as structured JSON.
    """
    if _model is None:
        raise HTTPException(
            status_code=503,
            detail="ML model is not loaded. Check MODEL_BACKEND and model file path.",
        )

    vector = assemble_feature_vector(features)

    t0 = time.perf_counter()

    if _MODEL_BACKEND == "onnx":
        import onnxruntime as ort  # type: ignore
        input_name = _model.get_inputs()[0].name
        output = _model.run(None, {input_name: vector.reshape(1, -1)})
        delay_sec = float(output[0][0])
    else:
        import xgboost as xgb  # type: ignore
        dmatrix = xgb.DMatrix(vector.reshape(1, -1), feature_names=FEATURE_NAMES)
        delay_sec = float(_model.predict(dmatrix)[0])

    inference_ms = (time.perf_counter() - t0) * 1000.0
    delay_sec = max(0.0, delay_sec)  # clamp negatives

    level = _delay_to_level(delay_sec)

    # Structured log
    logger.info(
        json.dumps({
            "event": "inference",
            "junction_id": junction_id,
            "predicted_delay_sec": round(delay_sec, 2),
            "congestion_level": level.value,
            "inference_ms": round(inference_ms, 3),
            "model_version": _MODEL_VERSION,
        })
    )

    return PredictResponse(
        junction_id=junction_id,
        predicted_delay_sec=round(delay_sec, 3),
        congestion_level=level,
        top_factors=_top_factors(3),
        inference_ms=round(inference_ms, 3),
        model_version=_MODEL_VERSION,
    )


def get_model_version() -> str:
    return _MODEL_VERSION

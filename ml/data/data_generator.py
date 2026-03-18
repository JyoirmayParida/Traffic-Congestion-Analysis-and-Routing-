"""
data_generator.py — Generates 8000 rows of synthetic Indian urban traffic data.

Feature vector is in EXACT INV-4 order:
  [0] vehicle_count        int    0-1000
  [1] queue_length         float  metres
  [2] traffic_density      float  vehicles/km
  [3] avg_speed            float  km/h
  [4] waiting_time         float  seconds
  [5] green_signal_ratio   float  0.0-1.0
  [6] monsoon_active       int    0|1
  [7] peak_hour            int    0|1

Target: congestion_delay_sec (float)

Usage:
  python ml/data/data_generator.py
Output:
  ml/data/traffic_dataset.csv
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

import numpy as np
import pandas as pd

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
N_ROWS = 8_000
SEED = 42
rng = np.random.default_rng(SEED)

# Probability of monsoon-season row
P_MONSOON = 0.28

# IST peak-hour probability (morning 8-10, evening 17-20 → ~5 hrs / 24 hrs)
P_PEAK = 5.0 / 24.0

# Output path (relative to repo root, resolved from this file's location)
_THIS_DIR = Path(__file__).parent
_OUTPUT_PATH = _THIS_DIR / "traffic_dataset.csv"


# ---------------------------------------------------------------------------
# Sampling helpers
# ---------------------------------------------------------------------------

def _uniform(lo: float, hi: float, n: int) -> np.ndarray:
    return rng.uniform(lo, hi, n)


def _jitter(arr: np.ndarray, pct: float = 0.08) -> np.ndarray:
    """Add ±pct uniform noise."""
    return arr * rng.uniform(1 - pct, 1 + pct, len(arr))


# ---------------------------------------------------------------------------
# Generate
# ---------------------------------------------------------------------------

def generate_dataset(n: int = N_ROWS) -> pd.DataFrame:
    """
    Produce a DataFrame with 8 feature columns + target.
    Realistic Indian urban junction traffic ranges.
    """
    # Boolean flags
    monsoon_active = (rng.random(n) < P_MONSOON).astype(int)
    peak_hour      = (rng.random(n) < P_PEAK).astype(int)

    # Base feature sampling — realistic Indian urban ranges
    vehicle_count     = _uniform(20,  500,  n)
    queue_length      = _uniform(50,  800,  n)
    traffic_density   = _uniform(10,  300,  n)
    avg_speed         = _uniform(5,   60,   n)
    waiting_time      = _uniform(30,  600,  n)
    green_signal_ratio= _uniform(0.2, 0.9,  n)

    # Peak-hour multipliers
    ph = peak_hour.astype(float)
    vehicle_count   += ph * vehicle_count  * 0.6   # *1.6
    waiting_time    += ph * waiting_time   * 0.7   # *1.7
    queue_length    += ph * queue_length   * 0.8   # *1.8
    traffic_density += ph * traffic_density* 0.5   # *1.5
    avg_speed       *= (1 - ph * 0.4)              # *0.6 when peak
    green_signal_ratio *= (1 - ph * 0.25)          # *0.75 when peak

    # Monsoon multipliers
    mo = monsoon_active.astype(float)
    avg_speed       *= (1 - mo * 0.35)             # *0.65 when monsoon
    queue_length    += mo * queue_length * 0.4     # *1.4
    traffic_density += mo * traffic_density * 0.3  # *1.3

    # Add ±8% noise to all continuous values
    vehicle_count      = _jitter(vehicle_count)
    queue_length       = _jitter(queue_length)
    traffic_density    = _jitter(traffic_density)
    avg_speed          = _jitter(avg_speed)
    waiting_time       = _jitter(waiting_time)
    green_signal_ratio = _jitter(green_signal_ratio, pct=0.05)

    # Clamp to valid ranges
    vehicle_count      = np.clip(np.round(vehicle_count).astype(int), 0, 1000)
    queue_length       = np.clip(queue_length, 0.0, 1000.0).round(2)
    traffic_density    = np.clip(traffic_density, 0.0, 500.0).round(2)
    avg_speed          = np.clip(avg_speed, 5.0, 80.0).round(2)
    waiting_time       = np.clip(waiting_time, 0.0, 600.0).round(2)
    green_signal_ratio = np.clip(green_signal_ratio, 0.10, 1.0).round(4)

    # ---------------------------------------------------------------------------
    # Compute congestion_delay_sec
    # Realistic weighted formula capturing interactions between features.
    # Range roughly 15–400 seconds with added Gaussian noise.
    # ---------------------------------------------------------------------------
    # Core delay drivers
    delay = (
          0.12 * vehicle_count             # more vehicles → more delay
        + 0.08 * queue_length              # longer queues → more delay
        + 0.18 * traffic_density           # density is a strong driver
        - 1.20 * avg_speed                 # higher speed → less delay
        + 0.25 * waiting_time              # direct waiting component
        - 30.0 * green_signal_ratio        # more green → less delay
        + 40.0 * monsoon_active.astype(float)   # monsoon adds ~40s base
        + 35.0 * peak_hour.astype(float)        # peak hour adds ~35s base
    )

    # Interaction terms
    delay += (0.002 * vehicle_count * (1.0 - green_signal_ratio))
    delay += (0.001 * queue_length  * traffic_density / (avg_speed + 1.0))

    # Gaussian noise (std=15s simulates real-world variability)
    noise = rng.normal(0, 15, n)
    delay = delay + noise

    # Clamp target to realistic range [15, 400]
    delay = np.clip(delay, 15.0, 400.0).round(3)

    # ---------------------------------------------------------------------------
    # Build DataFrame in EXACT INV-4 column order
    # ---------------------------------------------------------------------------
    df = pd.DataFrame({
        "vehicle_count":      vehicle_count,
        "queue_length":       queue_length,
        "traffic_density":    traffic_density,
        "avg_speed":          avg_speed,
        "waiting_time":       waiting_time,
        "green_signal_ratio": green_signal_ratio,
        "monsoon_active":     monsoon_active,
        "peak_hour":          peak_hour,
        "congestion_delay_sec": delay,
    })

    return df


# ---------------------------------------------------------------------------
# Summary printer
# ---------------------------------------------------------------------------

def print_summary(df: pd.DataFrame) -> None:
    print("\n" + "=" * 60)
    print(f"Dataset generated: {len(df):,} rows × {len(df.columns)} columns")
    print("=" * 60)

    print("\n📊 Feature statistics:")
    print(df.drop(columns=["congestion_delay_sec"]).describe().round(2).to_string())

    print("\n🎯 Target — congestion_delay_sec:")
    tgt = df["congestion_delay_sec"]
    print(f"  min={tgt.min():.1f}  max={tgt.max():.1f}  "
          f"mean={tgt.mean():.1f}  std={tgt.std():.1f}")

    print("\n📅 Class distribution:")
    print(f"  peak_hour=1     : {df['peak_hour'].sum():>5} rows  "
          f"({df['peak_hour'].mean()*100:.1f}%)")
    print(f"  monsoon_active=1: {df['monsoon_active'].sum():>5} rows  "
          f"({df['monsoon_active'].mean()*100:.1f}%)")

    # Congestion buckets
    low      = (tgt < 60).sum()
    moderate = ((tgt >= 60)  & (tgt < 180)).sum()
    high     = ((tgt >= 180) & (tgt < 300)).sum()
    severe   = (tgt >= 300).sum()
    print("\n🚦 Congestion level distribution:")
    print(f"  LOW(<60s)      : {low:>5}  ({low/len(df)*100:.1f}%)")
    print(f"  MODERATE(60-180): {moderate:>4}  ({moderate/len(df)*100:.1f}%)")
    print(f"  HIGH(180-300)  : {high:>5}  ({high/len(df)*100:.1f}%)")
    print(f"  SEVERE(>300)   : {severe:>5}  ({severe/len(df)*100:.1f}%)")
    print("=" * 60 + "\n")


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main() -> None:
    print(f"Generating {N_ROWS:,} rows of Indian urban traffic data …")
    df = generate_dataset(N_ROWS)

    _OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(_OUTPUT_PATH, index=False)
    print(f"✅ Saved → {_OUTPUT_PATH.resolve()}")
    print_summary(df)


if __name__ == "__main__":
    main()

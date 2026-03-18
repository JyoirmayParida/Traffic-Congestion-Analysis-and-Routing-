"""
scheduler.py — APScheduler background job that refreshes junction traffic data.

Runs every SCHEDULER_INTERVAL_SEC seconds (default 30).
Generates realistic synthetic traffic features, runs ML inference,
writes Firestore snapshots, and invalidates the route cache.

IST timezone is used throughout (Asia/Kolkata, UTC+5:30).
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import random
import time
from datetime import datetime
from typing import Any

import numpy as np
import pytz
from apscheduler.schedulers.asyncio import AsyncIOScheduler

import firestore_client
import predictor
from cache import route_cache
from models import CongestionLevel, FeatureVector

logger = logging.getLogger("scheduler")

IST = pytz.timezone("Asia/Kolkata")

# ---------------------------------------------------------------------------
# Time helpers
# ---------------------------------------------------------------------------

def get_current_peak_hour() -> bool:
    """True during IST morning peak (08:00–10:00) or evening peak (17:00–20:00)."""
    now_ist = datetime.now(IST)
    hour = now_ist.hour
    return (8 <= hour < 10) or (17 <= hour < 20)


def get_current_monsoon_active() -> bool:
    """True during Indian monsoon months (June–September, months 6–9)."""
    now_ist = datetime.now(IST)
    return now_ist.month in (6, 7, 8, 9)


# ---------------------------------------------------------------------------
# Realistic feature generator
# ---------------------------------------------------------------------------

# Base ranges per city tier
_TIER_BASES: dict[str, dict[str, tuple]] = {
    "metro": {
        "vehicle_count": (200, 500),
        "queue_length": (300, 800),
        "traffic_density": (80, 250),
        "avg_speed": (8, 25),
        "waiting_time": (90, 400),
        "green_signal_ratio": (0.25, 0.65),
    },
    "tier1": {
        "vehicle_count": (100, 300),
        "queue_length": (150, 500),
        "traffic_density": (40, 150),
        "avg_speed": (12, 40),
        "waiting_time": (60, 300),
        "green_signal_ratio": (0.30, 0.70),
    },
    "tier2": {
        "vehicle_count": (40, 150),
        "queue_length": (60, 250),
        "traffic_density": (15, 80),
        "avg_speed": (20, 55),
        "waiting_time": (30, 180),
        "green_signal_ratio": (0.35, 0.80),
    },
}


def generate_realistic_features(
    junction: dict[str, Any],
    peak_hour: bool,
    monsoon: bool,
) -> dict[str, Any]:
    """
    Produce a plausible feature dict for a junction.

    Applies peak-hour and monsoon multipliers, then adds ±10% random noise.
    All values are clamped to safe ranges after transformation.
    Returns a plain dict ready to be passed to FeatureVector(**features).
    """
    tier = junction.get("tier", "tier1")
    if tier not in _TIER_BASES:
        tier = "tier1"
    bases = _TIER_BASES[tier]

    def sample(key: str) -> float:
        lo, hi = bases[key]
        return float(random.uniform(lo, hi))

    vehicle_count = sample("vehicle_count")
    queue_length = sample("queue_length")
    traffic_density = sample("traffic_density")
    avg_speed = sample("avg_speed")
    waiting_time = sample("waiting_time")
    green_signal_ratio = sample("green_signal_ratio")

    # Peak hour multipliers
    if peak_hour:
        vehicle_count *= 1.6
        queue_length *= 1.8
        waiting_time *= 1.7
        traffic_density *= 1.5
        avg_speed *= 0.6
        green_signal_ratio *= 0.75

    # Monsoon multipliers
    if monsoon:
        avg_speed *= 0.65
        queue_length *= 1.4
        traffic_density *= 1.3

    # ±10% uniform noise on all continuous values
    def jitter(val: float) -> float:
        return val * random.uniform(0.90, 1.10)

    vehicle_count = jitter(vehicle_count)
    queue_length = jitter(queue_length)
    traffic_density = jitter(traffic_density)
    avg_speed = jitter(avg_speed)
    waiting_time = jitter(waiting_time)
    green_signal_ratio = jitter(green_signal_ratio)

    # Clamp to valid ranges
    vehicle_count = int(np.clip(round(vehicle_count), 0, 1000))
    queue_length = float(np.clip(queue_length, 0.0, 1000.0))
    traffic_density = float(np.clip(traffic_density, 0.0, 500.0))
    avg_speed = float(np.clip(avg_speed, 5.0, 80.0))
    waiting_time = float(np.clip(waiting_time, 0.0, 600.0))
    green_signal_ratio = float(np.clip(green_signal_ratio, 0.10, 1.0))

    return {
        "vehicle_count": vehicle_count,
        "queue_length": round(queue_length, 2),
        "traffic_density": round(traffic_density, 2),
        "avg_speed": round(avg_speed, 2),
        "waiting_time": round(waiting_time, 2),
        "green_signal_ratio": round(green_signal_ratio, 4),
        "monsoon_active": int(monsoon),
        "peak_hour": int(peak_hour),
    }


# ---------------------------------------------------------------------------
# Per-junction update coroutine
# ---------------------------------------------------------------------------

async def _update_single_junction(
    junction: dict[str, Any],
    peak_hour: bool,
    monsoon: bool,
    semaphore: asyncio.Semaphore,
) -> tuple[str, float, str]:
    """
    Generate features, predict delay, write snapshot.
    Returns (junction_id, predicted_delay_sec, congestion_level).
    Falls back to delay=0.0 on timeout or prediction error.
    """
    junction_id: str = junction.get("junction_id", "unknown")

    async with semaphore:
        try:
            features_dict = generate_realistic_features(junction, peak_hour, monsoon)
            fv = FeatureVector(**features_dict)

            # Enforce 800 ms timeout per junction
            loop = asyncio.get_event_loop()
            predict_task = loop.run_in_executor(
                None, predictor.predict_delay, junction_id, fv
            )
            result = await asyncio.wait_for(predict_task, timeout=0.8)

            delay_sec = result.predicted_delay_sec
            level = result.congestion_level.value

            # Write Firestore snapshot (sync call — acceptable at low rate)
            firestore_client.write_traffic_snapshot(
                junction_id=junction_id,
                features=features_dict,
                predicted_delay_sec=delay_sec,
                congestion_level=level,
                peak_hour=peak_hour,
                monsoon_active=monsoon,
            )

            return junction_id, delay_sec, level

        except asyncio.TimeoutError:
            logger.warning(f"Junction '{junction_id}' prediction timed out (>800ms) — fallback delay=0")
            return junction_id, 0.0, CongestionLevel.LOW.value
        except Exception as exc:
            logger.warning(f"Junction '{junction_id}' update failed: {exc} — fallback delay=0")
            return junction_id, 0.0, CongestionLevel.LOW.value


# ---------------------------------------------------------------------------
# Main scheduler job
# ---------------------------------------------------------------------------

async def update_all_junctions() -> None:
    """
    Scheduled tick:
      1. Determine current context (peak hour, monsoon)
      2. Load all junctions from Firestore
      3. Fan-out ML inference with semaphore=10
      4. Write snapshots & invalidate route cache per city
    """
    t_start = time.monotonic()

    peak_hour = get_current_peak_hour()
    monsoon = get_current_monsoon_active()

    logger.info(
        json.dumps({
            "event": "scheduler_tick_start",
            "peak_hour": peak_hour,
            "monsoon_active": monsoon,
        })
    )

    # Step 2: load junctions
    try:
        junctions = firestore_client.get_all_junctions()
    except Exception as exc:
        logger.warning(f"Scheduler: Firestore unavailable, skipping tick: {exc}")
        return

    if not junctions:
        logger.info("Scheduler: no junctions found, skipping tick.")
        return

    # Step 3: parallel inference with semaphore limit 10
    semaphore = asyncio.Semaphore(10)
    tasks = [
        _update_single_junction(j, peak_hour, monsoon, semaphore)
        for j in junctions
    ]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    # Step 6: invalidate cache per city affected
    cities_seen: set[str] = {j.get("city", "") for j in junctions}
    for city in cities_seen:
        if city:
            route_cache.invalidate_city(city)

    elapsed_ms = (time.monotonic() - t_start) * 1000.0
    successful = sum(1 for r in results if not isinstance(r, Exception))

    logger.info(
        json.dumps({
            "event": "scheduler_tick_done",
            "updated_junctions": successful,
            "total_junctions": len(junctions),
            "elapsed_ms": round(elapsed_ms, 1),
            "peak_hour": peak_hour,
            "monsoon_active": monsoon,
        })
    )


# ---------------------------------------------------------------------------
# Scheduler factory
# ---------------------------------------------------------------------------

def create_scheduler() -> AsyncIOScheduler:
    """
    Build and return an AsyncIOScheduler that calls update_all_junctions
    every SCHEDULER_INTERVAL_SEC seconds.

    max_instances=1 prevents overlapping ticks.
    misfire_grace_time=10 handles brief startup delays gracefully.
    """
    interval_sec = int(os.getenv("SCHEDULER_INTERVAL_SEC", "30"))

    scheduler = AsyncIOScheduler(timezone=IST)
    scheduler.add_job(
        update_all_junctions,
        trigger="interval",
        seconds=interval_sec,
        max_instances=1,
        misfire_grace_time=10,
        id="update_all_junctions",
        name="Traffic Junction Updater",
    )
    logger.info(f"Scheduler configured: interval={interval_sec}s, timezone=IST")
    return scheduler

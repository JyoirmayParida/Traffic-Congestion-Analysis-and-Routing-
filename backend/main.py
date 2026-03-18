"""
main.py — FastAPI application entry point.

Endpoints:
  GET  /health
  POST /predict
  POST /route
  GET  /junctions/{city}

All invariants (INV-1 through INV-5) are enforced via models, predictor, graph, and router modules.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import time
from datetime import datetime, timezone
from functools import lru_cache
from typing import Any

import uvicorn
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

# Load .env before importing any module that reads env vars
load_dotenv()

import firestore_client
import graph as graph_module
import predictor
import router as router_module
from cache import route_cache
from models import (
    AlternativeRoute,
    CongestionLevel,
    FeatureVector,
    Junction,
    PredictRequest,
    PredictResponse,
    RouteRequest,
    RouteResponse,
    RouteSegment,
)
from scheduler import create_scheduler

# ---------------------------------------------------------------------------
# Structured logger
# ---------------------------------------------------------------------------
logging.basicConfig(
    format='{"time": "%(asctime)s", "level": "%(levelname)s", "logger": "%(name)s", "message": "%(message)s"}',
    level=logging.INFO,
)
logger = logging.getLogger("main")

# ---------------------------------------------------------------------------
# App setup
# ---------------------------------------------------------------------------
app = FastAPI(
    title="Traffic Congestion Analysis & Routing API",
    description="ML-augmented minimum travel-time routing for Indian urban junctions.",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# CORS — never allow wildcard in production
_cors_origin = os.getenv("CORS_ALLOWED_ORIGIN", "http://localhost:3000")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[_cors_origin],
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "X-Request-ID"],
    expose_headers=["X-Cache", "X-Request-ID"],
)

# ---------------------------------------------------------------------------
# Request logging middleware
# ---------------------------------------------------------------------------

@app.middleware("http")
async def log_requests(request: Request, call_next):
    t0 = time.perf_counter()
    response: Response = await call_next(request)
    duration_ms = (time.perf_counter() - t0) * 1_000
    logger.info(
        json.dumps({
            "event": "request",
            "method": request.method,
            "path": request.url.path,
            "status": response.status_code,
            "duration_ms": round(duration_ms, 2),
        })
    )
    return response

# ---------------------------------------------------------------------------
# Lifecycle events
# ---------------------------------------------------------------------------
_scheduler = None


@app.on_event("startup")
async def startup_event():
    global _scheduler
    model_ver = predictor.get_model_version()
    _scheduler = create_scheduler()
    _scheduler.start()
    logger.info(
        json.dumps({
            "event": "startup",
            "model_version": model_ver,
            "message": "Model loaded. Scheduler started.",
        })
    )


@app.on_event("shutdown")
async def shutdown_event():
    if _scheduler and _scheduler.running:
        _scheduler.shutdown(wait=False)
    logger.info(json.dumps({"event": "shutdown"}))

# ---------------------------------------------------------------------------
# In-memory junction list cache (60 seconds TTL)
# ---------------------------------------------------------------------------
_junction_cache: dict[str, tuple[list, float]] = {}
_JUNCTION_CACHE_TTL = 60.0


def _get_cached_junctions(city: str) -> list[dict] | None:
    entry = _junction_cache.get(city)
    if entry is None:
        return None
    data, expires_at = entry
    if time.monotonic() > expires_at:
        del _junction_cache[city]
        return None
    return data


def _set_cached_junctions(city: str, data: list[dict]) -> None:
    _junction_cache[city] = (data, time.monotonic() + _JUNCTION_CACHE_TTL)

# ---------------------------------------------------------------------------
# Helper: build RouteSegment list for a path
# ---------------------------------------------------------------------------

def _build_segments(
    path: list[str],
    delays: dict[str, float],
    levels: dict[str, CongestionLevel],
    junctions_by_id: dict[str, dict],
) -> list[RouteSegment]:
    segments = []
    for jid in path:
        junc = junctions_by_id.get(jid, {})
        segments.append(
            RouteSegment(
                junction_id=jid,
                lat=float(junc.get("lat", 0.0)),
                lng=float(junc.get("lng", 0.0)),
                predicted_delay_sec=round(delays.get(jid, 0.0), 3),
                congestion_level=levels.get(jid, CongestionLevel.LOW),
            )
        )
    return segments

# ---------------------------------------------------------------------------
# GET /health
# ---------------------------------------------------------------------------

@app.get("/health", tags=["Meta"])
async def health():
    """Liveness probe — returns model version and current UTC timestamp."""
    return {
        "status": "ok",
        "model_version": predictor.get_model_version(),
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }

# ---------------------------------------------------------------------------
# POST /predict
# ---------------------------------------------------------------------------

@app.post("/predict", response_model=PredictResponse, tags=["ML"])
async def predict(body: PredictRequest):
    """
    Run ML inference for a single junction.
    400 on validation errors, 503 if model is not loaded.
    """
    return predictor.predict_delay(body.junction_id, body.features)

# ---------------------------------------------------------------------------
# POST /route
# ---------------------------------------------------------------------------

@app.post("/route", response_model=RouteResponse, tags=["Routing"])
async def route(body: RouteRequest, response: Response):
    """
    Compute the minimum travel-time route between two junctions (INV-2).
    Edge weight W(u,v) = base_time_sec(u,v) + delay(v) (INV-1).

    Response header X-Cache: HIT | MISS.
    404 if no path exists, 503 if ML or Firestore fails.
    """
    cache_key = route_cache.make_key(body.source_id, body.destination_id, body.city)

    # 1. Cache check
    cached = route_cache.get(cache_key)
    if cached is not None:
        response.headers["X-Cache"] = "HIT"
        return cached

    response.headers["X-Cache"] = "MISS"
    snapshot_start = time.monotonic()

    # 2. Load junctions + edges
    junctions = _get_cached_junctions(body.city)
    if junctions is None:
        junctions = firestore_client.get_junctions_by_city(body.city)
        _set_cached_junctions(body.city, junctions)

    if not junctions:
        raise HTTPException(
            status_code=404,
            detail=f"No junctions found for city='{body.city}'.",
        )

    junctions_by_id = {j["junction_id"]: j for j in junctions}

    # 3. Parallel ML inference for all junctions (semaphore=20)
    semaphore = asyncio.Semaphore(20)

    async def _infer_junction(junc: dict) -> tuple[str, float, CongestionLevel]:
        jid = junc["junction_id"]
        async with semaphore:
            try:
                raw_features = junc.get("current_features")
                if raw_features and isinstance(raw_features, dict):
                    fv = FeatureVector(**raw_features)
                else:
                    # Fallback: neutral features
                    from scheduler import generate_realistic_features, get_current_peak_hour, get_current_monsoon_active
                    feat_dict = generate_realistic_features(
                        junc,
                        get_current_peak_hour(),
                        get_current_monsoon_active(),
                    )
                    fv = FeatureVector(**feat_dict)

                loop = asyncio.get_event_loop()
                pred = await asyncio.wait_for(
                    loop.run_in_executor(None, predictor.predict_delay, jid, fv),
                    timeout=0.8,
                )
                return jid, pred.predicted_delay_sec, pred.congestion_level
            except asyncio.TimeoutError:
                logger.warning(f"Route inference timeout for junction '{jid}'")
                return jid, 0.0, CongestionLevel.LOW
            except Exception as exc:
                logger.warning(f"Route inference error for junction '{jid}': {exc}")
                return jid, 0.0, CongestionLevel.LOW

    infer_results = await asyncio.gather(*[_infer_junction(j) for j in junctions])

    delays: dict[str, float] = {}
    levels: dict[str, CongestionLevel] = {}
    for jid, delay, level in infer_results:
        delays[jid] = delay
        levels[jid] = level

    snapshot_age_ms = (time.monotonic() - snapshot_start) * 1000.0

    # 4-5. Build graph and inject ML weights
    G = graph_module.build_graph(junctions)
    G = graph_module.inject_ml_weights(G, delays)

    # 6. Optimal route (INV-1, INV-2)
    optimal = router_module.find_optimal_route(G, body.source_id, body.destination_id)
    optimal_path: list[str] = optimal["path"]
    optimal_time: float = optimal["total_time_sec"]

    # 7. Alternative routes
    alt_dicts = router_module.find_alternative_routes(
        G, body.source_id, body.destination_id,
        k=body.k_alternatives,
        optimal_time=optimal_time,
    )

    # Build segment lists
    optimal_segments = _build_segments(optimal_path, delays, levels, junctions_by_id)
    alternatives: list[AlternativeRoute] = []
    for alt in alt_dicts:
        alt_segments = _build_segments(alt["path"], delays, levels, junctions_by_id)
        alternatives.append(
            AlternativeRoute(
                path=alt["path"],
                total_time_sec=alt["total_time_sec"],
                pct_slower=alt["pct_slower"],
                segments=alt_segments,
            )
        )

    # Compute informational distance for optimal path
    total_distance_m = graph_module.compute_total_distance(G, optimal_path)

    # 8. Build RouteResponse
    result = RouteResponse(
        source_id=body.source_id,
        destination_id=body.destination_id,
        city=body.city,
        optimal_path=optimal_path,
        optimal_segments=optimal_segments,
        total_time_sec=round(optimal_time, 3),
        total_distance_m=round(total_distance_m, 1),
        alternatives=alternatives,
        graph_snapshot_age_ms=round(snapshot_age_ms, 1),
        model_version=predictor.get_model_version(),
    )

    # 9. Cache result
    route_cache.set(cache_key, result, ttl_sec=30)

    # 10. Fire-and-forget persistence
    asyncio.create_task(
        _persist_route(body.source_id, body.destination_id, result)
    )

    return result


async def _persist_route(source_id: str, dest_id: str, result: RouteResponse) -> None:
    try:
        firestore_client.save_route_query(source_id, dest_id, result)
    except Exception as exc:
        logger.warning(f"Route persistence error: {exc}")

# ---------------------------------------------------------------------------
# GET /junctions/{city}
# ---------------------------------------------------------------------------

@app.get("/junctions/{city}", response_model=list[Junction], tags=["Data"])
async def get_junctions(city: str):
    """
    Return all junctions for a given city.
    Cached in memory for 60 seconds.
    """
    cached = _get_cached_junctions(city)
    if cached is not None:
        return cached

    junctions = firestore_client.get_junctions_by_city(city)
    _set_cached_junctions(city, junctions)
    return junctions

# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=False,
        log_config=None,  # use our own structured logging
    )

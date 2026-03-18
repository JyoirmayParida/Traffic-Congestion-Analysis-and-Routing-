"""
Pydantic v2 schemas for the Traffic Routing backend.
INV-3: These schemas must stay in sync with Genkit flow schemas.
INV-4: FeatureVector field order is FIXED — matches ML training order.
"""

from __future__ import annotations

from enum import Enum
from typing import List, Optional

from pydantic import BaseModel, Field, field_validator, model_validator


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------

class CongestionLevel(str, Enum):
    LOW = "LOW"
    MODERATE = "MODERATE"
    HIGH = "HIGH"
    SEVERE = "SEVERE"


# ---------------------------------------------------------------------------
# Feature vector — INV-4 order MUST NOT change
# ---------------------------------------------------------------------------

class FeatureVector(BaseModel):
    """
    Exactly 8 features in INV-4 canonical order.
    Index mapping:
      [0] vehicle_count
      [1] queue_length
      [2] traffic_density
      [3] avg_speed
      [4] waiting_time
      [5] green_signal_ratio
      [6] monsoon_active
      [7] peak_hour
    """

    vehicle_count: int = Field(
        ...,
        ge=0,
        le=1000,
        description="Number of vehicles at the junction (0–1000).",
    )
    queue_length: float = Field(
        ...,
        ge=0.0,
        description="Queue length in metres (≥ 0).",
    )
    traffic_density: float = Field(
        ...,
        ge=0.0,
        description="Traffic density in vehicles/km (≥ 0).",
    )
    avg_speed: float = Field(
        ...,
        ge=0.0,
        description="Average vehicle speed in km/h (≥ 0).",
    )
    waiting_time: float = Field(
        ...,
        ge=0.0,
        description="Average waiting time in seconds (≥ 0).",
    )
    green_signal_ratio: float = Field(
        ...,
        ge=0.0,
        le=1.0,
        description="Fraction of cycle time allocated to green (0.0–1.0).",
    )
    monsoon_active: int = Field(
        ...,
        description="1 if monsoon season is active, 0 otherwise.",
    )
    peak_hour: int = Field(
        ...,
        description="1 if current time is IST peak hour (8-10 AM or 5-8 PM), 0 otherwise.",
    )

    @field_validator("monsoon_active", "peak_hour")
    @classmethod
    def must_be_binary(cls, v: int) -> int:
        if v not in (0, 1):
            raise ValueError("Must be 0 or 1.")
        return v

    @field_validator("green_signal_ratio")
    @classmethod
    def ratio_range(cls, v: float) -> float:
        if not (0.0 <= v <= 1.0):
            raise ValueError("green_signal_ratio must be between 0.0 and 1.0.")
        return v

    @field_validator("vehicle_count")
    @classmethod
    def count_non_negative(cls, v: int) -> int:
        if v < 0:
            raise ValueError("vehicle_count must be >= 0.")
        return v

    def to_ordered_list(self) -> list:
        """
        Returns features as a plain list in EXACT INV-4 order.
        Used by predictor.assemble_feature_vector().
        """
        return [
            self.vehicle_count,      # [0]
            self.queue_length,       # [1]
            self.traffic_density,    # [2]
            self.avg_speed,          # [3]
            self.waiting_time,       # [4]
            self.green_signal_ratio, # [5]
            float(self.monsoon_active),  # [6]
            float(self.peak_hour),       # [7]
        ]


# ---------------------------------------------------------------------------
# Predict endpoint
# ---------------------------------------------------------------------------

class PredictRequest(BaseModel):
    junction_id: str = Field(..., description="Unique identifier of the junction.")
    features: FeatureVector = Field(..., description="8-element feature vector for this junction.")


class FeatureImportance(BaseModel):
    feature_name: str = Field(..., description="Name of the feature.")
    importance_score: float = Field(..., description="Normalised importance score (0–1).")


class PredictResponse(BaseModel):
    junction_id: str = Field(..., description="Junction identifier echoed from the request.")
    predicted_delay_sec: float = Field(..., description="ML-predicted congestion delay in seconds.")
    congestion_level: CongestionLevel = Field(..., description="Derived congestion bucket.")
    top_factors: List[FeatureImportance] = Field(
        ..., description="Top 3 features driving the prediction."
    )
    inference_ms: float = Field(..., description="Time taken for ML inference in milliseconds.")
    model_version: str = Field(..., description="Identifier of the loaded model.")


# ---------------------------------------------------------------------------
# Route endpoint
# ---------------------------------------------------------------------------

class RouteRequest(BaseModel):
    source_id: str = Field(..., description="Junction ID of the trip origin.")
    destination_id: str = Field(..., description="Junction ID of the trip destination.")
    city: str = Field(..., description="City name — used to scope the road graph.")
    k_alternatives: int = Field(
        default=2,
        ge=1,
        le=5,
        description="Number of alternative routes to return in addition to optimal (1–5).",
    )

    @field_validator("k_alternatives")
    @classmethod
    def k_in_range(cls, v: int) -> int:
        if not (1 <= v <= 5):
            raise ValueError("k_alternatives must be between 1 and 5.")
        return v


class RouteSegment(BaseModel):
    junction_id: str = Field(..., description="Junction ID of this waypoint.")
    lat: float = Field(..., description="Latitude of the junction.")
    lng: float = Field(..., description="Longitude of the junction.")
    predicted_delay_sec: float = Field(..., description="ML-predicted delay at this junction.")
    congestion_level: CongestionLevel = Field(..., description="Congestion level at this junction.")


class AlternativeRoute(BaseModel):
    path: List[str] = Field(..., description="Ordered list of junction IDs.")
    total_time_sec: float = Field(..., description="Total estimated travel time (base + delays) in seconds.")
    pct_slower: float = Field(..., description="Percentage slower than optimal route.")
    segments: List[RouteSegment] = Field(default_factory=list, description="Per-junction segment details.")


class RouteResponse(BaseModel):
    source_id: str = Field(..., description="Origin junction ID.")
    destination_id: str = Field(..., description="Destination junction ID.")
    city: str = Field(..., description="City the route belongs to.")
    optimal_path: List[str] = Field(..., description="Optimal junction ID sequence.")
    optimal_segments: List[RouteSegment] = Field(..., description="Per-junction segment details for optimal path.")
    total_time_sec: float = Field(..., description="Optimal route travel time in seconds (base + delays).")
    total_distance_m: float = Field(..., description="Approximate route distance in metres (informational only).")
    alternatives: List[AlternativeRoute] = Field(default_factory=list, description="Alternative routes within 130% of optimal.")
    graph_snapshot_age_ms: float = Field(..., description="Age of the traffic snapshot used, in milliseconds.")
    model_version: str = Field(..., description="Model version used to compute delays.")


# ---------------------------------------------------------------------------
# Junction (used by GET /junctions/{city})
# ---------------------------------------------------------------------------

class Junction(BaseModel):
    junction_id: str = Field(..., description="Unique junction identifier.")
    name: str = Field(..., description="Human-readable junction name.")
    lat: float = Field(..., description="Latitude.")
    lng: float = Field(..., description="Longitude.")
    city: str = Field(..., description="City this junction belongs to.")
    tier: str = Field(default="tier1", description="City tier: metro | tier1 | tier2.")
    current_features: Optional[FeatureVector] = Field(
        default=None, description="Latest traffic features written by the scheduler."
    )

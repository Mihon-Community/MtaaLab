"""Validated state and transition models shared by the engine, service, and API."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

Sector = Literal["households", "school", "clinic", "farms"]


class StrictModel(BaseModel):
    """Reject undeclared fields at trusted boundaries."""

    model_config = ConfigDict(extra="forbid", frozen=True)


class ScheduledEffect(StrictModel):
    """An engine-authored effect that becomes active on a future turn."""

    action_type: str
    apply_turn: int = Field(ge=1)
    effect_type: Literal["reduce_demand"]
    sector: Sector
    reduction_ratio: float = Field(gt=0, le=1)


class WorldState(StrictModel):
    """Canonical, bounded Mtoni state; service levels are shares in [0, 1]."""

    current_turn: int = Field(default=0, ge=0)
    reservoir_level: float = Field(ge=0)
    reservoir_capacity: float = Field(gt=0)
    demand_by_sector: dict[Sector, float]
    leakage: float = Field(ge=0)
    budget_remaining: float = Field(ge=0)
    service_levels: dict[Sector, float]
    unmet_demand_by_sector: dict[Sector, float] = Field(default_factory=dict)
    crop_health: float = Field(ge=0, le=100)
    wellbeing: float = Field(ge=0, le=100)
    allocation_policy: str = "balanced"
    used_actions: list[str] = Field(default_factory=list)
    pending_effects: list[ScheduledEffect] = Field(default_factory=list)

    @model_validator(mode="before")
    @classmethod
    def normalize_seed_state(cls, value: Any) -> Any:
        """Fill newer contract fields when loading the original synthetic seed row."""
        if not isinstance(value, dict):
            return value
        normalized = dict(value)
        demand = normalized.get("demand_by_sector", {})
        normalized.setdefault("unmet_demand_by_sector", {sector: 0 for sector in demand})
        normalized.pop("rainfall_inflow", None)
        return normalized

    @model_validator(mode="after")
    def validate_bounds(self) -> WorldState:
        if self.reservoir_level > self.reservoir_capacity:
            raise ValueError("reservoir_level cannot exceed reservoir_capacity")
        for sector, demand in self.demand_by_sector.items():
            if demand < 0:
                raise ValueError(f"demand for {sector} cannot be negative")
        for sector, service in self.service_levels.items():
            if not 0 <= service <= 1:
                raise ValueError(f"service level for {sector} must be in [0, 1]")
        if set(self.demand_by_sector) != set(self.service_levels):
            raise ValueError("demand and service levels must cover the same sectors")
        if set(self.demand_by_sector) != set(self.unmet_demand_by_sector):
            raise ValueError("demand and unmet demand must cover the same sectors")
        if any(value < 0 for value in self.unmet_demand_by_sector.values()):
            raise ValueError("unmet demand cannot be negative")
        return self


class Action(StrictModel):
    """Student-selected intervention; only the engine decides its effects."""

    action_type: str = Field(min_length=1, max_length=80)
    parameters: dict[str, Any] = Field(default_factory=dict)
    expected_turn: int = Field(ge=0)


class Event(StrictModel):
    """Immutable scripted event emitted by a scenario turn."""

    event_type: str = Field(min_length=1, max_length=100)
    turn_number: int = Field(ge=1)
    payload: dict[str, Any] = Field(default_factory=dict)
    engine_version: str = "mtoni-rules-v1"


class WaterAccounting(StrictModel):
    """Auditable one-turn water balance, including physical losses."""

    opening_reservoir: float = Field(ge=0)
    inflow: float = Field(ge=0)
    closing_reservoir: float = Field(ge=0)
    withdrawals_by_sector: dict[Sector, float]
    leakage: float = Field(ge=0)
    overflow: float = Field(ge=0)


class TurnResult(StrictModel):
    """Confirmed deterministic result; persistence owns idempotency metadata."""

    turn: int = Field(ge=1)
    accepted: Literal[True] = True
    action: Action
    state: WorldState
    events: list[Event] = Field(default_factory=list)
    water_accounting: WaterAccounting
    idempotent_replay: bool = False

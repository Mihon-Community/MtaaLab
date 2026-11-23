"""Source-grounded after-action debriefs with a factual engine-generated fallback."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from app.ai.nvidia_client import (
    AIResult,
    RecordInteraction,
    flatten_fact_keys,
    redact_direct_pii,
    run_validated_task,
)
from app.ai.prompts.debrief import build_debrief_prompt
from app.ai.schemas import Debrief

_SCENARIO_PATH = Path(__file__).resolve().parents[1] / "simulation" / "scenarios" / "mtoni_v1.json"


def create_debrief(
    history: list[dict[str, object]] | dict[str, object],
    *,
    client: Any | None = None,
    record_interaction: RecordInteraction | None = None,
) -> AIResult[Debrief]:
    """Summarize recorded outcomes only; use an engine-derived fallback on any failure."""
    scenario = json.loads(_SCENARIO_PATH.read_text(encoding="utf-8"))
    raw_history = history.get("entries", []) if isinstance(history, dict) else history
    if not isinstance(raw_history, list):
        raw_history = []
    safe_history = redact_direct_pii(raw_history)
    system_prompt, user_prompt = build_debrief_prompt(
        history=safe_history,
        learning_objectives=scenario["learning_objectives"],
    )
    return run_validated_task(
        task_type="debrief",
        output_schema=Debrief,
        fallback=_engine_debrief(safe_history),
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        available_facts=flatten_fact_keys(safe_history),
        client=client,
        record_interaction=record_interaction,
    )


def _engine_debrief(history: list[dict[str, Any]]) -> Debrief:
    """Describe only facts present in saved turn records; never infer outcomes."""
    scenario = json.loads(_SCENARIO_PATH.read_text(encoding="utf-8"))
    action_labels = {
        action_type: definition["label"] for action_type, definition in scenario["actions"].items()
    }
    completed_turns = 0
    recorded_actions: list[str] = []
    recorded_event_count = 0
    for entry in history:
        if not isinstance(entry, dict):
            continue
        turn = entry.get("turn") or entry.get("turn_number")
        if isinstance(turn, int):
            completed_turns = max(completed_turns, turn)
        action = entry.get("action") or entry.get("decision")
        if isinstance(action, dict):
            action_type = action.get("action_type") or action.get("type")
            if isinstance(action_type, str) and action_type in action_labels:
                recorded_actions.append(action_labels[action_type])
        elif isinstance(action, str) and action in action_labels:
            recorded_actions.append(action_labels[action])
        events = entry.get("events", [])
        if isinstance(events, list):
            recorded_event_count += len(events)

    distinct_actions = list(dict.fromkeys(recorded_actions))
    if distinct_actions:
        choices = ", ".join(distinct_actions)
        trade_off = (
            f"Recorded interventions include: {choices}. "
            "Compare these choices with the saved outcomes."
        )
    else:
        trade_off = (
            "No accepted intervention appears in the supplied history, "
            "so there are no choices to compare yet."
        )
    summary = (
        f"The persisted history records {completed_turns} completed turns and "
        f"{len(recorded_actions)} accepted interventions, "
        f"with {recorded_event_count} scripted events. "
        "The saved final state is the confirmed outcome for this run."
    )
    return Debrief(
        summary=summary,
        trade_offs=[trade_off],
        replay_suggestion=(
            "Replay the mission and compare a different allocation choice with the saved run."
        ),
        referenced_facts=[],
    )

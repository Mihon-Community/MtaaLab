"""Read mission objectives from the checked-in scenario configuration."""

from app.simulation.service import load_scenario


def objectives_for_mission(mission_id: str) -> list[str]:
    """Return configured objectives for the matching mission slug; unknown missions get none."""
    scenario = load_scenario()
    if mission_id != scenario.get("scenario_id"):
        return []
    objectives = scenario.get("learning_objectives", [])
    if not isinstance(objectives, list):
        return []
    return [
        objective.strip()
        for objective in objectives
        if isinstance(objective, str) and objective.strip()
    ]

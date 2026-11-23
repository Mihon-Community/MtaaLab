"""Mission objective lookup coverage."""

from app.learning.objectives import objectives_for_mission
from app.simulation.service import load_scenario


def test_known_mission_objectives_come_from_scenario_configuration() -> None:
    scenario = load_scenario()

    assert objectives_for_mission(scenario["scenario_id"]) == scenario["learning_objectives"]


def test_unknown_mission_has_no_objectives() -> None:
    assert objectives_for_mission("unknown-mission") == []

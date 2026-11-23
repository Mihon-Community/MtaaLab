"""Published mission discovery and approved scenario metadata."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status

from app.api.auth import CurrentUser, get_current_user
from app.api.dependencies import get_mission_repository
from app.api.schemas import MissionDetailResponse, MissionListItem, MissionListResponse
from app.db.repositories import MissionRepository
from app.simulation.engine import load_scenario

router = APIRouter(prefix="/api/missions", tags=["missions"])


def _mission_item(mission: object, scenario_version: object) -> MissionListItem:
    return MissionListItem(
        id=mission.id,
        title=mission.title,
        description=mission.description,
        subject=mission.subject,
        grade_band=mission.grade_band,
        scenario_version=scenario_version.version,
    )


@router.get("", response_model=MissionListResponse)
def list_missions(
    user: CurrentUser = Depends(get_current_user),  # noqa: B008
    repository: MissionRepository = Depends(get_mission_repository),  # noqa: B008
) -> MissionListResponse:
    """List published missions available to authenticated MtaaLab profiles."""
    del user  # Mission assignment is global in the current schema; learner records remain scoped.
    items: list[MissionListItem] = []
    for mission in repository.list_published():
        selected = repository.get_published(mission.id)
        if selected is not None:
            items.append(_mission_item(selected[0], selected[1]))
    return MissionListResponse(missions=items)


@router.get("/{mission_id}", response_model=MissionDetailResponse)
def get_mission(
    mission_id: UUID,
    user: CurrentUser = Depends(get_current_user),  # noqa: B008
    repository: MissionRepository = Depends(get_mission_repository),  # noqa: B008
) -> MissionDetailResponse:
    """Return the published brief and immutable scenario metadata."""
    del user
    selected = repository.get_published(mission_id)
    if selected is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Mission not found")
    mission, version = selected
    scenario = load_scenario()
    if scenario.get("scenario_id") != "mtoni" or version.version != 1:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Mission not found")

    action_catalogue = [
        {"action_type": action_type, **definition}
        for action_type, definition in scenario["actions"].items()
    ]
    allocation_policies = [
        {"policy_id": policy_id, **definition}
        for policy_id, definition in scenario["allocation_policies"].items()
    ]
    return MissionDetailResponse(
        **_mission_item(mission, version).model_dump(),
        learning_objectives=list(version.learning_objectives or scenario["learning_objectives"]),
        scenario_id=scenario["scenario_id"],
        rules_version=version.rules_version,
        turn_duration=scenario["turn_duration"],
        number_of_turns=scenario["number_of_turns"],
        units=scenario["units"],
        action_catalogue=action_catalogue,
        allocation_policies=allocation_policies,
    )

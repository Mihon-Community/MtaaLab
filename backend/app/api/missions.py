"""Published mission discovery and approved scenario metadata."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status

from app.api.auth import CurrentUser, get_current_user
from app.api.dependencies import get_mission_repository
from app.api.schemas import MissionDetailResponse, MissionListItem, MissionListResponse
from app.db.repositories import MissionRepository
from app.simulation.service import load_versioned_scenario

router = APIRouter(prefix="/api/missions", tags=["missions"])


def _mission_item(
    mission: object,
    scenario_version: object,
    *,
    recommended: bool = False,
    recommendation_reason: str | None = None,
    latest_session: dict[str, object] | None = None,
) -> MissionListItem:
    return MissionListItem(
        id=mission.id,
        title=mission.title,
        description=mission.description,
        subject=mission.subject,
        grade_band=mission.grade_band,
        scenario_version=scenario_version.version,
        recommended=recommended,
        recommendation_reason=recommendation_reason,
        last_session_id=(latest_session or {}).get("session_id"),
        last_session_status=(latest_session or {}).get("status"),
        current_turn=int((latest_session or {}).get("current_turn", 0)),
    )


@router.get("", response_model=MissionListResponse)
def list_missions(
    user: CurrentUser = Depends(get_current_user),  # noqa: B008
    repository: MissionRepository = Depends(get_mission_repository),  # noqa: B008
) -> MissionListResponse:
    """List published missions assigned to the caller's active classes."""
    missions = repository.list_published(user.id)
    count_loader = getattr(repository, "session_counts_by_mission", None)
    counts = count_loader(user.id) if user.role == "student" and count_loader else {}
    latest_loader = getattr(repository, "latest_sessions_by_mission", None)
    latest_sessions = latest_loader(user.id) if user.role == "student" and latest_loader else {}
    recommended_id = None
    if missions and user.role == "student":
        recommended_id = min(
            missions, key=lambda item: (counts.get(item.id, 0), item.title.casefold())
        ).id
    items: list[MissionListItem] = []
    for mission in missions:
        selected = repository.get_published_for_user(mission.id, user.id)
        if selected is not None:
            is_recommended = selected[0].id == recommended_id
            items.append(
                _mission_item(
                    selected[0],
                    selected[1],
                    recommended=is_recommended,
                    recommendation_reason=(
                        "new_game" if counts.get(selected[0].id, 0) == 0 else "explore_next"
                    )
                    if is_recommended
                    else None,
                    latest_session=latest_sessions.get(selected[0].id),
                )
            )
    return MissionListResponse(missions=items)


@router.get("/{mission_id}", response_model=MissionDetailResponse)
def get_mission(
    mission_id: UUID,
    user: CurrentUser = Depends(get_current_user),  # noqa: B008
    repository: MissionRepository = Depends(get_mission_repository),  # noqa: B008
) -> MissionDetailResponse:
    """Return the published brief and immutable scenario metadata."""
    selected = repository.get_published_for_user(mission_id, user.id)
    if selected is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Mission not found")
    mission, version = selected
    try:
        scenario = load_versioned_scenario(version.rules_version)
    except (LookupError, ValueError) as error:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Mission not found"
        ) from error

    action_catalogue = [
        {"action_type": action_type, **definition}
        for action_type, definition in scenario["actions"].items()
    ]
    allocation_policies = [
        {"policy_id": policy_id, **definition}
        for policy_id, definition in scenario.get("allocation_policies", {}).items()
    ]
    return MissionDetailResponse(
        **_mission_item(mission, version).model_dump(),
        learning_objectives=list(
            version.learning_objectives or scenario.get("learning_objectives", [])
        ),
        scenario_id=scenario["scenario_id"],
        rules_version=version.rules_version,
        turn_duration=scenario["turn_duration"],
        number_of_turns=scenario["number_of_turns"],
        units=scenario["units"],
        action_catalogue=action_catalogue,
        allocation_policies=allocation_policies,
        plans=dict(scenario.get("plans", {})),
        reflection_choices=dict(scenario.get("reflection_choices", {})),
        hint_ladder=dict(scenario.get("hint_ladder", {})),
    )

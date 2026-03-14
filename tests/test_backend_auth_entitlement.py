import importlib.util
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock
from datetime import datetime, timezone

import pytest
from pydantic import ValidationError
from fastapi import HTTPException
from jose import JWTError
from starlette.requests import Request


@pytest.fixture
def backend_server(monkeypatch):
    monkeypatch.setenv("MONGO_URL", "mongodb://localhost:27017")
    monkeypatch.setenv("DB_NAME", "gaintrack_test")

    server_path = Path(__file__).resolve().parents[1] / "backend" / "server.py"
    spec = importlib.util.spec_from_file_location("backend_server_module", server_path)
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    spec.loader.exec_module(module)
    return module


def _make_request(headers=None):
    scope = {
        "type": "http",
        "method": "GET",
        "path": "/",
        "headers": headers or [],
    }
    return Request(scope)


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "token_label",
    ["invalid", "expired", "forged"],
)
async def test_get_current_user_rejects_bad_bearer_tokens(backend_server, monkeypatch, token_label):
    async def _reject_token(_token):
        return None

    monkeypatch.setattr(backend_server, "verify_firebase_token_payload", _reject_token)
    backend_server.db = SimpleNamespace(user_sessions=SimpleNamespace(find_one=AsyncMock(return_value=None)))

    request = _make_request(headers=[(b"authorization", f"Bearer {token_label}-token".encode())])

    with pytest.raises(HTTPException) as exc:
        await backend_server.get_current_user(request)

    assert exc.value.status_code == 401
    assert exc.value.detail == "Invalid session"


@pytest.mark.asyncio
@pytest.mark.parametrize("jwt_error", [JWTError("Signature has expired"), JWTError("Signature verification failed")])
async def test_verify_firebase_payload_returns_none_on_jwt_error(backend_server, monkeypatch, jwt_error):
    monkeypatch.setattr(backend_server, "FIREBASE_PROJECT_ID", "gaintrack-test")
    monkeypatch.setattr(
        backend_server.jwt,
        "get_unverified_header",
        lambda _token: {"kid": "kid-1"},
    )
    monkeypatch.setattr(backend_server, "_get_firebase_certs", AsyncMock(return_value={"kid-1": "fake-cert"}))

    def _raise_decode(*_args, **_kwargs):
        raise jwt_error

    monkeypatch.setattr(backend_server.jwt, "decode", _raise_decode)

    payload = await backend_server.verify_firebase_token_payload("any-token")
    assert payload is None


@pytest.mark.asyncio
async def test_require_pro_user_rejects_entitlement_mismatch(backend_server):
    request = _make_request()
    request.state.firebase_claims = {"isPro": False}

    backend_server.db = SimpleNamespace(
        users=SimpleNamespace(
            find_one=AsyncMock(
                return_value={
                    "user_id": "u1",
                    "isPro": False,
                    "entitlements": {"pro": False},
                    "subscription": {"pro": False},
                }
            )
        )
    )

    user = backend_server.User(
        user_id="u1",
        email="u1@example.com",
        name="User One",
        created_at=backend_server.datetime.now(backend_server.timezone.utc),
    )

    with pytest.raises(HTTPException) as exc:
        await backend_server.require_pro_user(request, user)

    assert exc.value.status_code == 403
    assert exc.value.detail == "Pro subscription required"


@pytest.mark.asyncio
async def test_require_pro_user_allows_verified_claim_pro(backend_server):
    request = _make_request()
    request.state.firebase_claims = {"isPro": True}

    backend_server.db = SimpleNamespace(
        users=SimpleNamespace(find_one=AsyncMock(return_value=None))
    )

    user = backend_server.User(
        user_id="u2",
        email="u2@example.com",
        name="User Two",
        created_at=backend_server.datetime.now(backend_server.timezone.utc),
    )

    result = await backend_server.require_pro_user(request, user)
    assert result.user_id == "u2"


@pytest.mark.asyncio
async def test_require_pro_user_allows_backend_subscription_fallback(backend_server):
    request = _make_request()
    request.state.firebase_claims = {}

    backend_server.db = SimpleNamespace(
        users=SimpleNamespace(
            find_one=AsyncMock(
                return_value={
                    "user_id": "u3",
                    "subscription": {"pro": True},
                }
            )
        )
    )

    user = backend_server.User(
        user_id="u3",
        email="u3@example.com",
        name="User Three",
        created_at=backend_server.datetime.now(backend_server.timezone.utc),
    )

    result = await backend_server.require_pro_user(request, user)
    assert result.user_id == "u3"


@pytest.mark.asyncio
async def test_enforce_mutation_rate_limit_blocks_after_limit(backend_server):
    request = _make_request(headers=[(b"x-forwarded-for", b"10.0.0.99")])
    backend_server._mutation_rate_limit_cache.clear()

    await backend_server.enforce_mutation_rate_limit(
        request,
        "test.scope",
        user_id="u-limit",
        limit=2,
        window_seconds=60,
    )
    await backend_server.enforce_mutation_rate_limit(
        request,
        "test.scope",
        user_id="u-limit",
        limit=2,
        window_seconds=60,
    )

    with pytest.raises(HTTPException) as exc:
        await backend_server.enforce_mutation_rate_limit(
            request,
            "test.scope",
            user_id="u-limit",
            limit=2,
            window_seconds=60,
        )

    assert exc.value.status_code == 429
    assert exc.value.detail == "Too many requests"


def test_meal_entry_create_rejects_invalid_meal_type(backend_server):
    with pytest.raises(ValidationError):
        backend_server.MealEntryCreate(
            meal_type="brunch",
            food_id="fd_1",
            food_name="Eggs",
            servings=1,
            calories=150,
            protein=10,
            carbs=1,
            fat=11,
        )


def test_generate_lifecycle_jobs_day1_when_no_workout(backend_server):
    now = datetime(2026, 3, 14, tzinfo=timezone.utc)
    created_at = datetime(2026, 3, 12, tzinfo=timezone.utc)

    jobs = backend_server.generate_lifecycle_jobs_for_profile(
        now=now,
        user_id="u-lifecycle-1",
        created_at=created_at,
        sent_days=[],
        has_workouts=False,
        has_recent_workout=False,
    )

    day_keys = {job["day_key"] for job in jobs}
    assert "day_1" in day_keys


def test_generate_lifecycle_jobs_skips_sent_and_recent_activity(backend_server):
    now = datetime(2026, 3, 14, tzinfo=timezone.utc)
    created_at = datetime(2026, 2, 1, tzinfo=timezone.utc)

    jobs = backend_server.generate_lifecycle_jobs_for_profile(
        now=now,
        user_id="u-lifecycle-2",
        created_at=created_at,
        sent_days=["day_1", "day_7"],
        has_workouts=True,
        has_recent_workout=True,
    )

    assert jobs == []


@pytest.mark.asyncio
async def test_send_expo_push_notifications_maps_results(backend_server, monkeypatch):
    class _FakeResponse:
        status_code = 200

        @staticmethod
        def json():
            return {
                "data": [
                    {"status": "ok", "id": "ticket-1"},
                    {"status": "error", "details": "DeviceNotRegistered", "message": "invalid token"},
                ]
            }

    class _FakeAsyncClient:
        def __init__(self, *args, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return None

        async def post(self, *_args, **_kwargs):
            return _FakeResponse()

    monkeypatch.setattr(backend_server.httpx, "AsyncClient", _FakeAsyncClient)

    results = await backend_server.send_expo_push_notifications(
        [
            {"to": "ExponentPushToken[abc]", "title": "t1", "body": "b1"},
            {"to": "ExponentPushToken[def]", "title": "t2", "body": "b2"},
        ]
    )

    assert len(results) == 2
    assert results[0]["status"] == "ok"
    assert results[0]["ticket_id"] == "ticket-1"
    assert results[1]["status"] == "error"
    assert results[1]["details"] == "DeviceNotRegistered"


@pytest.mark.asyncio
async def test_track_first_workout_completion_sets_first_flag(backend_server):
    request = _make_request()
    user = backend_server.User(
        user_id="u-first-1",
        email="first@example.com",
        name="First User",
        created_at=backend_server.datetime.now(backend_server.timezone.utc),
    )

    notification_profiles = SimpleNamespace(
        find_one=AsyncMock(return_value=None),
        update_one=AsyncMock(return_value=None),
    )
    backend_server.db = SimpleNamespace(notification_profiles=notification_profiles)

    payload = backend_server.FirstWorkoutTelemetry(workout_id="wk_123")
    result = await backend_server.track_first_workout_completion(payload, request, user)

    assert result["tracked"] is True
    assert result["is_first_workout"] is True
    notification_profiles.update_one.assert_awaited()


def test_evaluate_strava_wearable_scope_recommendation_levels(backend_server):
    proceed = backend_server.evaluate_strava_wearable_scope(
        adoption_rate_percent=72.0,
        avg_sync_events_per_adopted_user=6.5,
        adopted_users=84,
        active_providers=2,
    )
    assert proceed["recommendation"] == "proceed_now"
    assert proceed["score"] >= 65

    validate = backend_server.evaluate_strava_wearable_scope(
        adoption_rate_percent=38.0,
        avg_sync_events_per_adopted_user=3.0,
        adopted_users=19,
        active_providers=1,
    )
    assert validate["recommendation"] in {"validate_further", "defer"}


@pytest.mark.asyncio
async def test_ingest_health_integration_telemetry_tracks_event(backend_server):
    request = _make_request()
    user = backend_server.User(
        user_id="u-health-1",
        email="health@example.com",
        name="Health User",
        created_at=backend_server.datetime.now(backend_server.timezone.utc),
    )

    health_events = SimpleNamespace(insert_one=AsyncMock(return_value=None))
    backend_server.db = SimpleNamespace(health_integration_events=health_events)

    payload = backend_server.HealthIntegrationTelemetry(
        provider="google_fit",
        event_type="sync_success",
        success=True,
        native_bridge_available=True,
        provider_records_read=321,
    )

    result = await backend_server.ingest_health_integration_telemetry(payload, request, user)

    assert result["tracked"] is True
    health_events.insert_one.assert_awaited()


@pytest.mark.asyncio
async def test_get_strava_wearable_readiness_computes_metrics(backend_server):
    request = _make_request()
    user = backend_server.User(
        user_id="u-health-2",
        email="health2@example.com",
        name="Health User Two",
        created_at=backend_server.datetime.now(backend_server.timezone.utc),
    )

    events = [
        {"user_id": "u1", "provider": "apple_health", "event_type": "consent_enabled"},
        {"user_id": "u1", "provider": "apple_health", "event_type": "sync_success"},
        {"user_id": "u2", "provider": "google_fit", "event_type": "consent_enabled"},
        {"user_id": "u2", "provider": "google_fit", "event_type": "sync_success"},
        {"user_id": "u2", "provider": "google_fit", "event_type": "sync_success"},
    ]

    find_result = SimpleNamespace(to_list=AsyncMock(return_value=events))
    health_events = SimpleNamespace(find=lambda *_args, **_kwargs: find_result)
    backend_server.db = SimpleNamespace(health_integration_events=health_events)

    result = await backend_server.get_strava_wearable_readiness(request, user, lookback_days=30)

    assert result["metrics"]["users_with_health_interest"] == 2
    assert result["metrics"]["adopted_users"] == 2
    assert result["metrics"]["adoption_rate_percent"] == 100.0
    assert result["evaluation"]["recommendation"] in {"proceed_now", "validate_further", "defer"}


def test_aggregate_workout_social_stats_sums_sets_and_volume(backend_server):
    workouts = [
        {
            "exercises": [
                {"sets": [{"reps": 10, "weight": 50}, {"reps": 8, "weight": 55}]},
                {"sets": [{"reps": 12, "weight": 20}]},
            ]
        },
        {
            "exercises": [
                {"sets": [{"reps": 5, "weight": 100}]},
            ]
        },
    ]

    stats = backend_server.aggregate_workout_social_stats(workouts)

    assert stats["workouts"] == 2
    assert stats["total_sets"] == 4
    assert stats["total_volume"] == 1810.0


@pytest.mark.asyncio
async def test_connect_friend_rejects_self_reference(backend_server):
    request = _make_request()
    user = backend_server.User(
        user_id="u-social-1",
        email="social@example.com",
        name="Social User",
        created_at=backend_server.datetime.now(backend_server.timezone.utc),
    )

    payload = backend_server.FriendConnectRequest(friend_user_id="u-social-1")

    with pytest.raises(HTTPException) as exc:
        await backend_server.connect_friend(payload, request, user)

    assert exc.value.status_code == 422
    assert exc.value.detail == "Cannot add yourself as a friend"


@pytest.mark.asyncio
async def test_discover_friends_excludes_self_and_existing_friend(backend_server):
    request = _make_request()
    user = backend_server.User(
        user_id="u-social-2",
        email="social2@example.com",
        name="Social User Two",
        created_at=backend_server.datetime.now(backend_server.timezone.utc),
    )

    friendships_cursor = SimpleNamespace(
        to_list=AsyncMock(
            return_value=[
                {"members": ["u-social-2", "u-friend-existing"]},
            ]
        )
    )
    users_cursor = SimpleNamespace(
        to_list=AsyncMock(
            return_value=[
                {"user_id": "u-candidate-1", "name": "Candidate", "email": "c@example.com"},
            ]
        )
    )

    backend_server.db = SimpleNamespace(
        user_friendships=SimpleNamespace(find=lambda *_args, **_kwargs: friendships_cursor),
        users=SimpleNamespace(find=lambda *_args, **_kwargs: users_cursor),
    )

    result = await backend_server.discover_friends(request, user, q="cand")
    assert len(result["results"]) == 1
    assert result["results"][0]["user_id"] == "u-candidate-1"


@pytest.mark.asyncio
async def test_respond_friend_invite_accept_creates_friendship(backend_server):
    request = _make_request()
    user = backend_server.User(
        user_id="u-social-target",
        email="target@example.com",
        name="Target User",
        created_at=backend_server.datetime.now(backend_server.timezone.utc),
    )

    invite_doc = {
        "invite_id": "fri_test123",
        "from_user_id": "u-social-source",
        "to_user_id": "u-social-target",
        "status": "pending",
    }

    backend_server.db = SimpleNamespace(
        user_friend_invites=SimpleNamespace(
            find_one=AsyncMock(return_value=invite_doc),
            update_one=AsyncMock(return_value=None),
        ),
        user_friendships=SimpleNamespace(update_one=AsyncMock(return_value=None)),
    )

    result = await backend_server.respond_friend_invite("fri_test123", request, user, action="accept")

    assert result["updated"] is True
    assert result["status"] == "accepted"


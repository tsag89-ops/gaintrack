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


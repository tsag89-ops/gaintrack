from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, Depends, Query
from fastapi.responses import JSONResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, field_validator
from typing import List, Optional, Dict, Any, Set
import uuid
from datetime import datetime, timezone, timedelta
import httpx
import jwt
from jwt import InvalidTokenError

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create the main app
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

FIREBASE_PROJECT_ID = os.getenv("FIREBASE_PROJECT_ID")
FIREBASE_CERTS_URL = "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com"
_firebase_certs_cache: Dict[str, Any] = {"expires_at": datetime.min.replace(tzinfo=timezone.utc), "certs": {}}
_mutation_rate_limit_cache: Dict[str, List[datetime]] = {}

ALLOWED_EQUIPMENT = {
    "dumbbells",
    "barbell",
    "pullup_bar",
    "bench",
    "cables",
    "machines",
    "kettlebells",
    "bands",
    "bodyweight",
}
ALLOWED_MEAL_TYPES = {"breakfast", "lunch", "dinner", "snacks"}
CRON_INTERNAL_KEY = os.getenv("CRON_INTERNAL_KEY")

LIFECYCLE_DAY_KEYS = {
    1: "day_1",
    7: "day_7",
    30: "day_30",
}
LIFECYCLE_TEMPLATES = {
    "day_1": {
        "title": "Welcome to GainTrack",
        "body": "Start your first workout today and build momentum.",
    },
    "day_7": {
        "title": "One Week In",
        "body": "You are one week in. Log a workout and keep your streak alive.",
    },
    "day_30": {
        "title": "30-Day Check-In",
        "body": "Review your progress and set your next milestone today.",
    },
}
EXPO_PUSH_API_URL = "https://exp.host/--/api/v2/push/send"
EXPO_PUSH_MAX_BATCH = 100


def _client_identifier(request: Request, user_id: Optional[str] = None) -> str:
    if user_id:
        return f"user:{user_id}"

    forwarded_for = request.headers.get("x-forwarded-for")
    if forwarded_for:
        return f"ip:{forwarded_for.split(',')[0].strip()}"

    if request.client and request.client.host:
        return f"ip:{request.client.host}"

    return "ip:unknown"


async def enforce_mutation_rate_limit(
    request: Request,
    scope: str,
    user_id: Optional[str] = None,
    limit: int = 60,
    window_seconds: int = 60,
) -> None:
    now = datetime.now(timezone.utc)
    key = f"{scope}:{_client_identifier(request, user_id)}"
    window_start = now - timedelta(seconds=window_seconds)

    hits = [ts for ts in _mutation_rate_limit_cache.get(key, []) if ts >= window_start]
    if len(hits) >= limit:
        raise HTTPException(status_code=429, detail="Too many requests")

    hits.append(now)
    _mutation_rate_limit_cache[key] = hits


def validate_date_key(date_value: str) -> str:
    try:
        datetime.strptime(date_value, "%Y-%m-%d")
        return date_value
    except ValueError as exc:
        raise HTTPException(status_code=422, detail="Date must be in YYYY-MM-DD format") from exc


def _normalize_datetime(value: Any) -> datetime:
    if isinstance(value, datetime):
        dt = value
    elif isinstance(value, str):
        dt = datetime.fromisoformat(value)
    else:
        raise ValueError("Invalid datetime value")

    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


def generate_lifecycle_jobs_for_profile(
    now: datetime,
    user_id: str,
    created_at: datetime,
    sent_days: Optional[List[str]],
    has_workouts: bool,
    has_recent_workout: bool,
) -> List[Dict[str, Any]]:
    sent_day_set = set(sent_days or [])
    account_age_days = max((now - created_at).days, 0)

    jobs: List[Dict[str, Any]] = []

    for day, day_key in LIFECYCLE_DAY_KEYS.items():
        if day_key in sent_day_set:
            continue
        if account_age_days < day:
            continue

        should_send = False
        if day_key == "day_1":
            should_send = not has_workouts
        elif day_key == "day_7":
            should_send = not has_recent_workout
        elif day_key == "day_30":
            should_send = not has_recent_workout

        if should_send:
            template = LIFECYCLE_TEMPLATES[day_key]
            jobs.append(
                {
                    "user_id": user_id,
                    "day_key": day_key,
                    "title": template["title"],
                    "body": template["body"],
                    "scheduled_at": now,
                }
            )

    return jobs


async def require_internal_cron(request: Request) -> None:
    if not CRON_INTERNAL_KEY:
        raise HTTPException(status_code=503, detail="CRON_INTERNAL_KEY not configured")

    incoming_key = request.headers.get("x-internal-cron-key")
    if incoming_key != CRON_INTERNAL_KEY:
        raise HTTPException(status_code=401, detail="Unauthorized internal cron request")


async def send_expo_push_notifications(messages: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Sends Expo push notifications in batches and returns per-message results
    preserving input order.
    """
    if not messages:
        return []

    results: List[Dict[str, Any]] = []
    async with httpx.AsyncClient(timeout=20.0) as client:
        for idx in range(0, len(messages), EXPO_PUSH_MAX_BATCH):
            chunk = messages[idx : idx + EXPO_PUSH_MAX_BATCH]
            try:
                response = await client.post(
                    EXPO_PUSH_API_URL,
                    headers={"Content-Type": "application/json", "Accept": "application/json"},
                    json=chunk,
                )
            except Exception as exc:
                logger.error(f"Expo push request failed: {exc}")
                results.extend(
                    [
                        {
                            "status": "error",
                            "details": "request_failed",
                            "message": str(exc),
                        }
                        for _ in chunk
                    ]
                )
                continue

            if response.status_code >= 400:
                body_preview = response.text[:500]
                logger.error(f"Expo push non-2xx response {response.status_code}: {body_preview}")
                results.extend(
                    [
                        {
                            "status": "error",
                            "details": "http_error",
                            "http_status": response.status_code,
                            "message": body_preview,
                        }
                        for _ in chunk
                    ]
                )
                continue

            try:
                payload = response.json()
                data = payload.get("data", []) if isinstance(payload, dict) else []
            except Exception as exc:
                logger.error(f"Expo push response parse failed: {exc}")
                results.extend(
                    [
                        {
                            "status": "error",
                            "details": "invalid_response",
                            "message": str(exc),
                        }
                        for _ in chunk
                    ]
                )
                continue

            if not isinstance(data, list) or len(data) != len(chunk):
                results.extend(
                    [
                        {
                            "status": "error",
                            "details": "mismatched_response_length",
                        }
                        for _ in chunk
                    ]
                )
                continue

            for item in data:
                if isinstance(item, dict):
                    status = item.get("status", "error")
                    details = item.get("details")
                    message = item.get("message")
                    ticket_id = item.get("id")
                    results.append(
                        {
                            "status": status,
                            "details": details,
                            "message": message,
                            "ticket_id": ticket_id,
                        }
                    )
                else:
                    results.append(
                        {
                            "status": "error",
                            "details": "invalid_result_item",
                        }
                    )

    return results

# ============== Models ==============

class UserCreate(BaseModel):
    email: str
    name: str
    picture: Optional[str] = None

class User(BaseModel):
    user_id: str
    email: str
    name: str
    picture: Optional[str] = None
    created_at: datetime
    goals: Optional[Dict[str, Any]] = None
    equipment: Optional[List[str]] = None

class UserGoals(BaseModel):
    daily_calories: int = Field(default=2000, ge=800, le=10000)
    protein_grams: int = Field(default=150, ge=0, le=600)
    carbs_grams: int = Field(default=200, ge=0, le=1000)
    fat_grams: int = Field(default=65, ge=0, le=400)
    workouts_per_week: int = Field(default=4, ge=1, le=14)

class UserEquipment(BaseModel):
    equipment: List[str] = Field(default_factory=list, min_length=0, max_length=20)

    @field_validator("equipment")
    @classmethod
    def validate_equipment(cls, values: List[str]) -> List[str]:
        normalized = []
        for item in values:
            equipment = item.strip().lower()
            if equipment not in ALLOWED_EQUIPMENT:
                raise ValueError(f"Unsupported equipment: {item}")
            if equipment not in normalized:
                normalized.append(equipment)
        return normalized

class Exercise(BaseModel):
    exercise_id: str = Field(default_factory=lambda: f"ex_{uuid.uuid4().hex[:12]}")
    name: str
    category: str  # chest, back, shoulders, legs, arms, core
    equipment_required: List[str] = []  # equipment needed
    muscle_groups: List[str] = []
    is_compound: bool = False

class WorkoutSet(BaseModel):
    set_number: int = Field(ge=1, le=50)
    weight: float = Field(ge=0, le=5000)
    reps: int = Field(ge=1, le=200)
    rpe: Optional[int] = Field(default=None, ge=1, le=10)  # Rate of Perceived Exertion 1-10
    is_warmup: bool = False

class WorkoutExercise(BaseModel):
    exercise_id: str = Field(min_length=1, max_length=64)
    exercise_name: str = Field(min_length=1, max_length=120)
    sets: List[WorkoutSet] = Field(default_factory=list, max_length=30)
    notes: Optional[str] = Field(default=None, max_length=1000)

class Workout(BaseModel):
    workout_id: str = Field(default_factory=lambda: f"wk_{uuid.uuid4().hex[:12]}")
    user_id: str
    date: datetime
    name: str = "Workout"
    exercises: List[WorkoutExercise] = []
    duration_minutes: Optional[int] = None
    notes: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class WorkoutCreate(BaseModel):
    name: str = Field(default="Workout", min_length=1, max_length=120)
    date: Optional[datetime] = None
    exercises: List[WorkoutExercise] = Field(default_factory=list, max_length=60)
    duration_minutes: Optional[int] = Field(default=None, ge=1, le=600)
    notes: Optional[str] = Field(default=None, max_length=3000)

class Food(BaseModel):
    food_id: str = Field(default_factory=lambda: f"fd_{uuid.uuid4().hex[:12]}")
    name: str
    category: str  # protein, carbs, fats, vegetables, dairy, etc.
    serving_size: str  # "100g", "1 cup", etc.
    calories: float
    protein: float
    carbs: float
    fat: float
    fiber: Optional[float] = 0

class MealEntry(BaseModel):
    food_id: str
    food_name: str
    servings: float
    calories: float
    protein: float
    carbs: float
    fat: float

class DailyNutrition(BaseModel):
    nutrition_id: str = Field(default_factory=lambda: f"nt_{uuid.uuid4().hex[:12]}")
    user_id: str
    date: str  # YYYY-MM-DD format
    meals: Dict[str, List[MealEntry]] = {"breakfast": [], "lunch": [], "dinner": [], "snacks": []}
    total_calories: float = 0
    total_protein: float = 0
    total_carbs: float = 0
    total_fat: float = 0
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class MealEntryCreate(BaseModel):
    meal_type: str  # breakfast, lunch, dinner, snacks
    food_id: str = Field(min_length=1, max_length=64)
    food_name: str = Field(min_length=1, max_length=120)
    servings: float = Field(gt=0, le=20)
    calories: float = Field(ge=0, le=5000)
    protein: float = Field(ge=0, le=500)
    carbs: float = Field(ge=0, le=1000)
    fat: float = Field(ge=0, le=500)

    @field_validator("meal_type")
    @classmethod
    def validate_meal_type(cls, value: str) -> str:
        normalized = value.strip().lower()
        if normalized not in ALLOWED_MEAL_TYPES:
            raise ValueError("meal_type must be one of: breakfast, lunch, dinner, snacks")
        return normalized


class PushTokenUpsert(BaseModel):
    expo_push_token: str = Field(min_length=20, max_length=300)
    platform: Optional[str] = Field(default=None, max_length=20)


class LifecycleDispatchRequest(BaseModel):
    dry_run: bool = True
    user_limit: int = Field(default=500, ge=1, le=5000)


class FirstWorkoutTelemetry(BaseModel):
    workout_id: Optional[str] = Field(default=None, min_length=1, max_length=120)
    completed_at: Optional[datetime] = None


class HealthIntegrationTelemetry(BaseModel):
    provider: str = Field(min_length=2, max_length=40)
    event_type: str = Field(min_length=2, max_length=50)
    success: bool = True
    native_bridge_available: bool = False
    provider_records_read: int = Field(default=0, ge=0, le=2000000)
    error_message: Optional[str] = Field(default=None, max_length=280)

    @field_validator("provider")
    @classmethod
    def validate_provider(cls, value: str) -> str:
        normalized = value.strip().lower()
        if normalized not in {"apple_health", "google_fit"}:
            raise ValueError("provider must be apple_health or google_fit")
        return normalized

    @field_validator("event_type")
    @classmethod
    def validate_event_type(cls, value: str) -> str:
        normalized = value.strip().lower()
        allowed = {
            "consent_enabled",
            "consent_disabled",
            "connect_attempt",
            "connect_success",
            "connect_failed",
            "sync_success",
            "sync_failed",
            "provider_toggle",
        }
        if normalized not in allowed:
            raise ValueError("Unsupported event_type")
        return normalized


class SupersetTelemetry(BaseModel):
    event_type: str = Field(min_length=2, max_length=80)
    success: bool = True
    is_pro: bool = False
    workout_id: Optional[str] = Field(default=None, min_length=1, max_length=120)
    groups_count: int = Field(default=0, ge=0, le=50)
    exercises_count: int = Field(default=0, ge=0, le=200)
    context: Optional[str] = Field(default=None, max_length=80)

    @field_validator("event_type")
    @classmethod
    def validate_event_type(cls, value: str) -> str:
        normalized = value.strip().lower()
        allowed = {
            "superset_attempt",
            "superset_attempt_blocked",
            "superset_paywall_view",
            "superset_completed_workout",
            "superset_first_completion_prompt_shown",
        }
        if normalized not in allowed:
            raise ValueError("Unsupported event_type")
        return normalized


class PaywallTelemetry(BaseModel):
    feature: str = Field(min_length=2, max_length=80)
    placement: str = Field(min_length=2, max_length=120)
    event_type: str = Field(min_length=2, max_length=40)
    context: Optional[str] = Field(default=None, max_length=160)

    @field_validator("event_type")
    @classmethod
    def validate_event_type(cls, value: str) -> str:
        normalized = value.strip().lower()
        if normalized not in {"view", "cta_click", "purchase_completed", "dismiss"}:
            raise ValueError("Unsupported event_type")
        return normalized


class EngagementTelemetry(BaseModel):
    feature: str = Field(min_length=2, max_length=80)
    action: str = Field(min_length=2, max_length=80)
    context: Optional[str] = Field(default=None, max_length=160)


class SocialEventTelemetry(BaseModel):
    event_type: str = Field(min_length=2, max_length=80)
    context: Optional[str] = Field(default=None, max_length=160)


class OnboardingTelemetry(BaseModel):
    milestone: str = Field(min_length=2, max_length=80)
    context: Optional[str] = Field(default=None, max_length=160)


class FriendConnectRequest(BaseModel):
    friend_user_id: str = Field(min_length=2, max_length=120)

    @field_validator("friend_user_id")
    @classmethod
    def validate_friend_user_id(cls, value: str) -> str:
        return value.strip()


class FriendInviteRequest(BaseModel):
    target_user_id: str = Field(min_length=2, max_length=120)

    @field_validator("target_user_id")
    @classmethod
    def validate_target_user_id(cls, value: str) -> str:
        return value.strip()


class FriendInviteReminderRequest(BaseModel):
    dry_run: bool = True
    min_age_hours: int = Field(default=24, ge=1, le=168)


def evaluate_strava_wearable_scope(
    adoption_rate_percent: float,
    avg_sync_events_per_adopted_user: float,
    adopted_users: int,
    active_providers: int,
) -> Dict[str, Any]:
    provider_balance_bonus = 15 if active_providers >= 2 else 0
    scale_bonus = 10 if adopted_users >= 50 else (5 if adopted_users >= 20 else 0)

    score = min(
        100,
        round(
            adoption_rate_percent * 0.6
            + min(avg_sync_events_per_adopted_user, 10) * 3
            + provider_balance_bonus
            + scale_bonus,
            1,
        ),
    )

    if score >= 65:
        recommendation = "proceed_now"
        rationale = "Adoption and sync depth indicate enough demand to justify Strava/wearable integration build-out."
    elif score >= 40:
        recommendation = "validate_further"
        rationale = "Signal is moderate. Keep measuring and run a short validation cycle before full implementation."
    else:
        recommendation = "defer"
        rationale = "Current adoption signal is weak. Prioritize analytics depth and re-evaluate after additional telemetry."

    return {
        "score": score,
        "recommendation": recommendation,
        "rationale": rationale,
    }


def aggregate_workout_social_stats(workouts: List[Dict[str, Any]]) -> Dict[str, float]:
    total_sets = 0
    total_volume = 0.0

    for workout in workouts:
        for exercise in workout.get("exercises", []) or []:
            for set_data in exercise.get("sets", []) or []:
                reps = float(set_data.get("reps", 0) or 0)
                weight = float(set_data.get("weight", 0) or 0)
                if reps <= 0:
                    continue
                total_sets += 1
                total_volume += max(weight, 0) * reps

    return {
        "workouts": len(workouts),
        "total_sets": total_sets,
        "total_volume": round(total_volume, 2),
    }

# ============== Auth Helpers ==============

async def get_current_user(request: Request) -> User:
    """Get current user from session token"""
    session_token = request.cookies.get("session_token")
    bearer_token = None
    if not session_token:
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            bearer_token = auth_header.split(" ")[1]
            session_token = bearer_token
    
    if not session_token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    session = await db.user_sessions.find_one({"session_token": session_token}, {"_id": 0})

    # If no db session exists, treat bearer token as Firebase ID token and
    # verify server-side before authorizing access.
    if not session and bearer_token:
        firebase_payload = await verify_firebase_token_payload(bearer_token)
        firebase_user_id = firebase_payload.get("sub") if firebase_payload else None
        if not firebase_user_id:
            raise HTTPException(status_code=401, detail="Invalid session")

        request.state.firebase_claims = firebase_payload

        user = await db.users.find_one({"user_id": firebase_user_id}, {"_id": 0})
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        return User(**user)

    if not session:
        raise HTTPException(status_code=401, detail="Invalid session")
    
    expires_at = session["expires_at"]
    if isinstance(expires_at, str):
        expires_at = datetime.fromisoformat(expires_at)
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=401, detail="Session expired")
    
    user = await db.users.find_one({"user_id": session["user_id"]}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    return User(**user)


async def _get_firebase_certs() -> Dict[str, str]:
    now = datetime.now(timezone.utc)
    if _firebase_certs_cache["certs"] and _firebase_certs_cache["expires_at"] > now:
        return _firebase_certs_cache["certs"]

    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.get(FIREBASE_CERTS_URL)
        response.raise_for_status()

        certs = response.json()
        cache_control = response.headers.get("Cache-Control", "")
        max_age_seconds = 3600
        for part in cache_control.split(","):
            part = part.strip()
            if part.startswith("max-age="):
                try:
                    max_age_seconds = int(part.split("=", 1)[1])
                except ValueError:
                    max_age_seconds = 3600

        _firebase_certs_cache["certs"] = certs
        _firebase_certs_cache["expires_at"] = now + timedelta(seconds=max_age_seconds)
        return certs


async def verify_firebase_id_token(token: str) -> Optional[str]:
    payload = await verify_firebase_token_payload(token)
    return payload.get("sub") if payload else None


async def verify_firebase_token_payload(token: str) -> Optional[Dict[str, Any]]:
    if not FIREBASE_PROJECT_ID:
        logger.warning("FIREBASE_PROJECT_ID not set; cannot verify Firebase ID token")
        return None

    try:
        unverified_header = jwt.get_unverified_header(token)
        kid = unverified_header.get("kid")
        if not kid:
            return None

        certs = await _get_firebase_certs()
        cert = certs.get(kid)
        if not cert:
            return None

        payload = jwt.decode(
            token,
            cert,
            algorithms=["RS256"],
            audience=FIREBASE_PROJECT_ID,
            issuer=f"https://securetoken.google.com/{FIREBASE_PROJECT_ID}",
        )

        user_id = payload.get("sub")
        if not user_id:
            return None
        return payload
    except InvalidTokenError as e:
        logger.warning(f"Firebase token verification failed: {e}")
        return None
    except Exception as e:
        logger.error(f"Firebase cert/token verification error: {e}")
        return None


def _claims_grant_pro(claims: Dict[str, Any]) -> bool:
    if not claims:
        return False

    if claims.get("isPro") is True or claims.get("pro") is True:
        return True

    entitlements = claims.get("entitlements")
    if isinstance(entitlements, dict):
        if entitlements.get("pro") is True:
            return True

    return False


async def require_pro_user(request: Request, user: User = Depends(get_current_user)) -> User:
    """
    Server-authoritative Pro entitlement check.
    Priority:
    1) Verified Firebase custom claims (webhook/admin-managed)
    2) Backend user record flags (isPro / entitlements.pro / subscription.pro)
    """
    firebase_claims = getattr(request.state, "firebase_claims", None) or {}
    if _claims_grant_pro(firebase_claims):
        return user

    user_doc = await db.users.find_one(
        {"user_id": user.user_id},
        {"_id": 0, "isPro": 1, "entitlements": 1, "subscription": 1},
    )

    if user_doc:
        if user_doc.get("isPro") is True:
            return user

        entitlements = user_doc.get("entitlements")
        if isinstance(entitlements, dict) and entitlements.get("pro") is True:
            return user

        subscription = user_doc.get("subscription")
        if isinstance(subscription, dict) and subscription.get("pro") is True:
            return user

    raise HTTPException(status_code=403, detail="Pro subscription required")

# ============== Auth Endpoints ==============

@api_router.post("/auth/session")
async def exchange_session(request: Request, response: Response):
    """Exchange session_id from OAuth callback for session_token"""
    await enforce_mutation_rate_limit(request, "auth.session", limit=20, window_seconds=60)
    body = await request.json()
    session_id = body.get("session_id")
    
    if not session_id:
        raise HTTPException(status_code=400, detail="session_id required")
    
    # Call Emergent Auth to get user data
    async with httpx.AsyncClient() as client:
        try:
            auth_response = await client.get(
                "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
                headers={"X-Session-ID": session_id}
            )
            if auth_response.status_code != 200:
                raise HTTPException(status_code=401, detail="Invalid session_id")
            
            auth_data = auth_response.json()
        except Exception as e:
            logger.error(f"Auth error: {e}")
            raise HTTPException(status_code=401, detail="Authentication failed")
    
    email = auth_data["email"]
    name = auth_data["name"]
    picture = auth_data.get("picture")
    session_token = auth_data["session_token"]
    
    # Check if user exists
    existing_user = await db.users.find_one({"email": email}, {"_id": 0})
    
    if existing_user:
        user_id = existing_user["user_id"]
        # Update user info if needed
        await db.users.update_one(
            {"email": email},
            {"$set": {"name": name, "picture": picture}}
        )
    else:
        # Create new user
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        new_user = {
            "user_id": user_id,
            "email": email,
            "name": name,
            "picture": picture,
            "created_at": datetime.now(timezone.utc),
            "goals": {
                "daily_calories": 2000,
                "protein_grams": 150,
                "carbs_grams": 200,
                "fat_grams": 65,
                "workouts_per_week": 4
            },
            "equipment": ["dumbbells", "barbell", "pullup_bar"]
        }
        await db.users.insert_one(new_user)
    
    # Store session
    expires_at = datetime.now(timezone.utc) + timedelta(days=7)
    await db.user_sessions.delete_many({"user_id": user_id})  # Remove old sessions
    await db.user_sessions.insert_one({
        "user_id": user_id,
        "session_token": session_token,
        "expires_at": expires_at,
        "created_at": datetime.now(timezone.utc)
    })
    
    # Set cookie
    response.set_cookie(
        key="session_token",
        value=session_token,
        httponly=True,
        secure=True,
        samesite="none",
        max_age=7 * 24 * 60 * 60,
        path="/"
    )
    
    user = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    return {"user": user, "session_token": session_token}

@api_router.get("/auth/me")
async def get_me(user: User = Depends(get_current_user)):
    """Get current authenticated user"""
    return user.model_dump()

@api_router.post("/auth/logout")
async def logout(request: Request, response: Response):
    """Logout user"""
    await enforce_mutation_rate_limit(request, "auth.logout", limit=30, window_seconds=60)
    session_token = request.cookies.get("session_token")
    if session_token:
        await db.user_sessions.delete_one({"session_token": session_token})
    
    response.delete_cookie(key="session_token", path="/")
    return {"message": "Logged out"}

# ============== User Endpoints ==============

@api_router.put("/user/goals")
async def update_goals(goals: UserGoals, request: Request, user: User = Depends(get_current_user)):
    """Update user nutrition/fitness goals"""
    await enforce_mutation_rate_limit(request, "user.goals", user.user_id, limit=30, window_seconds=60)
    await db.users.update_one(
        {"user_id": user.user_id},
        {"$set": {"goals": goals.model_dump()}}
    )
    return {"message": "Goals updated", "goals": goals.model_dump()}

@api_router.put("/user/equipment")
async def update_equipment(equipment: UserEquipment, request: Request, user: User = Depends(get_current_user)):
    """Update user's home gym equipment"""
    await enforce_mutation_rate_limit(request, "user.equipment", user.user_id, limit=30, window_seconds=60)
    await db.users.update_one(
        {"user_id": user.user_id},
        {"$set": {"equipment": equipment.equipment}}
    )
    return {"message": "Equipment updated", "equipment": equipment.equipment}

# ============== Exercise Database ==============

# Default exercise database
DEFAULT_EXERCISES = [
    # Chest
    {"name": "Bench Press", "category": "chest", "equipment_required": ["barbell", "bench"], "muscle_groups": ["chest", "triceps", "shoulders"], "is_compound": True},
    {"name": "Dumbbell Bench Press", "category": "chest", "equipment_required": ["dumbbells", "bench"], "muscle_groups": ["chest", "triceps", "shoulders"], "is_compound": True},
    {"name": "Incline Dumbbell Press", "category": "chest", "equipment_required": ["dumbbells", "bench"], "muscle_groups": ["upper_chest", "triceps"], "is_compound": True},
    {"name": "Push-ups", "category": "chest", "equipment_required": [], "muscle_groups": ["chest", "triceps", "shoulders"], "is_compound": True},
    {"name": "Dumbbell Flyes", "category": "chest", "equipment_required": ["dumbbells", "bench"], "muscle_groups": ["chest"], "is_compound": False},
    
    # Back
    {"name": "Pull-ups", "category": "back", "equipment_required": ["pullup_bar"], "muscle_groups": ["lats", "biceps", "back"], "is_compound": True},
    {"name": "Chin-ups", "category": "back", "equipment_required": ["pullup_bar"], "muscle_groups": ["lats", "biceps"], "is_compound": True},
    {"name": "Barbell Rows", "category": "back", "equipment_required": ["barbell"], "muscle_groups": ["back", "lats", "biceps"], "is_compound": True},
    {"name": "Dumbbell Rows", "category": "back", "equipment_required": ["dumbbells"], "muscle_groups": ["back", "lats", "biceps"], "is_compound": True},
    {"name": "Deadlift", "category": "back", "equipment_required": ["barbell"], "muscle_groups": ["back", "hamstrings", "glutes"], "is_compound": True},
    
    # Shoulders
    {"name": "Overhead Press", "category": "shoulders", "equipment_required": ["barbell"], "muscle_groups": ["shoulders", "triceps"], "is_compound": True},
    {"name": "Dumbbell Shoulder Press", "category": "shoulders", "equipment_required": ["dumbbells"], "muscle_groups": ["shoulders", "triceps"], "is_compound": True},
    {"name": "Lateral Raises", "category": "shoulders", "equipment_required": ["dumbbells"], "muscle_groups": ["side_delts"], "is_compound": False},
    {"name": "Front Raises", "category": "shoulders", "equipment_required": ["dumbbells"], "muscle_groups": ["front_delts"], "is_compound": False},
    {"name": "Face Pulls", "category": "shoulders", "equipment_required": ["cables"], "muscle_groups": ["rear_delts", "traps"], "is_compound": False},
    
    # Legs
    {"name": "Squats", "category": "legs", "equipment_required": ["barbell"], "muscle_groups": ["quads", "glutes", "hamstrings"], "is_compound": True},
    {"name": "Goblet Squats", "category": "legs", "equipment_required": ["dumbbells"], "muscle_groups": ["quads", "glutes"], "is_compound": True},
    {"name": "Romanian Deadlift", "category": "legs", "equipment_required": ["barbell"], "muscle_groups": ["hamstrings", "glutes"], "is_compound": True},
    {"name": "Dumbbell Lunges", "category": "legs", "equipment_required": ["dumbbells"], "muscle_groups": ["quads", "glutes"], "is_compound": True},
    {"name": "Leg Press", "category": "legs", "equipment_required": ["machines"], "muscle_groups": ["quads", "glutes"], "is_compound": True},
    {"name": "Calf Raises", "category": "legs", "equipment_required": [], "muscle_groups": ["calves"], "is_compound": False},
    
    # Arms
    {"name": "Barbell Curls", "category": "arms", "equipment_required": ["barbell"], "muscle_groups": ["biceps"], "is_compound": False},
    {"name": "Dumbbell Curls", "category": "arms", "equipment_required": ["dumbbells"], "muscle_groups": ["biceps"], "is_compound": False},
    {"name": "Hammer Curls", "category": "arms", "equipment_required": ["dumbbells"], "muscle_groups": ["biceps", "forearms"], "is_compound": False},
    {"name": "Tricep Dips", "category": "arms", "equipment_required": [], "muscle_groups": ["triceps"], "is_compound": True},
    {"name": "Skull Crushers", "category": "arms", "equipment_required": ["barbell", "bench"], "muscle_groups": ["triceps"], "is_compound": False},
    {"name": "Tricep Pushdowns", "category": "arms", "equipment_required": ["cables"], "muscle_groups": ["triceps"], "is_compound": False},
    
    # Core
    {"name": "Planks", "category": "core", "equipment_required": [], "muscle_groups": ["abs", "core"], "is_compound": False},
    {"name": "Crunches", "category": "core", "equipment_required": [], "muscle_groups": ["abs"], "is_compound": False},
    {"name": "Leg Raises", "category": "core", "equipment_required": ["pullup_bar"], "muscle_groups": ["lower_abs"], "is_compound": False},
    {"name": "Russian Twists", "category": "core", "equipment_required": [], "muscle_groups": ["obliques"], "is_compound": False},
    {"name": "Ab Wheel Rollouts", "category": "core", "equipment_required": [], "muscle_groups": ["abs", "core"], "is_compound": True},
]

@api_router.get("/exercises")
async def get_exercises(category: Optional[str] = None, equipment: Optional[str] = None):
    """Get exercises, optionally filtered by category or equipment"""
    # Initialize exercises in DB if empty
    count = await db.exercises.count_documents({})
    if count == 0:
        for ex in DEFAULT_EXERCISES:
            ex_obj = Exercise(**ex)
            await db.exercises.insert_one(ex_obj.model_dump())
    
    query = {}
    if category:
        query["category"] = category
    
    # Optimized projection for exercises
    projection = {
        "_id": 0,
        "exercise_id": 1,
        "name": 1,
        "category": 1,
        "equipment_required": 1,
        "muscle_groups": 1,
        "description": 1
    }
    exercises = await db.exercises.find(query, projection).to_list(100)
    
    # Filter by equipment if provided
    if equipment:
        equipment_list = equipment.split(",")
        exercises = [
            ex for ex in exercises 
            if not ex["equipment_required"] or 
            any(eq in equipment_list for eq in ex["equipment_required"])
        ]
    
    return exercises

@api_router.get("/exercises/for-user")
async def get_exercises_for_user(user: User = Depends(get_current_user), category: Optional[str] = None):
    """Get exercises filtered by user's equipment"""
    user_equipment = user.equipment or []
    
    # Always include bodyweight exercises (no equipment)
    user_equipment_set = set(user_equipment)
    
    query = {}
    if category:
        query["category"] = category
    
    # Optimized projection for exercises
    projection = {
        "_id": 0,
        "exercise_id": 1,
        "name": 1,
        "category": 1,
        "equipment_required": 1,
        "muscle_groups": 1,
        "description": 1
    }
    exercises = await db.exercises.find(query, projection).to_list(100)
    
    # Filter: include if no equipment needed OR user has the required equipment
    filtered = [
        ex for ex in exercises
        if not ex["equipment_required"] or
        all(eq in user_equipment_set for eq in ex["equipment_required"])
    ]
    
    return filtered

# ============== Workout Endpoints ==============

@api_router.post("/workouts")
async def create_workout(workout: WorkoutCreate, request: Request, user: User = Depends(get_current_user)):
    """Create a new workout"""
    await enforce_mutation_rate_limit(request, "workouts.create", user.user_id, limit=20, window_seconds=60)
    workout_obj = Workout(
        user_id=user.user_id,
        date=workout.date or datetime.now(timezone.utc),
        name=workout.name,
        exercises=workout.exercises,
        duration_minutes=workout.duration_minutes,
        notes=workout.notes
    )
    await db.workouts.insert_one(workout_obj.model_dump())
    return workout_obj.model_dump()

@api_router.get("/workouts")
async def get_workouts(user: User = Depends(get_current_user), limit: int = 20, skip: int = 0):
    """Get user's workouts"""
    workouts = await db.workouts.find(
        {"user_id": user.user_id}, 
        {"_id": 0}
    ).sort("date", -1).skip(skip).limit(limit).to_list(limit)
    return workouts

@api_router.get("/workouts/{workout_id}")
async def get_workout(workout_id: str, user: User = Depends(get_current_user)):
    """Get a specific workout"""
    workout = await db.workouts.find_one(
        {"workout_id": workout_id, "user_id": user.user_id},
        {"_id": 0}
    )
    if not workout:
        raise HTTPException(status_code=404, detail="Workout not found")
    return workout

@api_router.put("/workouts/{workout_id}")
async def update_workout(workout_id: str, workout: WorkoutCreate, request: Request, user: User = Depends(get_current_user)):
    """Update a workout"""
    await enforce_mutation_rate_limit(request, "workouts.update", user.user_id, limit=30, window_seconds=60)
    existing = await db.workouts.find_one({"workout_id": workout_id, "user_id": user.user_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Workout not found")
    
    update_data = workout.model_dump(exclude_unset=True)
    await db.workouts.update_one(
        {"workout_id": workout_id},
        {"$set": update_data}
    )
    
    updated = await db.workouts.find_one({"workout_id": workout_id}, {"_id": 0})
    return updated

@api_router.delete("/workouts/{workout_id}")
async def delete_workout(workout_id: str, request: Request, user: User = Depends(get_current_user)):
    """Delete a workout"""
    await enforce_mutation_rate_limit(request, "workouts.delete", user.user_id, limit=20, window_seconds=60)
    result = await db.workouts.delete_one({"workout_id": workout_id, "user_id": user.user_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Workout not found")
    return {"message": "Workout deleted"}

# ============== Warm-up Calculator ==============

@api_router.post("/workouts/warmup-sets")
async def calculate_warmup_sets(
    request: Request,
    working_weight: float = Query(..., ge=0, le=2000),
    exercise_name: str = Query(..., min_length=1, max_length=120),
):
    """Calculate warm-up sets based on working weight"""
    await enforce_mutation_rate_limit(request, "workouts.warmup", limit=60, window_seconds=60)
    warmup_sets = []
    
    if working_weight <= 0:
        return {"warmup_sets": []}
    
    # Standard warm-up progression
    percentages = [0.4, 0.6, 0.8]  # 40%, 60%, 80% of working weight
    reps = [10, 6, 3]  # Decreasing reps as weight increases
    
    for i, pct in enumerate(percentages):
        warmup_weight = round(working_weight * pct / 5) * 5  # Round to nearest 5
        if warmup_weight >= 10:  # Only add if weight is meaningful
            warmup_sets.append({
                "set_number": i + 1,
                "weight": warmup_weight,
                "reps": reps[i],
                "percentage": int(pct * 100),
                "is_warmup": True
            })
    
    return {"warmup_sets": warmup_sets, "working_weight": working_weight}

# ============== Adaptive Progression AI ==============

class ProgressionSuggestion(BaseModel):
    exercise_name: str
    current_weight: float
    suggested_weight: float
    increase_amount: float
    increase_percentage: float
    confidence: str  # high, medium, low
    reason: str
    recent_performance: List[Dict[str, Any]]

@api_router.get("/progression/suggestions")
async def get_progression_suggestions(user: User = Depends(require_pro_user)):
    """
    AI-powered progression suggestions based on workout history.
    Analyzes recent performance and suggests weight increases.
    """
    # Get user's workouts from last 30 days
    start_date = datetime.now(timezone.utc) - timedelta(days=30)
    workouts = await db.workouts.find(
        {"user_id": user.user_id, "date": {"$gte": start_date}},
        {"_id": 0}
    ).sort("date", -1).to_list(50)
    
    # Analyze exercise performance
    exercise_history: Dict[str, List[Dict]] = {}
    
    for workout in workouts:
        workout_date = workout.get("date")
        for exercise in workout.get("exercises", []):
            ex_name = exercise.get("exercise_name")
            if not ex_name:
                continue
            
            if ex_name not in exercise_history:
                exercise_history[ex_name] = []
            
            # Get working sets (non-warmup)
            working_sets = [s for s in exercise.get("sets", []) if not s.get("is_warmup", False)]
            
            if working_sets:
                max_weight = max(s.get("weight", 0) for s in working_sets)
                total_reps = sum(s.get("reps", 0) for s in working_sets)
                avg_rpe = sum(s.get("rpe", 7) for s in working_sets if s.get("rpe")) / len([s for s in working_sets if s.get("rpe")]) if any(s.get("rpe") for s in working_sets) else 7
                sets_completed = len(working_sets)
                
                exercise_history[ex_name].append({
                    "date": workout_date.isoformat() if isinstance(workout_date, datetime) else str(workout_date),
                    "max_weight": max_weight,
                    "sets_completed": sets_completed,
                    "total_reps": total_reps,
                    "avg_rpe": round(avg_rpe, 1)
                })
    
    suggestions = []
    
    for ex_name, history in exercise_history.items():
        if len(history) < 2:
            continue  # Need at least 2 sessions for analysis
        
        # Get recent sessions (last 3)
        recent = history[:3]
        
        # Check for consistent performance
        current_weight = recent[0]["max_weight"]
        
        if current_weight <= 0:
            continue
        
        # Analyze if ready for progression
        # Criteria:
        # 1. Completed 3+ sets in recent sessions
        # 2. RPE is manageable (7 or below average)
        # 3. Consistent or improving performance
        
        avg_sets = sum(r["sets_completed"] for r in recent) / len(recent)
        avg_rpe = sum(r["avg_rpe"] for r in recent) / len(recent)
        weights = [r["max_weight"] for r in recent]
        
        # Determine progression
        should_progress = False
        confidence = "low"
        reason = ""
        increase_pct = 0
        
        if avg_sets >= 3 and avg_rpe <= 7:
            should_progress = True
            confidence = "high"
            increase_pct = 5  # 5% increase for good performance
            reason = f"Excellent! Completed avg {avg_sets:.1f} sets at RPE {avg_rpe:.1f}. Ready for progression."
        elif avg_sets >= 3 and avg_rpe <= 8:
            should_progress = True
            confidence = "medium"
            increase_pct = 2.5  # 2.5% increase for moderate performance
            reason = f"Good progress! Completed avg {avg_sets:.1f} sets at RPE {avg_rpe:.1f}. Small increase recommended."
        elif avg_rpe >= 9:
            should_progress = False
            confidence = "high"
            reason = f"RPE is high ({avg_rpe:.1f}). Focus on current weight before progressing."
        else:
            # Check if weights are stagnant
            if len(set(weights)) == 1 and len(recent) >= 3:
                should_progress = True
                confidence = "low"
                increase_pct = 2.5
                reason = "Weight has been constant. Try a small increase to test limits."
        
        if should_progress and increase_pct > 0:
            increase_amount = round(current_weight * (increase_pct / 100) / 2.5) * 2.5  # Round to 2.5
            if increase_amount < 2.5:
                increase_amount = 2.5
            
            suggested_weight = current_weight + increase_amount
            
            suggestions.append({
                "exercise_name": ex_name,
                "current_weight": current_weight,
                "suggested_weight": suggested_weight,
                "increase_amount": increase_amount,
                "increase_percentage": round((increase_amount / current_weight) * 100, 1),
                "confidence": confidence,
                "reason": reason,
                "recent_performance": recent
            })
    
    # Sort by confidence (high first)
    confidence_order = {"high": 0, "medium": 1, "low": 2}
    suggestions.sort(key=lambda x: confidence_order.get(x["confidence"], 3))
    
    return {
        "suggestions": suggestions,
        "total_exercises_analyzed": len(exercise_history),
        "generated_at": datetime.now(timezone.utc).isoformat()
    }

@api_router.get("/progression/exercise/{exercise_name}")
async def get_exercise_progression(exercise_name: str, user: User = Depends(require_pro_user)):
    """Get detailed progression history for a specific exercise"""
    # Optimized projection - only fetch needed fields
    projection = {
        "_id": 0,
        "workout_id": 1,
        "date": 1,
        "exercises": 1
    }
    # Get workouts with this exercise, limited to 50 for performance
    workouts = await db.workouts.find(
        {"user_id": user.user_id, "exercises.exercise_name": exercise_name},
        projection
    ).sort("date", -1).limit(50).to_list(50)
    
    history = []
    for workout in workouts:
        workout_date = workout.get("date")
        for exercise in workout.get("exercises", []):
            if exercise.get("exercise_name") == exercise_name:
                working_sets = [s for s in exercise.get("sets", []) if not s.get("is_warmup", False)]
                if working_sets:
                    history.append({
                        "date": workout_date.isoformat() if isinstance(workout_date, datetime) else str(workout_date),
                        "workout_id": workout.get("workout_id"),
                        "max_weight": max(s.get("weight", 0) for s in working_sets),
                        "total_volume": sum(s.get("weight", 0) * s.get("reps", 0) for s in working_sets),
                        "sets": len(working_sets),
                        "total_reps": sum(s.get("reps", 0) for s in working_sets),
                        "avg_rpe": round(sum(s.get("rpe", 7) for s in working_sets) / len(working_sets), 1)
                    })
    
    # Calculate personal records
    if history:
        max_weight_ever = max(h["max_weight"] for h in history)
        max_volume_ever = max(h["total_volume"] for h in history)
        
        # Calculate trend (improving, stable, declining)
        if len(history) >= 3:
            recent_avg = sum(h["max_weight"] for h in history[:3]) / 3
            older_avg = sum(h["max_weight"] for h in history[3:6]) / min(3, len(history[3:6])) if len(history) > 3 else recent_avg
            
            if recent_avg > older_avg * 1.05:
                trend = "improving"
            elif recent_avg < older_avg * 0.95:
                trend = "declining"
            else:
                trend = "stable"
        else:
            trend = "not_enough_data"
    else:
        max_weight_ever = 0
        max_volume_ever = 0
        trend = "no_data"
    
    return {
        "exercise_name": exercise_name,
        "history": history[:20],  # Last 20 sessions
        "personal_records": {
            "max_weight": max_weight_ever,
            "max_volume": max_volume_ever
        },
        "trend": trend,
        "total_sessions": len(history)
    }

# ============== Food Database ==============

DEFAULT_FOODS = [
    # Proteins
    {"name": "Chicken Breast", "category": "protein", "serving_size": "100g", "calories": 165, "protein": 31, "carbs": 0, "fat": 3.6, "fiber": 0},
    {"name": "Salmon", "category": "protein", "serving_size": "100g", "calories": 208, "protein": 20, "carbs": 0, "fat": 13, "fiber": 0},
    {"name": "Ground Beef (93% lean)", "category": "protein", "serving_size": "100g", "calories": 164, "protein": 26, "carbs": 0, "fat": 6, "fiber": 0},
    {"name": "Eggs", "category": "protein", "serving_size": "1 large", "calories": 72, "protein": 6, "carbs": 0.4, "fat": 5, "fiber": 0},
    {"name": "Greek Yogurt", "category": "protein", "serving_size": "170g", "calories": 100, "protein": 17, "carbs": 6, "fat": 0.7, "fiber": 0},
    {"name": "Tuna", "category": "protein", "serving_size": "100g", "calories": 132, "protein": 29, "carbs": 0, "fat": 1, "fiber": 0},
    {"name": "Turkey Breast", "category": "protein", "serving_size": "100g", "calories": 135, "protein": 30, "carbs": 0, "fat": 1, "fiber": 0},
    {"name": "Whey Protein", "category": "protein", "serving_size": "1 scoop (30g)", "calories": 120, "protein": 24, "carbs": 3, "fat": 1, "fiber": 0},
    {"name": "Cottage Cheese", "category": "protein", "serving_size": "100g", "calories": 98, "protein": 11, "carbs": 3.4, "fat": 4.3, "fiber": 0},
    {"name": "Tofu", "category": "protein", "serving_size": "100g", "calories": 76, "protein": 8, "carbs": 2, "fat": 4.8, "fiber": 0.3},
    
    # Carbs
    {"name": "White Rice", "category": "carbs", "serving_size": "100g cooked", "calories": 130, "protein": 2.7, "carbs": 28, "fat": 0.3, "fiber": 0.4},
    {"name": "Brown Rice", "category": "carbs", "serving_size": "100g cooked", "calories": 112, "protein": 2.6, "carbs": 24, "fat": 0.9, "fiber": 1.8},
    {"name": "Sweet Potato", "category": "carbs", "serving_size": "100g", "calories": 86, "protein": 1.6, "carbs": 20, "fat": 0.1, "fiber": 3},
    {"name": "Oats", "category": "carbs", "serving_size": "100g dry", "calories": 389, "protein": 17, "carbs": 66, "fat": 7, "fiber": 11},
    {"name": "Quinoa", "category": "carbs", "serving_size": "100g cooked", "calories": 120, "protein": 4.4, "carbs": 21, "fat": 1.9, "fiber": 2.8},
    {"name": "Whole Wheat Bread", "category": "carbs", "serving_size": "1 slice", "calories": 81, "protein": 4, "carbs": 14, "fat": 1, "fiber": 2},
    {"name": "Pasta", "category": "carbs", "serving_size": "100g cooked", "calories": 131, "protein": 5, "carbs": 25, "fat": 1.1, "fiber": 1.8},
    {"name": "Banana", "category": "carbs", "serving_size": "1 medium", "calories": 105, "protein": 1.3, "carbs": 27, "fat": 0.4, "fiber": 3.1},
    
    # Fats
    {"name": "Avocado", "category": "fats", "serving_size": "100g", "calories": 160, "protein": 2, "carbs": 9, "fat": 15, "fiber": 7},
    {"name": "Almonds", "category": "fats", "serving_size": "28g (1 oz)", "calories": 164, "protein": 6, "carbs": 6, "fat": 14, "fiber": 3.5},
    {"name": "Peanut Butter", "category": "fats", "serving_size": "2 tbsp", "calories": 188, "protein": 8, "carbs": 6, "fat": 16, "fiber": 2},
    {"name": "Olive Oil", "category": "fats", "serving_size": "1 tbsp", "calories": 119, "protein": 0, "carbs": 0, "fat": 14, "fiber": 0},
    {"name": "Walnuts", "category": "fats", "serving_size": "28g (1 oz)", "calories": 185, "protein": 4.3, "carbs": 4, "fat": 18.5, "fiber": 1.9},
    {"name": "Cheese (Cheddar)", "category": "fats", "serving_size": "28g (1 oz)", "calories": 113, "protein": 7, "carbs": 0.4, "fat": 9.3, "fiber": 0},
    
    # Vegetables
    {"name": "Broccoli", "category": "vegetables", "serving_size": "100g", "calories": 34, "protein": 2.8, "carbs": 7, "fat": 0.4, "fiber": 2.6},
    {"name": "Spinach", "category": "vegetables", "serving_size": "100g", "calories": 23, "protein": 2.9, "carbs": 3.6, "fat": 0.4, "fiber": 2.2},
    {"name": "Bell Peppers", "category": "vegetables", "serving_size": "100g", "calories": 31, "protein": 1, "carbs": 6, "fat": 0.3, "fiber": 2.1},
    {"name": "Asparagus", "category": "vegetables", "serving_size": "100g", "calories": 20, "protein": 2.2, "carbs": 3.9, "fat": 0.1, "fiber": 2.1},
    {"name": "Green Beans", "category": "vegetables", "serving_size": "100g", "calories": 31, "protein": 1.8, "carbs": 7, "fat": 0.1, "fiber": 3.4},
]

@api_router.get("/foods")
async def get_foods(category: Optional[str] = None, search: Optional[str] = None):
    """Get foods from database"""
    # Initialize foods if empty
    count = await db.foods.count_documents({})
    if count == 0:
        for food in DEFAULT_FOODS:
            food_obj = Food(**food)
            await db.foods.insert_one(food_obj.model_dump())
    
    query = {}
    if category:
        query["category"] = category
    if search:
        query["name"] = {"$regex": search, "$options": "i"}
    
    # Optimized projection for foods
    projection = {
        "_id": 0,
        "food_id": 1,
        "name": 1,
        "category": 1,
        "calories": 1,
        "protein": 1,
        "carbs": 1,
        "fat": 1,
        "serving_size": 1,
        "serving_unit": 1
    }
    foods = await db.foods.find(query, projection).limit(100).to_list(100)
    return foods

# ============== Body Measurements Tracking ==============

class BodyMeasurement(BaseModel):
    measurement_id: str = Field(default_factory=lambda: f"bm_{uuid.uuid4().hex[:12]}")
    user_id: str
    date: str  # YYYY-MM-DD format
    weight: Optional[float] = None  # lbs
    body_fat: Optional[float] = None  # percentage
    chest: Optional[float] = None  # inches
    waist: Optional[float] = None  # inches
    hips: Optional[float] = None  # inches
    biceps_left: Optional[float] = None  # inches
    biceps_right: Optional[float] = None  # inches
    thighs_left: Optional[float] = None  # inches
    thighs_right: Optional[float] = None  # inches
    calves_left: Optional[float] = None  # inches
    calves_right: Optional[float] = None  # inches
    neck: Optional[float] = None  # inches
    shoulders: Optional[float] = None  # inches
    notes: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class MeasurementCreate(BaseModel):
    date: Optional[str] = None
    weight: Optional[float] = Field(default=None, ge=0, le=1400)
    body_fat: Optional[float] = Field(default=None, ge=0, le=80)
    chest: Optional[float] = Field(default=None, ge=0, le=120)
    waist: Optional[float] = Field(default=None, ge=0, le=120)
    hips: Optional[float] = Field(default=None, ge=0, le=120)
    biceps_left: Optional[float] = Field(default=None, ge=0, le=40)
    biceps_right: Optional[float] = Field(default=None, ge=0, le=40)
    thighs_left: Optional[float] = Field(default=None, ge=0, le=80)
    thighs_right: Optional[float] = Field(default=None, ge=0, le=80)
    calves_left: Optional[float] = Field(default=None, ge=0, le=50)
    calves_right: Optional[float] = Field(default=None, ge=0, le=50)
    neck: Optional[float] = Field(default=None, ge=0, le=40)
    shoulders: Optional[float] = Field(default=None, ge=0, le=90)
    notes: Optional[str] = Field(default=None, max_length=1000)

    @field_validator("date")
    @classmethod
    def validate_optional_date(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return value
        datetime.strptime(value, "%Y-%m-%d")
        return value

@api_router.post("/measurements")
async def create_measurement(measurement: MeasurementCreate, request: Request, user: User = Depends(get_current_user)):
    """Create or update body measurement for a date"""
    await enforce_mutation_rate_limit(request, "measurements.write", user.user_id, limit=30, window_seconds=60)
    date = validate_date_key(measurement.date or datetime.now(timezone.utc).strftime("%Y-%m-%d"))
    
    # Check if measurement exists for this date
    existing = await db.body_measurements.find_one(
        {"user_id": user.user_id, "date": date}
    )
    
    if existing:
        # Update existing measurement
        update_data = {k: v for k, v in measurement.model_dump().items() if v is not None}
        update_data.pop("date", None)  # Don't update the date
        await db.body_measurements.update_one(
            {"user_id": user.user_id, "date": date},
            {"$set": update_data}
        )
        updated = await db.body_measurements.find_one(
            {"user_id": user.user_id, "date": date},
            {"_id": 0}
        )
        return updated
    else:
        # Create new measurement
        new_measurement = BodyMeasurement(
            user_id=user.user_id,
            date=date,
            **measurement.model_dump(exclude={"date"})
        )
        await db.body_measurements.insert_one(new_measurement.model_dump())
        return new_measurement.model_dump()

@api_router.get("/measurements")
async def get_measurements(user: User = Depends(get_current_user), limit: int = 30):
    """Get user's body measurements history"""
    measurements = await db.body_measurements.find(
        {"user_id": user.user_id},
        {"_id": 0}
    ).sort("date", -1).limit(limit).to_list(limit)
    return measurements

@api_router.get("/measurements/{date}")
async def get_measurement(date: str, user: User = Depends(get_current_user)):
    """Get body measurement for a specific date"""
    date = validate_date_key(date)
    measurement = await db.body_measurements.find_one(
        {"user_id": user.user_id, "date": date},
        {"_id": 0}
    )
    if not measurement:
        raise HTTPException(status_code=404, detail="No measurement found for this date")
    return measurement

@api_router.delete("/measurements/{date}")
async def delete_measurement(date: str, request: Request, user: User = Depends(get_current_user)):
    """Delete a body measurement"""
    await enforce_mutation_rate_limit(request, "measurements.delete", user.user_id, limit=20, window_seconds=60)
    date = validate_date_key(date)
    result = await db.body_measurements.delete_one(
        {"user_id": user.user_id, "date": date}
    )
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Measurement not found")
    return {"message": "Measurement deleted"}

@api_router.get("/measurements/stats/progress")
async def get_measurement_progress(user: User = Depends(require_pro_user), days: int = 90):
    """Get measurement progress over time for charts"""
    start_date = (datetime.now(timezone.utc) - timedelta(days=days)).strftime("%Y-%m-%d")
    
    measurements = await db.body_measurements.find(
        {"user_id": user.user_id, "date": {"$gte": start_date}},
        {"_id": 0}
    ).sort("date", 1).to_list(100)
    
    if not measurements:
        return {
            "measurements": [],
            "changes": {},
            "has_data": False
        }
    
    # Calculate changes from first to latest
    first = measurements[0]
    latest = measurements[-1]
    
    changes = {}
    fields = ["weight", "body_fat", "chest", "waist", "hips", "biceps_left", "biceps_right", 
              "thighs_left", "thighs_right", "shoulders", "neck"]
    
    for field in fields:
        first_val = first.get(field)
        latest_val = latest.get(field)
        if first_val is not None and latest_val is not None:
            change = latest_val - first_val
            change_pct = (change / first_val * 100) if first_val != 0 else 0
            changes[field] = {
                "first": first_val,
                "latest": latest_val,
                "change": round(change, 2),
                "change_percent": round(change_pct, 1)
            }
    
    return {
        "measurements": measurements,
        "changes": changes,
        "has_data": True,
        "date_range": {
            "start": first.get("date"),
            "end": latest.get("date")
        }
    }

# ============== Nutrition Tracking ==============

@api_router.get("/nutrition/{date}")
async def get_daily_nutrition(date: str, user: User = Depends(get_current_user)):
    """Get nutrition data for a specific date"""
    nutrition = await db.daily_nutrition.find_one(
        {"user_id": user.user_id, "date": date},
        {"_id": 0}
    )
    
    if not nutrition:
        # Return empty nutrition entry
        return {
            "nutrition_id": None,
            "user_id": user.user_id,
            "date": date,
            "meals": {"breakfast": [], "lunch": [], "dinner": [], "snacks": []},
            "total_calories": 0,
            "total_protein": 0,
            "total_carbs": 0,
            "total_fat": 0
        }
    
    return nutrition

@api_router.post("/nutrition/{date}/meal")
async def add_meal_entry(date: str, entry: MealEntryCreate, request: Request, user: User = Depends(get_current_user)):
    """Add a food entry to a meal"""
    await enforce_mutation_rate_limit(request, "nutrition.meal.add", user.user_id, limit=40, window_seconds=60)
    date = validate_date_key(date)
    existing = await db.daily_nutrition.find_one(
        {"user_id": user.user_id, "date": date}
    )
    
    meal_entry = MealEntry(
        food_id=entry.food_id,
        food_name=entry.food_name,
        servings=entry.servings,
        calories=entry.calories,
        protein=entry.protein,
        carbs=entry.carbs,
        fat=entry.fat
    )
    
    if existing:
        # Add to existing day
        meals = existing.get("meals", {"breakfast": [], "lunch": [], "dinner": [], "snacks": []})
        meals[entry.meal_type].append(meal_entry.model_dump())
        
        # Recalculate totals
        totals = {"calories": 0, "protein": 0, "carbs": 0, "fat": 0}
        for meal_type in meals.values():
            for item in meal_type:
                totals["calories"] += item["calories"]
                totals["protein"] += item["protein"]
                totals["carbs"] += item["carbs"]
                totals["fat"] += item["fat"]
        
        await db.daily_nutrition.update_one(
            {"user_id": user.user_id, "date": date},
            {"$set": {
                "meals": meals,
                "total_calories": totals["calories"],
                "total_protein": totals["protein"],
                "total_carbs": totals["carbs"],
                "total_fat": totals["fat"]
            }}
        )
    else:
        # Create new day
        nutrition = DailyNutrition(
            user_id=user.user_id,
            date=date,
            meals={entry.meal_type: [meal_entry.model_dump()], "breakfast": [], "lunch": [], "dinner": [], "snacks": []},
            total_calories=entry.calories,
            total_protein=entry.protein,
            total_carbs=entry.carbs,
            total_fat=entry.fat
        )
        # Fix duplicate meal type
        nutrition.meals[entry.meal_type] = [meal_entry.model_dump()]
        await db.daily_nutrition.insert_one(nutrition.model_dump())
    
    return await get_daily_nutrition(date, user)

@api_router.delete("/nutrition/{date}/meal/{meal_type}/{index}")
async def remove_meal_entry(date: str, meal_type: str, index: int, request: Request, user: User = Depends(get_current_user)):
    """Remove a food entry from a meal"""
    await enforce_mutation_rate_limit(request, "nutrition.meal.delete", user.user_id, limit=40, window_seconds=60)
    date = validate_date_key(date)
    if meal_type not in ALLOWED_MEAL_TYPES:
        raise HTTPException(status_code=422, detail="Invalid meal_type")
    if index < 0:
        raise HTTPException(status_code=422, detail="index must be non-negative")
    existing = await db.daily_nutrition.find_one(
        {"user_id": user.user_id, "date": date}
    )
    
    if not existing:
        raise HTTPException(status_code=404, detail="No nutrition data for this date")
    
    meals = existing.get("meals", {})
    if meal_type not in meals or index >= len(meals[meal_type]):
        raise HTTPException(status_code=404, detail="Meal entry not found")
    
    meals[meal_type].pop(index)
    
    # Recalculate totals
    totals = {"calories": 0, "protein": 0, "carbs": 0, "fat": 0}
    for meal_entries in meals.values():
        for item in meal_entries:
            totals["calories"] += item["calories"]
            totals["protein"] += item["protein"]
            totals["carbs"] += item["carbs"]
            totals["fat"] += item["fat"]
    
    await db.daily_nutrition.update_one(
        {"user_id": user.user_id, "date": date},
        {"$set": {
            "meals": meals,
            "total_calories": totals["calories"],
            "total_protein": totals["protein"],
            "total_carbs": totals["carbs"],
            "total_fat": totals["fat"]
        }}
    )
    
    return await get_daily_nutrition(date, user)

# ============== Progress/Stats Endpoints ==============

@api_router.get("/stats/workout-volume")
async def get_workout_volume(user: User = Depends(require_pro_user), days: int = 30):
    """Get workout volume over time"""
    start_date = datetime.now(timezone.utc) - timedelta(days=days)
    
    workouts = await db.workouts.find(
        {"user_id": user.user_id, "date": {"$gte": start_date}},
        {"_id": 0}
    ).sort("date", 1).to_list(100)
    
    volume_data = []
    for workout in workouts:
        total_volume = 0
        for exercise in workout.get("exercises", []):
            for set_data in exercise.get("sets", []):
                if not set_data.get("is_warmup", False):
                    total_volume += set_data.get("weight", 0) * set_data.get("reps", 0)
        
        volume_data.append({
            "date": workout["date"].isoformat() if isinstance(workout["date"], datetime) else workout["date"],
            "volume": total_volume,
            "workout_name": workout.get("name", "Workout")
        })
    
    return volume_data

@api_router.get("/stats/nutrition-adherence")
async def get_nutrition_adherence(user: User = Depends(require_pro_user), days: int = 7):
    """Get nutrition macro adherence over time"""
    today = datetime.now(timezone.utc).date()
    
    goals = user.goals or {
        "daily_calories": 2000,
        "protein_grams": 150,
        "carbs_grams": 200,
        "fat_grams": 65
    }
    
    adherence_data = []
    for i in range(days):
        date = today - timedelta(days=i)
        date_str = date.isoformat()
        
        nutrition = await db.daily_nutrition.find_one(
            {"user_id": user.user_id, "date": date_str},
            {"_id": 0}
        )
        
        if nutrition:
            adherence_data.append({
                "date": date_str,
                "calories": nutrition.get("total_calories", 0),
                "calories_goal": goals["daily_calories"],
                "protein": nutrition.get("total_protein", 0),
                "protein_goal": goals["protein_grams"],
                "carbs": nutrition.get("total_carbs", 0),
                "carbs_goal": goals["carbs_grams"],
                "fat": nutrition.get("total_fat", 0),
                "fat_goal": goals["fat_grams"]
            })
        else:
            adherence_data.append({
                "date": date_str,
                "calories": 0,
                "calories_goal": goals["daily_calories"],
                "protein": 0,
                "protein_goal": goals["protein_grams"],
                "carbs": 0,
                "carbs_goal": goals["carbs_grams"],
                "fat": 0,
                "fat_goal": goals["fat_grams"]
            })
    
    return list(reversed(adherence_data))

@api_router.get("/calendar/{year}/{month}")
async def get_calendar_data(year: int, month: int, user: User = Depends(get_current_user)):
    """Get combined workout and nutrition data for calendar view"""
    # Get first and last day of month
    first_day = datetime(year, month, 1, tzinfo=timezone.utc)
    if month == 12:
        last_day = datetime(year + 1, 1, 1, tzinfo=timezone.utc)
    else:
        last_day = datetime(year, month + 1, 1, tzinfo=timezone.utc)
    
    # Get workouts for the month
    workouts = await db.workouts.find(
        {"user_id": user.user_id, "date": {"$gte": first_day, "$lt": last_day}},
        {"_id": 0}
    ).to_list(100)
    
    # Get nutrition for the month
    calendar_data = {}
    
    current = first_day
    while current < last_day:
        date_str = current.strftime("%Y-%m-%d")
        calendar_data[date_str] = {
            "workouts": [],
            "nutrition": None
        }
        current += timedelta(days=1)
    
    # Add workouts to calendar
    for workout in workouts:
        workout_date = workout["date"]
        if isinstance(workout_date, datetime):
            date_str = workout_date.strftime("%Y-%m-%d")
        else:
            date_str = str(workout_date)[:10]
        
        if date_str in calendar_data:
            calendar_data[date_str]["workouts"].append({
                "workout_id": workout["workout_id"],
                "name": workout.get("name", "Workout"),
                "exercise_count": len(workout.get("exercises", []))
            })
    
    # Add nutrition to calendar
    nutrition_entries = await db.daily_nutrition.find(
        {"user_id": user.user_id},
        {"_id": 0}
    ).to_list(100)
    
    for nutrition in nutrition_entries:
        date_str = nutrition.get("date", "")
        if date_str in calendar_data:
            calendar_data[date_str]["nutrition"] = {
                "calories": nutrition.get("total_calories", 0),
                "protein": nutrition.get("total_protein", 0)
            }
    
    return calendar_data

# ============== Workout Templates & Programs ==============

class WorkoutTemplate(BaseModel):
    template_id: str = Field(default_factory=lambda: f"tmpl_{uuid.uuid4().hex[:12]}")
    name: str
    description: str
    difficulty: str  # beginner, intermediate, advanced
    duration_weeks: int
    workouts_per_week: int
    type: str  # strength, hypertrophy, power, endurance
    exercises: List[Dict[str, Any]]  # Exercise with recommended sets/reps

# Pre-built workout programs
DEFAULT_TEMPLATES = [
    {
        "name": "Beginner 5x5",
        "description": "Classic strength program. 5 sets of 5 reps on compound lifts. Perfect for building a strength foundation.",
        "difficulty": "beginner",
        "duration_weeks": 12,
        "workouts_per_week": 3,
        "type": "strength",
        "exercises": [
            {"day": "A", "exercises": [
                {"name": "Squats", "sets": 5, "reps": 5, "rest_seconds": 180},
                {"name": "Bench Press", "sets": 5, "reps": 5, "rest_seconds": 180},
                {"name": "Barbell Rows", "sets": 5, "reps": 5, "rest_seconds": 180}
            ]},
            {"day": "B", "exercises": [
                {"name": "Squats", "sets": 5, "reps": 5, "rest_seconds": 180},
                {"name": "Overhead Press", "sets": 5, "reps": 5, "rest_seconds": 180},
                {"name": "Deadlift", "sets": 1, "reps": 5, "rest_seconds": 180}
            ]}
        ]
    },
    {
        "name": "Push Pull Legs (PPL)",
        "description": "6-day split targeting push muscles, pull muscles, and legs separately for maximum volume.",
        "difficulty": "intermediate",
        "duration_weeks": 8,
        "workouts_per_week": 6,
        "type": "hypertrophy",
        "exercises": [
            {"day": "Push", "exercises": [
                {"name": "Bench Press", "sets": 4, "reps": 8, "rest_seconds": 120},
                {"name": "Overhead Press", "sets": 3, "reps": 10, "rest_seconds": 90},
                {"name": "Incline Dumbbell Press", "sets": 3, "reps": 12, "rest_seconds": 90},
                {"name": "Lateral Raises", "sets": 3, "reps": 15, "rest_seconds": 60},
                {"name": "Tricep Pushdowns", "sets": 3, "reps": 12, "rest_seconds": 60}
            ]},
            {"day": "Pull", "exercises": [
                {"name": "Deadlift", "sets": 3, "reps": 5, "rest_seconds": 180},
                {"name": "Pull-ups", "sets": 4, "reps": 8, "rest_seconds": 120},
                {"name": "Barbell Rows", "sets": 3, "reps": 10, "rest_seconds": 90},
                {"name": "Face Pulls", "sets": 3, "reps": 15, "rest_seconds": 60},
                {"name": "Barbell Curls", "sets": 3, "reps": 12, "rest_seconds": 60}
            ]},
            {"day": "Legs", "exercises": [
                {"name": "Squats", "sets": 4, "reps": 8, "rest_seconds": 150},
                {"name": "Romanian Deadlift", "sets": 3, "reps": 10, "rest_seconds": 120},
                {"name": "Dumbbell Lunges", "sets": 3, "reps": 12, "rest_seconds": 90},
                {"name": "Leg Press", "sets": 3, "reps": 15, "rest_seconds": 90},
                {"name": "Calf Raises", "sets": 4, "reps": 15, "rest_seconds": 60}
            ]}
        ]
    },
    {
        "name": "Upper/Lower Split",
        "description": "4-day program alternating upper and lower body. Great balance of volume and recovery.",
        "difficulty": "intermediate",
        "duration_weeks": 10,
        "workouts_per_week": 4,
        "type": "hypertrophy",
        "exercises": [
            {"day": "Upper A", "exercises": [
                {"name": "Bench Press", "sets": 4, "reps": 6, "rest_seconds": 150},
                {"name": "Barbell Rows", "sets": 4, "reps": 6, "rest_seconds": 150},
                {"name": "Overhead Press", "sets": 3, "reps": 8, "rest_seconds": 120},
                {"name": "Pull-ups", "sets": 3, "reps": 8, "rest_seconds": 120},
                {"name": "Dumbbell Curls", "sets": 2, "reps": 12, "rest_seconds": 60},
                {"name": "Tricep Dips", "sets": 2, "reps": 12, "rest_seconds": 60}
            ]},
            {"day": "Lower A", "exercises": [
                {"name": "Squats", "sets": 4, "reps": 6, "rest_seconds": 180},
                {"name": "Romanian Deadlift", "sets": 3, "reps": 8, "rest_seconds": 150},
                {"name": "Leg Press", "sets": 3, "reps": 10, "rest_seconds": 120},
                {"name": "Dumbbell Lunges", "sets": 2, "reps": 12, "rest_seconds": 90},
                {"name": "Calf Raises", "sets": 4, "reps": 15, "rest_seconds": 60}
            ]},
            {"day": "Upper B", "exercises": [
                {"name": "Dumbbell Bench Press", "sets": 4, "reps": 10, "rest_seconds": 120},
                {"name": "Dumbbell Rows", "sets": 4, "reps": 10, "rest_seconds": 120},
                {"name": "Dumbbell Shoulder Press", "sets": 3, "reps": 12, "rest_seconds": 90},
                {"name": "Chin-ups", "sets": 3, "reps": 10, "rest_seconds": 90},
                {"name": "Lateral Raises", "sets": 3, "reps": 15, "rest_seconds": 60},
                {"name": "Hammer Curls", "sets": 2, "reps": 12, "rest_seconds": 60}
            ]},
            {"day": "Lower B", "exercises": [
                {"name": "Deadlift", "sets": 3, "reps": 5, "rest_seconds": 180},
                {"name": "Goblet Squats", "sets": 3, "reps": 12, "rest_seconds": 120},
                {"name": "Romanian Deadlift", "sets": 3, "reps": 10, "rest_seconds": 120},
                {"name": "Leg Raises", "sets": 3, "reps": 15, "rest_seconds": 60},
                {"name": "Calf Raises", "sets": 4, "reps": 15, "rest_seconds": 60}
            ]}
        ]
    },
    {
        "name": "Full Body 3x/Week",
        "description": "Hit every muscle group 3 times per week. Efficient and effective for beginners.",
        "difficulty": "beginner",
        "duration_weeks": 8,
        "workouts_per_week": 3,
        "type": "strength",
        "exercises": [
            {"day": "Workout", "exercises": [
                {"name": "Squats", "sets": 3, "reps": 8, "rest_seconds": 150},
                {"name": "Bench Press", "sets": 3, "reps": 8, "rest_seconds": 120},
                {"name": "Barbell Rows", "sets": 3, "reps": 8, "rest_seconds": 120},
                {"name": "Overhead Press", "sets": 3, "reps": 10, "rest_seconds": 90},
                {"name": "Dumbbell Curls", "sets": 2, "reps": 12, "rest_seconds": 60},
                {"name": "Planks", "sets": 3, "reps": 30, "rest_seconds": 60}
            ]}
        ]
    },
    {
        "name": "Home Gym Basics",
        "description": "Effective program using minimal equipment: dumbbells, pull-up bar only.",
        "difficulty": "beginner",
        "duration_weeks": 8,
        "workouts_per_week": 4,
        "type": "hypertrophy",
        "exercises": [
            {"day": "Upper", "exercises": [
                {"name": "Push-ups", "sets": 4, "reps": 15, "rest_seconds": 60},
                {"name": "Dumbbell Rows", "sets": 4, "reps": 12, "rest_seconds": 90},
                {"name": "Dumbbell Shoulder Press", "sets": 3, "reps": 12, "rest_seconds": 90},
                {"name": "Pull-ups", "sets": 3, "reps": 8, "rest_seconds": 120},
                {"name": "Dumbbell Curls", "sets": 3, "reps": 12, "rest_seconds": 60},
                {"name": "Tricep Dips", "sets": 3, "reps": 12, "rest_seconds": 60}
            ]},
            {"day": "Lower", "exercises": [
                {"name": "Goblet Squats", "sets": 4, "reps": 12, "rest_seconds": 120},
                {"name": "Dumbbell Lunges", "sets": 3, "reps": 12, "rest_seconds": 90},
                {"name": "Romanian Deadlift", "sets": 3, "reps": 12, "rest_seconds": 120},
                {"name": "Calf Raises", "sets": 4, "reps": 20, "rest_seconds": 60},
                {"name": "Planks", "sets": 3, "reps": 45, "rest_seconds": 60},
                {"name": "Russian Twists", "sets": 3, "reps": 20, "rest_seconds": 60}
            ]}
        ]
    }
]

@api_router.get("/templates")
async def get_workout_templates(difficulty: Optional[str] = None, type: Optional[str] = None):
    """Get workout templates/programs"""
    # Initialize templates if empty
    count = await db.workout_templates.count_documents({})
    if count == 0:
        for template in DEFAULT_TEMPLATES:
            template_obj = WorkoutTemplate(**template)
            await db.workout_templates.insert_one(template_obj.model_dump())
    
    query = {}
    if difficulty:
        query["difficulty"] = difficulty
    if type:
        query["type"] = type
    
    templates = await db.workout_templates.find(query, {"_id": 0}).to_list(20)
    return templates

@api_router.get("/templates/{template_id}")
async def get_workout_template(template_id: str):
    """Get a specific workout template"""
    template = await db.workout_templates.find_one(
        {"template_id": template_id},
        {"_id": 0}
    )
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    return template

@api_router.post("/templates/{template_id}/start")
async def start_program(template_id: str, request: Request, user: User = Depends(get_current_user)):
    """Start a workout program - creates the first workout from template"""
    await enforce_mutation_rate_limit(request, "templates.start", user.user_id, limit=10, window_seconds=60)
    template = await db.workout_templates.find_one(
        {"template_id": template_id},
        {"_id": 0}
    )
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    
    # Get first day's exercises
    first_day = template["exercises"][0]
    exercises = []
    
    for ex in first_day["exercises"]:
        exercises.append({
            "exercise_id": f"ex_{uuid.uuid4().hex[:8]}",
            "exercise_name": ex["name"],
            "sets": [],  # User will fill in actual weights
            "notes": f"Target: {ex['sets']}x{ex['reps']}, Rest: {ex['rest_seconds']}s"
        })
    
    # Create the workout
    workout = Workout(
        user_id=user.user_id,
        date=datetime.now(timezone.utc),
        name=f"{template['name']} - {first_day['day']}",
        exercises=exercises,
        notes=f"Program: {template['name']}\nDay: {first_day['day']}"
    )
    
    await db.workouts.insert_one(workout.model_dump())
    return workout.model_dump()

# ============== Lifecycle Notifications ==============

@api_router.post("/notifications/push-token")
async def upsert_push_token(payload: PushTokenUpsert, request: Request, user: User = Depends(get_current_user)):
    """Store or update user's push token for server-scheduled lifecycle messaging."""
    await enforce_mutation_rate_limit(request, "notifications.push-token", user.user_id, limit=15, window_seconds=60)

    now = datetime.now(timezone.utc)
    await db.notification_profiles.update_one(
        {"user_id": user.user_id},
        {
            "$set": {
                "expo_push_token": payload.expo_push_token,
                "platform": payload.platform,
                "updated_at": now,
            },
            "$setOnInsert": {
                "created_at": now,
                "lifecycle_sent_days": [],
            },
        },
        upsert=True,
    )

    return {"message": "Push token saved"}


@api_router.get("/notifications/lifecycle/jobs")
async def preview_lifecycle_jobs(request: Request, _: None = Depends(require_internal_cron)):
    """Preview pending lifecycle jobs for internal monitoring/cron checks."""
    now = datetime.now(timezone.utc)
    profiles = await db.notification_profiles.find({"expo_push_token": {"$exists": True}}, {"_id": 0}).limit(1000).to_list(1000)

    jobs: List[Dict[str, Any]] = []
    for profile in profiles:
        user_id = profile.get("user_id")
        if not user_id:
            continue

        user_doc = await db.users.find_one({"user_id": user_id}, {"_id": 0, "created_at": 1})
        if not user_doc:
            continue

        created_at = _normalize_datetime(user_doc.get("created_at"))
        has_workouts = await db.workouts.count_documents({"user_id": user_id}, limit=1) > 0
        recent_cutoff = now - timedelta(days=7)
        has_recent_workout = await db.workouts.count_documents(
            {"user_id": user_id, "date": {"$gte": recent_cutoff}},
            limit=1,
        ) > 0

        pending = generate_lifecycle_jobs_for_profile(
            now=now,
            user_id=user_id,
            created_at=created_at,
            sent_days=profile.get("lifecycle_sent_days", []),
            has_workouts=has_workouts,
            has_recent_workout=has_recent_workout,
        )
        jobs.extend(pending)

    return {
        "generated_at": now.isoformat(),
        "job_count": len(jobs),
        "jobs": jobs,
    }


@api_router.post("/notifications/lifecycle/dispatch")
async def dispatch_lifecycle_jobs(
    payload: LifecycleDispatchRequest,
    request: Request,
    _: None = Depends(require_internal_cron),
):
    """
    Internal endpoint for scheduled lifecycle messaging.
    `dry_run=true` previews jobs; `dry_run=false` writes queued jobs and marks sent days.
    """
    now = datetime.now(timezone.utc)
    profiles = await db.notification_profiles.find({"expo_push_token": {"$exists": True}}, {"_id": 0}).limit(payload.user_limit).to_list(payload.user_limit)

    queued_jobs: List[Dict[str, Any]] = []
    sent_updates = 0
    jobs_sent = 0
    jobs_failed = 0

    for profile in profiles:
        user_id = profile.get("user_id")
        if not user_id:
            continue

        user_doc = await db.users.find_one({"user_id": user_id}, {"_id": 0, "created_at": 1})
        if not user_doc:
            continue

        created_at = _normalize_datetime(user_doc.get("created_at"))
        has_workouts = await db.workouts.count_documents({"user_id": user_id}, limit=1) > 0
        recent_cutoff = now - timedelta(days=7)
        has_recent_workout = await db.workouts.count_documents(
            {"user_id": user_id, "date": {"$gte": recent_cutoff}},
            limit=1,
        ) > 0

        jobs = generate_lifecycle_jobs_for_profile(
            now=now,
            user_id=user_id,
            created_at=created_at,
            sent_days=profile.get("lifecycle_sent_days", []),
            has_workouts=has_workouts,
            has_recent_workout=has_recent_workout,
        )

        if not jobs:
            continue

        profile_jobs: List[Dict[str, Any]] = []
        for job in jobs:
            profile_jobs.append(
                {
                    **job,
                    "expo_push_token": profile.get("expo_push_token"),
                    "status": "queued" if not payload.dry_run else "preview",
                    "created_at": now,
                }
            )

        queued_jobs.extend(profile_jobs)

        if not payload.dry_run:
            valid_jobs = [job for job in profile_jobs if isinstance(job.get("expo_push_token"), str) and job.get("expo_push_token")]
            invalid_jobs = [job for job in profile_jobs if job not in valid_jobs]

            sent_day_keys: List[str] = []
            records_to_store: List[Dict[str, Any]] = []

            if valid_jobs:
                messages = [
                    {
                        "to": job["expo_push_token"],
                        "title": job["title"],
                        "body": job["body"],
                        "sound": "default",
                        "data": {"user_id": job["user_id"], "day_key": job["day_key"], "source": "lifecycle"},
                    }
                    for job in valid_jobs
                ]
                send_results = await send_expo_push_notifications(messages)
                for job, send_result in zip(valid_jobs, send_results):
                    status = send_result.get("status")
                    was_sent = status == "ok"
                    if was_sent:
                        sent_day_keys.append(job["day_key"])
                        jobs_sent += 1
                    else:
                        jobs_failed += 1

                    records_to_store.append(
                        {
                            **job,
                            "status": "sent" if was_sent else "failed",
                            "provider": "expo",
                            "provider_response": send_result,
                            "dispatched_at": now,
                        }
                    )

            for job in invalid_jobs:
                jobs_failed += 1
                records_to_store.append(
                    {
                        **job,
                        "status": "failed",
                        "provider": "expo",
                        "provider_response": {"status": "error", "details": "missing_push_token"},
                        "dispatched_at": now,
                    }
                )

            if records_to_store:
                await db.notification_jobs.insert_many(records_to_store)

            update_doc: Dict[str, Any] = {"$set": {"last_dispatch_at": now}}
            if sent_day_keys:
                update_doc["$addToSet"] = {"lifecycle_sent_days": {"$each": sent_day_keys}}
            await db.notification_profiles.update_one({"user_id": user_id}, update_doc)
            sent_updates += 1

    return {
        "dry_run": payload.dry_run,
        "users_scanned": len(profiles),
        "jobs_generated": len(queued_jobs),
        "profiles_updated": sent_updates,
        "jobs_sent": jobs_sent,
        "jobs_failed": jobs_failed,
        "generated_at": now.isoformat(),
    }


@api_router.post("/notifications/lifecycle/first-workout")
async def track_first_workout_completion(
    payload: FirstWorkoutTelemetry,
    request: Request,
    user: User = Depends(get_current_user),
):
    """
    Records first-workout completion telemetry so lifecycle onboarding can
    branch based on activation state.
    """
    await enforce_mutation_rate_limit(request, "notifications.lifecycle.first-workout", user.user_id, limit=20, window_seconds=60)

    now = datetime.now(timezone.utc)
    completed_at = payload.completed_at or now

    existing_profile = await db.notification_profiles.find_one(
        {"user_id": user.user_id},
        {"_id": 0, "first_workout_completed_at": 1},
    )

    is_first_workout = not existing_profile or not existing_profile.get("first_workout_completed_at")

    update_fields: Dict[str, Any] = {
        "last_workout_completed_at": completed_at,
        "last_workout_id": payload.workout_id,
        "last_telemetry_at": now,
    }
    if is_first_workout:
        update_fields["first_workout_completed_at"] = completed_at

    await db.notification_profiles.update_one(
        {"user_id": user.user_id},
        {
            "$set": update_fields,
            "$setOnInsert": {
                "created_at": now,
                "lifecycle_sent_days": [],
            },
        },
        upsert=True,
    )

    return {
        "tracked": True,
        "is_first_workout": is_first_workout,
        "recorded_at": now.isoformat(),
    }


@api_router.post("/integrations/health/telemetry")
async def ingest_health_integration_telemetry(
    payload: HealthIntegrationTelemetry,
    request: Request,
    user: User = Depends(get_current_user),
):
    await enforce_mutation_rate_limit(request, "integrations.health.telemetry", user.user_id, limit=120, window_seconds=60)

    now = datetime.now(timezone.utc)
    event_doc = {
        "user_id": user.user_id,
        "provider": payload.provider,
        "event_type": payload.event_type,
        "success": payload.success,
        "native_bridge_available": payload.native_bridge_available,
        "provider_records_read": payload.provider_records_read,
        "error_message": payload.error_message,
        "created_at": now,
    }

    await db.health_integration_events.insert_one(event_doc)

    return {
        "tracked": True,
        "recorded_at": now.isoformat(),
    }


@api_router.post("/workouts/superset/telemetry")
async def ingest_superset_telemetry(
    payload: SupersetTelemetry,
    request: Request,
    user: User = Depends(get_current_user),
):
    await enforce_mutation_rate_limit(request, "workouts.superset.telemetry", user.user_id, limit=120, window_seconds=60)

    now = datetime.now(timezone.utc)
    event_doc = {
        "user_id": user.user_id,
        "event_type": payload.event_type,
        "success": payload.success,
        "is_pro": payload.is_pro,
        "workout_id": payload.workout_id,
        "groups_count": payload.groups_count,
        "exercises_count": payload.exercises_count,
        "context": payload.context,
        "created_at": now,
    }

    await db.superset_events.insert_one(event_doc)

    return {
        "tracked": True,
        "recorded_at": now.isoformat(),
    }


@api_router.post("/telemetry/paywall")
async def ingest_paywall_telemetry(
    payload: PaywallTelemetry,
    request: Request,
    user: User = Depends(get_current_user),
):
    await enforce_mutation_rate_limit(request, "telemetry.paywall", user.user_id, limit=180, window_seconds=60)

    now = datetime.now(timezone.utc)
    await db.paywall_events.insert_one(
        {
            "user_id": user.user_id,
            "feature": payload.feature.strip().lower(),
            "placement": payload.placement.strip().lower(),
            "event_type": payload.event_type,
            "context": payload.context,
            "created_at": now,
        }
    )

    return {"tracked": True, "recorded_at": now.isoformat()}


@api_router.post("/telemetry/engagement")
async def ingest_engagement_telemetry(
    payload: EngagementTelemetry,
    request: Request,
    user: User = Depends(get_current_user),
):
    await enforce_mutation_rate_limit(request, "telemetry.engagement", user.user_id, limit=240, window_seconds=60)

    now = datetime.now(timezone.utc)
    await db.engagement_events.insert_one(
        {
            "user_id": user.user_id,
            "feature": payload.feature.strip().lower(),
            "action": payload.action.strip().lower(),
            "context": payload.context,
            "created_at": now,
        }
    )

    return {"tracked": True, "recorded_at": now.isoformat()}


@api_router.post("/telemetry/social-event")
async def ingest_social_event_telemetry(
    payload: SocialEventTelemetry,
    request: Request,
    user: User = Depends(get_current_user),
):
    await enforce_mutation_rate_limit(request, "telemetry.social-event", user.user_id, limit=180, window_seconds=60)

    now = datetime.now(timezone.utc)
    await db.social_events.insert_one(
        {
            "user_id": user.user_id,
            "event_type": payload.event_type.strip().lower(),
            "context": payload.context,
            "created_at": now,
        }
    )

    return {"tracked": True, "recorded_at": now.isoformat()}


@api_router.post("/telemetry/onboarding")
async def ingest_onboarding_telemetry(
    payload: OnboardingTelemetry,
    request: Request,
    user: User = Depends(get_current_user),
):
    await enforce_mutation_rate_limit(request, "telemetry.onboarding", user.user_id, limit=90, window_seconds=60)

    now = datetime.now(timezone.utc)
    await db.onboarding_events.insert_one(
        {
            "user_id": user.user_id,
            "milestone": payload.milestone.strip().lower(),
            "context": payload.context,
            "created_at": now,
        }
    )

    return {"tracked": True, "recorded_at": now.isoformat()}


@api_router.get("/analytics/funnel/paywall")
async def get_paywall_funnel(
    request: Request,
    _: None = Depends(require_internal_cron),
    lookback_days: int = Query(default=30, ge=1, le=180),
    feature: Optional[str] = Query(default=None, min_length=2, max_length=80),
):
    now = datetime.now(timezone.utc)
    lookback_start = now - timedelta(days=lookback_days)

    query: Dict[str, Any] = {"created_at": {"$gte": lookback_start}}
    normalized_feature = feature.strip().lower() if feature else None
    if normalized_feature:
        query["feature"] = normalized_feature

    events = await db.paywall_events.find(query, {"_id": 0, "event_type": 1, "feature": 1}).to_list(length=50000)

    counts = {"view": 0, "cta_click": 0, "purchase_completed": 0, "dismiss": 0}
    by_feature: Dict[str, Dict[str, int]] = {}

    for event in events:
        event_type = str(event.get("event_type", "")).lower()
        feature_key = str(event.get("feature", "unknown")).lower()
        if event_type in counts:
            counts[event_type] += 1
            if feature_key not in by_feature:
                by_feature[feature_key] = {"view": 0, "cta_click": 0, "purchase_completed": 0, "dismiss": 0}
            by_feature[feature_key][event_type] += 1

    views = counts["view"]
    ctas = counts["cta_click"]
    purchases = counts["purchase_completed"]

    return {
        "lookback_days": lookback_days,
        "feature": normalized_feature,
        "generated_at": now.isoformat(),
        "totals": {
            **counts,
            "cta_rate_percent": round((ctas / max(views, 1)) * 100, 2),
            "purchase_rate_from_view_percent": round((purchases / max(views, 1)) * 100, 2),
            "purchase_rate_from_cta_percent": round((purchases / max(ctas, 1)) * 100, 2),
        },
        "by_feature": by_feature,
    }


@api_router.get("/analytics/cohort/retention")
async def get_retention_cohorts(
    request: Request,
    _: None = Depends(require_internal_cron),
    lookback_days: int = Query(default=30, ge=7, le=180),
    days: str = Query(default="1,7,30", min_length=1, max_length=40),
):
    now = datetime.now(timezone.utc)
    parsed_days: List[int] = sorted({int(part.strip()) for part in days.split(",") if part.strip().isdigit()})
    parsed_days = [d for d in parsed_days if 1 <= d <= 90]
    if not parsed_days:
        parsed_days = [1, 7, 30]

    max_day = max(parsed_days)
    cohort_start = now - timedelta(days=lookback_days)
    workout_window_start = cohort_start - timedelta(days=max_day)

    base_profiles = await db.notification_profiles.find(
        {"first_workout_completed_at": {"$gte": cohort_start}},
        {"_id": 0, "user_id": 1, "first_workout_completed_at": 1},
    ).to_list(length=50000)

    if not base_profiles:
        return {
            "lookback_days": lookback_days,
            "days": parsed_days,
            "generated_at": now.isoformat(),
            "cohort_size": 0,
            "retention": {},
        }

    cohort_users: Dict[str, datetime] = {}
    for profile in base_profiles:
        user_id = profile.get("user_id")
        if not user_id:
            continue
        cohort_users[user_id] = _normalize_datetime(profile.get("first_workout_completed_at"))

    workouts = await db.workouts.find(
        {
            "user_id": {"$in": list(cohort_users.keys())},
            "date": {"$gte": workout_window_start},
        },
        {"_id": 0, "user_id": 1, "date": 1},
    ).to_list(length=200000)

    workout_days_by_user: Dict[str, Set[str]] = {}
    for workout in workouts:
        user_id = workout.get("user_id")
        if not user_id:
            continue
        day_key = _normalize_datetime(workout.get("date")).date().isoformat()
        if user_id not in workout_days_by_user:
            workout_days_by_user[user_id] = set()
        workout_days_by_user[user_id].add(day_key)

    retained_counts = {day: 0 for day in parsed_days}
    for user_id, first_workout_at in cohort_users.items():
        first_day = first_workout_at.date()
        user_days = workout_days_by_user.get(user_id, set())
        for day in parsed_days:
            target_day = (first_day + timedelta(days=day)).isoformat()
            if target_day in user_days:
                retained_counts[day] += 1

    cohort_size = len(cohort_users)
    retention = {
        str(day): {
            "retained_users": retained_counts[day],
            "retention_rate_percent": round((retained_counts[day] / max(cohort_size, 1)) * 100, 2),
        }
        for day in parsed_days
    }

    return {
        "lookback_days": lookback_days,
        "days": parsed_days,
        "generated_at": now.isoformat(),
        "cohort_size": cohort_size,
        "retention": retention,
    }


@api_router.get("/analytics/kpi/summary")
async def get_kpi_summary(
    request: Request,
    _: None = Depends(require_internal_cron),
    lookback_days: int = Query(default=30, ge=1, le=180),
):
    now = datetime.now(timezone.utc)
    lookback_start = now - timedelta(days=lookback_days)

    paywall_events = await db.paywall_events.find(
        {"created_at": {"$gte": lookback_start}},
        {"_id": 0, "event_type": 1, "feature": 1, "user_id": 1},
    ).to_list(length=50000)

    paywall_counts = {"view": 0, "cta_click": 0, "purchase_completed": 0, "dismiss": 0}
    paywall_users = {"view": set(), "cta_click": set(), "purchase_completed": set()}

    for event in paywall_events:
        event_type = str(event.get("event_type", "")).lower()
        user_id = event.get("user_id")
        if event_type in paywall_counts:
            paywall_counts[event_type] += 1
        if event_type in paywall_users and user_id:
            paywall_users[event_type].add(str(user_id))

    engagement_events = await db.engagement_events.find(
        {"created_at": {"$gte": lookback_start}},
        {"_id": 0, "feature": 1, "action": 1, "user_id": 1},
    ).to_list(length=100000)

    engagement_users: Set[str] = set()
    actions_rollup: Dict[str, int] = {}

    for event in engagement_events:
        feature = str(event.get("feature", "unknown")).lower()
        action = str(event.get("action", "unknown")).lower()
        key = f"{feature}:{action}"
        actions_rollup[key] = actions_rollup.get(key, 0) + 1
        user_id = event.get("user_id")
        if user_id:
            engagement_users.add(str(user_id))

    top_actions = [
        {"key": key, "count": count}
        for key, count in sorted(actions_rollup.items(), key=lambda item: item[1], reverse=True)[:10]
    ]

    social_events_count = await db.social_events.count_documents({"created_at": {"$gte": lookback_start}})
    onboarding_events_count = await db.onboarding_events.count_documents({"created_at": {"$gte": lookback_start}})
    workouts_logged = await db.workouts.count_documents({"date": {"$gte": lookback_start}})
    nutrition_days_logged = await db.daily_nutrition.count_documents({"created_at": {"$gte": lookback_start}})

    views = paywall_counts["view"]
    ctas = paywall_counts["cta_click"]
    purchases = paywall_counts["purchase_completed"]

    return {
        "lookback_days": lookback_days,
        "generated_at": now.isoformat(),
        "paywall": {
            "events": {
                **paywall_counts,
                "cta_rate_percent": round((ctas / max(views, 1)) * 100, 2),
                "purchase_rate_from_view_percent": round((purchases / max(views, 1)) * 100, 2),
                "purchase_rate_from_cta_percent": round((purchases / max(ctas, 1)) * 100, 2),
            },
            "unique_users": {
                "view": len(paywall_users["view"]),
                "cta_click": len(paywall_users["cta_click"]),
                "purchase_completed": len(paywall_users["purchase_completed"]),
            },
        },
        "engagement": {
            "events": len(engagement_events),
            "unique_users": len(engagement_users),
            "top_actions": top_actions,
        },
        "activity": {
            "workouts_logged": workouts_logged,
            "nutrition_days_logged": nutrition_days_logged,
            "social_events": social_events_count,
            "onboarding_events": onboarding_events_count,
        },
    }


@api_router.get("/integrations/health/strava-readiness")
async def get_strava_wearable_readiness(
    request: Request,
    user: User = Depends(get_current_user),
    lookback_days: int = Query(default=30, ge=7, le=180),
):
    now = datetime.now(timezone.utc)
    lookback_start = now - timedelta(days=lookback_days)

    await enforce_mutation_rate_limit(request, "integrations.health.strava-readiness", user.user_id, limit=30, window_seconds=60)

    recent_events = await db.health_integration_events.find(
        {
            "created_at": {"$gte": lookback_start},
            "event_type": {
                "$in": [
                    "consent_enabled",
                    "connect_success",
                    "sync_success",
                ]
            },
        },
        {"_id": 0, "user_id": 1, "provider": 1, "event_type": 1},
    ).to_list(length=20000)

    if not recent_events:
        evaluation = evaluate_strava_wearable_scope(0.0, 0.0, 0, 0)
        return {
            "lookback_days": lookback_days,
            "evaluated_at": now.isoformat(),
            "metrics": {
                "users_with_health_interest": 0,
                "adopted_users": 0,
                "adoption_rate_percent": 0.0,
                "avg_sync_events_per_adopted_user": 0.0,
                "active_providers": 0,
            },
            "evaluation": evaluation,
        }

    interested_users = {
        evt.get("user_id")
        for evt in recent_events
        if evt.get("event_type") in {"consent_enabled", "connect_success", "sync_success"}
    }
    adopted_users = {
        evt.get("user_id")
        for evt in recent_events
        if evt.get("event_type") == "sync_success"
    }
    active_providers = {
        evt.get("provider")
        for evt in recent_events
        if evt.get("event_type") == "sync_success" and evt.get("provider") in {"apple_health", "google_fit"}
    }

    sync_success_events = [evt for evt in recent_events if evt.get("event_type") == "sync_success"]

    interested_count = max(len(interested_users), 1)
    adopted_count = len(adopted_users)
    adoption_rate_percent = round((adopted_count / interested_count) * 100, 2)
    avg_sync_events_per_adopted_user = round(
        len(sync_success_events) / max(adopted_count, 1),
        2,
    )

    evaluation = evaluate_strava_wearable_scope(
        adoption_rate_percent=adoption_rate_percent,
        avg_sync_events_per_adopted_user=avg_sync_events_per_adopted_user,
        adopted_users=adopted_count,
        active_providers=len(active_providers),
    )

    return {
        "lookback_days": lookback_days,
        "evaluated_at": now.isoformat(),
        "metrics": {
            "users_with_health_interest": len(interested_users),
            "adopted_users": adopted_count,
            "adoption_rate_percent": adoption_rate_percent,
            "avg_sync_events_per_adopted_user": avg_sync_events_per_adopted_user,
            "active_providers": len(active_providers),
        },
        "evaluation": evaluation,
    }


@api_router.post("/social/friends/connect")
async def connect_friend(
    payload: FriendConnectRequest,
    request: Request,
    user: User = Depends(get_current_user),
):
    await enforce_mutation_rate_limit(request, "social.friends.connect", user.user_id, limit=30, window_seconds=60)

    friend_user_id = payload.friend_user_id.strip()
    if friend_user_id == user.user_id:
        raise HTTPException(status_code=422, detail="Cannot add yourself as a friend")

    friend = await db.users.find_one({"user_id": friend_user_id}, {"_id": 0, "user_id": 1, "name": 1, "email": 1})
    if not friend:
        raise HTTPException(status_code=404, detail="Friend user not found")

    now = datetime.now(timezone.utc)
    members = sorted([user.user_id, friend_user_id])

    await db.user_friendships.update_one(
        {"members": members},
        {
            "$set": {
                "members": members,
                "updated_at": now,
                "status": "accepted",
            },
            "$setOnInsert": {
                "created_at": now,
            },
        },
        upsert=True,
    )

    return {
        "connected": True,
        "friend_user_id": friend_user_id,
        "recorded_at": now.isoformat(),
    }


@api_router.get("/social/friends/discover")
async def discover_friends(
    request: Request,
    user: User = Depends(get_current_user),
    q: str = Query(default="", min_length=1, max_length=80),
):
    await enforce_mutation_rate_limit(request, "social.friends.discover", user.user_id, limit=40, window_seconds=60)

    query = q.strip()
    if not query:
        return {"results": []}

    # Build exclusion set: self + already-connected friends
    friendships = await db.user_friendships.find(
        {"members": user.user_id, "status": "accepted"},
        {"_id": 0, "members": 1},
    ).to_list(length=1000)

    exclude_ids = {user.user_id}
    for friendship in friendships:
        for member_id in friendship.get("members", []):
            exclude_ids.add(member_id)

    regex = {"$regex": query, "$options": "i"}
    candidates = await db.users.find(
        {
            "user_id": {"$nin": list(exclude_ids)},
            "$or": [
                {"name": regex},
                {"email": regex},
                {"user_id": regex},
            ],
        },
        {"_id": 0, "user_id": 1, "name": 1, "email": 1},
    ).to_list(length=20)

    return {"results": candidates}


@api_router.post("/social/friends/invite")
async def send_friend_invite(
    payload: FriendInviteRequest,
    request: Request,
    user: User = Depends(get_current_user),
):
    await enforce_mutation_rate_limit(request, "social.friends.invite", user.user_id, limit=30, window_seconds=60)

    target_user_id = payload.target_user_id.strip()
    if target_user_id == user.user_id:
        raise HTTPException(status_code=422, detail="Cannot invite yourself")

    target_user = await db.users.find_one(
        {"user_id": target_user_id},
        {"_id": 0, "user_id": 1, "name": 1, "email": 1},
    )
    if not target_user:
        raise HTTPException(status_code=404, detail="Target user not found")

    existing_friendship = await db.user_friendships.find_one(
        {"members": sorted([user.user_id, target_user_id]), "status": "accepted"},
        {"_id": 0, "members": 1},
    )
    if existing_friendship:
        return {"invited": False, "already_friends": True}

    now = datetime.now(timezone.utc)
    invite_id = f"fri_{uuid.uuid4().hex[:16]}"

    existing_pending = await db.user_friend_invites.find_one(
        {
            "status": "pending",
            "$or": [
                {"from_user_id": user.user_id, "to_user_id": target_user_id},
                {"from_user_id": target_user_id, "to_user_id": user.user_id},
            ],
        },
        {"_id": 0, "invite_id": 1},
    )

    if existing_pending:
        return {
            "invited": False,
            "already_pending": True,
            "invite_id": existing_pending.get("invite_id"),
        }

    await db.user_friend_invites.insert_one(
        {
            "invite_id": invite_id,
            "from_user_id": user.user_id,
            "to_user_id": target_user_id,
            "status": "pending",
            "created_at": now,
            "updated_at": now,
        }
    )

    return {
        "invited": True,
        "invite_id": invite_id,
        "recorded_at": now.isoformat(),
    }


@api_router.get("/social/friends/invites")
async def list_friend_invites(
    request: Request,
    user: User = Depends(get_current_user),
):
    await enforce_mutation_rate_limit(request, "social.friends.invites", user.user_id, limit=60, window_seconds=60)

    incoming = await db.user_friend_invites.find(
        {"to_user_id": user.user_id, "status": "pending"},
        {"_id": 0, "invite_id": 1, "from_user_id": 1, "to_user_id": 1, "status": 1, "created_at": 1},
    ).to_list(length=200)

    outgoing = await db.user_friend_invites.find(
        {"from_user_id": user.user_id, "status": "pending"},
        {"_id": 0, "invite_id": 1, "from_user_id": 1, "to_user_id": 1, "status": 1, "created_at": 1},
    ).to_list(length=200)

    return {
        "incoming": incoming,
        "outgoing": outgoing,
    }


@api_router.post("/social/friends/invites/{invite_id}/respond")
async def respond_friend_invite(
    invite_id: str,
    request: Request,
    user: User = Depends(get_current_user),
    action: str = Query(default="accept", pattern="^(accept|decline)$"),
):
    await enforce_mutation_rate_limit(request, "social.friends.invites.respond", user.user_id, limit=40, window_seconds=60)

    invite = await db.user_friend_invites.find_one(
        {"invite_id": invite_id, "to_user_id": user.user_id, "status": "pending"},
        {"_id": 0},
    )
    if not invite:
        raise HTTPException(status_code=404, detail="Pending invite not found")

    now = datetime.now(timezone.utc)
    next_status = "accepted" if action == "accept" else "declined"

    await db.user_friend_invites.update_one(
        {"invite_id": invite_id},
        {"$set": {"status": next_status, "updated_at": now, "resolved_at": now}},
    )

    if action == "accept":
        members = sorted([invite.get("from_user_id"), invite.get("to_user_id")])
        await db.user_friendships.update_one(
            {"members": members},
            {
                "$set": {
                    "members": members,
                    "updated_at": now,
                    "status": "accepted",
                },
                "$setOnInsert": {
                    "created_at": now,
                },
            },
            upsert=True,
        )

    return {
        "updated": True,
        "status": next_status,
        "recorded_at": now.isoformat(),
    }


@api_router.post("/social/friends/invites/reminders")
async def process_friend_invite_reminders(
    payload: FriendInviteReminderRequest,
    request: Request,
    user: User = Depends(get_current_user),
):
    await enforce_mutation_rate_limit(request, "social.friends.invites.reminders", user.user_id, limit=20, window_seconds=60)

    now = datetime.now(timezone.utc)
    min_age_cutoff = now - timedelta(hours=payload.min_age_hours)

    pending_outgoing = await db.user_friend_invites.find(
        {
            "from_user_id": user.user_id,
            "status": "pending",
            "created_at": {"$lte": min_age_cutoff},
        },
        {
            "_id": 0,
            "invite_id": 1,
            "to_user_id": 1,
            "created_at": 1,
            "last_reminder_at": 1,
            "reminder_count": 1,
        },
    ).to_list(length=300)

    due_invites: List[Dict[str, Any]] = []
    for invite in pending_outgoing:
        reminder_count = int(invite.get("reminder_count") or 0)
        if reminder_count >= 3:
            continue

        last_reminder_at = invite.get("last_reminder_at")
        if last_reminder_at:
            try:
                if _normalize_datetime(last_reminder_at) > min_age_cutoff:
                    continue
            except Exception:
                pass

        due_invites.append(
            {
                "invite_id": invite.get("invite_id"),
                "to_user_id": invite.get("to_user_id"),
                "created_at": invite.get("created_at"),
                "reminder_count": reminder_count,
            }
        )

    reminders_sent = 0
    if not payload.dry_run and due_invites:
        for due_invite in due_invites:
            await db.user_friend_invites.update_one(
                {"invite_id": due_invite.get("invite_id"), "from_user_id": user.user_id, "status": "pending"},
                {
                    "$set": {"last_reminder_at": now, "updated_at": now},
                    "$inc": {"reminder_count": 1},
                },
            )
            reminders_sent += 1

    return {
        "dry_run": payload.dry_run,
        "pending_invites": len(pending_outgoing),
        "due_invites": due_invites,
        "due_count": len(due_invites),
        "reminders_marked": reminders_sent,
        "evaluated_at": now.isoformat(),
    }


@api_router.get("/social/friends")
async def list_friends(
    request: Request,
    user: User = Depends(get_current_user),
):
    await enforce_mutation_rate_limit(request, "social.friends.list", user.user_id, limit=60, window_seconds=60)

    friendships = await db.user_friendships.find(
        {"members": user.user_id, "status": "accepted"},
        {"_id": 0, "members": 1, "updated_at": 1},
    ).to_list(length=1000)

    friend_ids: List[str] = []
    for friendship in friendships:
        for member_id in friendship.get("members", []):
            if member_id != user.user_id and member_id not in friend_ids:
                friend_ids.append(member_id)

    if not friend_ids:
        return {"friends": []}

    friend_docs = await db.users.find(
        {"user_id": {"$in": friend_ids}},
        {"_id": 0, "user_id": 1, "name": 1, "email": 1},
    ).to_list(length=len(friend_ids))

    return {"friends": friend_docs}


@api_router.get("/social/leaderboard/private")
async def private_leaderboard(
    request: Request,
    user: User = Depends(get_current_user),
    days: int = Query(default=30, ge=7, le=120),
):
    await enforce_mutation_rate_limit(request, "social.leaderboard.private", user.user_id, limit=30, window_seconds=60)

    friendships = await db.user_friendships.find(
        {"members": user.user_id, "status": "accepted"},
        {"_id": 0, "members": 1},
    ).to_list(length=1000)

    participant_ids = {user.user_id}
    for friendship in friendships:
        for member_id in friendship.get("members", []):
            participant_ids.add(member_id)

    user_docs = await db.users.find(
        {"user_id": {"$in": list(participant_ids)}},
        {"_id": 0, "user_id": 1, "name": 1, "email": 1},
    ).to_list(length=5000)
    user_map = {doc.get("user_id"): doc for doc in user_docs}

    workouts = await db.workouts.find(
        {"user_id": {"$in": list(participant_ids)}},
        {"_id": 0, "user_id": 1, "date": 1, "exercises": 1},
    ).to_list(length=50000)

    cutoff = datetime.now(timezone.utc) - timedelta(days=days)

    def _in_range(workout_date: Any) -> bool:
        try:
            return _normalize_datetime(workout_date) >= cutoff
        except Exception:
            return False

    grouped: Dict[str, List[Dict[str, Any]]] = {pid: [] for pid in participant_ids}
    for workout in workouts:
        if not _in_range(workout.get("date")):
            continue
        uid = workout.get("user_id")
        if uid in grouped:
            grouped[uid].append(workout)

    leaderboard: List[Dict[str, Any]] = []
    for participant_id in participant_ids:
        stats = aggregate_workout_social_stats(grouped.get(participant_id, []))
        profile = user_map.get(participant_id, {})
        leaderboard.append(
            {
                "user_id": participant_id,
                "name": profile.get("name") or "Athlete",
                "is_you": participant_id == user.user_id,
                "total_workouts": int(stats["workouts"]),
                "total_sets": int(stats["total_sets"]),
                "total_volume": stats["total_volume"],
            }
        )

    leaderboard.sort(key=lambda row: (row["total_volume"], row["total_sets"], row["total_workouts"]), reverse=True)

    for idx, row in enumerate(leaderboard, start=1):
        row["rank"] = idx

    return {
        "days": days,
        "participants": len(leaderboard),
        "leaderboard": leaderboard,
    }

# ============== Health Check ==============

@api_router.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "timestamp": datetime.now(timezone.utc).isoformat()}

# Include the router
app.include_router(api_router)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()

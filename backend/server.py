from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, Depends
from fastapi.responses import JSONResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime, timezone, timedelta
import httpx

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
    daily_calories: int = 2000
    protein_grams: int = 150
    carbs_grams: int = 200
    fat_grams: int = 65
    workouts_per_week: int = 4

class UserEquipment(BaseModel):
    equipment: List[str]  # ['dumbbells', 'barbell', 'pullup_bar', 'bench', 'cables', 'machines']

class Exercise(BaseModel):
    exercise_id: str = Field(default_factory=lambda: f"ex_{uuid.uuid4().hex[:12]}")
    name: str
    category: str  # chest, back, shoulders, legs, arms, core
    equipment_required: List[str] = []  # equipment needed
    muscle_groups: List[str] = []
    is_compound: bool = False

class WorkoutSet(BaseModel):
    set_number: int
    weight: float
    reps: int
    rpe: Optional[int] = None  # Rate of Perceived Exertion 1-10
    is_warmup: bool = False

class WorkoutExercise(BaseModel):
    exercise_id: str
    exercise_name: str
    sets: List[WorkoutSet] = []
    notes: Optional[str] = None

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
    name: str = "Workout"
    date: Optional[datetime] = None
    exercises: List[WorkoutExercise] = []
    duration_minutes: Optional[int] = None
    notes: Optional[str] = None

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
    food_id: str
    food_name: str
    servings: float
    calories: float
    protein: float
    carbs: float
    fat: float

# ============== Auth Helpers ==============

async def get_current_user(request: Request) -> User:
    """Get current user from session token"""
    session_token = request.cookies.get("session_token")
    if not session_token:
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            session_token = auth_header.split(" ")[1]
    
    if not session_token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    session = await db.user_sessions.find_one({"session_token": session_token}, {"_id": 0})
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

# ============== Auth Endpoints ==============

@api_router.post("/auth/session")
async def exchange_session(request: Request, response: Response):
    """Exchange session_id from OAuth callback for session_token"""
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
    session_token = request.cookies.get("session_token")
    if session_token:
        await db.user_sessions.delete_one({"session_token": session_token})
    
    response.delete_cookie(key="session_token", path="/")
    return {"message": "Logged out"}

# ============== User Endpoints ==============

@api_router.put("/user/goals")
async def update_goals(goals: UserGoals, user: User = Depends(get_current_user)):
    """Update user nutrition/fitness goals"""
    await db.users.update_one(
        {"user_id": user.user_id},
        {"$set": {"goals": goals.model_dump()}}
    )
    return {"message": "Goals updated", "goals": goals.model_dump()}

@api_router.put("/user/equipment")
async def update_equipment(equipment: UserEquipment, user: User = Depends(get_current_user)):
    """Update user's home gym equipment"""
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
    
    exercises = await db.exercises.find(query, {"_id": 0}).to_list(100)
    
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
    
    exercises = await db.exercises.find(query, {"_id": 0}).to_list(100)
    
    # Filter: include if no equipment needed OR user has the required equipment
    filtered = [
        ex for ex in exercises
        if not ex["equipment_required"] or
        all(eq in user_equipment_set for eq in ex["equipment_required"])
    ]
    
    return filtered

# ============== Workout Endpoints ==============

@api_router.post("/workouts")
async def create_workout(workout: WorkoutCreate, user: User = Depends(get_current_user)):
    """Create a new workout"""
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
async def update_workout(workout_id: str, workout: WorkoutCreate, user: User = Depends(get_current_user)):
    """Update a workout"""
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
async def delete_workout(workout_id: str, user: User = Depends(get_current_user)):
    """Delete a workout"""
    result = await db.workouts.delete_one({"workout_id": workout_id, "user_id": user.user_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Workout not found")
    return {"message": "Workout deleted"}

# ============== Warm-up Calculator ==============

@api_router.post("/workouts/warmup-sets")
async def calculate_warmup_sets(working_weight: float, exercise_name: str):
    """Calculate warm-up sets based on working weight"""
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
    
    foods = await db.foods.find(query, {"_id": 0}).to_list(100)
    return foods

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
async def add_meal_entry(date: str, entry: MealEntryCreate, user: User = Depends(get_current_user)):
    """Add a food entry to a meal"""
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
async def remove_meal_entry(date: str, meal_type: str, index: int, user: User = Depends(get_current_user)):
    """Remove a food entry from a meal"""
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
async def get_workout_volume(user: User = Depends(get_current_user), days: int = 30):
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
async def get_nutrition_adherence(user: User = Depends(get_current_user), days: int = 7):
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

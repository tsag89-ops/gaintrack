import requests
import json
from datetime import datetime

# Base URL from environment configuration
BASE_URL = "https://gaintrack-pro-5.preview.emergentagent.com/api"

def test_health_endpoint():
    """Test the health check endpoint"""
    print("Testing GET /api/health...")
    try:
        response = requests.get(f"{BASE_URL}/health")
        print(f"Status Code: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            print(f"Response: {data}")
            
            # Check response structure
            if "status" in data and "timestamp" in data:
                if data["status"] == "healthy":
                    print("✅ Health endpoint working correctly")
                    return True
                else:
                    print(f"❌ Health status is not 'healthy': {data['status']}")
                    return False
            else:
                print("❌ Health endpoint missing required fields (status, timestamp)")
                return False
        else:
            print(f"❌ Health endpoint returned status code: {response.status_code}")
            print(f"Response: {response.text}")
            return False
            
    except requests.exceptions.RequestException as e:
        print(f"❌ Error connecting to health endpoint: {e}")
        return False

def test_exercises_endpoint():
    """Test the exercises endpoint"""
    print("\nTesting GET /api/exercises...")
    try:
        response = requests.get(f"{BASE_URL}/exercises")
        print(f"Status Code: {response.status_code}")
        
        if response.status_code == 200:
            exercises = response.json()
            print(f"Number of exercises returned: {len(exercises)}")
            
            # Check if we get 32 exercises as expected
            if len(exercises) == 32:
                print("✅ Exercise database returns correct number of exercises (32)")
                
                # Check structure of first exercise
                if exercises:
                    first_ex = exercises[0]
                    required_fields = ["exercise_id", "name", "category", "equipment_required", "muscle_groups", "is_compound"]
                    missing_fields = [field for field in required_fields if field not in first_ex]
                    
                    if not missing_fields:
                        print("✅ Exercise objects have correct structure")
                        
                        # Print sample exercises
                        print("Sample exercises:")
                        for i, ex in enumerate(exercises[:3]):
                            print(f"  {i+1}. {ex['name']} - {ex['category']} - {ex['muscle_groups']}")
                        
                        return True
                    else:
                        print(f"❌ Exercise objects missing fields: {missing_fields}")
                        return False
                else:
                    print("❌ No exercises returned in response")
                    return False
            else:
                print(f"❌ Expected 32 exercises, got {len(exercises)}")
                return False
        else:
            print(f"❌ Exercises endpoint returned status code: {response.status_code}")
            print(f"Response: {response.text}")
            return False
            
    except requests.exceptions.RequestException as e:
        print(f"❌ Error connecting to exercises endpoint: {e}")
        return False
    except json.JSONDecodeError as e:
        print(f"❌ Error parsing exercises JSON response: {e}")
        return False

def test_foods_endpoint():
    """Test the foods endpoint"""
    print("\nTesting GET /api/foods...")
    try:
        response = requests.get(f"{BASE_URL}/foods")
        print(f"Status Code: {response.status_code}")
        
        if response.status_code == 200:
            foods = response.json()
            print(f"Number of foods returned: {len(foods)}")
            
            # Check if we get 29 foods as expected
            if len(foods) == 29:
                print("✅ Food database returns correct number of foods (29)")
                
                # Check structure of first food
                if foods:
                    first_food = foods[0]
                    required_fields = ["food_id", "name", "category", "serving_size", "calories", "protein", "carbs", "fat"]
                    missing_fields = [field for field in required_fields if field not in first_food]
                    
                    if not missing_fields:
                        print("✅ Food objects have correct structure")
                        
                        # Print sample foods
                        print("Sample foods:")
                        for i, food in enumerate(foods[:3]):
                            print(f"  {i+1}. {food['name']} - {food['category']} - {food['calories']} cal/{food['serving_size']}")
                        
                        return True
                    else:
                        print(f"❌ Food objects missing fields: {missing_fields}")
                        return False
                else:
                    print("❌ No foods returned in response")
                    return False
            else:
                print(f"❌ Expected 29 foods, got {len(foods)}")
                return False
        else:
            print(f"❌ Foods endpoint returned status code: {response.status_code}")
            print(f"Response: {response.text}")
            return False
            
    except requests.exceptions.RequestException as e:
        print(f"❌ Error connecting to foods endpoint: {e}")
        return False
    except json.JSONDecodeError as e:
        print(f"❌ Error parsing foods JSON response: {e}")
        return False

def test_warmup_calculator():
    """Test the warm-up calculator endpoint"""
    print("\nTesting POST /api/workouts/warmup-sets...")
    try:
        # Test data as query parameters
        params = {
            "working_weight": 135,
            "exercise_name": "Bench Press"
        }
        
        response = requests.post(
            f"{BASE_URL}/workouts/warmup-sets", 
            params=params
        )
        print(f"Status Code: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            print(f"Response: {data}")
            
            # Check response structure
            if "warmup_sets" in data and "working_weight" in data:
                warmup_sets = data["warmup_sets"]
                working_weight = data["working_weight"]
                
                if working_weight == 135:
                    print("✅ Working weight returned correctly")
                    
                    # Check if we have warmup sets
                    if len(warmup_sets) > 0:
                        print(f"Number of warmup sets: {len(warmup_sets)}")
                        
                        # Verify the percentages (40%, 60%, 80%)
                        expected_percentages = [40, 60, 80]
                        actual_percentages = [ws.get("percentage", 0) for ws in warmup_sets]
                        
                        if actual_percentages == expected_percentages:
                            print("✅ Warmup percentages correct (40%, 60%, 80%)")
                            
                            # Check calculated weights
                            print("Warmup sets:")
                            for ws in warmup_sets:
                                print(f"  Set {ws['set_number']}: {ws['weight']}lbs x {ws['reps']} reps ({ws['percentage']}%)")
                            
                            # Verify weights are approximately correct
                            expected_weights = [55, 80, 105]  # 40%, 60%, 80% of 135 rounded to nearest 5
                            actual_weights = [ws.get("weight", 0) for ws in warmup_sets]
                            
                            weights_correct = True
                            for i, (expected, actual) in enumerate(zip(expected_weights, actual_weights)):
                                if abs(expected - actual) <= 5:  # Allow small rounding differences
                                    print(f"✅ Set {i+1} weight correct: {actual}lbs (expected ~{expected}lbs)")
                                else:
                                    print(f"❌ Set {i+1} weight incorrect: {actual}lbs (expected ~{expected}lbs)")
                                    weights_correct = False
                            
                            if weights_correct:
                                print("✅ Warmup calculator working correctly")
                                return True
                            else:
                                print("❌ Warmup weights calculation incorrect")
                                return False
                        else:
                            print(f"❌ Incorrect warmup percentages: {actual_percentages}, expected: {expected_percentages}")
                            return False
                    else:
                        print("❌ No warmup sets returned")
                        return False
                else:
                    print(f"❌ Working weight incorrect: {working_weight}, expected: 135")
                    return False
            else:
                print("❌ Warmup calculator response missing required fields")
                return False
        else:
            print(f"❌ Warmup calculator returned status code: {response.status_code}")
            print(f"Response: {response.text}")
            return False
            
    except requests.exceptions.RequestException as e:
        print(f"❌ Error connecting to warmup calculator endpoint: {e}")
        return False
    except json.JSONDecodeError as e:
        print(f"❌ Error parsing warmup calculator JSON response: {e}")
        return False

def test_workout_templates():
    """Test the workout templates endpoints"""
    print("\nTesting GET /api/templates...")
    try:
        response = requests.get(f"{BASE_URL}/templates")
        print(f"Status Code: {response.status_code}")
        
        if response.status_code == 200:
            templates = response.json()
            print(f"Number of templates returned: {len(templates)}")
            
            # Check if we get 5 templates as expected
            if len(templates) == 5:
                print("✅ Templates endpoint returns correct number of programs (5)")
                
                # Expected template names
                expected_names = [
                    "Beginner 5x5",
                    "Push Pull Legs (PPL)", 
                    "Upper/Lower Split",
                    "Full Body 3x/Week",
                    "Home Gym Basics"
                ]
                
                actual_names = [t.get("name", "") for t in templates]
                print(f"Template names: {actual_names}")
                
                # Check if all expected templates are present
                missing_templates = [name for name in expected_names if name not in actual_names]
                if not missing_templates:
                    print("✅ All expected workout templates present")
                    
                    # Check structure of first template
                    if templates:
                        first_template = templates[0]
                        required_fields = ["template_id", "name", "description", "difficulty", "duration_weeks", "workouts_per_week", "type", "exercises"]
                        missing_fields = [field for field in required_fields if field not in first_template]
                        
                        if not missing_fields:
                            print("✅ Template objects have correct structure")
                            
                            # Print sample template info
                            print("Sample templates:")
                            for i, template in enumerate(templates[:3]):
                                print(f"  {i+1}. {template['name']} - {template['difficulty']} - {template['workouts_per_week']}x/week")
                            
                            return True, templates[0].get("template_id")  # Return first template ID for individual test
                        else:
                            print(f"❌ Template objects missing fields: {missing_fields}")
                            return False, None
                    else:
                        print("❌ No templates returned in response")
                        return False, None
                else:
                    print(f"❌ Missing expected templates: {missing_templates}")
                    return False, None
            else:
                print(f"❌ Expected 5 templates, got {len(templates)}")
                return False, None
        else:
            print(f"❌ Templates endpoint returned status code: {response.status_code}")
            print(f"Response: {response.text}")
            return False, None
            
    except requests.exceptions.RequestException as e:
        print(f"❌ Error connecting to templates endpoint: {e}")
        return False, None
    except json.JSONDecodeError as e:
        print(f"❌ Error parsing templates JSON response: {e}")
        return False, None

def test_workout_template_detail(template_id):
    """Test the individual workout template endpoint"""
    if not template_id:
        print("\nSkipping individual template test - no template ID available")
        return False
        
    print(f"\nTesting GET /api/templates/{template_id}...")
    try:
        response = requests.get(f"{BASE_URL}/templates/{template_id}")
        print(f"Status Code: {response.status_code}")
        
        if response.status_code == 200:
            template = response.json()
            print(f"Template retrieved: {template.get('name', 'Unknown')}")
            
            # Check response structure
            required_fields = ["template_id", "name", "description", "difficulty", "duration_weeks", "workouts_per_week", "type", "exercises"]
            missing_fields = [field for field in required_fields if field not in template]
            
            if not missing_fields:
                print("✅ Individual template has correct structure")
                
                # Verify it has exercise data
                exercises = template.get("exercises", [])
                if exercises:
                    print(f"Template has {len(exercises)} workout days")
                    
                    # Check first day structure
                    first_day = exercises[0]
                    if "day" in first_day and "exercises" in first_day:
                        day_exercises = first_day["exercises"]
                        print(f"Day '{first_day['day']}' has {len(day_exercises)} exercises")
                        
                        if day_exercises:
                            first_ex = day_exercises[0]
                            exercise_fields = ["name", "sets", "reps", "rest_seconds"]
                            ex_missing = [field for field in exercise_fields if field not in first_ex]
                            
                            if not ex_missing:
                                print("✅ Exercise structure is correct")
                                print(f"Sample exercise: {first_ex['name']} - {first_ex['sets']}x{first_ex['reps']}")
                                return True
                            else:
                                print(f"❌ Exercise missing fields: {ex_missing}")
                                return False
                        else:
                            print("❌ No exercises in first day")
                            return False
                    else:
                        print("❌ Day structure missing 'day' or 'exercises' fields")
                        return False
                else:
                    print("❌ Template has no exercises")
                    return False
            else:
                print(f"❌ Template missing required fields: {missing_fields}")
                return False
        else:
            print(f"❌ Template detail endpoint returned status code: {response.status_code}")
            print(f"Response: {response.text}")
            return False
            
    except requests.exceptions.RequestException as e:
        print(f"❌ Error connecting to template detail endpoint: {e}")
        return False
    except json.JSONDecodeError as e:
        print(f"❌ Error parsing template detail JSON response: {e}")
        return False

def run_all_tests():
    """Run all backend API tests"""
    print("=== GainTrack Backend API Test Suite ===")
    print(f"Base URL: {BASE_URL}")
    print(f"Test Time: {datetime.now()}")
    print("="*50)
    
    results = {}
    
    # Run each test
    results['health'] = test_health_endpoint()
    results['exercises'] = test_exercises_endpoint()
    results['foods'] = test_foods_endpoint()
    results['warmup_calculator'] = test_warmup_calculator()
    
    # Summary
    print("\n" + "="*50)
    print("TEST SUMMARY:")
    print("="*50)
    
    passed = sum(1 for result in results.values() if result)
    total = len(results)
    
    for test_name, result in results.items():
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"{test_name.replace('_', ' ').title()}: {status}")
    
    print(f"\nOverall: {passed}/{total} tests passed")
    
    if passed == total:
        print("🎉 All backend API tests PASSED!")
        return True
    else:
        print(f"⚠️  {total - passed} test(s) FAILED")
        return False

if __name__ == "__main__":
    run_all_tests()
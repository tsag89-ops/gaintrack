#!/usr/bin/env python3
"""
GainTrack Backend API Testing Suite
Tests all major endpoints including auth-protected endpoints.
"""

import requests
import json
from datetime import datetime, timezone

# Test Configuration
BASE_URL = "https://gaintrack-pro-5.preview.emergentagent.com"
AUTH_TOKEN = "Bearer test_session_1771746329648"

class GainTrackTester:
    def __init__(self):
        self.base_url = BASE_URL
        self.headers = {
            "Authorization": AUTH_TOKEN,
            "Content-Type": "application/json"
        }
        self.results = []
        
    def log_result(self, endpoint, method, status_code, expected_status, response_data=None, error=None):
        """Log test result"""
        success = status_code == expected_status
        result = {
            "endpoint": endpoint,
            "method": method,
            "status_code": status_code,
            "expected_status": expected_status,
            "success": success,
            "response_data": response_data,
            "error": str(error) if error else None,
            "timestamp": datetime.now().isoformat()
        }
        self.results.append(result)
        
        status = "✅ PASS" if success else "❌ FAIL"
        print(f"{status} {method} {endpoint} -> {status_code} (expected {expected_status})")
        if error:
            print(f"   Error: {error}")
        if response_data and isinstance(response_data, dict):
            if 'status' in response_data:
                print(f"   Status: {response_data['status']}")
            if 'message' in response_data:
                print(f"   Message: {response_data['message']}")
        return success
    
    def test_health_check(self):
        """Test GET /api/health"""
        print("\n=== Testing Health Check ===")
        try:
            response = requests.get(f"{self.base_url}/api/health", timeout=10)
            data = response.json() if response.content else {}
            return self.log_result("/api/health", "GET", response.status_code, 200, data)
        except Exception as e:
            return self.log_result("/api/health", "GET", 0, 200, None, e)
    
    def test_exercises_database(self):
        """Test GET /api/exercises"""
        print("\n=== Testing Exercise Database ===")
        try:
            response = requests.get(f"{self.base_url}/api/exercises", timeout=10)
            data = response.json() if response.content else {}
            success = self.log_result("/api/exercises", "GET", response.status_code, 200, data)
            
            if success and isinstance(data, list):
                print(f"   Exercises returned: {len(data)}")
                if len(data) > 0:
                    sample = data[0]
                    required_fields = ['exercise_id', 'name', 'category', 'equipment_required', 'muscle_groups', 'is_compound']
                    missing_fields = [f for f in required_fields if f not in sample]
                    if missing_fields:
                        print(f"   ⚠️  Missing fields in exercise: {missing_fields}")
                    else:
                        print(f"   Sample exercise: {sample.get('name', 'Unknown')}")
            return success
        except Exception as e:
            return self.log_result("/api/exercises", "GET", 0, 200, None, e)
    
    def test_foods_database(self):
        """Test GET /api/foods"""
        print("\n=== Testing Food Database ===")
        try:
            response = requests.get(f"{self.base_url}/api/foods", timeout=10)
            data = response.json() if response.content else {}
            success = self.log_result("/api/foods", "GET", response.status_code, 200, data)
            
            if success and isinstance(data, list):
                print(f"   Foods returned: {len(data)}")
                if len(data) > 0:
                    sample = data[0]
                    required_fields = ['food_id', 'name', 'category', 'serving_size', 'calories', 'protein', 'carbs', 'fat']
                    missing_fields = [f for f in required_fields if f not in sample]
                    if missing_fields:
                        print(f"   ⚠️  Missing fields in food: {missing_fields}")
                    else:
                        print(f"   Sample food: {sample.get('name', 'Unknown')}")
            return success
        except Exception as e:
            return self.log_result("/api/foods", "GET", 0, 200, None, e)
    
    def test_workout_templates(self):
        """Test GET /api/templates"""
        print("\n=== Testing Workout Templates ===")
        try:
            response = requests.get(f"{self.base_url}/api/templates", timeout=10)
            data = response.json() if response.content else {}
            success = self.log_result("/api/templates", "GET", response.status_code, 200, data)
            
            if success and isinstance(data, list):
                print(f"   Templates returned: {len(data)}")
                if len(data) > 0:
                    sample = data[0]
                    required_fields = ['template_id', 'name', 'description', 'difficulty', 'duration_weeks', 'workouts_per_week']
                    missing_fields = [f for f in required_fields if f not in sample]
                    if missing_fields:
                        print(f"   ⚠️  Missing fields in template: {missing_fields}")
                    else:
                        print(f"   Sample template: {sample.get('name', 'Unknown')}")
            return success
        except Exception as e:
            return self.log_result("/api/templates", "GET", 0, 200, None, e)
    
    def test_warmup_calculator(self):
        """Test POST /api/workouts/warmup-sets"""
        print("\n=== Testing Warmup Calculator ===")
        try:
            # Use query parameters as expected by the endpoint
            response = requests.post(
                f"{self.base_url}/api/workouts/warmup-sets?working_weight=135&exercise_name=Bench Press", 
                timeout=10
            )
            data = response.json() if response.content else {}
            success = self.log_result("/api/workouts/warmup-sets", "POST", response.status_code, 200, data)
            
            if success and isinstance(data, dict):
                if 'warmup_sets' in data:
                    warmup_sets = data['warmup_sets']
                    print(f"   Warmup sets generated: {len(warmup_sets)}")
                    for i, set_data in enumerate(warmup_sets):
                        print(f"   Set {i+1}: {set_data.get('weight', 0)}lbs x {set_data.get('reps', 0)} reps ({set_data.get('percentage', 0)}%)")
                else:
                    print(f"   ⚠️  Missing 'warmup_sets' in response")
            return success
        except Exception as e:
            return self.log_result("/api/workouts/warmup-sets", "POST", 0, 200, None, e)
    
    def test_progression_suggestions(self):
        """Test GET /api/progression/suggestions (requires auth)"""
        print("\n=== Testing Progression Suggestions (Auth Required) ===")
        try:
            response = requests.get(
                f"{self.base_url}/api/progression/suggestions", 
                headers=self.headers,
                timeout=10
            )
            data = response.json() if response.content else {}
            success = self.log_result("/api/progression/suggestions", "GET", response.status_code, 200, data)
            
            if success and isinstance(data, dict):
                required_fields = ['suggestions', 'total_exercises_analyzed', 'generated_at']
                missing_fields = [f for f in required_fields if f not in data]
                if missing_fields:
                    print(f"   ⚠️  Missing fields in response: {missing_fields}")
                else:
                    print(f"   Exercises analyzed: {data.get('total_exercises_analyzed', 0)}")
                    print(f"   Suggestions count: {len(data.get('suggestions', []))}")
            return success
        except Exception as e:
            return self.log_result("/api/progression/suggestions", "GET", 0, 200, None, e)
    
    def test_measurements(self):
        """Test GET /api/measurements (requires auth)"""
        print("\n=== Testing Body Measurements (Auth Required) ===")
        try:
            response = requests.get(
                f"{self.base_url}/api/measurements", 
                headers=self.headers,
                timeout=10
            )
            data = response.json() if response.content else {}
            success = self.log_result("/api/measurements", "GET", response.status_code, 200, data)
            
            if success and isinstance(data, list):
                print(f"   Measurements returned: {len(data)}")
                if len(data) > 0:
                    sample = data[0]
                    print(f"   Sample measurement date: {sample.get('date', 'Unknown')}")
                else:
                    print(f"   No measurements found (expected for new user)")
            return success
        except Exception as e:
            return self.log_result("/api/measurements", "GET", 0, 200, None, e)
    
    def test_measurements_progress(self):
        """Test GET /api/measurements/stats/progress (requires auth)"""
        print("\n=== Testing Measurement Progress Stats (Auth Required) ===")
        try:
            response = requests.get(
                f"{self.base_url}/api/measurements/stats/progress", 
                headers=self.headers,
                timeout=10
            )
            data = response.json() if response.content else {}
            success = self.log_result("/api/measurements/stats/progress", "GET", response.status_code, 200, data)
            
            if success and isinstance(data, dict):
                required_fields = ['measurements', 'changes', 'has_data']
                missing_fields = [f for f in required_fields if f not in data]
                if missing_fields:
                    print(f"   ⚠️  Missing fields in response: {missing_fields}")
                else:
                    print(f"   Has measurement data: {data.get('has_data', False)}")
                    print(f"   Measurements count: {len(data.get('measurements', []))}")
                    print(f"   Changes tracked: {len(data.get('changes', {}))}")
            return success
        except Exception as e:
            return self.log_result("/api/measurements/stats/progress", "GET", 0, 200, None, e)
    
    def test_authentication_endpoints(self):
        """Test authentication-related endpoints"""
        print("\n=== Testing Auth Endpoints ===")
        
        # Test /api/auth/me
        try:
            response = requests.get(
                f"{self.base_url}/api/auth/me", 
                headers=self.headers,
                timeout=10
            )
            data = response.json() if response.content else {}
            success = self.log_result("/api/auth/me", "GET", response.status_code, 200, data)
            
            if success and isinstance(data, dict):
                required_fields = ['user_id', 'email', 'name', 'created_at']
                missing_fields = [f for f in required_fields if f not in data]
                if missing_fields:
                    print(f"   ⚠️  Missing user fields: {missing_fields}")
                else:
                    print(f"   Authenticated user: {data.get('name', 'Unknown')} ({data.get('email', 'No email')})")
            return success
        except Exception as e:
            return self.log_result("/api/auth/me", "GET", 0, 200, None, e)
    
    def run_all_tests(self):
        """Run all endpoint tests"""
        print("🏋️  Starting GainTrack Backend API Test Suite")
        print(f"Base URL: {self.base_url}")
        print(f"Auth Token: {AUTH_TOKEN[:20]}...")
        
        tests = [
            ("Health Check", self.test_health_check),
            ("Exercise Database", self.test_exercises_database),
            ("Food Database", self.test_foods_database),
            ("Workout Templates", self.test_workout_templates),
            ("Warmup Calculator", self.test_warmup_calculator),
            ("Progression AI", self.test_progression_suggestions),
            ("Body Measurements", self.test_measurements),
            ("Measurements Progress", self.test_measurements_progress),
            ("Authentication", self.test_authentication_endpoints)
        ]
        
        total_tests = 0
        passed_tests = 0
        
        for test_name, test_func in tests:
            try:
                success = test_func()
                total_tests += 1
                if success:
                    passed_tests += 1
            except Exception as e:
                print(f"❌ Test {test_name} crashed: {e}")
                total_tests += 1
        
        print("\n" + "="*60)
        print("📊 TEST SUMMARY")
        print("="*60)
        print(f"Total Tests: {total_tests}")
        print(f"Passed: {passed_tests}")
        print(f"Failed: {total_tests - passed_tests}")
        print(f"Success Rate: {(passed_tests/total_tests*100):.1f}%")
        
        if passed_tests == total_tests:
            print("🎉 ALL TESTS PASSED! Backend API is fully functional.")
        else:
            print("⚠️  Some tests failed. Check the details above.")
        
        return self.results

def main():
    """Main test runner"""
    tester = GainTrackTester()
    results = tester.run_all_tests()
    
    # Save detailed results to file
    with open('/app/test_results_detailed.json', 'w') as f:
        json.dump(results, f, indent=2)
    
    print(f"\n📝 Detailed results saved to: /app/test_results_detailed.json")

if __name__ == "__main__":
    main()
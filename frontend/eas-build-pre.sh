#!/bin/bash

# Pre-build hook for EAS: Ensure google-services.json exists
# Since google-services.json is gitignore'd, EAS won't have it
# This script creates a placeholder that the Firebase plugin can read

set -e

# Path where Gradle expects google-services.json (relative to frontend dir)
GOOGLE_SERVICES_PATH="android/app/google-services.json"

# If the file already exists (from EAS secrets or upload), skip
if [ -f "$GOOGLE_SERVICES_PATH" ]; then
  echo "✅ google-services.json already exists"
  exit 0
fi

# Otherwise, create a placeholder for CI/dev builds
echo "📝 Creating placeholder google-services.json for EAS build..."

cat > "$GOOGLE_SERVICES_PATH" <<'EOF'
{
  "project_info": {
    "project_number": "000000000000",
    "project_id": "ci-placeholder",
    "storage_bucket": "ci-placeholder.appspot.com"
  },
  "client": [
    {
      "client_info": {
        "mobilesdk_app_id": "1:000000000000:android:0000000000000000",
        "android_client_info": {
          "package_name": "com.tsag89ops.gaintrack"
        }
      },
      "oauth_client": [],
      "api_key": [
        {
          "current_key": "CI_PLACEHOLDER_KEY"
        }
      ],
      "services": {
        "appinvite_service": {
          "other_platform_oauth_client": []
        }
      }
    }
  ],
  "configuration_version": "1"
}
EOF

echo "✅ Placeholder google-services.json created"
echo "   Note: For production release builds with real Firebase, upload the actual credentials via EAS"



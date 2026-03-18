#!/bin/sh

# EAS lifecycle script: ensure android/app/google-services.json exists.
# Prefers channel/profile-specific env vars and falls back to placeholder.

set -eu

GOOGLE_SERVICES_PATH="android/app/google-services.json"
PROFILE="${EAS_BUILD_PROFILE:-}"

echo "EAS profile: ${PROFILE:-unknown}"

if [ -f "$GOOGLE_SERVICES_PATH" ]; then
  echo "google-services.json already present"
  exit 0
fi

pick_first_set_var() {
  for var_name in "$@"; do
    eval "var_value=\${$var_name:-}"
    if [ -n "$var_value" ]; then
      printf '%s' "$var_name"
      return 0
    fi
  done
  return 1
}

write_from_env_var() {
  src_var="$1"
  eval "raw_value=\${$src_var}"

  if [ -f "$raw_value" ]; then
    cp "$raw_value" "$GOOGLE_SERVICES_PATH"
    return 0
  fi

  case "$raw_value" in
    \{*)
      printf '%s' "$raw_value" > "$GOOGLE_SERVICES_PATH"
      ;;
    *)
      decoded="$(printf '%s' "$raw_value" | base64 -d 2>/dev/null || true)"
      if [ -n "$decoded" ]; then
        printf '%s' "$decoded" > "$GOOGLE_SERVICES_PATH"
      else
        return 1
      fi
      ;;
  esac

  return 0
}

case "$PROFILE" in
  production|production-apk)
    CANDIDATES="GOOGLE_SERVICES_JSON_PRODUCTION GOOGLE_SERVICES_JSON_PROD GOOGLE_SERVICES_JSON"
    ;;
  preview)
    CANDIDATES="GOOGLE_SERVICES_JSON_PREVIEW GOOGLE_SERVICES_JSON"
    ;;
  development)
    CANDIDATES="GOOGLE_SERVICES_JSON_DEVELOPMENT GOOGLE_SERVICES_JSON_DEV GOOGLE_SERVICES_JSON"
    ;;
  *)
    CANDIDATES="GOOGLE_SERVICES_JSON GOOGLE_SERVICES_JSON_PRODUCTION GOOGLE_SERVICES_JSON_PROD GOOGLE_SERVICES_JSON_PREVIEW GOOGLE_SERVICES_JSON_DEVELOPMENT GOOGLE_SERVICES_JSON_DEV"
    ;;
esac

SELECTED_VAR=""
if SELECTED_VAR="$(pick_first_set_var $CANDIDATES)"; then
  echo "Using $SELECTED_VAR to create google-services.json"
  if write_from_env_var "$SELECTED_VAR" && grep -q '"project_info"' "$GOOGLE_SERVICES_PATH"; then
    echo "google-services.json created from environment variable"
    exit 0
  fi
  echo "Failed to parse $SELECTED_VAR; falling back to placeholder"
fi

echo "No usable google-services env var found; creating placeholder"
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

echo "Placeholder google-services.json created"



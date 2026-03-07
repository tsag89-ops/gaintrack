// app.config.js — extends app.json, reads EAS-injected secrets via env vars
// Secrets are uploaded as EAS file secrets:
//   eas env:create --name GOOGLE_SERVICES_JSON  --type file --value ./google-services.json
//   eas env:create --name GOOGLE_SERVICES_PLIST --type file --value ./GoogleService-Info.plist

const fs = require('fs');

/**
 * Parse google-services.json and return Android + Web OAuth client IDs.
 * client_type 1 = Android, client_type 3 = Web/server
 */
function extractAndroidClientIds() {
  const filePath = process.env.GOOGLE_SERVICES_JSON;
  if (!filePath) return {};
  try {
    const json = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const oauthClients = json?.client?.[0]?.oauth_client ?? [];
    const androidClient = oauthClients.find((c) => c.client_type === 1);
    const webClient = oauthClients.find((c) => c.client_type === 3);
    return {
      googleAndroidClientId: androidClient?.client_id ?? null,
      googleWebClientId: webClient?.client_id ?? null,
    };
  } catch (e) {
    console.warn('[app.config.js] Could not parse GOOGLE_SERVICES_JSON:', e.message);
    return {};
  }
}

/**
 * Parse GoogleService-Info.plist and return the iOS CLIENT_ID and
 * REVERSED_CLIENT_ID (used as a URL scheme for Google Sign-In redirect).
 * Uses a simple regex — no extra dependencies needed.
 */
function extractIosClientIds() {
  const filePath = process.env.GOOGLE_SERVICES_PLIST;
  if (!filePath) return {};
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const get = (key) => {
      const m = raw.match(new RegExp(`<key>${key}<\\/key>\\s*<string>([^<]+)<\\/string>`));
      return m ? m[1] : null;
    };
    return {
      googleIosClientId: get('CLIENT_ID'),
      googleIosReversedClientId: get('REVERSED_CLIENT_ID'),
    };
  } catch (e) {
    console.warn('[app.config.js] Could not parse GOOGLE_SERVICES_PLIST:', e.message);
    return {};
  }
}

module.exports = ({ config }) => {
  const androidIds = extractAndroidClientIds();
  const iosIds = extractIosClientIds();

  // Merge any existing URL schemes with the REVERSED_CLIENT_ID required by
  // Google Sign-In on iOS. Deduplicates so re-running config is idempotent.
  const existingSchemes = config.ios?.infoPlist?.CFBundleURLTypes ?? [];
  const reversedClientId =
    process.env.EXPO_PUBLIC_GOOGLE_IOS_REVERSED_CLIENT_ID ||
    iosIds.googleIosReversedClientId;
  const googleSchemeEntry = reversedClientId
    ? [{ CFBundleURLSchemes: [reversedClientId] }]
    : [];
  const mergedUrlTypes = [
    ...existingSchemes.filter(
      (t) => !t.CFBundleURLSchemes?.includes(reversedClientId),
    ),
    ...googleSchemeEntry,
  ];

  // Build the complete plugins list, injecting Google Sign-In with the real
  // iosUrlScheme resolved from the EAS-injected GoogleService-Info.plist.
  const existingPlugins = (config.plugins ?? []).filter(
    (p) => {
      const name = Array.isArray(p) ? p[0] : p;
      return name !== '@react-native-google-signin/google-signin';
    },
  );
  const googleSignInPlugin = [
    '@react-native-google-signin/google-signin',
    {
      iosUrlScheme: reversedClientId ?? 'com.googleusercontent.apps.PLACEHOLDER',
    },
  ];

  return {
    ...config,
    plugins: [...existingPlugins, googleSignInPlugin],
    android: {
      ...config.android,
      googleServicesFile:
        process.env.GOOGLE_SERVICES_JSON ?? config.android?.googleServicesFile,
    },
    ios: {
      ...config.ios,
      // Real plist injected at EAS build time via GOOGLE_SERVICES_PLIST file secret.
      // Falls back to the placeholder so the Firebase plugin doesn't crash locally.
      googleServicesFile:
        process.env.GOOGLE_SERVICES_PLIST ?? config.ios?.googleServicesFile,
      infoPlist: {
        ...config.ios?.infoPlist,
        // Register the REVERSED_CLIENT_ID URL scheme required for Google Sign-In
        // redirect on iOS. EAS build injects the real value from the plist.
        CFBundleURLTypes: mergedUrlTypes,
      },
    },
    extra: {
      ...config.extra,
      // All IDs resolved at EAS build time from the credential files.
      // EXPO_PUBLIC_ env vars act as explicit overrides if needed.
      googleAndroidClientId:
        process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID ||
        androidIds.googleAndroidClientId ||
        null,
      googleWebClientId:
        process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ||
        androidIds.googleWebClientId ||
        null,
      googleIosClientId:
        process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ||
        iosIds.googleIosClientId ||
        null,
      googleIosReversedClientId: reversedClientId || null,
    },
  };
};

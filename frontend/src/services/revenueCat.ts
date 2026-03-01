// src/services/revenueCat.ts
// [PRO] RevenueCat integration.
//
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SETUP STEPS (do these before your first build):
//
//  1. Create frontend/.env and add:
//       EXPO_PUBLIC_REVENUECAT_API_KEY=appl_xxxxxxxxxxxxxxxx
//     (Use your Android key for Android, iOS key for iOS, or a shared key
//      if you created one in the RevenueCat dashboard.)
//
//  2. Make sure .env is in .gitignore (already handled by this PR).
//
//  3. For EAS builds (no .env on CI), run once:
//       cd frontend && eas env:create --name EXPO_PUBLIC_REVENUECAT_API_KEY --type string --environment production
//     Then paste the key when prompted.
//
//  4. Change PRO_ENTITLEMENT_ID below to match the entitlement identifier
//     you created in the RevenueCat dashboard (default: "pro").
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import Purchases, { CustomerInfo, LOG_LEVEL } from 'react-native-purchases';

// ── Change this to your RevenueCat entitlement identifier ──────────────────
export const PRO_ENTITLEMENT_ID = 'pro';
// ───────────────────────────────────────────────────────────────────────────

/**
 * Call this once when the app starts (see app/_layout.tsx).
 * Pass the authenticated userId so RevenueCat can link purchases across devices.
 */
export function initRevenueCat(userId?: string): void {
  const apiKey = process.env.EXPO_PUBLIC_REVENUECAT_API_KEY;

  if (!apiKey) {
    console.warn(
      '[RevenueCat] EXPO_PUBLIC_REVENUECAT_API_KEY is not set.\n' +
        'Create frontend/.env and add:\n' +
        '  EXPO_PUBLIC_REVENUECAT_API_KEY=your_key_here',
    );
    return;
  }

  if (__DEV__) {
    // Show verbose RevenueCat logs in development only
    Purchases.setLogLevel(LOG_LEVEL.DEBUG);
  }

  Purchases.configure({
    apiKey,
    appUserID: userId ?? null, // null → RevenueCat generates an anonymous ID
  });
}

/** Fetch the latest subscription / purchase state from RevenueCat. */
export async function getCustomerInfo(): Promise<CustomerInfo> {
  return Purchases.getCustomerInfo();
}

/**
 * Returns true if the "pro" entitlement (or your custom one) is active.
 * Always pass a freshly fetched CustomerInfo for accuracy.
 */
export function hasProEntitlement(customerInfo: CustomerInfo): boolean {
  return PRO_ENTITLEMENT_ID in customerInfo.entitlements.active;
}

/**
 * Call after a user logs in so RevenueCat can restore their purchases.
 * Safe to call even if RevenueCat wasn't configured (no-op).
 */
export async function identifyUser(userId: string): Promise<void> {
  try {
    await Purchases.logIn(userId);
  } catch (err) {
    console.warn('[RevenueCat] logIn failed:', err);
  }
}

/**
 * Call on logout so the next session starts with a fresh anonymous ID.
 */
export async function resetRevenueCatUser(): Promise<void> {
  try {
    await Purchases.logOut();
  } catch (err) {
    console.warn('[RevenueCat] logOut failed:', err);
  }
}

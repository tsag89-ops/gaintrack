// src/services/revenueCat.web.ts
// Web stub — react-native-purchases is iOS/Android only.
// Metro automatically resolves this file instead of revenueCat.ts for web builds.

export const PRO_ENTITLEMENT_ID = 'pro';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function initRevenueCat(_userId?: string): void {
  // no-op on web
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getCustomerInfo(): Promise<any> {
  return { entitlements: { active: {} } };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function hasProEntitlement(_customerInfo: any): boolean {
  return false;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function identifyUser(_userId: string): Promise<void> {
  // no-op on web
}

export async function resetRevenueCatUser(): Promise<void> {
  // no-op on web
}

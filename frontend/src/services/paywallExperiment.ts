import AsyncStorage from '@react-native-async-storage/async-storage';

const PAYWALL_EXPERIMENT_KEY = 'gaintrack_paywall_experiment_v1';
const PAYWALL_EXPERIMENT_ID = 'paywall_copy_v1';

export type PaywallVariant = 'value_first' | 'feature_first';

export interface PaywallVariantCopy {
  title: string;
  subtitle: string;
}

export interface PaywallExperimentAssignment {
  experimentId: string;
  variant: PaywallVariant;
  assignedAt: string;
}

function pickVariant(): PaywallVariant {
  return Math.random() < 0.5 ? 'value_first' : 'feature_first';
}

export async function getPaywallExperimentAssignment(): Promise<PaywallExperimentAssignment> {
  try {
    const existingRaw = await AsyncStorage.getItem(PAYWALL_EXPERIMENT_KEY);
    if (existingRaw) {
      const existing = JSON.parse(existingRaw) as PaywallExperimentAssignment;
      if (existing?.experimentId === PAYWALL_EXPERIMENT_ID && (existing.variant === 'value_first' || existing.variant === 'feature_first')) {
        return existing;
      }
    }
  } catch {}

  const created: PaywallExperimentAssignment = {
    experimentId: PAYWALL_EXPERIMENT_ID,
    variant: pickVariant(),
    assignedAt: new Date().toISOString(),
  };

  try {
    await AsyncStorage.setItem(PAYWALL_EXPERIMENT_KEY, JSON.stringify(created));
  } catch {}

  return created;
}

export function getPaywallVariantCopy(
  variant: PaywallVariant,
  localizedCopy?: Partial<Record<PaywallVariant, PaywallVariantCopy>>,
): PaywallVariantCopy {
  const scopedCopy = localizedCopy?.[variant];
  if (scopedCopy) {
    return scopedCopy;
  }

  if (variant === 'value_first') {
    return {
      title: 'Get stronger with clear progression',
      subtitle: 'Unlock advanced charts, full exercise library, and smarter coaching. Pro plans: EUR 5.99 monthly or EUR 39.99 yearly with a 7-day annual trial.',
    };
  }

  return {
    title: 'Unlock all Pro features',
    subtitle: 'Full 1000+ exercise library, advanced analytics, AI coaching, and premium tracking. Best value: EUR 39.99/year (7-day trial) or EUR 5.99/month.',
  };
}

export function buildPaywallExperimentContext(baseContext: string, assignment: PaywallExperimentAssignment): string {
  return `${baseContext}|exp:${assignment.experimentId}|variant:${assignment.variant}`;
}

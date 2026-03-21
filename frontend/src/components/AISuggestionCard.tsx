// src/components/AISuggestionCard.tsx

import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLanguage } from '../context/LanguageContext';

// Category → icon mapping
const CATEGORY_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  exercise:  'barbell-outline',
  superset:  'swap-horizontal-outline',
  nutrition: 'nutrition-outline',
  program:   'calendar-outline',
};

const CATEGORY_COLORS: Record<string, string> = {
  exercise:  '#FF6200',
  superset:  '#10B981',
  nutrition: '#3B82F6',
  program:   '#8B5CF6',
};

export interface AISuggestionCardProps {
  id: string;
  category: string;
  title: string;
  description: string;
  isProLocked?: boolean;
  onPressUpgrade?: () => void;
}

export function AISuggestionCard({
  category,
  title,
  description,
  isProLocked = false,
  onPressUpgrade,
}: AISuggestionCardProps) {
  const { t } = useLanguage();
  const iconName  = CATEGORY_ICONS[category] ?? 'bulb-outline';
  const accentColor = CATEGORY_COLORS[category] ?? '#FF6200';

  return (
    <View style={[styles.card, isProLocked && styles.cardLocked]}>
      {/* Header row */}
      <View style={styles.header}>
        <View style={[styles.iconBadge, { backgroundColor: accentColor + '22' }]}>
          <Ionicons name={iconName} size={18} color={accentColor} />
        </View>

        <Text style={[styles.title, isProLocked && styles.textDim]} numberOfLines={2}>
          {title}
        </Text>

        {isProLocked && (
          <View style={styles.proBadge}>
            <Text style={styles.proBadgeText}>{t('progressTab.proBadge')}</Text>
          </View>
        )}
      </View>

      {/* Description — dimmed when Pro-locked */}
      <Text
        style={[styles.description, isProLocked && styles.textDim]}
        numberOfLines={isProLocked ? 2 : undefined}
      >
        {description}
      </Text>

      {/* Upgrade CTA */}
      {isProLocked && (
        <TouchableOpacity
          style={styles.upgradeBtn}
          onPress={onPressUpgrade}
          activeOpacity={0.8}
        >
          <Ionicons name="lock-open-outline" size={14} color="#1A1A1A" />
          <Text style={styles.upgradeBtnText}>{t('aiSuggestions.unlockWithPro')}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#252525',
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    gap: 10,
  },
  cardLocked: {
    borderWidth: 1,
    borderColor: '#FF620044',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconBadge: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
  },
  proBadge: {
    backgroundColor: '#FF6200',
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  proBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  description: {
    color: '#B0B0B0',
    fontSize: 13,
    lineHeight: 19,
  },
  textDim: {
    opacity: 0.45,
  },
  upgradeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#FF6200',
    borderRadius: 10,
    paddingVertical: 10,
    marginTop: 4,
  },
  upgradeBtnText: {
    color: '#1A1A1A',
    fontSize: 13,
    fontWeight: '700',
  },
});

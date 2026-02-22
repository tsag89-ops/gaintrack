import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { getMacroPercentage } from '../utils/helpers';

interface MacroBarProps {
  label: string;
  current: number;
  goal: number;
  color: string;
  unit?: string;
}

export const MacroBar: React.FC<MacroBarProps> = ({
  label,
  current,
  goal,
  color,
  unit = 'g',
}) => {
  const percentage = getMacroPercentage(current, goal);

  return (
    <View style={styles.container}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.value}>
          {Math.round(current)}{unit} / {goal}{unit}
        </Text>
      </View>
      <View style={styles.barBackground}>
        <View
          style={[
            styles.barFill,
            { width: `${percentage}%`, backgroundColor: color },
          ]}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 12,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  label: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '500',
  },
  value: {
    color: '#9CA3AF',
    fontSize: 14,
  },
  barBackground: {
    height: 8,
    backgroundColor: '#374151',
    borderRadius: 4,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 4,
  },
});

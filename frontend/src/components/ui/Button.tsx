// File: src/components/ui/Button.tsx
// GainTrack — Primary/Secondary button with haptic feedback

import React from 'react';
import {
  TouchableOpacity,
  Text,
  ActivityIndicator,
  StyleSheet,
  ViewStyle,
  TextStyle,
  StyleProp,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { theme } from '../../constants/theme';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
}

export const Button: React.FC<ButtonProps> = ({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  fullWidth = false,
  style,
  textStyle,
}) => {
  const handlePress = async () => {
    if (disabled || loading) return;
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onPress();
  };

  const containerStyle: StyleProp<ViewStyle> = [
    styles.base,
    styles[`size_${size}`],
    styles[`variant_${variant}`],
    fullWidth && styles.fullWidth,
    (disabled || loading) && styles.disabled,
    style,
  ];

  const labelStyle: StyleProp<TextStyle> = [
    styles.label,
    styles[`labelSize_${size}`],
    styles[`labelVariant_${variant}`],
    (disabled || loading) && styles.labelDisabled,
    textStyle,
  ];

  return (
    <TouchableOpacity
      style={containerStyle}
      onPress={handlePress}
      activeOpacity={0.75}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: disabled || loading }}
    >
      {loading ? (
        <ActivityIndicator
          size="small"
          color={variant === 'primary' ? theme.textPrimary : theme.primary}
        />
      ) : (
        <Text style={labelStyle}>{label}</Text>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  base: {
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },

  // Sizes
  size_sm: { paddingVertical: 8, paddingHorizontal: 16, minHeight: 36 },
  size_md: { paddingVertical: 13, paddingHorizontal: 24, minHeight: 48 },
  size_lg: { paddingVertical: 16, paddingHorizontal: 32, minHeight: 56 },

  // Variants — backgrounds
  variant_primary: {
    backgroundColor: theme.primary,
  },
  variant_secondary: {
    backgroundColor: theme.charcoal,
    borderWidth: 1,
    borderColor: '#3D3D3D',
  },
  variant_ghost: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: theme.primary,
  },
  variant_danger: {
    backgroundColor: theme.error,
  },

  fullWidth: { width: '100%' },

  disabled: { opacity: 0.45 },

  // Labels
  label: {
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  labelSize_sm: { fontSize: 13 },
  labelSize_md: { fontSize: 15 },
  labelSize_lg: { fontSize: 17 },

  labelVariant_primary: { color: theme.textPrimary },
  labelVariant_secondary: { color: theme.textPrimary },
  labelVariant_ghost: { color: theme.primary },
  labelVariant_danger: { color: theme.textPrimary },

  labelDisabled: { opacity: 0.7 },
});

export default Button;

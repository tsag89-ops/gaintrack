// File: src/components/ui/Input.tsx
// GainTrack — Dark-mode text input with orange focus border

import React, { useState, forwardRef } from 'react';
import {
  TextInput,
  View,
  Text,
  TextInputProps,
  StyleSheet,
  ViewStyle,
  StyleProp,
  TouchableOpacity,
} from 'react-native';
import { theme } from '../../constants/theme';

interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
  hint?: string;
  /** Icon rendered on the left side */
  leftIcon?: React.ReactNode;
  /** Icon/button rendered on the right side */
  rightIcon?: React.ReactNode;
  onRightIconPress?: () => void;
  containerStyle?: StyleProp<ViewStyle>;
}

export const Input = forwardRef<TextInput, InputProps>(
  (
    {
      label,
      error,
      hint,
      leftIcon,
      rightIcon,
      onRightIconPress,
      containerStyle,
      style,
      onFocus,
      onBlur,
      ...rest
    },
    ref,
  ) => {
    const [focused, setFocused] = useState(false);

    const handleFocus = (e: any) => {
      setFocused(true);
      onFocus?.(e);
    };

    const handleBlur = (e: any) => {
      setFocused(false);
      onBlur?.(e);
    };

    return (
      <View style={[styles.wrapper, containerStyle]}>
        {label ? <Text style={styles.label}>{label}</Text> : null}

        <View
          style={[
            styles.inputRow,
            focused && styles.inputRowFocused,
            !!error && styles.inputRowError,
          ]}
        >
          {leftIcon ? <View style={styles.iconLeft}>{leftIcon}</View> : null}

          <TextInput
            ref={ref}
            style={[
              styles.input,
              leftIcon ? styles.inputWithLeft : undefined,
              rightIcon ? styles.inputWithRight : undefined,
              style,
            ]}
            placeholderTextColor={theme.textSecondary}
            selectionColor={theme.primary}
            cursorColor={theme.primary}
            onFocus={handleFocus}
            onBlur={handleBlur}
            {...rest}
          />

          {rightIcon ? (
            <TouchableOpacity
              style={styles.iconRight}
              onPress={onRightIconPress}
              disabled={!onRightIconPress}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              {rightIcon}
            </TouchableOpacity>
          ) : null}
        </View>

        {error ? (
          <Text style={styles.errorText}>{error}</Text>
        ) : hint ? (
          <Text style={styles.hintText}>{hint}</Text>
        ) : null}
      </View>
    );
  },
);

Input.displayName = 'Input';

const styles = StyleSheet.create({
  wrapper: {
    gap: 6,
  },

  label: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.textSecondary,
    letterSpacing: 0.3,
  },

  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.surface,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#3A3A3A',
    minHeight: 48,
  },

  inputRowFocused: {
    borderColor: theme.primary,
  },

  inputRowError: {
    borderColor: theme.error,
  },

  input: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: theme.textPrimary,
    fontWeight: '400',
  },

  inputWithLeft: {
    paddingLeft: 0,
  },

  inputWithRight: {
    paddingRight: 0,
  },

  iconLeft: {
    paddingLeft: 14,
    paddingRight: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },

  iconRight: {
    paddingRight: 14,
    paddingLeft: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },

  errorText: {
    fontSize: 12,
    color: theme.error,
    fontWeight: '500',
  },

  hintText: {
    fontSize: 12,
    color: theme.textSecondary,
  },
});

export default Input;

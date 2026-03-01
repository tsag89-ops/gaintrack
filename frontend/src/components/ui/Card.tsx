// File: src/components/ui/Card.tsx
// GainTrack — Base surface card, Surface #252525, rounded-xl, subtle shadow

import React from 'react';
import {
  View,
  StyleSheet,
  ViewStyle,
  StyleProp,
  Platform,
} from 'react-native';
import { theme } from '../../constants/theme';

interface CardProps {
  children: React.ReactNode;
  /** Extra styles to merge in */
  style?: StyleProp<ViewStyle>;
  /** Remove the default padding */
  noPadding?: boolean;
  /** Elevate the card with a stronger shadow */
  elevated?: boolean;
}

export const Card: React.FC<CardProps> = ({
  children,
  style,
  noPadding = false,
  elevated = false,
}) => {
  return (
    <View
      style={[
        styles.card,
        !noPadding && styles.padding,
        elevated && styles.elevated,
        style,
      ]}
    >
      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.surface,
    borderRadius: 12,                    // rounded-xl
    borderWidth: 1,
    borderColor: '#303030',

    // Android elevation
    elevation: 4,

    // iOS shadow
    ...Platform.select({
      ios: {
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.35,
        shadowRadius: 6,
      },
    }),
  },

  padding: {
    padding: 16,
  },

  elevated: {
    elevation: 10,
    ...Platform.select({
      ios: {
        shadowOpacity: 0.55,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 5 },
      },
    }),
  },
});

export default Card;

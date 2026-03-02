/**
 * AuthSplash.tsx
 *
 * Animated splash screen shown while the native auth bridge is resolving.
 * Replaces the bare ActivityIndicator in the root layout.
 *
 * Animations (react-native-reanimated):
 *  1. Logo fades + scales in on mount.
 *  2. App-name "GAINTRACK" fades in 200 ms after the logo settles.
 *  3. Tagline fades in 150 ms after the name.
 *  4. Progress bar fills from 0 → 85 % during the loading window, then
 *     snaps to 100 % and holds so it never looks stuck.
 *
 * Usage:
 *   {status === 'loading' && <AuthSplash />}
 */

import React, { useEffect } from 'react';
import { Dimensions, Image, Platform, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { colors, typography } from '../constants/theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const BAR_WIDTH = SCREEN_WIDTH * 0.55;

// Durations (ms)
const LOGO_DURATION  = 600;
const NAME_DELAY     = 400;
const NAME_DURATION  = 400;
const TAG_DELAY      = 650;
const TAG_DURATION   = 350;
const BAR_FILL_MS    = 2200; // time to reach 85 %
const BAR_PULSE_MS   = 900;  // subtle shimmer repeat

export default function AuthSplash() {
  // ── Logo ──────────────────────────────────────────────────────────────────
  const logoOpacity = useSharedValue(0);
  const logoScale   = useSharedValue(0.72);

  // ── App name ──────────────────────────────────────────────────────────────
  const nameOpacity = useSharedValue(0);
  const nameY       = useSharedValue(10);

  // ── Tagline ───────────────────────────────────────────────────────────────
  const tagOpacity  = useSharedValue(0);

  // ── Progress bar ──────────────────────────────────────────────────────────
  const barProgress = useSharedValue(0);
  const shimmer     = useSharedValue(0);

  useEffect(() => {
    // Logo entry
    logoOpacity.value = withTiming(1, { duration: LOGO_DURATION, easing: Easing.out(Easing.cubic) });
    // Easing.back() and Easing.ease (bezier preset) are not valid inside Easing.out() on the web worklet — use Easing.quad instead.
    logoScale.value   = withTiming(1, { duration: LOGO_DURATION, easing: Easing.out(Platform.OS === 'web' ? Easing.quad : Easing.back(1.3)) });

    // Name entry (delayed)
    nameOpacity.value = withDelay(NAME_DELAY, withTiming(1, { duration: NAME_DURATION }));
    nameY.value       = withDelay(NAME_DELAY, withTiming(0, { duration: NAME_DURATION, easing: Easing.out(Easing.quad) }));

    // Tagline entry
    tagOpacity.value  = withDelay(TAG_DELAY, withTiming(1, { duration: TAG_DURATION }));

    // Progress bar — fill to 85 %, then pulse subtly (never goes to 100 while loading)
    barProgress.value = withTiming(0.85, { duration: BAR_FILL_MS, easing: Easing.out(Easing.quad) });

    // Shimmer overlay repeating
    shimmer.value = withRepeat(
      withSequence(
        withTiming(1, { duration: BAR_PULSE_MS, easing: Easing.inOut(Easing.sin) }),
        withTiming(0, { duration: BAR_PULSE_MS, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      false,
    );
  }, []);

  // ── Animated styles ───────────────────────────────────────────────────────
  const logoStyle = useAnimatedStyle(() => ({
    opacity:   logoOpacity.value,
    transform: [{ scale: logoScale.value }],
  }));

  const nameStyle = useAnimatedStyle(() => ({
    opacity:   nameOpacity.value,
    transform: [{ translateY: nameY.value }],
  }));

  const tagStyle = useAnimatedStyle(() => ({
    opacity: tagOpacity.value,
  }));

  const barFillStyle = useAnimatedStyle(() => ({
    width: barProgress.value * BAR_WIDTH,
  }));

  const shimmerStyle = useAnimatedStyle(() => ({
    opacity: shimmer.value * 0.35,
  }));

  return (
    <View style={styles.container}>
      {/* Logo */}
      <Animated.View style={[styles.logoWrapper, logoStyle]}>
        <Image
          source={require('../../assets/images/splash-image.png')}
          style={styles.logo}
          resizeMode="contain"
        />
      </Animated.View>

      {/* App name */}
      <Animated.Text style={[styles.appName, nameStyle]}>
        GAINTRACK
      </Animated.Text>

      {/* Tagline */}
      <Animated.Text style={[styles.tagline, tagStyle]}>
        Track every rep. Own every PR.
      </Animated.Text>

      {/* Progress bar */}
      <View style={styles.barTrack}>
        <Animated.View style={[styles.barFill, barFillStyle]}>
          {/* Shimmer highlight */}
          <Animated.View style={[styles.barShimmer, shimmerStyle]} />
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 0,
  },
  logoWrapper: {
    marginBottom: 28,
  },
  logo: {
    width:  120,
    height: 120,
  },
  appName: {
    fontFamily:   typography.fontFamily,
    fontSize:     typography.fontSize['3xl'],
    fontWeight:   typography.fontWeight.extrabold,
    color:        colors.primary,
    letterSpacing: 4,
    marginBottom: 8,
  },
  tagline: {
    fontFamily: typography.fontFamily,
    fontSize:   typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    color:      colors.textSecondary,
    letterSpacing: typography.letterSpacing.wide,
    marginBottom: 48,
  },
  barTrack: {
    width:           BAR_WIDTH,
    height:          3,
    borderRadius:    9999,
    backgroundColor: colors.charcoal,
    overflow:        'hidden',
  },
  barFill: {
    height:          3,
    borderRadius:    9999,
    backgroundColor: colors.primary,
    overflow:        'hidden',
  },
  barShimmer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#FFFFFF',
    borderRadius:    9999,
  },
});

// frontend/src/hooks/useTimerAlerts.ts
// Fires haptic feedback at 3–2–1 seconds remaining and plays the rest-bell
// sound at 0. Loads the bell once on mount and unloads on unmount.
//
// iOS silent-mode: playsInSilentModeIOS ensures the bell is audible even
// when the hardware mute switch is engaged.

import { useEffect, useRef } from 'react';
import { Audio } from 'expo-av';
import * as Haptics from 'expo-haptics';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const BELL_ASSET = require('../../assets/sounds/rest-bell.wav');

export function useTimerAlerts(remainingSeconds: number, active: boolean): void {
  const soundRef = useRef<Audio.Sound | null>(null);
  // Tracks which second we last alerted on to prevent duplicate fires.
  const lastAlertedRef = useRef<number>(-1);

  // Load the bell sound once; configure iOS audio session to bypass silent mode.
  useEffect(() => {
    let mounted = true;

    Audio.setAudioModeAsync({ playsInSilentModeIOS: true }).catch(() => null);

    Audio.Sound.createAsync(BELL_ASSET, { shouldPlay: false })
      .then(({ sound }) => {
        if (mounted) soundRef.current = sound;
      })
      .catch(() => null);

    return () => {
      mounted = false;
      soundRef.current?.unloadAsync().catch(() => null);
      soundRef.current = null;
    };
  }, []);

  // Fire haptics / bell whenever remainingSeconds changes during an active countdown.
  useEffect(() => {
    if (!active) {
      // Reset guard so the next timer run starts fresh.
      lastAlertedRef.current = -1;
      return;
    }
    // Skip if this second has already been processed (guards against extra re-renders).
    if (remainingSeconds === lastAlertedRef.current) return;
    lastAlertedRef.current = remainingSeconds;

    if (remainingSeconds > 0 && remainingSeconds <= 3) {
      // Countdown vibration at 3, 2, 1.
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => null);
    } else if (remainingSeconds === 0) {
      // Timer complete — bell + success haptic.
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => null);
      soundRef.current?.replayAsync().catch(() => null);
    }
  }, [remainingSeconds, active]);
}

## GainTrack Context Override
- Stack: Expo managed workflow, React Native, TypeScript
- No eject, no paid services, free tiers only
- Local path: C:\gaintrack\gaintrack\frontend\
- Navigation: Expo Router file-based (app/ folder)
- State: AsyncStorage local + Firestore free tier
- Monetization: RevenueCat, isPro flag gates Pro features
- Never commit secrets (.env, google-services.json)

---
# GainTrack Charts Agent

## Role
You are a React Native data visualization engineer.  
You build all progress charts for GainTrack using `react-native-chart-kit`.  
All charts are Pro-only features. You never render chart data for free users β€” you render the `<ProGate>` component instead.  
You always calculate 1RM using the Brzycki formula. You always format dates with `date-fns`.

---

## Library: react-native-chart-kit

Install command:
```powershell
cd C:\gaintrack\gaintrack\frontend
npx expo install react-native-chart-kit react-native-svg
```

Chart-kit requires `react-native-svg` as a peer dependency.

---

## 1RM Formula β€” Brzycki (Use This Everywhere)

```ts
// src/utils/calculations.ts

/**
 * Brzycki 1RM formula.
 * @param weight - Weight lifted in kg
 * @param reps   - Number of reps performed (must be < 37)
 * @returns      - Estimated one-rep max in kg (rounded to 1 decimal)
 */
export function calculate1RM(weight: number, reps: number): number {
  if (reps <= 0 || reps >= 37 || weight <= 0) return weight;
  if (reps === 1) return weight;
  return Math.round((weight * (36 / (37 - reps))) * 10) / 10;
}

/**
 * Extracts the best (highest) 1RM from an array of sets for a given exercise.
 */
export function getBest1RM(sets: Array<{ weight: number; reps: number; completed: boolean }>): number {
  return sets
    .filter((s) => s.completed && s.reps > 0 && s.weight > 0)
    .reduce((best, s) => {
      const est = calculate1RM(s.weight, s.reps);
      return est > best ? est : best;
    }, 0);
}
```

---

## Chart Types

### 1. LineChart β€” 1RM Over Time
- **File:** `src/components/charts/OneRMChart.tsx`
- **Data:** Best estimated 1RM per workout session for a given exercise
- **X-axis:** Date labels (last 8 sessions), formatted `MMM d` (e.g., "Jan 15")
- **Y-axis:** Estimated 1RM in kg (or lbs if user preference is lbs)
- **Highlight:** Mark personal record point with a gold dot overlay

```tsx
// frontend/src/components/charts/OneRMChart.tsx
import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import { LineChart } from 'react-native-chart-kit';
import { format } from 'date-fns';
import { Colors, Font, Spacing, Radius } from '@/constants/theme';
import { Workout } from '@/src/types';
import { calculate1RM, getBest1RM } from '@/src/utils/calculations';
import { usePro } from '@/src/hooks/usePro';
import { ProGate } from '@/src/components/ProGate';

interface OneRMChartProps {
  exerciseName: string;
  workouts: Workout[];
}

const SCREEN_WIDTH = Dimensions.get('window').width;

export function OneRMChart({ exerciseName, workouts }: OneRMChartProps) {
  const { isPro } = usePro();

  {/* [PRO] β€” entire chart is Pro-only */}
  if (!isPro) {
    return <ProGate featureName="1RM Progress Chart" />;
  }

  const chartData = useMemo(() => {
    const relevant = workouts
      .flatMap((w) =>
        w.exercises
          .filter((ex) => ex.name.toLowerCase() === exerciseName.toLowerCase())
          .map((ex) => ({
            date:  w.date,
            oneRM: getBest1RM(ex.sets),
          }))
      )
      .filter((d) => d.oneRM > 0)
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-8); // last 8 sessions

    return {
      labels: relevant.map((d) => format(new Date(d.date + 'T12:00:00'), 'MMM d')),
      datasets: [{ data: relevant.map((d) => d.oneRM) }],
    };
  }, [workouts, exerciseName]);

  if (chartData.labels.length < 2) {
    return (
      <View style={styles.emptState}>
        <Text style={styles.emptyText}>Log at least 2 sessions to see progress</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Estimated 1RM β€” {exerciseName}</Text>
      <LineChart
        data={chartData}
        width={SCREEN_WIDTH - Spacing.md * 2}
        height={200}
        yAxisSuffix=" kg"
        chartConfig={{
          backgroundColor:         Colors.surface,
          backgroundGradientFrom:  Colors.surface,
          backgroundGradientTo:    Colors.charcoal,
          decimalPlaces:           1,
          color:                   (opacity = 1) => `rgba(255, 98, 0, ${opacity})`,
          labelColor:              (opacity = 1) => `rgba(176, 176, 176, ${opacity})`,
          style:                   { borderRadius: Radius.md },
          propsForDots: {
            r:           '5',
            strokeWidth: '2',
            stroke:      Colors.primary,
          },
        }}
        bezier
        style={styles.chart}
        withInnerLines={false}
        withOuterLines={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.surface,
    borderRadius:    Radius.lg,
    padding:         Spacing.md,
    marginBottom:    Spacing.md,
  },
  title: {
    color:         Colors.textPrimary,
    fontSize:      Font.lg,
    fontWeight:    '700',
    marginBottom:  Spacing.sm,
  },
  chart: {
    borderRadius: Radius.md,
  },
  emptState: {
    backgroundColor: Colors.surface,
    borderRadius:    Radius.lg,
    padding:         Spacing.lg,
    alignItems:      'center',
  },
  emptyText: {
    color:    Colors.textSecondary,
    fontSize: Font.md,
  },
});
```

---

### 2. BarChart β€” Weekly Volume

- **File:** `src/components/charts/VolumeChart.tsx`
- **Data:** Total volume per week (sum of weight Γ— reps for all completed sets)
- **X-axis:** Last 6 weeks, formatted `Wk 1`, `Wk 2`, etc.
- **Y-axis:** Total volume in kg
- **Pro gate:** Required

```tsx
// frontend/src/components/charts/VolumeChart.tsx
import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import { BarChart } from 'react-native-chart-kit';
import { format, startOfWeek, addWeeks } from 'date-fns';
import { Colors, Font, Spacing, Radius } from '@/constants/theme';
import { Workout } from '@/src/types';
import { usePro } from '@/src/hooks/usePro';
import { ProGate } from '@/src/components/ProGate';

interface VolumeChartProps {
  workouts: Workout[];
}

const SCREEN_WIDTH = Dimensions.get('window').width;

export function VolumeChart({ workouts }: VolumeChartProps) {
  const { isPro } = usePro();

  {/* [PRO] */}
  if (!isPro) {
    return <ProGate featureName="Weekly Volume Chart" />;
  }

  const chartData = useMemo(() => {
    const now = new Date();
    const weeks = Array.from({ length: 6 }, (_, i) => {
      const start = startOfWeek(addWeeks(now, -(5 - i)), { weekStartsOn: 1 });
      return start;
    });

    const volumes = weeks.map((weekStart) => {
      const weekEnd = addWeeks(weekStart, 1);
      return workouts
        .filter((w) => {
          const d = new Date(w.date + 'T12:00:00');
          return d >= weekStart && d < weekEnd;
        })
        .reduce((total, w) =>
          total + w.exercises.reduce((exTotal, ex) =>
            exTotal + ex.sets
              .filter((s) => s.completed)
              .reduce((setTotal, s) => setTotal + s.weight * s.reps, 0),
            0),
          0);
    });

    return {
      labels: weeks.map((_, i) => `Wk ${i + 1}`),
      datasets: [{ data: volumes }],
    };
  }, [workouts]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Weekly Volume (kg)</Text>
      <BarChart
        data={chartData}
        width={SCREEN_WIDTH - Spacing.md * 2}
        height={200}
        yAxisLabel=""
        yAxisSuffix=""
        chartConfig={{
          backgroundColor:        Colors.surface,
          backgroundGradientFrom: Colors.surface,
          backgroundGradientTo:   Colors.charcoal,
          decimalPlaces:          0,
          color:                  (opacity = 1) => `rgba(255, 98, 0, ${opacity})`,
          labelColor:             (opacity = 1) => `rgba(176, 176, 176, ${opacity})`,
          style:                  { borderRadius: Radius.md },
          barPercentage:          0.6,
        }}
        style={styles.chart}
        withInnerLines={false}
        showValuesOnTopOfBars
        fromZero
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.surface,
    borderRadius:    Radius.lg,
    padding:         Spacing.md,
    marginBottom:    Spacing.md,
  },
  title: {
    color:        Colors.textPrimary,
    fontSize:     Font.lg,
    fontWeight:   '700',
    marginBottom: Spacing.sm,
  },
  chart: {
    borderRadius: Radius.md,
  },
});
```

---

### 3. PR Highlights Card

- **File:** `src/components/charts/PRCard.tsx`
- **Data:** Personal records per exercise (highest 1RM ever recorded)
- **Display:** List of top 5 exercises with PR weight and date
- **Pro gate:** Required

```tsx
// frontend/src/components/charts/PRCard.tsx
import React, { useMemo } from 'react';
import { View, Text, StyleSheet, FlatList } from 'react-native';
import { format } from 'date-fns';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Font, Spacing, Radius } from '@/constants/theme';
import { Workout } from '@/src/types';
import { calculate1RM } from '@/src/utils/calculations';
import { usePro } from '@/src/hooks/usePro';
import { ProGate } from '@/src/components/ProGate';

interface PRCardProps {
  workouts: Workout[];
}

interface PRRecord {
  exerciseName: string;
  oneRM:        number;
  date:         string;
}

export function PRCard({ workouts }: PRCardProps) {
  const { isPro } = usePro();

  {/* [PRO] */}
  if (!isPro) {
    return <ProGate featureName="Personal Records" />;
  }

  const prs = useMemo((): PRRecord[] => {
    const map = new Map<string, PRRecord>();

    workouts.forEach((w) => {
      w.exercises.forEach((ex) => {
        ex.sets
          .filter((s) => s.completed && s.reps > 0 && s.weight > 0)
          .forEach((s) => {
            const est = calculate1RM(s.weight, s.reps);
            const existing = map.get(ex.name);
            if (!existing || est > existing.oneRM) {
              map.set(ex.name, { exerciseName: ex.name, oneRM: est, date: w.date });
            }
          });
      });
    });

    return Array.from(map.values())
      .sort((a, b) => b.oneRM - a.oneRM)
      .slice(0, 5);
  }, [workouts]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Personal Records</Text>
      {prs.length === 0 ? (
        <Text style={styles.empty}>Log workouts to track PRs</Text>
      ) : (
        <FlatList
          data={prs}
          keyExtractor={(item) => item.exerciseName}
          scrollEnabled={false}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <Ionicons name="trophy" size={16} color={Colors.accent} style={styles.icon} />
              <View style={styles.rowText}>
                <Text style={styles.exName}>{item.exerciseName}</Text>
                <Text style={styles.date}>
                  {format(new Date(item.date + 'T12:00:00'), 'MMM d, yyyy')}
                </Text>
              </View>
              <Text style={styles.weight}>{item.oneRM} kg</Text>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.surface,
    borderRadius:    Radius.lg,
    padding:         Spacing.md,
    marginBottom:    Spacing.md,
  },
  title: {
    color:        Colors.textPrimary,
    fontSize:     Font.lg,
    fontWeight:   '700',
    marginBottom: Spacing.sm,
  },
  empty: {
    color:    Colors.textSecondary,
    fontSize: Font.md,
  },
  row: {
    flexDirection:  'row',
    alignItems:     'center',
    paddingVertical: Spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: Colors.charcoal,
  },
  icon: {
    marginRight: Spacing.sm,
  },
  rowText: {
    flex: 1,
  },
  exName: {
    color:      Colors.textPrimary,
    fontSize:   Font.md,
    fontWeight: '600',
  },
  date: {
    color:    Colors.textSecondary,
    fontSize: Font.sm,
  },
  weight: {
    color:      Colors.primary,
    fontSize:   Font.lg,
    fontWeight: '700',
  },
});
```

---

## Rules for This Agent

1. **All charts are Pro-only** β€” always check `isPro` before rendering any chart component.
2. **Brzycki formula only** β€” never use Epley or other 1RM formulas.
3. **`date-fns` for all dates** β€” format display dates with `format(new Date(date + 'T12:00:00'), 'MMM d')`. The `T12:00:00` suffix prevents off-by-one timezone errors.
4. **`react-native-chart-kit` only** β€” never use Victory Native, Recharts, or D3.
5. **Colors from theme** β€” chart colors always use `Colors.primary` (`#FF6200`) and `Colors.surface` (`#252525`).
6. **`withInnerLines={false}`** β€” always set this on all charts for a clean dark-mode look.

---

## Required Output Format

### 1. File Structure
List all new/changed files.

### 2. Full Component Code
Complete `.tsx` files. No placeholders.

### 3. Install Commands
```powershell
cd C:\gaintrack\gaintrack\frontend
npx expo install react-native-chart-kit react-native-svg
```

### 4. Test Steps
```
1. Make sure you have at least 3 workout sessions logged with the same exercise
2. Navigate to Progress tab
3. Select the exercise from the dropdown
4. 1RM chart should show a line with data points, each labeled with date
5. Tap a dot to see the exact value
```


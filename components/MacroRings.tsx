import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import Animated, {
  useSharedValue,
  useAnimatedProps,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { useEffect } from 'react';
import { colors, spacing } from '../lib/theme';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const R = 110;
const CIRC = 2 * Math.PI * R;
const SIZE = (R + 16) * 2; // viewBox with stroke

type MacroRingsProps = {
  totalEaten: number;
  burnedToday: number;
  calorieGoal: number;
};

export default function MacroRings({ totalEaten, burnedToday, calorieGoal }: MacroRingsProps) {
  const netCals = totalEaten - burnedToday;
  const remaining = Math.max(calorieGoal - netCals, 0);
  const usedPct = Math.min(Math.max(netCals / (calorieGoal || 2000), 0), 1);

  // stroke color thresholds
  let strokeColor = colors.primary;
  if (netCals > calorieGoal + 50) strokeColor = '#ef4444';
  else if (netCals > calorieGoal * 0.9) strokeColor = '#f59e0b';

  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withTiming(usedPct, {
      duration: 900,
      easing: Easing.out(Easing.cubic),
    });
  }, [usedPct]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: CIRC * (1 - progress.value),
  }));

  return (
    <View style={styles.container}>
      <Svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
        {/* Background track */}
        <Circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={R}
          stroke={colors.border}
          strokeWidth={16}
          fill="none"
          strokeLinecap="round"
        />
        {/* Progress arc */}
        <AnimatedCircle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={R}
          stroke={strokeColor}
          strokeWidth={16}
          fill="none"
          strokeDasharray={`${CIRC} ${CIRC}`}
          animatedProps={animatedProps}
          strokeLinecap="round"
          rotation="-90"
          origin={`${SIZE / 2}, ${SIZE / 2}`}
        />
      </Svg>

      {/* Center label */}
      <View style={styles.centerLabel} pointerEvents="none">
        <Text style={styles.centerTop}>REMAINING</Text>
        <Text style={[styles.centerCals, { color: strokeColor }]}>
          {remaining.toLocaleString()}
        </Text>
        <Text style={styles.centerBottom}>KCAL ⚡</Text>
      </View>

      {/* Below ring stats */}
      <View style={styles.stats}>
        <View style={styles.statItem}>
          <Text style={styles.statLabel}>EATEN</Text>
          <Text style={styles.statValue}>{totalEaten.toLocaleString()}</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statLabel}>BURNED</Text>
          <Text style={styles.statValue}>{burnedToday.toLocaleString()}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
  },
  centerLabel: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerTop: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 10,
    color: colors.textMuted,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  centerCals: {
    fontFamily: 'Inter_700Bold',
    fontSize: 38,
    lineHeight: 42,
  },
  centerBottom: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11,
    color: colors.textMuted,
    letterSpacing: 1.2,
    marginTop: 2,
  },
  stats: {
    flexDirection: 'row',
    marginTop: spacing.sm,
    gap: spacing.xl,
  },
  statItem: {
    alignItems: 'center',
  },
  statLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 10,
    color: colors.textMuted,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  statValue: {
    fontFamily: 'Inter_700Bold',
    fontSize: 18,
    color: colors.text,
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    backgroundColor: colors.border,
  },
});

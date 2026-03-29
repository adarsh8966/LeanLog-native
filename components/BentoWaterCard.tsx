import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { colors, spacing, borderRadius } from '../lib/theme';

type BentoWaterCardProps = {
  waterOz: number;
  waterGoalOz: number;
};

export default function BentoWaterCard({ waterOz, waterGoalOz }: BentoWaterCardProps) {
  const pct = waterGoalOz > 0 ? Math.round((waterOz / waterGoalOz) * 100) : 0;

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={() => router.push('/water' as any)}
      activeOpacity={0.75}
    >
      <Text style={styles.icon}>💧</Text>
      <Text style={styles.title}>Water</Text>
      <Text style={styles.value}>{waterOz} oz</Text>
      <Text style={styles.sub}>{pct}% of goal</Text>

      {/* Progress bar */}
      <View style={styles.bar}>
        <View style={[styles.barFill, { width: `${Math.min(pct, 100)}%` }]} />
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 110,
    justifyContent: 'space-between',
  },
  icon: {
    fontSize: 20,
    marginBottom: spacing.xs,
  },
  title: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  value: {
    fontFamily: 'Inter_700Bold',
    fontSize: 20,
    color: '#38bdf8',
    marginTop: 2,
  },
  sub: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 2,
  },
  bar: {
    height: 4,
    backgroundColor: colors.border,
    borderRadius: 2,
    marginTop: spacing.sm,
    overflow: 'hidden',
  },
  barFill: {
    height: 4,
    backgroundColor: '#38bdf8',
    borderRadius: 2,
  },
});

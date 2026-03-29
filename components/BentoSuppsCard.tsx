import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { colors, spacing, borderRadius } from '../lib/theme';

type BentoSuppsCardProps = {
  taken: number;
  total: number;
  nextSupplementName?: string;
};

export default function BentoSuppsCard({ taken, total, nextSupplementName }: BentoSuppsCardProps) {
  const allDone = total > 0 && taken >= total;
  const pct = total > 0 ? Math.round((taken / total) * 100) : 0;

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={() => router.push('/supplements' as any)}
      activeOpacity={0.75}
    >
      <Text style={styles.icon}>💊</Text>
      <Text style={styles.title}>Supplements</Text>
      <Text style={styles.value}>
        {taken}/{total}
      </Text>
      <Text style={styles.sub}>
        {allDone ? 'All done ✓' : nextSupplementName ? `Next: ${nextSupplementName}` : 'Nothing logged'}
      </Text>

      {/* Progress bar */}
      <View style={styles.bar}>
        <View
          style={[
            styles.barFill,
            { width: `${Math.min(pct, 100)}%`, backgroundColor: allDone ? colors.primary : '#a78bfa' },
          ]}
        />
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
    color: '#a78bfa',
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
    borderRadius: 2,
  },
});

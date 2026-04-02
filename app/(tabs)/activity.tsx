import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { colors, spacing, borderRadius } from '../../lib/theme';

// ── Types ──────────────────────────────────────────────────────────────────────

type ActivityLevel =
  | 'sedentary'
  | 'lightly_active'
  | 'moderately_active'
  | 'very_active'
  | 'extra_active';

type DailyLog = {
  id: string;
  user_id: string;
  date: string;
  activity_level: ActivityLevel | null;
  workout_completed: boolean;
};

// ── Constants ──────────────────────────────────────────────────────────────────

const ACTIVITY_LEVELS: { value: ActivityLevel; label: string; description: string }[] = [
  {
    value: 'sedentary',
    label: 'Sedentary',
    description: 'Little or no exercise, desk job',
  },
  {
    value: 'lightly_active',
    label: 'Lightly Active',
    description: 'Light exercise 1–3 days/week',
  },
  {
    value: 'moderately_active',
    label: 'Moderately Active',
    description: 'Moderate exercise 3–5 days/week',
  },
  {
    value: 'very_active',
    label: 'Very Active',
    description: 'Hard exercise 6–7 days/week',
  },
  {
    value: 'extra_active',
    label: 'Extra Active',
    description: 'Very hard exercise or physical job',
  },
];

function todayLocal() {
  return new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD in local time
}

function activityLabel(value: ActivityLevel | null) {
  return ACTIVITY_LEVELS.find(a => a.value === value)?.label ?? '—';
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function Activity() {
  const qc = useQueryClient();
  const today = todayLocal();

  // ── Fetch today's record ───────────────────────────────────────────────────
  const { data: todayLog, isLoading } = useQuery<DailyLog | null>({
    queryKey: ['daily_log', today],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      const { data, error } = await supabase
        .from('daily_logs')
        .select('id, user_id, date, activity_level, workout_completed')
        .eq('user_id', user.id)
        .eq('date', today)
        .maybeSingle();
      if (error) throw error;
      return data as DailyLog | null;
    },
  });

  // ── Upsert mutation ────────────────────────────────────────────────────────
  const upsertMutation = useMutation({
    mutationFn: async (updates: Partial<Pick<DailyLog, 'activity_level' | 'workout_completed'>>) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      const { error } = await supabase
        .from('daily_logs')
        .upsert(
          {
            user_id: user.id,
            date: today,
            activity_level: updates.activity_level ?? todayLog?.activity_level ?? null,
            workout_completed: updates.workout_completed ?? todayLog?.workout_completed ?? false,
          },
          { onConflict: 'user_id,date' }
        );
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['daily_log', today] }),
    onError: (err: Error) => Alert.alert('Error', err.message),
  });

  // ── Render ─────────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  const workout = todayLog?.workout_completed ?? false;
  const activeLevel = todayLog?.activity_level ?? null;
  const isSaving = upsertMutation.isPending;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.heading}>Activity</Text>

      {/* ── Workout toggle ── */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Did you work out today?</Text>
        <View style={styles.toggleRow}>
          <TouchableOpacity
            style={[styles.toggleBtn, workout && styles.toggleBtnActive]}
            onPress={() => !isSaving && upsertMutation.mutate({ workout_completed: true })}
            disabled={isSaving}
          >
            <Text style={[styles.toggleBtnText, workout && styles.toggleBtnTextActive]}>
              Yes
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.toggleBtn, !workout && styles.toggleBtnActive]}
            onPress={() => !isSaving && upsertMutation.mutate({ workout_completed: false })}
            disabled={isSaving}
          >
            <Text style={[styles.toggleBtnText, !workout && styles.toggleBtnTextActive]}>
              No
            </Text>
          </TouchableOpacity>
          {isSaving && (
            <ActivityIndicator
              color={colors.primary}
              size="small"
              style={styles.savingIndicator}
            />
          )}
        </View>
      </View>

      {/* ── Activity level selector ── */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Activity Level</Text>
        {ACTIVITY_LEVELS.map((level, index) => {
          const isSelected = activeLevel === level.value;
          return (
            <TouchableOpacity
              key={level.value}
              style={[
                styles.levelCard,
                isSelected && styles.levelCardSelected,
                index < ACTIVITY_LEVELS.length - 1 && styles.levelCardGap,
              ]}
              onPress={() => !isSaving && upsertMutation.mutate({ activity_level: level.value })}
              disabled={isSaving}
              activeOpacity={0.7}
            >
              <View style={styles.levelCardInner}>
                <View style={styles.levelTextGroup}>
                  <Text style={[styles.levelLabel, isSelected && styles.levelLabelSelected]}>
                    {level.label}
                  </Text>
                  <Text style={styles.levelDescription}>{level.description}</Text>
                </View>
                {isSelected && <View style={styles.selectedDot} />}
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* ── Today's summary ── */}
      {todayLog && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Today's Summary</Text>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Activity Level</Text>
            <Text style={styles.summaryValue}>{activityLabel(todayLog.activity_level)}</Text>
          </View>
          <View style={[styles.summaryRow, styles.summaryRowLast]}>
            <Text style={styles.summaryLabel}>Workout</Text>
            <View style={[styles.badge, todayLog.workout_completed ? styles.badgeGreen : styles.badgeGray]}>
              <Text style={[styles.badgeText, todayLog.workout_completed ? styles.badgeTextGreen : styles.badgeTextGray]}>
                {todayLog.workout_completed ? 'Completed' : 'Rest day'}
              </Text>
            </View>
          </View>
        </View>
      )}
    </ScrollView>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.md,
    paddingBottom: spacing.xl,
  },
  centered: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heading: {
    fontFamily: 'Inter_700Bold',
    fontSize: 28,
    color: colors.text,
    marginBottom: spacing.lg,
    marginTop: spacing.sm,
  },

  // Card
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: spacing.md,
  },

  // Workout toggle
  toggleRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'center',
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: spacing.sm + 4,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  toggleBtnActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  toggleBtnText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
    color: colors.textMuted,
  },
  toggleBtnTextActive: {
    color: '#000',
  },
  savingIndicator: {
    marginLeft: spacing.xs,
  },

  // Activity level cards
  levelCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    backgroundColor: colors.background,
  },
  levelCardSelected: {
    borderColor: colors.primary,
    backgroundColor: `${colors.primary}12`, // ~7% opacity tint
  },
  levelCardGap: {
    marginBottom: spacing.sm,
  },
  levelCardInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  levelTextGroup: {
    flex: 1,
  },
  levelLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
    color: colors.text,
    marginBottom: 2,
  },
  levelLabelSelected: {
    color: colors.primary,
  },
  levelDescription: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: colors.textMuted,
  },
  selectedDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary,
    marginLeft: spacing.sm,
  },

  // Summary
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  summaryRowLast: {
    borderBottomWidth: 0,
  },
  summaryLabel: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: colors.textMuted,
  },
  summaryValue: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    color: colors.text,
  },
  badge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
  },
  badgeGreen: {
    backgroundColor: `${colors.primary}20`,
  },
  badgeGray: {
    backgroundColor: colors.border,
  },
  badgeText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
  },
  badgeTextGreen: {
    color: colors.primary,
  },
  badgeTextGray: {
    color: colors.textMuted,
  },
});

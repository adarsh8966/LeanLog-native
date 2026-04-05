import { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { colors, spacing, borderRadius } from '../lib/theme';

// ── Types ──────────────────────────────────────────────────────────────────────

type StreakProfile = {
  current_streak: number | null;
  longest_streak: number | null;
  total_xp: number | null;
};

type XpEvent = {
  event_type: string;
  xp_amount: number;
  description: string;
  created_at?: string;
};

type DailyLogRow = {
  log_date: string;
  xp_events: XpEvent[] | null;
};

type FlatXpEvent = XpEvent & { log_date: string };

// ── Constants ──────────────────────────────────────────────────────────────────

const CELL_SIZE = 28;
const CELL_GAP = 4;
const GRID_COLS = 6;
const GRID_ROWS = 5; // 6 × 5 = 30

// ── Helpers ────────────────────────────────────────────────────────────────────

function getLocalDateString(): string {
  return new Date().toLocaleDateString('en-CA');
}

/** Returns YYYY-MM-DD string n days before dateStr */
function subDaysStr(dateStr: string, n: number): string {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() - n);
  return d.toLocaleDateString('en-CA');
}

/** Generate array of last N calendar days (oldest first, today last) */
function lastNDays(n: number): string[] {
  const today = getLocalDateString();
  return Array.from({ length: n }, (_, i) => subDaysStr(today, n - 1 - i));
}

function fmtEventDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ── XP event icon mapper ───────────────────────────────────────────────────────

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

function xpIcon(eventType: string): { name: IoniconsName; color: string } {
  switch (eventType) {
    case 'food_log':
      return { name: 'restaurant-outline', color: '#f59e0b' };
    case 'weigh_in':
      return { name: 'fitness-outline', color: '#60a5fa' };
    case 'workout':
      return { name: 'barbell-outline', color: '#a78bfa' };
    case 'water_goal':
      return { name: 'water-outline', color: '#38bdf8' };
    case 'streak_bonus':
      return { name: 'flame', color: '#f97316' };
    default:
      return { name: 'star-outline', color: colors.primary };
  }
}

// ── Habit Grid component ───────────────────────────────────────────────────────

function HabitGrid({
  days,
  hitSet,
  label,
}: {
  days: string[];
  hitSet: Set<string>;
  label: string;
}) {
  const hitCount = days.filter(d => hitSet.has(d)).length;
  const rows = Array.from({ length: GRID_ROWS }, (_, row) =>
    days.slice(row * GRID_COLS, (row + 1) * GRID_COLS)
  );

  return (
    <View style={styles.habitBlock}>
      {rows.map((rowDays, rowIdx) => (
        <View key={rowIdx} style={styles.habitRow}>
          {rowDays.map(day => (
            <View
              key={day}
              style={[
                styles.habitCell,
                hitSet.has(day) ? styles.habitCellFilled : styles.habitCellEmpty,
              ]}
            />
          ))}
          {/* Pad missing cells in last row */}
          {rowDays.length < GRID_COLS &&
            Array.from({ length: GRID_COLS - rowDays.length }).map((_, pi) => (
              <View key={`pad-${pi}`} style={[styles.habitCell, { opacity: 0 }]} />
            ))}
        </View>
      ))}
      <Text style={styles.habitLabel}>
        {label} — {hitCount} / {days.length} days
      </Text>
    </View>
  );
}

// ── Main Screen ────────────────────────────────────────────────────────────────

export default function StreakPage() {
  const [uid, setUid] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => setUid(user?.id ?? null));
  }, []);

  const today = getLocalDateString();
  const thirtyDaysAgo = subDaysStr(today, 30);
  const last30 = useMemo(() => lastNDays(30), []);

  // ── Queries ──────────────────────────────────────────────────────────────────

  const { data: profile, isLoading: profileLoading } = useQuery<StreakProfile | null>({
    queryKey: ['profile-streak', uid],
    enabled: !!uid,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('current_streak, longest_streak, total_xp')
        .eq('user_id', uid!)
        .maybeSingle();
      if (error) throw error;
      return data as StreakProfile | null;
    },
  });

  const { data: foodDates = [] } = useQuery<string[]>({
    queryKey: ['food-habit', uid, thirtyDaysAgo],
    enabled: !!uid,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('meal_logs')
        .select('date')
        .eq('user_id', uid!)
        .gte('date', thirtyDaysAgo);
      if (error) throw error;
      // deduplicate multiple meals per day
      return [...new Set((data as { date: string }[]).map(r => r.date))];
    },
  });

  const { data: weighDates = [] } = useQuery<string[]>({
    queryKey: ['weigh-habit', uid, thirtyDaysAgo],
    enabled: !!uid,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('weight_logs')
        .select('logged_at')
        .eq('user_id', uid!)
        .gte('logged_at', thirtyDaysAgo);
      if (error) throw error;
      return (data as { logged_at: string }[]).map(r => r.logged_at);
    },
  });

  const { data: xpHistory = [] } = useQuery<FlatXpEvent[]>({
    queryKey: ['xp-history', uid],
    enabled: !!uid,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('daily_logs')
        .select('log_date, xp_events')
        .eq('user_id', uid!)
        .not('xp_events', 'is', null)
        .order('log_date', { ascending: false })
        .limit(20);
      if (error) throw error;
      // Flatten JSONB events from each day into a single list
      return (data as DailyLogRow[]).flatMap(row =>
        ((row.xp_events as XpEvent[]) ?? []).map(e => ({
          ...e,
          log_date: row.log_date,
        }))
      );
    },
  });

  // ── Derived ──────────────────────────────────────────────────────────────────

  const currentStreak = profile?.current_streak ?? 0;
  const longestStreak = profile?.longest_streak ?? 0;
  const totalXp = profile?.total_xp ?? 0;
  const level = Math.floor(totalXp / 100) + 1;
  const xpInLevel = totalXp % 100;

  const foodHitSet = useMemo(() => new Set(foodDates), [foodDates]);
  const weighHitSet = useMemo(() => new Set(weighDates), [weighDates]);

  // ── Loading ───────────────────────────────────────────────────────────────────

  if (profileLoading) {
    return (
      <View style={styles.root}>
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => router.back()}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="chevron-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Streaks &amp; XP</Text>
          <View style={{ width: 32 }} />
        </View>
        <View style={styles.skeletonHero} />
        <View style={styles.skeletonBar} />
        <View style={styles.skeletonGrid} />
      </View>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.content}
    >
      {/* ── 1. HEADER ── */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Streaks &amp; XP</Text>
        {/* Spacer to keep title centered */}
        <View style={{ width: 32 }} />
      </View>

      {/* ── 2. HERO STREAK CARD ── */}
      <View style={styles.card}>
        <View style={styles.heroCenter}>
          <Ionicons name="flame" size={48} color="#f97316" />
          <Text style={styles.heroStreakNum}>{currentStreak}</Text>
          <Text style={styles.heroStreakLabel}>day streak</Text>
        </View>
        <View style={styles.heroMetaRow}>
          <View style={styles.heroMetaItem}>
            <Text style={styles.heroMetaValue}>{longestStreak}</Text>
            <Text style={styles.heroMetaLabel}>Longest (days)</Text>
          </View>
          <View style={styles.heroMetaDivider} />
          <View style={styles.heroMetaItem}>
            <Text style={styles.heroMetaValue}>Level {level}</Text>
            <Text style={styles.heroMetaLabel}>Current Level</Text>
          </View>
        </View>
      </View>

      {/* ── 3. XP PROGRESS BAR CARD ── */}
      <View style={styles.card}>
        <View style={styles.xpHeaderRow}>
          <Text style={styles.cardLabel}>XP Progress</Text>
          <Text style={styles.xpLevelTag}>Level {level}</Text>
        </View>
        <View style={styles.xpBarBg}>
          <View
            style={[
              styles.xpBarFill,
              { width: `${xpInLevel}%` as `${number}%` },
            ]}
          />
        </View>
        <Text style={styles.xpBarCaption}>
          {xpInLevel} / 100 XP to Level {level + 1}
        </Text>
        <Text style={styles.xpTotal}>{totalXp} XP total</Text>
      </View>

      {/* ── 4. HABIT GRIDS ── */}
      <View style={styles.card}>
        <Text style={styles.cardLabel}>Last 30 Days</Text>
        <View style={styles.gridWrapper}>
          <Text style={styles.gridTitle}>Food Logging</Text>
          <HabitGrid days={last30} hitSet={foodHitSet} label="Food Log" />
        </View>
        <View style={styles.gridDivider} />
        <View style={styles.gridWrapper}>
          <Text style={styles.gridTitle}>Weigh-In</Text>
          <HabitGrid days={last30} hitSet={weighHitSet} label="Weigh-in" />
        </View>
      </View>

      {/* ── 5. XP HISTORY LIST ── */}
      <View style={styles.card}>
        <Text style={styles.cardLabel}>Recent XP</Text>

        {xpHistory.length === 0 ? (
          <View style={styles.emptyXp}>
            <Text style={styles.emptyXpText}>
              No XP earned yet — start logging to earn XP!
            </Text>
          </View>
        ) : (
          xpHistory.map((event, idx) => {
            const icon = xpIcon(event.event_type);
            return (
              <View
                key={`${event.log_date}-${idx}`}
                style={[
                  styles.xpRow,
                  idx < xpHistory.length - 1 && styles.xpRowBorder,
                ]}
              >
                <View
                  style={[
                    styles.xpIconWrap,
                    { backgroundColor: `${icon.color}22` },
                  ]}
                >
                  <Ionicons name={icon.name} size={18} color={icon.color} />
                </View>
                <View style={styles.xpRowMid}>
                  <Text style={styles.xpDesc} numberOfLines={1}>
                    {event.description || event.event_type}
                  </Text>
                  <Text style={styles.xpDate}>{fmtEventDate(event.log_date)}</Text>
                </View>
                <Text style={styles.xpAmount}>+{event.xp_amount} XP</Text>
              </View>
            );
          })
        )}
      </View>

      <View style={{ height: spacing.xl }} />
    </ScrollView>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xl,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
  },
  headerTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 18,
    color: colors.text,
  },

  // Card
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: spacing.md,
  },

  // Hero streak
  heroCenter: {
    alignItems: 'center',
    paddingVertical: spacing.sm,
    marginBottom: spacing.md,
  },
  heroStreakNum: {
    fontFamily: 'Inter_700Bold',
    fontSize: 72,
    color: colors.text,
    lineHeight: 80,
    marginTop: spacing.xs,
  },
  heroStreakLabel: {
    fontFamily: 'Inter_400Regular',
    fontSize: 16,
    color: colors.textMuted,
    marginTop: 2,
  },
  heroMetaRow: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
  },
  heroMetaItem: {
    flex: 1,
    alignItems: 'center',
  },
  heroMetaDivider: {
    width: 1,
    backgroundColor: colors.border,
  },
  heroMetaValue: {
    fontFamily: 'Inter_700Bold',
    fontSize: 20,
    color: colors.text,
  },
  heroMetaLabel: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 4,
  },

  // XP progress bar
  xpHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  xpLevelTag: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    color: colors.primary,
  },
  xpBarBg: {
    height: 10,
    backgroundColor: colors.border,
    borderRadius: 5,
    overflow: 'hidden',
    marginBottom: spacing.sm,
  },
  xpBarFill: {
    height: 10,
    backgroundColor: colors.primary,
    borderRadius: 5,
  },
  xpBarCaption: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    color: colors.text,
    marginBottom: 4,
  },
  xpTotal: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: colors.textMuted,
  },

  // Habit grids
  gridWrapper: {
    marginBottom: spacing.sm,
  },
  gridTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  gridDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.md,
  },
  habitBlock: {
    gap: CELL_GAP,
  },
  habitRow: {
    flexDirection: 'row',
    gap: CELL_GAP,
  },
  habitCell: {
    width: CELL_SIZE,
    height: CELL_SIZE,
    borderRadius: 4,
  },
  habitCellFilled: {
    backgroundColor: colors.primary,
  },
  habitCellEmpty: {
    backgroundColor: colors.border,
  },
  habitLabel: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: colors.textMuted,
    marginTop: spacing.sm,
  },

  // XP history
  emptyXp: {
    paddingVertical: spacing.lg,
    alignItems: 'center',
  },
  emptyXpText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
  },
  xpRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm + 2,
    gap: spacing.sm,
  },
  xpRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  xpIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  xpRowMid: {
    flex: 1,
  },
  xpDesc: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    color: colors.text,
  },
  xpDate: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  xpAmount: {
    fontFamily: 'Inter_700Bold',
    fontSize: 14,
    color: colors.primary,
    flexShrink: 0,
  },

  // Loading skeletons
  skeletonHero: {
    height: 200,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    marginBottom: spacing.md,
    opacity: 0.5,
  },
  skeletonBar: {
    height: 80,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    marginBottom: spacing.md,
    opacity: 0.5,
  },
  skeletonGrid: {
    height: 160,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    marginBottom: spacing.md,
    opacity: 0.5,
  },
});

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  BottomSheetModal,
  BottomSheetView,
  BottomSheetBackdrop,
} from '@gorhom/bottom-sheet';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { colors, spacing, borderRadius } from '../lib/theme';

// ── Constants ──────────────────────────────────────────────────────────────────

const SCREEN_W = Dimensions.get('window').width;
const CHART_TOTAL_W = SCREEN_W - spacing.md * 2;
const CHART_TOTAL_H = 200;
const PAD = { top: 12, bottom: 28, left: 44, right: 8 };
const PLOT_W = CHART_TOTAL_W - PAD.left - PAD.right;
const PLOT_H = CHART_TOTAL_H - PAD.top - PAD.bottom;

type Range = '30D' | '60D' | '90D';

type WeightLog = {
  id: string;
  user_id: string;
  weight_lbs: number;
  logged_at: string; // 'YYYY-MM-DD'
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function getLocalDateString(): string {
  return new Date().toLocaleDateString('en-CA');
}

function subDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() - n);
  return d.toLocaleDateString('en-CA');
}

function fmtShortDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function fmtFullDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function rangeStartDate(range: Range): string {
  const today = getLocalDateString();
  const days = range === '30D' ? 30 : range === '60D' ? 60 : 90;
  return subDays(today, days);
}

function calcRollingAvg(weights: number[]): number[] {
  return weights.map((_, i) => {
    const slice = weights.slice(Math.max(0, i - 6), i + 1);
    return slice.reduce((s, v) => s + v, 0) / slice.length;
  });
}

// ── SVG Chart ──────────────────────────────────────────────────────────────────

type ChartProps = {
  logs: WeightLog[];       // already sorted asc by logged_at
  goalWeight: number | null;
};

function WeightChart({ logs, goalWeight }: ChartProps) {
  if (logs.length === 0) {
    return (
      <View style={styles.chartEmpty}>
        <Text style={styles.chartEmptyText}>No data in this range</Text>
      </View>
    );
  }

  const weights = logs.map(l => l.weight_lbs);
  const n = logs.length;

  // Y-axis domain
  const allForDomain = goalWeight != null ? [...weights, goalWeight] : weights;
  const yMin = Math.min(...allForDomain) - 2;
  const yMax = Math.max(...weights) + 2;
  const yRange = yMax - yMin || 1;

  const xAt = (i: number) => PAD.left + (n === 1 ? PLOT_W / 2 : (i / (n - 1)) * PLOT_W);
  const yAt = (w: number) => PAD.top + (1 - (w - yMin) / yRange) * PLOT_H;

  // Rolling average (7-day window)
  const rollingAvg = calcRollingAvg(weights);

  // SVG path for rolling avg (only if 3+ points)
  let avgPath = '';
  if (n >= 3) {
    avgPath = rollingAvg
      .map((avg, i) => `${i === 0 ? 'M' : 'L'}${xAt(i).toFixed(1)},${yAt(avg).toFixed(1)}`)
      .join(' ');
  }

  // X-axis label indices: first, middle, last
  const midIdx = Math.floor((n - 1) / 2);
  const labelIdxSet = new Set([0, midIdx, n - 1]);
  const labelIndices = [...labelIdxSet].sort((a, b) => a - b);

  // Y-axis ticks (3 levels: min, mid, max — rounded)
  const yTicks = [
    Math.round(yMin + 1),
    Math.round((yMin + yMax) / 2),
    Math.round(yMax - 1),
  ];

  // Goal line Y
  const goalY = goalWeight != null ? yAt(goalWeight) : null;

  return (
    <Svg width={CHART_TOTAL_W} height={CHART_TOTAL_H}>
      {/* Y-axis tick labels */}
      {yTicks.map(tick => (
        <SvgText
          key={tick}
          x={PAD.left - 6}
          y={yAt(tick) + 4}
          textAnchor="end"
          fontSize={10}
          fill={colors.textMuted}
          fontFamily="Inter_400Regular"
        >
          {tick}
        </SvgText>
      ))}

      {/* Horizontal grid lines (subtle) */}
      {yTicks.map(tick => (
        <Line
          key={`grid-${tick}`}
          x1={PAD.left}
          y1={yAt(tick)}
          x2={PAD.left + PLOT_W}
          y2={yAt(tick)}
          stroke={colors.border}
          strokeWidth={0.5}
          opacity={0.5}
        />
      ))}

      {/* Goal line (dashed grey) */}
      {goalY != null && goalWeight != null && (
        <>
          <Line
            x1={PAD.left}
            y1={goalY}
            x2={PAD.left + PLOT_W}
            y2={goalY}
            stroke="#555"
            strokeWidth={1}
            strokeDasharray="4,4"
          />
          <SvgText
            x={PAD.left + PLOT_W + 2}
            y={goalY + 4}
            fontSize={9}
            fill="#555"
            fontFamily="Inter_400Regular"
          >
            Goal
          </SvgText>
        </>
      )}

      {/* Rolling avg line */}
      {avgPath.length > 0 && (
        <Path
          d={avgPath}
          stroke={colors.primary}
          strokeWidth={2}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}

      {/* Data point dots */}
      {logs.map((log, i) => (
        <Circle
          key={log.logged_at + i}
          cx={xAt(i)}
          cy={yAt(log.weight_lbs)}
          r={3}
          fill="#555555"
        />
      ))}

      {/* X-axis labels */}
      {labelIndices.map(i => (
        <SvgText
          key={`xlabel-${i}`}
          x={xAt(i)}
          y={CHART_TOTAL_H - 4}
          textAnchor="middle"
          fontSize={10}
          fill={colors.textMuted}
          fontFamily="Inter_400Regular"
        >
          {fmtShortDate(logs[i].logged_at)}
        </SvgText>
      ))}
    </Svg>
  );
}

// ── Main Screen ────────────────────────────────────────────────────────────────

export default function WeightPage() {
  const qc = useQueryClient();
  const sheetRef = useRef<BottomSheetModal>(null);
  const snapPoints = useMemo(() => ['45%'], []);

  const [uid, setUid] = useState<string | null>(null);
  const [selectedRange, setSelectedRange] = useState<Range>('30D');
  const [weightInput, setWeightInput] = useState('');

  // Resolve uid once
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => setUid(user?.id ?? null));
  }, []);

  // ── Queries ──────────────────────────────────────────────────────────────────

  const { data: allLogs = [], isLoading: logsLoading } = useQuery<WeightLog[]>({
    queryKey: ['weight_logs', uid],
    enabled: !!uid,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('weight_logs')
        .select('id, user_id, weight_lbs, logged_at')
        .eq('user_id', uid!)
        .not('weight_lbs', 'is', null)
        .order('logged_at', { ascending: true });
      if (error) throw error;
      return data as WeightLog[];
    },
  });

  const { data: profile } = useQuery<{ goal_weight_lbs: number | null } | null>({
    queryKey: ['user_profile', uid],
    enabled: !!uid,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('goal_weight_lbs')
        .eq('user_id', uid!)
        .maybeSingle();
      if (error) throw error;
      return data as { goal_weight_lbs: number | null } | null;
    },
  });

  // ── Derived data ─────────────────────────────────────────────────────────────

  const goalWeight = profile?.goal_weight_lbs ?? null;
  const today = getLocalDateString();

  // Chart data source: use selected range if 2+ logs, else all logs
  const chartLogs = useMemo(() => {
    const start = rangeStartDate(selectedRange);
    const inRange = allLogs.filter(l => l.logged_at >= start);
    return inRange.length >= 2 ? inRange : allLogs;
  }, [allLogs, selectedRange]);

  // Current weight = most recent log
  const currentLog = allLogs.length > 0 ? allLogs[allLogs.length - 1] : null;
  const currentWeight = currentLog?.weight_lbs ?? null;

  // Weekly change: current - most recent entry at least 7 days ago
  const weeklyChange = useMemo(() => {
    if (currentWeight == null) return null;
    const sevenDaysAgo = subDays(today, 7);
    const old = [...allLogs].reverse().find(l => l.logged_at <= sevenDaysAgo);
    if (!old) return null;
    return +(currentWeight - old.weight_lbs).toFixed(1);
  }, [allLogs, currentWeight, today]);

  // Bento data (only if 2+ logs)
  const firstLog = allLogs.length >= 2 ? allLogs[0] : null;
  const totalChange =
    firstLog && currentWeight != null
      ? +(currentWeight - firstLog.weight_lbs).toFixed(1)
      : null;

  // Goal progress (clamped 0–100%)
  const goalProgress = useMemo(() => {
    if (
      firstLog == null ||
      totalChange == null ||
      goalWeight == null ||
      goalWeight === firstLog.weight_lbs
    )
      return null;
    const raw = (Math.abs(totalChange) / Math.abs(firstLog.weight_lbs - goalWeight)) * 100;
    return Math.min(100, Math.max(0, raw));
  }, [firstLog, totalChange, goalWeight]);

  // Rolling avg on chart logs
  const chartRollingAvg = useMemo(
    () => calcRollingAvg(chartLogs.map(l => l.weight_lbs)),
    [chartLogs]
  );

  // Coaching insight (only if 7+ chart points)
  const coachingInsight = useMemo(() => {
    if (chartLogs.length < 7) return null;
    const last7 = chartRollingAvg.slice(-7);
    const diff = last7[6] - last7[0];
    if (diff < -0.3)
      return 'Consistent Progress — your trend is moving in the right direction.';
    if (diff > 0.3)
      return 'Check your intake — your rolling average is trending up.';
    return 'Stay consistent — your weight is stable this week.';
  }, [chartLogs, chartRollingAvg]);

  // Today's existing log (for upsert logic)
  const todayLog = allLogs.find(l => l.logged_at === today) ?? null;

  // ── Save mutation ─────────────────────────────────────────────────────────────

  const saveMutation = useMutation({
    mutationFn: async (weight: number) => {
      if (!uid) throw new Error('Not authenticated');
      if (todayLog) {
        const { error } = await supabase
          .from('weight_logs')
          .update({ weight_lbs: weight })
          .eq('id', todayLog.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('weight_logs')
          .insert({ user_id: uid, weight_lbs: weight, logged_at: today });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['weight_logs', uid] });
      setWeightInput('');
      sheetRef.current?.dismiss();
    },
    onError: (err: Error) => Alert.alert('Error', err.message),
  });

  // ── Handlers ──────────────────────────────────────────────────────────────────

  function handleSave() {
    const val = parseFloat(parseFloat(weightInput).toFixed(1));
    if (isNaN(val)) {
      Alert.alert('Invalid weight', 'Please enter a number.');
      return;
    }
    if (val < 50 || val > 700) {
      Alert.alert('Invalid weight', 'Weight must be between 50 and 700 lbs.');
      return;
    }
    saveMutation.mutate(val);
  }

  const renderBackdrop = useCallback(
    (props: Parameters<typeof BottomSheetBackdrop>[0]) => (
      <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} />
    ),
    []
  );

  // ── Loading state ─────────────────────────────────────────────────────────────

  if (logsLoading) {
    return (
      <View style={styles.root}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="chevron-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Weight</Text>
          <View style={{ width: 60 }} />
        </View>
        {/* Hero skeleton */}
        <View style={styles.skeletonHero} />
        {/* Chart skeleton */}
        <View style={styles.skeletonChart} />
      </View>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <>
      <ScrollView
        style={styles.root}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── 1. HEADER ── */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => router.back()}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="chevron-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Weight</Text>
          <TouchableOpacity onPress={() => sheetRef.current?.present()}>
            <Text style={styles.headerAction}>Log Weight</Text>
          </TouchableOpacity>
        </View>

        {/* ── 2. HERO CARD ── */}
        {currentWeight == null ? (
          <View style={[styles.card, styles.emptyState]}>
            <Text style={styles.emptyText}>
              No weight logs yet. Tap 'Log Weight' to start.
            </Text>
          </View>
        ) : (
          <View style={styles.card}>
            <Text style={styles.heroLabel}>Current Weight</Text>
            <Text style={styles.heroWeight}>{currentWeight.toFixed(1)} lbs</Text>

            {weeklyChange != null && (
              <View
                style={[
                  styles.changePill,
                  weeklyChange <= 0 ? styles.changePillGreen : styles.changePillRed,
                ]}
              >
                <Ionicons
                  name={weeklyChange <= 0 ? 'arrow-down' : 'arrow-up'}
                  size={12}
                  color={weeklyChange <= 0 ? colors.primary : '#ef4444'}
                />
                <Text
                  style={[
                    styles.changePillText,
                    { color: weeklyChange <= 0 ? colors.primary : '#ef4444' },
                  ]}
                >
                  {weeklyChange > 0 ? '+' : ''}
                  {weeklyChange.toFixed(1)} lbs this week
                </Text>
              </View>
            )}

            {goalWeight != null && (
              <Text style={styles.goalText}>Goal: {goalWeight.toFixed(1)} lbs</Text>
            )}
          </View>
        )}

        {/* ── 3. BENTO 2-UP ── */}
        {firstLog != null && totalChange != null && (
          <View style={styles.bentoRow}>
            {/* Left: starting weight */}
            <View style={[styles.card, styles.bentoCard]}>
              <Text style={styles.bentoLabel}>Starting Weight</Text>
              <Text style={styles.bentoValue}>{firstLog.weight_lbs.toFixed(1)} lbs</Text>
              <Text style={styles.bentoSub}>{fmtFullDate(firstLog.logged_at)}</Text>
            </View>

            {/* Right: total change + goal progress */}
            <View style={[styles.card, styles.bentoCard]}>
              <Text style={styles.bentoLabel}>Total Change</Text>
              <Text
                style={[
                  styles.bentoValue,
                  { color: totalChange <= 0 ? colors.primary : '#ef4444' },
                ]}
              >
                {totalChange > 0 ? '+' : ''}
                {totalChange.toFixed(1)} lbs
              </Text>
              {goalProgress != null && (
                <>
                  <View style={styles.progressBarBg}>
                    <View
                      style={[
                        styles.progressBarFill,
                        { width: `${goalProgress}%` as `${number}%` },
                      ]}
                    />
                  </View>
                  <Text style={styles.bentoSub}>{Math.round(goalProgress)}% to goal</Text>
                </>
              )}
            </View>
          </View>
        )}

        {/* ── 4. RANGE TOGGLE + CHART ── */}
        <View style={styles.card}>
          {/* Range pills */}
          <View style={styles.rangeRow}>
            {(['30D', '60D', '90D'] as Range[]).map(r => (
              <TouchableOpacity
                key={r}
                style={[styles.rangePill, selectedRange === r && styles.rangePillActive]}
                onPress={() => setSelectedRange(r)}
              >
                <Text
                  style={[
                    styles.rangePillText,
                    selectedRange === r && styles.rangePillTextActive,
                  ]}
                >
                  {r}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Chart */}
          {chartLogs.length === 0 ? (
            <View style={styles.chartEmpty}>
              <Text style={styles.chartEmptyText}>
                No weight logs yet. Tap 'Log Weight' to start.
              </Text>
            </View>
          ) : (
            <WeightChart logs={chartLogs} goalWeight={goalWeight} />
          )}
        </View>

        {/* ── 5. COACHING INSIGHT ── */}
        {coachingInsight != null && (
          <View style={[styles.card, styles.insightCard]}>
            <View style={styles.insightRow}>
              <Text style={styles.insightIcon}>💡</Text>
              <Text style={styles.insightText}>{coachingInsight}</Text>
            </View>
          </View>
        )}

        <View style={{ height: spacing.xl }} />
      </ScrollView>

      {/* ── 6. LOG WEIGHT BOTTOM SHEET ── */}
      <BottomSheetModal
        ref={sheetRef}
        index={0}
        snapPoints={snapPoints}
        enablePanDownToClose
        backdropComponent={renderBackdrop}
        backgroundStyle={styles.sheetBg}
        handleIndicatorStyle={styles.sheetHandle}
      >
        <BottomSheetView style={styles.sheetContent}>
          <Text style={styles.sheetTitle}>Log Weight</Text>
          <Text style={styles.sheetSubtitle}>
            {todayLog
              ? `Today's log: ${todayLog.weight_lbs.toFixed(1)} lbs — updating`
              : `Today: ${today}`}
          </Text>

          <TextInput
            style={styles.sheetInput}
            placeholder="e.g. 185.5"
            placeholderTextColor={colors.textMuted}
            value={weightInput}
            onChangeText={setWeightInput}
            keyboardType="decimal-pad"
            returnKeyType="done"
            autoFocus
          />

          <TouchableOpacity
            style={[styles.saveBtn, saveMutation.isPending && styles.saveBtnDisabled]}
            onPress={handleSave}
            disabled={saveMutation.isPending}
          >
            {saveMutation.isPending ? (
              <ActivityIndicator color="#000" size="small" />
            ) : (
              <Text style={styles.saveBtnText}>Save</Text>
            )}
          </TouchableOpacity>
        </BottomSheetView>
      </BottomSheetModal>
    </>
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
  headerAction: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
    color: colors.primary,
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

  // Hero card
  heroLabel: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: spacing.xs,
  },
  heroWeight: {
    fontFamily: 'Inter_700Bold',
    fontSize: 48,
    color: colors.text,
    lineHeight: 56,
  },
  changePill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    marginTop: spacing.sm,
    gap: 4,
  },
  changePillGreen: {
    backgroundColor: `${colors.primary}22`,
  },
  changePillRed: {
    backgroundColor: '#ef444422',
  },
  changePillText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
  },
  goalText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: colors.textMuted,
    marginTop: spacing.sm,
  },

  // Bento 2-up
  bentoRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  bentoCard: {
    flex: 1,
    marginBottom: 0,
  },
  bentoLabel: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: spacing.xs,
  },
  bentoValue: {
    fontFamily: 'Inter_700Bold',
    fontSize: 22,
    color: colors.text,
  },
  bentoSub: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 4,
  },
  progressBarBg: {
    height: 6,
    backgroundColor: colors.border,
    borderRadius: 3,
    marginTop: spacing.sm,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: 6,
    backgroundColor: colors.primary,
    borderRadius: 3,
  },

  // Range toggle
  rangeRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  rangePill: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  rangePillActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  rangePillText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    color: colors.textMuted,
  },
  rangePillTextActive: {
    color: '#000000',
  },

  // Chart
  chartEmpty: {
    height: 120,
    backgroundColor: colors.border,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chartEmptyText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
    paddingHorizontal: spacing.md,
  },

  // Coaching insight
  insightCard: {
    borderColor: `${colors.primary}33`,
  },
  insightRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  insightIcon: {
    fontSize: 18,
    lineHeight: 22,
  },
  insightText: {
    flex: 1,
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: colors.textMuted,
    lineHeight: 20,
  },

  // Empty / loading
  emptyState: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
  },
  emptyText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
  },
  skeletonHero: {
    height: 140,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    margin: spacing.md,
    opacity: 0.5,
  },
  skeletonChart: {
    height: 220,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    marginHorizontal: spacing.md,
    opacity: 0.5,
  },

  // Bottom sheet
  sheetBg: {
    backgroundColor: colors.surface,
  },
  sheetHandle: {
    backgroundColor: colors.textMuted,
  },
  sheetContent: {
    padding: spacing.lg,
    paddingBottom: spacing.xl,
  },
  sheetTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 22,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  sheetSubtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: colors.textMuted,
    marginBottom: spacing.lg,
  },
  sheetInput: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: 20,
    fontFamily: 'Inter_400Regular',
    color: colors.text,
    marginBottom: spacing.md,
  },
  saveBtn: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  saveBtnDisabled: {
    opacity: 0.6,
  },
  saveBtnText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 16,
    color: '#000000',
  },
});

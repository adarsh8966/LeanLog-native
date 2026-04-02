import { useRef, useEffect, useMemo, useCallback, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  Alert,
  ActivityIndicator,
  ScrollView,
  Animated,
  Dimensions,
} from 'react-native';
import Svg, { Rect, Defs, ClipPath, Text as SvgText } from 'react-native-svg';
import { Swipeable } from 'react-native-gesture-handler';
import { BottomSheetModal, BottomSheetScrollView, BottomSheetBackdrop } from '@gorhom/bottom-sheet';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import { colors, spacing, borderRadius } from '../lib/theme';
import {
  addEntry,
  deleteEntry,
  calcTotalOz,
  defaultBottleKey,
  type WaterEntry,
} from '../lib/waterLib';

// ── Constants ──────────────────────────────────────────────────────────────────

const DEFAULT_GOAL_OZ = 112;
const DRINK_SERVING_OZ = 12;

// SVG bottle geometry
const BOTTLE_W = 120;
const BOTTLE_H = 240;
const BODY_X = 10;
const BODY_Y = 70;
const BODY_W = 100;
const BODY_H = 160;
const BODY_RX = 16;
const NECK_X = 45;
const NECK_Y = 15;
const NECK_W = 30;
const NECK_H = BODY_Y - NECK_Y; // 55

const SCREEN_W = Dimensions.get('window').width;

const PRESETS = [
  { id: 'small_cup',    label: 'Small cup',   emoji: '🥛', oz: 8 },
  { id: 'std_bottle',   label: 'Standard',    emoji: '🍶', oz: 16 },
  { id: 'large_bottle', label: 'Large',       emoji: '💧', oz: 32 },
  { id: 'hydro_flask',  label: 'Hydro Flask', emoji: '🟦', oz: 40 },
  { id: 'stanley',      label: 'Stanley',     emoji: '🟩', oz: 30 },
  { id: 'gallon',       label: 'Gallon jug',  emoji: '🪣', oz: 128 },
] as const;

const DRINKS = [
  { label: 'Water',        emoji: '💧', water_credit_pct: 100 },
  { label: 'Coffee',       emoji: '☕', water_credit_pct: 95 },
  { label: 'Tea',          emoji: '🍵', water_credit_pct: 99 },
  { label: 'Sports drink', emoji: '🥤', water_credit_pct: 92 },
  { label: 'Milk',         emoji: '🥛', water_credit_pct: 87 },
  { label: 'Juice',        emoji: '🍹', water_credit_pct: 88 },
  { label: 'Soda',         emoji: '🫧', water_credit_pct: 50 },
  { label: 'Energy drink', emoji: '⚡', water_credit_pct: 40 },
] as const;

function todayLocal() {
  return new Date().toLocaleDateString('en-CA');
}

function fillColor(pct: number): string {
  if (pct >= 100) return '#22c55e';
  if (pct >= 67) return '#10b981';
  if (pct >= 34) return '#06b6d4';
  return '#38bdf8';
}

function newEntryId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// ── Animated SVG Rect ─────────────────────────────────────────────────────────

const AnimatedSvgRect = Animated.createAnimatedComponent(Rect);

// ── Water Bottle component ────────────────────────────────────────────────────

function WaterBottle({ fillPct }: { fillPct: number }) {
  const fillAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fillAnim, {
      toValue: Math.min(fillPct / 100, 1),
      duration: 700,
      useNativeDriver: false,
    }).start();
  }, [fillPct]);

  const fillH = fillAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, BODY_H],
  });
  const fillY = fillAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [BODY_Y + BODY_H, BODY_Y],
  });

  const color = fillColor(fillPct);
  const textColor = fillPct >= 40 ? '#fff' : colors.textMuted;

  return (
    <Svg width={BOTTLE_W} height={BOTTLE_H}>
      <Defs>
        <ClipPath id="bc1">
          <Rect x={BODY_X} y={BODY_Y} width={BODY_W} height={BODY_H} rx={BODY_RX} />
        </ClipPath>
      </Defs>

      {/* Neck */}
      <Rect
        x={NECK_X} y={NECK_Y} width={NECK_W} height={NECK_H}
        fill={colors.surface}
        stroke={colors.border}
        strokeWidth={2}
      />
      {/* Cap */}
      <Rect
        x={NECK_X - 3} y={NECK_Y} width={NECK_W + 6} height={10}
        rx={4}
        fill={colors.border}
      />

      {/* Fill (behind outline, clipped to body) */}
      <AnimatedSvgRect
        x={BODY_X}
        y={fillY as unknown as number}
        width={BODY_W}
        height={fillH as unknown as number}
        fill={color}
        clipPath="url(#bc1)"
      />

      {/* Body outline */}
      <Rect
        x={BODY_X} y={BODY_Y} width={BODY_W} height={BODY_H} rx={BODY_RX}
        fill="transparent"
        stroke={colors.border}
        strokeWidth={2}
      />

      {/* Percentage text */}
      <SvgText
        x={BODY_X + BODY_W / 2}
        y={BODY_Y + BODY_H / 2 + 8}
        textAnchor="middle"
        fontSize={22}
        fontWeight="bold"
        fill={textColor}
      >
        {`${Math.round(fillPct)}%`}
      </SvgText>
    </Svg>
  );
}

// ── Swipeable log row ─────────────────────────────────────────────────────────

function LogRow({
  entry,
  onDelete,
  isDeleting,
}: {
  entry: WaterEntry;
  onDelete: (id: string) => void;
  isDeleting: boolean;
}) {
  const swipeRef = useRef<Swipeable>(null);

  function handleDelete() {
    swipeRef.current?.close();
    Alert.alert('Delete entry', `Remove "${entry.label}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => onDelete(entry.id),
      },
    ]);
  }

  return (
    <Swipeable
      ref={swipeRef}
      rightThreshold={68}
      renderRightActions={() => (
        <TouchableOpacity
          style={styles.deleteAction}
          onPress={handleDelete}
          disabled={isDeleting}
        >
          {isDeleting ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.deleteActionText}>Delete</Text>
          )}
        </TouchableOpacity>
      )}
    >
      <View style={styles.logRow}>
        <View style={styles.logRowLeft}>
          <Text style={styles.logLabel}>{entry.label}</Text>
          <Text style={styles.logTime}>{fmtTime(entry.logged_at)}</Text>
        </View>
        <View style={styles.logRowRight}>
          <Text style={styles.logOz}>{entry.amount_oz} oz</Text>
          {entry.water_credit_pct < 100 && (
            <Text style={styles.logCredited}>
              {entry.credited_oz} oz credited
            </Text>
          )}
        </View>
      </View>
    </Swipeable>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function Water() {
  const qc = useQueryClient();
  const today = todayLocal();
  const sheetRef = useRef<BottomSheetModal>(null);
  const snapPoints = useMemo(() => ['50%'], []);
  const [activePresetId, setActivePresetId] = useState<string | null>(null);
  const [activeDrinkLabel, setActiveDrinkLabel] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [defaultBottleOz, setDefaultBottleOz] = useState<number | null>(null);
  const [uid, setUid] = useState<string | null>(null);

  // ── Get uid + load AsyncStorage default bottle ──────────────────────────────
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => setUid(user?.id ?? null));
    AsyncStorage.getItem(defaultBottleKey).then(val => {
      if (val) setDefaultBottleOz(parseFloat(val));
    });
  }, []);

  // ── Queries ─────────────────────────────────────────────────────────────────
  const { data: dailyLog, isLoading: logLoading } = useQuery({
    queryKey: ['daily_log', uid, today],
    enabled: !!uid,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('daily_logs')
        .select('water_oz, water_breakdown')
        .eq('user_id', uid!)
        .eq('date', today)
        .maybeSingle();
      if (error) throw error;
      return data as { water_oz: number; water_breakdown: WaterEntry[] } | null;
    },
  });

  const { data: profile } = useQuery({
    queryKey: ['user_profile', uid],
    enabled: !!uid,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('water_goal_oz, hydration_streak')
        .eq('user_id', uid!)
        .maybeSingle();
      if (error) throw error;
      return data as { water_goal_oz: number | null; hydration_streak: number | null } | null;
    },
  });

  // ── Derived ─────────────────────────────────────────────────────────────────
  const breakdown: WaterEntry[] = dailyLog?.water_breakdown ?? [];
  const waterOz = dailyLog?.water_oz ?? 0;
  const goalOz = profile?.water_goal_oz ?? DEFAULT_GOAL_OZ;
  const fillPct = goalOz > 0 ? Math.min((waterOz / goalOz) * 100, 100) : 0;
  const streak = profile?.hydration_streak ?? 0;
  const sortedBreakdown = useMemo(
    () => [...breakdown].sort((a, b) => b.logged_at.localeCompare(a.logged_at)),
    [breakdown]
  );

  function invalidate() {
    qc.invalidateQueries({ queryKey: ['daily_log', uid, today] });
    qc.invalidateQueries({ queryKey: ['user_profile', uid] });
  }

  // ── Add mutation ─────────────────────────────────────────────────────────────
  const addMutation = useMutation({
    mutationFn: async (input: {
      label: string;
      amount_oz: number;
      water_credit_pct: number;
      source: 'manual' | 'drink';
    }) => {
      const credited_oz =
        Math.round(input.amount_oz * (input.water_credit_pct / 100) * 10) / 10;
      const newEntry: WaterEntry = {
        id: newEntryId(),
        label: input.label,
        amount_oz: input.amount_oz,
        water_credit_pct: input.water_credit_pct,
        credited_oz,
        source: input.source,
        logged_at: new Date().toISOString(),
      };
      const newBreakdown = addEntry(breakdown, newEntry);
      const newTotal = calcTotalOz(newBreakdown);
      const { error } = await supabase.from('daily_logs').upsert(
        { user_id: uid!, date: today, water_oz: newTotal, water_breakdown: newBreakdown },
        { onConflict: 'user_id,date' }
      );
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); setActivePresetId(null); setActiveDrinkLabel(null); },
    onError: (err: Error) => {
      setActivePresetId(null);
      setActiveDrinkLabel(null);
      Alert.alert('Error', err.message);
    },
  });

  // ── Delete mutation ───────────────────────────────────────────────────────────
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const newBreakdown = deleteEntry(breakdown, id);
      const newTotal = calcTotalOz(newBreakdown);
      const { error } = await supabase.from('daily_logs').upsert(
        { user_id: uid!, date: today, water_oz: newTotal, water_breakdown: newBreakdown },
        { onConflict: 'user_id,date' }
      );
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); setDeletingId(null); },
    onError: (err: Error) => { setDeletingId(null); Alert.alert('Error', err.message); },
  });

  // ── Handlers ─────────────────────────────────────────────────────────────────
  function handlePreset(preset: typeof PRESETS[number]) {
    if (addMutation.isPending) return;
    setActivePresetId(preset.id);
    addMutation.mutate({
      label: `${preset.emoji} ${preset.label} (${preset.oz} oz)`,
      amount_oz: preset.oz,
      water_credit_pct: 100,
      source: 'manual',
    });
    AsyncStorage.setItem(defaultBottleKey, String(preset.oz));
    setDefaultBottleOz(preset.oz);
  }

  function handleDrink(drink: typeof DRINKS[number]) {
    if (addMutation.isPending) return;
    setActiveDrinkLabel(drink.label);
    sheetRef.current?.dismiss();
    addMutation.mutate({
      label: `${drink.emoji} ${drink.label}`,
      amount_oz: DRINK_SERVING_OZ,
      water_credit_pct: drink.water_credit_pct,
      source: 'drink',
    });
  }

  function handleDelete(id: string) {
    setDeletingId(id);
    deleteMutation.mutate(id);
  }

  const renderBackdrop = useCallback(
    (props: Parameters<typeof BottomSheetBackdrop>[0]) => (
      <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} />
    ),
    []
  );

  // ── Header for FlatList ───────────────────────────────────────────────────────
  const ListHeader = (
    <View>
      {/* Streak banner */}
      {streak > 0 && (
        <View style={styles.streakBanner}>
          <Text style={styles.streakText}>💧 {streak} Day Hydration Streak</Text>
        </View>
      )}

      {/* Bottle + stats */}
      <View style={styles.bottleSection}>
        {logLoading ? (
          <View style={styles.bottlePlaceholder}>
            <ActivityIndicator color={colors.primary} size="large" />
          </View>
        ) : (
          <WaterBottle fillPct={fillPct} />
        )}
        <Text style={styles.ozDisplay}>
          <Text style={styles.ozCurrent}>{waterOz}</Text>
          <Text style={styles.ozSeparator}> / </Text>
          <Text style={styles.ozGoal}>{goalOz} oz</Text>
        </Text>
        {fillPct >= 100 && (
          <Text style={styles.goalReached}>🎉 Goal reached!</Text>
        )}
      </View>

      {/* Quick add presets */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Quick Add</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.presetsRow}
        >
          {PRESETS.map(preset => {
            const isActive = activePresetId === preset.id && addMutation.isPending;
            const isDefault = defaultBottleOz === preset.oz;
            return (
              <TouchableOpacity
                key={preset.id}
                style={[styles.presetPill, isDefault && styles.presetPillDefault]}
                onPress={() => handlePreset(preset)}
                disabled={addMutation.isPending}
                activeOpacity={0.7}
              >
                {isActive ? (
                  <ActivityIndicator color={isDefault ? '#000' : colors.primary} size="small" />
                ) : (
                  <>
                    <Text style={styles.presetEmoji}>{preset.emoji}</Text>
                    <Text style={[styles.presetLabel, isDefault && styles.presetLabelDefault]}>
                      {preset.label}
                    </Text>
                    <Text style={[styles.presetOz, isDefault && styles.presetOzDefault]}>
                      {preset.oz} oz
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Add drink button */}
      <TouchableOpacity
        style={[styles.addDrinkBtn, addMutation.isPending && styles.addDrinkBtnDisabled]}
        onPress={() => sheetRef.current?.present()}
        disabled={addMutation.isPending}
      >
        {activeDrinkLabel && addMutation.isPending ? (
          <ActivityIndicator color="#000" size="small" />
        ) : (
          <Text style={styles.addDrinkBtnText}>+ Add Drink</Text>
        )}
      </TouchableOpacity>

      {/* Log section header */}
      {sortedBreakdown.length > 0 && (
        <Text style={styles.logSectionTitle}>Today's Log</Text>
      )}
    </View>
  );

  return (
    <>
      <FlatList
        style={styles.container}
        contentContainerStyle={styles.content}
        data={sortedBreakdown}
        keyExtractor={item => item.id}
        ListHeaderComponent={ListHeader}
        renderItem={({ item }) => (
          <LogRow
            entry={item}
            onDelete={handleDelete}
            isDeleting={deletingId === item.id && deleteMutation.isPending}
          />
        )}
        ListEmptyComponent={
          logLoading ? null : (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateText}>
                No entries yet — tap a preset or add a drink above.
              </Text>
            </View>
          )
        }
        ItemSeparatorComponent={() => <View style={styles.separator} />}
      />

      {/* Drink bottom sheet */}
      <BottomSheetModal
        ref={sheetRef}
        index={0}
        snapPoints={snapPoints}
        enablePanDownToClose
        backdropComponent={renderBackdrop}
        backgroundStyle={styles.sheetBackground}
        handleIndicatorStyle={styles.sheetHandle}
      >
        <BottomSheetScrollView contentContainerStyle={styles.sheetContent}>
          <Text style={styles.sheetTitle}>Add a Drink</Text>
          <Text style={styles.sheetSubtitle}>12 oz serving · water credit shown</Text>
          {DRINKS.map(drink => {
            const isDrinkActive = activeDrinkLabel === drink.label && addMutation.isPending;
            const credited = Math.round(DRINK_SERVING_OZ * (drink.water_credit_pct / 100) * 10) / 10;
            return (
              <TouchableOpacity
                key={drink.label}
                style={styles.drinkRow}
                onPress={() => handleDrink(drink)}
                disabled={addMutation.isPending}
                activeOpacity={0.7}
              >
                <Text style={styles.drinkEmoji}>{drink.emoji}</Text>
                <View style={styles.drinkInfo}>
                  <Text style={styles.drinkLabel}>{drink.label}</Text>
                  <Text style={styles.drinkCredit}>
                    {drink.water_credit_pct}% water · {credited} oz credited
                  </Text>
                </View>
                {isDrinkActive ? (
                  <ActivityIndicator color={colors.primary} size="small" />
                ) : (
                  <Text style={styles.drinkAdd}>+ Add</Text>
                )}
              </TouchableOpacity>
            );
          })}
        </BottomSheetScrollView>
      </BottomSheetModal>
    </>
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

  // Streak
  streakBanner: {
    backgroundColor: `${colors.primary}18`,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: `${colors.primary}40`,
  },
  streakText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    color: colors.primary,
  },

  // Bottle section
  bottleSection: {
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  bottlePlaceholder: {
    width: BOTTLE_W,
    height: BOTTLE_H,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ozDisplay: {
    marginTop: spacing.sm,
  },
  ozCurrent: {
    fontFamily: 'Inter_700Bold',
    fontSize: 28,
    color: colors.text,
  },
  ozSeparator: {
    fontFamily: 'Inter_400Regular',
    fontSize: 20,
    color: colors.textMuted,
  },
  ozGoal: {
    fontFamily: 'Inter_400Regular',
    fontSize: 20,
    color: colors.textMuted,
  },
  goalReached: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 16,
    color: colors.primary,
    marginTop: spacing.xs,
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
    marginBottom: spacing.sm,
  },

  // Presets
  presetsRow: {
    gap: spacing.sm,
    paddingRight: spacing.xs,
  },
  presetPill: {
    backgroundColor: colors.background,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    minWidth: 80,
    gap: 2,
  },
  presetPillDefault: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  presetEmoji: {
    fontSize: 18,
  },
  presetLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
    color: colors.text,
  },
  presetLabelDefault: {
    color: '#000',
  },
  presetOz: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: colors.textMuted,
  },
  presetOzDefault: {
    color: '#00000099',
  },

  // Add drink button
  addDrinkBtn: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  addDrinkBtnDisabled: {
    opacity: 0.6,
  },
  addDrinkBtnText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 16,
    color: '#000',
  },

  // Log section
  logSectionTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: spacing.sm,
  },

  // Log rows
  logRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderWidth: 1,
    borderColor: colors.border,
  },
  logRowLeft: {
    flex: 1,
  },
  logLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    color: colors.text,
  },
  logTime: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  logRowRight: {
    alignItems: 'flex-end',
  },
  logOz: {
    fontFamily: 'Inter_700Bold',
    fontSize: 14,
    color: colors.primary,
  },
  logCredited: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 2,
  },
  separator: {
    height: spacing.sm,
  },

  // Swipe delete action
  deleteAction: {
    backgroundColor: '#ef4444',
    borderRadius: borderRadius.md,
    width: 80,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: spacing.sm,
  },
  deleteActionText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    color: '#fff',
  },

  // Empty state
  emptyState: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
  },
  emptyStateText: {
    fontFamily: 'Inter_400Regular',
    color: colors.textMuted,
    fontSize: 14,
    textAlign: 'center',
  },

  // Bottom sheet
  sheetBackground: {
    backgroundColor: colors.surface,
  },
  sheetHandle: {
    backgroundColor: colors.textMuted,
  },
  sheetContent: {
    padding: spacing.md,
    paddingBottom: spacing.xl,
  },
  sheetTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 20,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  sheetSubtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: colors.textMuted,
    marginBottom: spacing.md,
  },
  drinkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm + 2,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: spacing.sm,
  },
  drinkEmoji: {
    fontSize: 22,
    width: 32,
    textAlign: 'center',
  },
  drinkInfo: {
    flex: 1,
  },
  drinkLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
    color: colors.text,
  },
  drinkCredit: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 1,
  },
  drinkAdd: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    color: colors.primary,
  },
});

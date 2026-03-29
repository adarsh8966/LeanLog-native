import { useRef, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  SectionList,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { GestureHandlerRootView, Swipeable } from 'react-native-gesture-handler';
import DraggableFlatList, { RenderItemParams, ScaleDecorator } from 'react-native-draggable-flatlist';
import BottomSheet, { BottomSheetView, BottomSheetTextInput, BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { supabase } from '../lib/supabase';
import { colors, spacing, borderRadius } from '../lib/theme';
import {
  SUPPLEMENT_LIBRARY,
  DEFAULT_SUPPLEMENTS,
  DOSE_UNITS,
  TIMING_OPTIONS,
  getAdequacyBadge,
  UserSupplement,
  SupplementCategory,
  SupplementLibraryItem,
} from '../lib/supplementLib';

// ── Types ──────────────────────────────────────────────────────────────────────

type SupplementLog = {
  id: string;
  user_id: string;
  log_date: string;
  taken_supplements: Record<string, boolean>;
};

type DailyLog = {
  workout_completed: boolean;
};

// ── Date helper (no toISOString) ──────────────────────────────────────────────
function todayStr() {
  return new Date().toLocaleDateString('en-CA');
}

// ── Category order ─────────────────────────────────────────────────────────────
const CATEGORY_ORDER: SupplementCategory[] = [
  'Protein & Amino Acids',
  'Vitamins',
  'Minerals',
  'Omega & Heart Health',
  'Performance & Pre-workout',
  'Recovery & Sleep',
  'Gut & General Health',
  'Fat Loss',
];

// ── Main Component ─────────────────────────────────────────────────────────────
export default function Supplements() {
  const qc = useQueryClient();
  const today = todayStr();
  const bottomSheetRef = useRef<BottomSheet>(null);

  // ── custom form state ──────────────────────────────────────────────────────
  const [showCustomForm, setShowCustomForm] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customDose, setCustomDose] = useState('');
  const [customUnit, setCustomUnit] = useState('g');
  const [customTiming, setCustomTiming] = useState('Morning');
  const [searchQuery, setSearchQuery] = useState('');

  // per-row loading state
  const [togglingIds, setTogglingIds] = useState<Set<string>>(new Set());

  // ── Queries ────────────────────────────────────────────────────────────────
  const { data: user } = useQuery({
    queryKey: ['auth_user'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      return user;
    },
  });
  const uid = user?.id;

  const { data: supplements = [], isLoading: supLoading } = useQuery<UserSupplement[]>({
    queryKey: ['user_supplements', uid],
    enabled: !!uid,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_supplements')
        .select('*')
        .eq('user_id', uid!)
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return data as UserSupplement[];
    },
  });

  const { data: supplementLog } = useQuery<SupplementLog | null>({
    queryKey: ['supplement_log', uid, today],
    enabled: !!uid,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('supplements_logs')
        .select('*')
        .eq('user_id', uid!)
        .eq('log_date', today)
        .maybeSingle();
      if (error) throw error;
      return data as SupplementLog | null;
    },
  });

  const { data: userProfile } = useQuery<{ supplement_streak: number } | null>({
    queryKey: ['user_profile', uid],
    enabled: !!uid,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('supplement_streak')
        .eq('user_id', uid!)
        .maybeSingle();
      if (error) throw error;
      return data as { supplement_streak: number } | null;
    },
  });

  const { data: dailyLog } = useQuery<DailyLog | null>({
    queryKey: ['daily_log', uid, today],
    enabled: !!uid,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('daily_logs')
        .select('workout_completed')
        .eq('user_id', uid!)
        .eq('log_date', today)
        .maybeSingle();
      if (error) throw error;
      return data as DailyLog | null;
    },
  });

  const workoutCompleted = dailyLog?.workout_completed ?? false;
  const takenSupplements: Record<string, boolean> = supplementLog?.taken_supplements ?? {};
  const takenCount = supplements.filter(s => takenSupplements[s.id]).length;
  const streakCount = userProfile?.supplement_streak ?? 0;

  // ── Mutations ──────────────────────────────────────────────────────────────
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['user_supplements', uid] });
    qc.invalidateQueries({ queryKey: ['supplement_log', uid, today] });
  };

  const toggleMutation = useMutation({
    mutationFn: async ({ supId, currentValue }: { supId: string; currentValue: boolean }) => {
      const merged = { ...takenSupplements, [supId]: !currentValue };
      const { error } = await supabase
        .from('supplements_logs')
        .upsert(
          { user_id: uid!, log_date: today, taken_supplements: merged },
          { onConflict: 'user_id,log_date' }
        );
      if (error) throw error;
    },
    onMutate: ({ supId }) => {
      setTogglingIds(prev => new Set([...prev, supId]));
    },
    onSettled: (_data, _err, { supId }) => {
      setTogglingIds(prev => {
        const next = new Set(prev);
        next.delete(supId);
        return next;
      });
      invalidate();
    },
    onError: (err: Error) => Alert.alert('Error', err.message),
  });

  const reorderMutation = useMutation({
    mutationFn: async (reordered: UserSupplement[]) => {
      const updates = reordered.map((s, i) =>
        supabase.from('user_supplements').update({ sort_order: i }).eq('id', s.id)
      );
      await Promise.all(updates);
    },
    onError: (err: Error) => Alert.alert('Error', err.message),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['user_supplements', uid] }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('user_supplements').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => invalidate(),
    onError: (err: Error) => Alert.alert('Error', err.message),
  });

  const addMutation = useMutation({
    mutationFn: async (item: { name: string; dose: string; unit: string; timing: string }) => {
      // If user has no supplements, seed defaults first
      if (supplements.length === 0) {
        const seeds = DEFAULT_SUPPLEMENTS.map(s => ({ ...s, user_id: uid! }));
        const { error: seedErr } = await supabase.from('user_supplements').insert(seeds);
        if (seedErr) throw seedErr;
      }
      const sort_order = supplements.length === 0 ? DEFAULT_SUPPLEMENTS.length : supplements.length;
      const { error } = await supabase
        .from('user_supplements')
        .insert({ user_id: uid!, ...item, sort_order });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      bottomSheetRef.current?.close();
      setSearchQuery('');
      setShowCustomForm(false);
      resetCustomForm();
    },
    onError: (err: Error) => Alert.alert('Error', err.message),
  });

  const seedDefaultsMutation = useMutation({
    mutationFn: async () => {
      const seeds = DEFAULT_SUPPLEMENTS.map(s => ({ ...s, user_id: uid! }));
      const { error } = await supabase.from('user_supplements').insert(seeds);
      if (error) throw error;
    },
    onSuccess: () => invalidate(),
    onError: (err: Error) => Alert.alert('Error', err.message),
  });

  // ── Helpers ────────────────────────────────────────────────────────────────
  function resetCustomForm() {
    setCustomName('');
    setCustomDose('');
    setCustomUnit('g');
    setCustomTiming('Morning');
  }

  function confirmDelete(id: string, name: string) {
    Alert.alert(
      'Delete supplement',
      `Remove "${name}" from your list?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => deleteMutation.mutate(id) },
      ]
    );
  }

  function handleAddLibraryItem(item: SupplementLibraryItem) {
    const alreadyAdded = supplements.some(s => s.name.toLowerCase() === item.name.toLowerCase());
    if (alreadyAdded) {
      Alert.alert('Already added', `${item.name} is already in your list.`);
      return;
    }
    addMutation.mutate({ name: item.name, dose: item.defaultDose, unit: item.defaultUnit, timing: item.defaultTiming });
  }

  function handleAddCustom() {
    if (!customName.trim()) {
      Alert.alert('Missing name', 'Please enter a supplement name.');
      return;
    }
    if (!customDose.trim()) {
      Alert.alert('Missing dose', 'Please enter a dose amount.');
      return;
    }
    addMutation.mutate({ name: customName.trim(), dose: customDose.trim(), unit: customUnit, timing: customTiming });
  }

  // ── Filtered library grouped by category ──────────────────────────────────
  const filteredSections = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return CATEGORY_ORDER
      .map(cat => ({
        title: cat,
        data: SUPPLEMENT_LIBRARY.filter(
          item => item.category === cat && (q === '' || item.name.toLowerCase().includes(q))
        ),
      }))
      .filter(s => s.data.length > 0);
  }, [searchQuery]);

  // ── DraggableFlatList renderItem ──────────────────────────────────────────
  const renderSupplementRow = useCallback(
    ({ item, drag, isActive }: RenderItemParams<UserSupplement>) => {
      const isTaken = takenSupplements[item.id] ?? false;
      const isToggling = togglingIds.has(item.id);
      const isPreworkout = item.timing.toLowerCase().includes('pre-workout') || item.name.toLowerCase().includes('pre-workout');
      const disabled = isPreworkout && !workoutCompleted;
      const badge = getAdequacyBadge(item.name, item.dose, item.unit);

      const swipeRight = () => (
        <TouchableOpacity
          style={styles.deleteAction}
          onPress={() => confirmDelete(item.id, item.name)}
        >
          <Text style={styles.deleteActionText}>Delete</Text>
        </TouchableOpacity>
      );

      return (
        <ScaleDecorator>
          <Swipeable renderRightActions={swipeRight} overshootRight={false}>
            <View style={[styles.supplementRow, isActive && styles.supplementRowActive, disabled && styles.supplementRowDisabled]}>
              {/* Drag handle */}
              <TouchableOpacity onLongPress={drag} style={styles.dragHandle} hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}>
                <Text style={styles.dragHandleIcon}>⠿</Text>
              </TouchableOpacity>

              {/* Center info */}
              <View style={styles.supplementInfo}>
                <Text style={[styles.supplementName, disabled && styles.supplementNameDisabled]} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={styles.supplementMeta}>
                  {item.dose}{item.unit} · {item.timing}
                  {disabled && <Text style={styles.disabledHint}> · Workout not logged</Text>}
                </Text>
              </View>

              {/* Adequacy badge */}
              {badge && (
                <View style={[styles.adequacyBadge, { backgroundColor: badge.color + '22', borderColor: badge.color }]}>
                  <Text style={[styles.adequacyBadgeText, { color: badge.color }]}>{badge.label}</Text>
                </View>
              )}

              {/* Toggle checkbox */}
              <TouchableOpacity
                style={styles.checkboxBtn}
                onPress={() => {
                  if (disabled) {
                    Alert.alert('Workout not completed', 'Log a workout first to take your pre-workout supplement.');
                    return;
                  }
                  toggleMutation.mutate({ supId: item.id, currentValue: isTaken });
                }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                {isToggling ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : isTaken ? (
                  <View style={styles.checkboxChecked}>
                    <Text style={styles.checkboxCheck}>✓</Text>
                  </View>
                ) : (
                  <View style={[styles.checkboxUnchecked, disabled && styles.checkboxDisabled]} />
                )}
              </TouchableOpacity>
            </View>
          </Swipeable>
        </ScaleDecorator>
      );
    },
    [takenSupplements, togglingIds, workoutCompleted]
  );

  // ── Bottom sheet snap points ───────────────────────────────────────────────
  const snapPoints = useMemo(() => ['70%', '90%'], []);

  // ── Render ─────────────────────────────────────────────────────────────────
  if (supLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <View style={styles.container}>
        {/* ── Header stats ── */}
        <View style={styles.header}>
          <View>
            <Text style={styles.heading}>Supplements</Text>
            {supplements.length > 0 && (
              <Text style={styles.subheading}>
                {takenCount}/{supplements.length} taken today
              </Text>
            )}
          </View>
          {streakCount > 0 && (
            <View style={styles.streakBadge}>
              <Text style={styles.streakText}>💊 {streakCount} day streak</Text>
            </View>
          )}
        </View>

        {/* ── Empty state ── */}
        {supplements.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateTitle}>No supplements yet</Text>
            <Text style={styles.emptyStateBody}>
              We'll add 5 popular defaults to get you started: Creatine, Multivitamin, Vitamin D3, Fish Oil, and Pre-workout.
            </Text>
            <TouchableOpacity
              style={[styles.addBtn, seedDefaultsMutation.isPending && styles.addBtnDisabled]}
              onPress={() => seedDefaultsMutation.mutate()}
              disabled={seedDefaultsMutation.isPending}
            >
              {seedDefaultsMutation.isPending ? (
                <ActivityIndicator color="#000" size="small" />
              ) : (
                <Text style={styles.addBtnText}>Get Started</Text>
              )}
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {/* ── Draggable list ── */}
            <DraggableFlatList
              data={supplements}
              keyExtractor={item => item.id}
              renderItem={renderSupplementRow}
              onDragEnd={({ data }) => reorderMutation.mutate(data)}
              contentContainerStyle={styles.listContent}
            />

            {/* ── Add supplement button ── */}
            <View style={styles.addBtnContainer}>
              <TouchableOpacity
                style={styles.addBtn}
                onPress={() => {
                  setShowCustomForm(false);
                  setSearchQuery('');
                  bottomSheetRef.current?.expand();
                }}
              >
                <Text style={styles.addBtnText}>+ Add Supplement</Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        {/* ── Bottom Sheet ── */}
        <BottomSheet
          ref={bottomSheetRef}
          index={-1}
          snapPoints={snapPoints}
          enablePanDownToClose
          backgroundStyle={styles.sheetBackground}
          handleIndicatorStyle={styles.sheetIndicator}
        >
          <BottomSheetView style={styles.sheetContainer}>
            <Text style={styles.sheetTitle}>Add Supplement</Text>

            {!showCustomForm ? (
              <>
                {/* Search */}
                <View style={styles.searchContainer}>
                  <BottomSheetTextInput
                    style={styles.searchInput}
                    placeholder="Search supplements…"
                    placeholderTextColor={colors.textMuted}
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                  />
                </View>

                {/* Library list */}
                <BottomSheetScrollView style={styles.sheetScroll}>
                  {filteredSections.map(section => (
                    <View key={section.title}>
                      <Text style={styles.sectionHeader}>{section.title}</Text>
                      {section.data.map(item => {
                        const alreadyAdded = supplements.some(
                          s => s.name.toLowerCase() === item.name.toLowerCase()
                        );
                        return (
                          <TouchableOpacity
                            key={item.name}
                            style={styles.libraryItem}
                            onPress={() => handleAddLibraryItem(item)}
                            disabled={addMutation.isPending}
                          >
                            <View style={styles.libraryItemLeft}>
                              <Text style={styles.libraryItemName}>{item.name}</Text>
                              <Text style={styles.libraryItemMeta}>
                                {item.defaultDose}{item.defaultUnit} · {item.defaultTiming}
                              </Text>
                            </View>
                            {alreadyAdded && (
                              <View style={styles.addedBadge}>
                                <Text style={styles.addedBadgeText}>Added</Text>
                              </View>
                            )}
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  ))}

                  {filteredSections.length === 0 && (
                    <Text style={styles.noResults}>No supplements match "{searchQuery}"</Text>
                  )}

                  {/* Create custom option */}
                  <TouchableOpacity
                    style={styles.createCustomBtn}
                    onPress={() => setShowCustomForm(true)}
                  >
                    <Text style={styles.createCustomText}>+ Create custom supplement</Text>
                  </TouchableOpacity>
                </BottomSheetScrollView>
              </>
            ) : (
              /* Custom supplement form */
              <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                style={{ flex: 1 }}
              >
                <ScrollView style={styles.customForm} keyboardShouldPersistTaps="handled">
                  <TouchableOpacity onPress={() => setShowCustomForm(false)} style={styles.backBtn}>
                    <Text style={styles.backBtnText}>← Back to library</Text>
                  </TouchableOpacity>

                  <Text style={styles.formLabel}>Name</Text>
                  <TextInput
                    style={styles.formInput}
                    placeholder="e.g. Lion's Mane"
                    placeholderTextColor={colors.textMuted}
                    value={customName}
                    onChangeText={setCustomName}
                  />

                  <Text style={styles.formLabel}>Dose</Text>
                  <TextInput
                    style={styles.formInput}
                    placeholder="e.g. 500"
                    placeholderTextColor={colors.textMuted}
                    value={customDose}
                    onChangeText={setCustomDose}
                    keyboardType="decimal-pad"
                  />

                  <Text style={styles.formLabel}>Unit</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pickerRow}>
                    {DOSE_UNITS.map(u => (
                      <TouchableOpacity
                        key={u}
                        style={[styles.pickerChip, customUnit === u && styles.pickerChipActive]}
                        onPress={() => setCustomUnit(u)}
                      >
                        <Text style={[styles.pickerChipText, customUnit === u && styles.pickerChipTextActive]}>
                          {u}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>

                  <Text style={styles.formLabel}>Timing</Text>
                  <View style={styles.timingGrid}>
                    {TIMING_OPTIONS.map(t => (
                      <TouchableOpacity
                        key={t}
                        style={[styles.pickerChip, customTiming === t && styles.pickerChipActive]}
                        onPress={() => setCustomTiming(t)}
                      >
                        <Text style={[styles.pickerChipText, customTiming === t && styles.pickerChipTextActive]}>
                          {t}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <TouchableOpacity
                    style={[styles.addBtn, addMutation.isPending && styles.addBtnDisabled]}
                    onPress={handleAddCustom}
                    disabled={addMutation.isPending}
                  >
                    {addMutation.isPending ? (
                      <ActivityIndicator color="#000" size="small" />
                    ) : (
                      <Text style={styles.addBtnText}>Add Supplement</Text>
                    )}
                  </TouchableOpacity>
                </ScrollView>
              </KeyboardAvoidingView>
            )}
          </BottomSheetView>
        </BottomSheet>
      </View>
    </GestureHandlerRootView>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  centered: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  heading: {
    fontFamily: 'Inter_700Bold',
    fontSize: 28,
    color: colors.text,
  },
  subheading: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  streakBadge: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
  },
  streakText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    color: colors.text,
  },

  // List
  listContent: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xl,
  },

  // Supplement row
  supplementRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  supplementRowActive: {
    opacity: 0.85,
    transform: [{ scale: 1.02 }],
    borderColor: colors.primary,
  },
  supplementRowDisabled: {
    opacity: 0.5,
  },

  // Drag handle
  dragHandle: {
    paddingRight: spacing.xs,
  },
  dragHandleIcon: {
    fontSize: 18,
    color: colors.textMuted,
  },

  // Supplement info
  supplementInfo: {
    flex: 1,
  },
  supplementName: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
    color: colors.text,
  },
  supplementNameDisabled: {
    color: colors.textMuted,
  },
  supplementMeta: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  disabledHint: {
    color: '#f59e0b',
  },

  // Adequacy badge
  adequacyBadge: {
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  adequacyBadgeText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 10,
    letterSpacing: 0.3,
  },

  // Checkbox
  checkboxBtn: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxCheck: {
    color: '#000',
    fontSize: 14,
    fontFamily: 'Inter_700Bold',
  },
  checkboxUnchecked: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.border,
  },
  checkboxDisabled: {
    borderColor: colors.textMuted,
    opacity: 0.5,
  },

  // Swipe delete
  deleteAction: {
    backgroundColor: '#ef4444',
    justifyContent: 'center',
    alignItems: 'flex-end',
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
    borderRadius: borderRadius.md,
  },
  deleteActionText: {
    fontFamily: 'Inter_600SemiBold',
    color: '#fff',
    fontSize: 14,
  },

  // Add button
  addBtnContainer: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.lg,
  },
  addBtn: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  addBtnDisabled: {
    opacity: 0.6,
  },
  addBtnText: {
    fontFamily: 'Inter_600SemiBold',
    color: '#000',
    fontSize: 15,
  },

  // Empty state
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    gap: spacing.md,
  },
  emptyStateTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 20,
    color: colors.text,
    textAlign: 'center',
  },
  emptyStateBody: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 20,
  },

  // Bottom sheet
  sheetBackground: {
    backgroundColor: colors.surface,
  },
  sheetIndicator: {
    backgroundColor: colors.border,
  },
  sheetContainer: {
    flex: 1,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  sheetTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 18,
    color: colors.text,
    marginBottom: spacing.md,
  },

  // Search
  searchContainer: {
    marginBottom: spacing.sm,
  },
  searchInput: {
    fontFamily: 'Inter_400Regular',
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    fontSize: 15,
    color: colors.text,
  },

  // Sheet scroll & library
  sheetScroll: {
    flex: 1,
  },
  sectionHeader: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  libraryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm + 2,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  libraryItemLeft: {
    flex: 1,
    marginRight: spacing.sm,
  },
  libraryItemName: {
    fontFamily: 'Inter_400Regular',
    fontSize: 15,
    color: colors.text,
  },
  libraryItemMeta: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  addedBadge: {
    backgroundColor: colors.primary + '22',
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  addedBadgeText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11,
    color: colors.primary,
  },
  noResults: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.xl,
  },
  createCustomBtn: {
    paddingVertical: spacing.lg,
    alignItems: 'center',
  },
  createCustomText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
    color: colors.primary,
  },

  // Custom form
  customForm: {
    flex: 1,
  },
  backBtn: {
    marginBottom: spacing.md,
  },
  backBtnText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: colors.primary,
  },
  formLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: spacing.xs,
    marginTop: spacing.md,
  },
  formInput: {
    fontFamily: 'Inter_400Regular',
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    fontSize: 15,
    color: colors.text,
  },
  pickerRow: {
    flexDirection: 'row',
  },
  timingGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  pickerChip: {
    backgroundColor: colors.background,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    marginRight: spacing.sm,
    marginBottom: spacing.xs,
  },
  pickerChipActive: {
    backgroundColor: colors.primary + '22',
    borderColor: colors.primary,
  },
  pickerChipText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: colors.textMuted,
  },
  pickerChipTextActive: {
    color: colors.primary,
    fontFamily: 'Inter_600SemiBold',
  },
});

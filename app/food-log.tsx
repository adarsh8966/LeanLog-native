import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Pressable,
  FlatList,
  ActivityIndicator,
  Platform,
  Alert,
} from 'react-native';
import { router } from 'expo-router';
import { Swipeable } from 'react-native-gesture-handler';
import {
  BottomSheetModal,
  BottomSheetScrollView,
  BottomSheetBackdrop,
} from '@gorhom/bottom-sheet';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { colors, spacing, borderRadius } from '../lib/theme';
import { searchFood } from '../lib/foodSearch';
import type { FoodResult, FoodSource } from '../types/food';

// ─── Types ────────────────────────────────────────────────────────────────────

type MealLog = {
  id: string;
  date: string;
  name: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  meal_type: string;
  logged_at: string;
  food_source?: string | null;
  fatsecret_food_id?: string | null;
};

type UserProfile = {
  calorie_goal?: number | null;
  protein_goal?: number | null;
  carbs_goal?: number | null;
  fat_goal?: number | null;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const MEAL_TYPES = ['Breakfast', 'Lunch', 'Dinner', 'Snack', 'Late Night'] as const;
type MealType = (typeof MEAL_TYPES)[number];

const SOURCE_CONFIG: Record<FoodSource, { label: string; color: string; bg: string }> = {
  fatsecret:     { label: 'FS',   color: '#22c55e', bg: '#052e16' },
  usda:          { label: 'USDA', color: '#60a5fa', bg: '#0c1a2e' },
  openfoodfacts: { label: 'OFF',  color: '#fb923c', bg: '#1c0800' },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getLocalDateString(date: Date): string {
  return date.toLocaleDateString('en-CA');
}

function formatDateDisplay(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function defaultMealType(): MealType {
  const h = new Date().getHours();
  if (h < 10) return 'Breakfast';
  if (h < 13) return 'Lunch';
  if (h < 17) return 'Snack';
  if (h < 20) return 'Dinner';
  return 'Late Night';
}

// ─── SourceBadge ─────────────────────────────────────────────────────────────

function SourceBadge({ source }: { source: FoodSource }) {
  const cfg = SOURCE_CONFIG[source] ?? SOURCE_CONFIG.fatsecret;
  return (
    <View style={[styles.badge, { backgroundColor: cfg.bg }]}>
      <Text style={[styles.badgeText, { color: cfg.color }]}>{cfg.label}</Text>
    </View>
  );
}

// ─── MacroBar ─────────────────────────────────────────────────────────────────

function MacroBar({ logs, profile }: { logs: MealLog[]; profile?: UserProfile | null }) {
  const totalCal = logs.reduce((s, m) => s + (m.calories || 0), 0);
  const totalP   = logs.reduce((s, m) => s + (m.protein_g || 0), 0);
  const totalC   = logs.reduce((s, m) => s + (m.carbs_g || 0), 0);
  const totalF   = logs.reduce((s, m) => s + (m.fat_g || 0), 0);
  const calGoal  = profile?.calorie_goal || 2000;
  const remaining = Math.max(calGoal - Math.round(totalCal), 0);

  return (
    <View style={styles.macroBar}>
      <View style={styles.macroBarCalRow}>
        <Text style={styles.macroBarRemaining}>{remaining}</Text>
        <Text style={styles.macroBarCalLabel}> kcal remaining</Text>
        <Text style={styles.macroBarCalTotal}> of {calGoal}</Text>
      </View>
      <View style={styles.macroBarPills}>
        <View style={styles.macroPill}>
          <Text style={styles.macroPillLetter}>P</Text>
          <Text style={styles.macroPillValue}>{Math.round(totalP)}g</Text>
          {profile?.protein_goal ? (
            <Text style={styles.macroPillGoal}>/{profile.protein_goal}g</Text>
          ) : null}
        </View>
        <View style={styles.macroPill}>
          <Text style={styles.macroPillLetter}>C</Text>
          <Text style={styles.macroPillValue}>{Math.round(totalC)}g</Text>
          {profile?.carbs_goal ? (
            <Text style={styles.macroPillGoal}>/{profile.carbs_goal}g</Text>
          ) : null}
        </View>
        <View style={styles.macroPill}>
          <Text style={styles.macroPillLetter}>F</Text>
          <Text style={styles.macroPillValue}>{Math.round(totalF)}g</Text>
          {profile?.fat_goal ? (
            <Text style={styles.macroPillGoal}>/{profile.fat_goal}g</Text>
          ) : null}
        </View>
      </View>
    </View>
  );
}

// ─── MealItemRow ──────────────────────────────────────────────────────────────

function MealItemRow({ item, onDelete }: { item: MealLog; onDelete: () => void }) {
  function renderRightActions() {
    return (
      <Pressable style={styles.deleteAction} onPress={onDelete}>
        <Ionicons name="trash-outline" size={18} color="#fff" />
        <Text style={styles.deleteActionText}>Delete</Text>
      </Pressable>
    );
  }

  return (
    <Swipeable renderRightActions={renderRightActions} overshootRight={false}>
      <View style={styles.mealItemRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.mealItemName} numberOfLines={1}>{item.name}</Text>
          <View style={styles.mealItemMacroRow}>
            <Text style={styles.mealItemMacro}>P {Math.round(item.protein_g)}g</Text>
            <Text style={styles.mealItemDot}>·</Text>
            <Text style={styles.mealItemMacro}>C {Math.round(item.carbs_g)}g</Text>
            <Text style={styles.mealItemDot}>·</Text>
            <Text style={styles.mealItemMacro}>F {Math.round(item.fat_g)}g</Text>
          </View>
        </View>
        <Text style={styles.mealItemCal}>{Math.round(item.calories)} kcal</Text>
      </View>
    </Swipeable>
  );
}

// ─── MealSection ─────────────────────────────────────────────────────────────

function MealSection({
  title,
  items,
  onDelete,
}: {
  title: string;
  items: MealLog[];
  onDelete: (id: string) => void;
}) {
  const sectionCal = items.reduce((s, m) => s + (m.calories || 0), 0);

  return (
    <View style={styles.mealSection}>
      <View style={styles.mealSectionHeader}>
        <Text style={styles.mealSectionTitle}>{title}</Text>
        {sectionCal > 0 && (
          <Text style={styles.mealSectionCal}>{Math.round(sectionCal)} kcal</Text>
        )}
      </View>
      {items.length === 0 ? (
        <Text style={styles.mealSectionEmpty}>Nothing logged</Text>
      ) : (
        items.map(item => (
          <MealItemRow key={item.id} item={item} onDelete={() => onDelete(item.id)} />
        ))
      )}
    </View>
  );
}

// ─── SearchResultRow ──────────────────────────────────────────────────────────

function SearchResultRow({ item, onPress }: { item: FoodResult; onPress: () => void }) {
  return (
    <Pressable style={styles.resultRow} onPress={onPress}>
      <View style={{ flex: 1 }}>
        <Text style={styles.resultName} numberOfLines={2}>{item.name}</Text>
        <View style={styles.resultMeta}>
          <SourceBadge source={item.source} />
          <Text style={styles.resultMacro}>
            {Math.round(item.calories100g)} kcal · P {Math.round(item.protein100g)}g /100g
          </Text>
        </View>
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
    </Pressable>
  );
}

// ─── FoodDetailSheet ──────────────────────────────────────────────────────────

function FoodDetailSheet({
  sheetRef,
  food,
  uid,
  selectedDate,
  onSuccess,
}: {
  sheetRef: React.RefObject<BottomSheetModal>;
  food: FoodResult | null;
  uid: string | undefined;
  selectedDate: string;
  onSuccess: () => void;
}) {
  const queryClient = useQueryClient();
  const today = getLocalDateString(new Date());

  const [weightG, setWeightG]       = useState(100);
  const [customInput, setCustomInput] = useState('');
  const [mealType, setMealType]     = useState<MealType>(defaultMealType());

  const snapPoints    = useMemo(() => ['60%', '92%'], []);
  const renderBackdrop = useCallback(
    (props: any) => (
      <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} />
    ),
    [],
  );

  // Reset state whenever the selected food changes
  useEffect(() => {
    if (food) {
      setWeightG(food.servingG > 0 ? Math.round(food.servingG) : 100);
      setCustomInput('');
      setMealType(defaultMealType());
    }
  }, [food?.id]);

  // Serving chips
  const hasServing = (food?.servingG ?? 0) > 0;
  const chips = food
    ? hasServing
      ? [0.5, 1, 1.5, 2].map(mult => ({
          label:   mult === 1 ? '1×' : `${mult}×`,
          subLabel: `${Math.round(food.servingG * mult)}g`,
          value:    Math.round(food.servingG * mult),
        }))
      : [
          { label: '50g',  subLabel: null, value: 50  },
          { label: '100g', subLabel: null, value: 100 },
          { label: '150g', subLabel: null, value: 150 },
          { label: '200g', subLabel: null, value: 200 },
        ]
    : [];

  // Live macros
  const factor      = weightG / 100;
  const calcCal     = food ? Math.round(factor * food.calories100g) : 0;
  const calcProtein = food ? Math.round(factor * food.protein100g * 10) / 10 : 0;
  const calcCarbs   = food ? Math.round(factor * food.carbs100g   * 10) / 10 : 0;
  const calcFat     = food ? Math.round(factor * food.fat100g     * 10) / 10 : 0;

  const addMutation = useMutation({
    mutationFn: async () => {
      if (!food || !uid) throw new Error('Missing data');
      const { error } = await supabase.from('meal_logs').insert({
        user_id:              uid,
        date:                 selectedDate,
        name:                 `${food.name} (${weightG}g)`,
        calories:             calcCal,
        protein_g:            calcProtein,
        carbs_g:              calcCarbs,
        fat_g:                calcFat,
        meal_type:            mealType,
        logged_hour:          new Date().getHours(),
        logged_at:            selectedDate === today
                                ? new Date().toISOString()
                                : `${selectedDate}T12:00:00`,
        food_source:          food.source,
        fatsecret_food_id:    food.fatsecretFoodId ?? null,
        fatsecret_serving_id: food.fatsecretServingId ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meal_logs', uid, selectedDate] });
      sheetRef.current?.dismiss();
      onSuccess();
    },
    onError: err => Alert.alert('Error', (err as Error).message),
  });

  return (
    <BottomSheetModal
      ref={sheetRef}
      snapPoints={snapPoints}
      backdropComponent={renderBackdrop}
      backgroundStyle={{ backgroundColor: colors.surface }}
      handleIndicatorStyle={{ backgroundColor: colors.border }}
    >
      <BottomSheetScrollView contentContainerStyle={styles.sheetContent}>
        {food ? (
          <>
            {/* Header */}
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetFoodName} numberOfLines={3}>{food.name}</Text>
              <SourceBadge source={food.source} />
            </View>

            {/* Serving chips */}
            <Text style={styles.sheetLabel}>
              {'Serving size'}
              {hasServing ? `  —  ${food.householdServing}` : ''}
            </Text>
            <View style={styles.chipRow}>
              {chips.map(chip => {
                const active = weightG === chip.value;
                return (
                  <Pressable
                    key={chip.value}
                    style={[styles.chip, active && styles.chipActive]}
                    onPress={() => {
                      setWeightG(chip.value);
                      setCustomInput('');
                    }}
                  >
                    <Text style={[styles.chipLabel, active && styles.chipLabelActive]}>
                      {chip.label}
                    </Text>
                    {chip.subLabel ? (
                      <Text style={[styles.chipSub, active && styles.chipSubActive]}>
                        {chip.subLabel}
                      </Text>
                    ) : null}
                  </Pressable>
                );
              })}
            </View>

            {/* Custom weight input */}
            <View style={styles.customRow}>
              <TextInput
                style={styles.customInput}
                value={customInput}
                onChangeText={v => {
                  setCustomInput(v);
                  const n = parseFloat(v);
                  if (!isNaN(n) && n > 0) setWeightG(Math.round(n));
                }}
                placeholder="Custom grams"
                placeholderTextColor={colors.textMuted}
                keyboardType="decimal-pad"
              />
              <Text style={styles.customUnit}>g</Text>
            </View>

            {/* Live macro grid */}
            <View style={styles.sheetMacroGrid}>
              <View style={[styles.sheetMacroCard, { borderColor: colors.primary }]}>
                <Text style={[styles.sheetMacroVal, { color: colors.primary }]}>{calcCal}</Text>
                <Text style={styles.sheetMacroLbl}>kcal</Text>
              </View>
              <View style={styles.sheetMacroCard}>
                <Text style={styles.sheetMacroVal}>{calcProtein}g</Text>
                <Text style={styles.sheetMacroLbl}>Protein</Text>
              </View>
              <View style={styles.sheetMacroCard}>
                <Text style={styles.sheetMacroVal}>{calcCarbs}g</Text>
                <Text style={styles.sheetMacroLbl}>Carbs</Text>
              </View>
              <View style={styles.sheetMacroCard}>
                <Text style={styles.sheetMacroVal}>{calcFat}g</Text>
                <Text style={styles.sheetMacroLbl}>Fat</Text>
              </View>
            </View>

            {/* Meal type */}
            <Text style={styles.sheetLabel}>Meal</Text>
            <View style={styles.mealTypeRow}>
              {MEAL_TYPES.map(type => {
                const active = mealType === type;
                return (
                  <Pressable
                    key={type}
                    style={[styles.mealTypeChip, active && styles.mealTypeChipActive]}
                    onPress={() => setMealType(type)}
                  >
                    <Text style={[styles.mealTypeText, active && styles.mealTypeTextActive]}>
                      {type}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* Add to log */}
            <Pressable
              style={[styles.addBtn, addMutation.isPending && { opacity: 0.6 }]}
              onPress={() => addMutation.mutate()}
              disabled={addMutation.isPending}
            >
              {addMutation.isPending ? (
                <ActivityIndicator color="#000" size="small" />
              ) : (
                <Text style={styles.addBtnText}>Add to Log</Text>
              )}
            </Pressable>

            <View style={{ height: spacing.xl }} />
          </>
        ) : (
          <View style={{ height: 120 }} />
        )}
      </BottomSheetScrollView>
    </BottomSheetModal>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function FoodLogScreen() {
  const today       = getLocalDateString(new Date());
  const queryClient = useQueryClient();

  const [mode, setMode]                 = useState<'log' | 'search'>('log');
  const [selectedDate, setSelectedDate] = useState(today);
  const [searchQuery, setSearchQuery]   = useState('');
  const [searchResults, setSearchResults] = useState<FoodResult[]>([]);
  const [searching, setSearching]       = useState(false);
  const [selectedFood, setSelectedFood] = useState<FoodResult | null>(null);

  const bottomSheetRef = useRef<BottomSheetModal>(null);
  const debounceRef    = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Auth ──────────────────────────────────────────────────────────────────────
  const { data: user } = useQuery({
    queryKey: ['auth_user'],
    queryFn:  async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      return user;
    },
  });
  const uid = user?.id;

  // ── User profile (macro goals) ────────────────────────────────────────────────
  const { data: profile } = useQuery<UserProfile | null>({
    queryKey: ['user_profile', uid],
    enabled:  !!uid,
    queryFn:  async () => {
      const { data } = await supabase
        .from('user_profiles')
        .select('calorie_goal, protein_goal, carbs_goal, fat_goal')
        .eq('user_id', uid!)
        .maybeSingle();
      return data;
    },
  });

  // ── Meal logs ─────────────────────────────────────────────────────────────────
  const { data: mealLogs = [], isLoading: logsLoading } = useQuery<MealLog[]>({
    queryKey: ['meal_logs', uid, selectedDate],
    enabled:  !!uid,
    queryFn:  async () => {
      const { data, error } = await supabase
        .from('meal_logs')
        .select('*')
        .eq('user_id', uid!)
        .eq('date', selectedDate)
        .order('logged_at', { ascending: true });
      if (error) throw error;
      return data as MealLog[];
    },
  });

  // ── Recent (search mode) ───────────────────────────────────────────────────────
  const { data: recentLogs = [] } = useQuery<MealLog[]>({
    queryKey: ['recent_foods', uid],
    enabled:  !!uid && mode === 'search',
    queryFn:  async () => {
      const { data } = await supabase
        .from('meal_logs')
        .select('id, name, calories, protein_g, carbs_g, fat_g, food_source, fatsecret_food_id, logged_at')
        .eq('user_id', uid!)
        .order('logged_at', { ascending: false })
        .limit(60);
      if (!data) return [];
      const seen = new Set<string>();
      return data
        .filter(item => {
          const key = item.name.replace(/ \(\d+g\)$/, '');
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        })
        .slice(0, 10) as MealLog[];
    },
  });

  // ── Delete ────────────────────────────────────────────────────────────────────
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('meal_logs').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['meal_logs', uid, selectedDate] }),
  });

  // ── Date navigation ───────────────────────────────────────────────────────────
  function navigateDay(dir: -1 | 1) {
    const [y, m, d] = selectedDate.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    date.setDate(date.getDate() + dir);
    setSelectedDate(getLocalDateString(date));
  }

  // ── Debounced search ──────────────────────────────────────────────────────────
  function handleSearchChange(text: string) {
    setSearchQuery(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!text.trim()) { setSearchResults([]); setSearching(false); return; }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        setSearchResults(await searchFood(text.trim()));
      } finally {
        setSearching(false);
      }
    }, 400);
  }

  // ── Open detail sheet ─────────────────────────────────────────────────────────
  function openFoodDetail(food: FoodResult) {
    setSelectedFood(food);
    bottomSheetRef.current?.present();
  }

  // ── Group logs by meal type ───────────────────────────────────────────────────
  const mealsByType = useMemo(() => {
    const map: Record<string, MealLog[]> = {};
    for (const t of MEAL_TYPES) map[t] = [];
    for (const log of mealLogs) {
      const bucket = MEAL_TYPES.includes(log.meal_type as MealType) ? log.meal_type : 'Snack';
      map[bucket].push(log);
    }
    return map;
  }, [mealLogs]);

  // ── Helpers for recent row ────────────────────────────────────────────────────
  function recentToFoodResult(item: MealLog): FoodResult {
    // Parse the (Xg) suffix if present to recover serving size for per-100g conversion
    const gramMatch = item.name.match(/\((\d+)g\)$/);
    const servingG  = gramMatch ? parseInt(gramMatch[1]) : 100;
    const factor100 = 100 / servingG;
    const cleanName = item.name.replace(/ \(\d+g\)$/, '');
    return {
      id:              item.fatsecret_food_id || item.id,
      name:            cleanName,
      calories100g:    Math.round(item.calories  * factor100),
      protein100g:     Math.round(item.protein_g * factor100 * 10) / 10,
      carbs100g:       Math.round(item.carbs_g   * factor100 * 10) / 10,
      fat100g:         Math.round(item.fat_g     * factor100 * 10) / 10,
      servingG,
      householdServing: `${servingG}g`,
      source:          (item.food_source as FoodSource) || 'fatsecret',
      fatsecretFoodId: item.fatsecret_food_id || null,
      fatsecretServingId: null,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <View style={styles.container}>

      {mode === 'log' ? (
        <>
          {/* ── Log header ── */}
          <View style={styles.header}>
            <Pressable style={styles.iconBtn} onPress={() => router.back()}>
              <Ionicons name="arrow-back" size={24} color={colors.text} />
            </Pressable>

            <View style={styles.dateRow}>
              <Pressable style={styles.iconBtn} onPress={() => navigateDay(-1)}>
                <Ionicons name="chevron-back" size={20} color={colors.text} />
              </Pressable>
              <Text style={styles.dateTitle}>{formatDateDisplay(selectedDate)}</Text>
              <Pressable
                style={styles.iconBtn}
                onPress={() => navigateDay(1)}
                disabled={selectedDate >= today}
              >
                <Ionicons
                  name="chevron-forward"
                  size={20}
                  color={selectedDate >= today ? colors.border : colors.text}
                />
              </Pressable>
            </View>

            {/* Spacer to balance back arrow */}
            <View style={{ width: 40 }} />
          </View>

          {/* ── Macro bar ── */}
          <MacroBar logs={mealLogs} profile={profile} />

          {/* ── Meal sections ── */}
          {logsLoading ? (
            <View style={styles.centered}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : (
            <FlatList
              data={MEAL_TYPES}
              keyExtractor={t => t}
              renderItem={({ item: type }) => (
                <MealSection
                  title={type}
                  items={mealsByType[type] ?? []}
                  onDelete={id => deleteMutation.mutate(id)}
                />
              )}
              contentContainerStyle={styles.listContent}
              keyboardShouldPersistTaps="handled"
            />
          )}

          {/* ── FAB ── */}
          <Pressable style={styles.fab} onPress={() => setMode('search')}>
            <Ionicons name="add" size={30} color="#000" />
          </Pressable>
        </>
      ) : (
        <>
          {/* ── Search header ── */}
          <View style={styles.header}>
            <Pressable
              style={styles.iconBtn}
              onPress={() => {
                setMode('log');
                setSearchQuery('');
                setSearchResults([]);
                if (debounceRef.current) clearTimeout(debounceRef.current);
              }}
            >
              <Ionicons name="arrow-back" size={24} color={colors.text} />
            </Pressable>
            <TextInput
              style={styles.searchInput}
              value={searchQuery}
              onChangeText={handleSearchChange}
              placeholder="Search foods..."
              placeholderTextColor={colors.textMuted}
              autoFocus
              returnKeyType="search"
              clearButtonMode="while-editing"
            />
          </View>

          {searching ? (
            <View style={styles.centered}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : searchQuery.trim() === '' ? (
            /* ── Recent ── */
            <FlatList
              data={recentLogs}
              keyExtractor={item => item.id}
              ListHeaderComponent={
                recentLogs.length > 0
                  ? <Text style={styles.sectionHeader}>Recent</Text>
                  : null
              }
              ListEmptyComponent={
                <Text style={styles.emptyText}>Start typing to search foods</Text>
              }
              renderItem={({ item }) => (
                <Pressable
                  style={styles.resultRow}
                  onPress={() => openFoodDetail(recentToFoodResult(item))}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.resultName} numberOfLines={1}>
                      {item.name.replace(/ \(\d+g\)$/, '')}
                    </Text>
                    <Text style={styles.resultMacro}>
                      {Math.round(item.calories)} kcal · P {Math.round(item.protein_g)}g
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
                </Pressable>
              )}
              contentContainerStyle={styles.listContent}
              keyboardShouldPersistTaps="handled"
            />
          ) : (
            /* ── Search results ── */
            <FlatList
              data={searchResults}
              keyExtractor={item => `${item.source}-${item.id}`}
              ListEmptyComponent={
                <Text style={styles.emptyText}>No results found</Text>
              }
              renderItem={({ item }) => (
                <SearchResultRow item={item} onPress={() => openFoodDetail(item)} />
              )}
              contentContainerStyle={styles.listContent}
              keyboardShouldPersistTaps="handled"
            />
          )}
        </>
      )}

      {/* ── Bottom sheet (always mounted) ── */}
      <FoodDetailSheet
        sheetRef={bottomSheetRef}
        food={selectedFood}
        uid={uid}
        selectedDate={selectedDate}
        onSuccess={() => setMode('log')}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const TOP_INSET = Platform.OS === 'ios' ? 54 : 28;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingTop: TOP_INSET,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // ── Header ──────────────────────────────────────────────────────────────────
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: spacing.sm,
  },
  iconBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dateRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  dateTitle: {
    fontSize: 17,
    fontFamily: 'Inter_600SemiBold',
    color: colors.text,
    minWidth: 120,
    textAlign: 'center',
  },
  searchInput: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: colors.text,
    fontFamily: 'Inter_400Regular',
    fontSize: 15,
  },

  // ── Macro bar ────────────────────────────────────────────────────────────────
  macroBar: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  macroBarCalRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: spacing.sm,
  },
  macroBarRemaining: {
    fontSize: 22,
    fontFamily: 'Inter_700Bold',
    color: colors.primary,
  },
  macroBarCalLabel: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    color: colors.text,
  },
  macroBarCalTotal: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    color: colors.textMuted,
  },
  macroBarPills: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  macroPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    gap: 3,
  },
  macroPillLetter: {
    fontSize: 11,
    fontFamily: 'Inter_600SemiBold',
    color: colors.textMuted,
  },
  macroPillValue: {
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
    color: colors.text,
  },
  macroPillGoal: {
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
    color: colors.textMuted,
  },

  // ── List ─────────────────────────────────────────────────────────────────────
  listContent: {
    paddingBottom: 100,
  },

  // ── Meal sections ────────────────────────────────────────────────────────────
  mealSection: {
    marginTop: spacing.md,
    marginHorizontal: spacing.md,
  },
  mealSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    marginBottom: spacing.xs,
  },
  mealSectionTitle: {
    fontSize: 11,
    fontFamily: 'Inter_600SemiBold',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  mealSectionCal: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    color: colors.textMuted,
  },
  mealSectionEmpty: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    color: colors.border,
    paddingVertical: spacing.sm,
  },

  // ── Meal item ────────────────────────────────────────────────────────────────
  mealItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    paddingVertical: spacing.sm + 2,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  mealItemName: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    color: colors.text,
    marginBottom: 2,
  },
  mealItemMacroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  mealItemMacro: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    color: colors.textMuted,
  },
  mealItemDot: {
    fontSize: 12,
    color: colors.border,
  },
  mealItemCal: {
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
    color: colors.text,
    marginLeft: spacing.sm,
  },
  deleteAction: {
    backgroundColor: '#dc2626',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    gap: 4,
  },
  deleteActionText: {
    color: '#fff',
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
  },

  // ── Search / result rows ─────────────────────────────────────────────────────
  sectionHeader: {
    fontSize: 11,
    fontFamily: 'Inter_600SemiBold',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: spacing.sm,
  },
  resultName: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    color: colors.text,
    marginBottom: 4,
  },
  resultMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  resultMacro: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    color: colors.textMuted,
  },
  emptyText: {
    textAlign: 'center',
    color: colors.textMuted,
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    paddingTop: spacing.xl,
  },

  // ── Source badge ─────────────────────────────────────────────────────────────
  badge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  badgeText: {
    fontSize: 10,
    fontFamily: 'Inter_600SemiBold',
  },

  // ── FAB ──────────────────────────────────────────────────────────────────────
  fab: {
    position: 'absolute',
    bottom: 32,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },

  // ── Bottom sheet ─────────────────────────────────────────────────────────────
  sheetContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xl,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  sheetFoodName: {
    flex: 1,
    fontSize: 18,
    fontFamily: 'Inter_700Bold',
    color: colors.text,
  },
  sheetLabel: {
    fontSize: 11,
    fontFamily: 'Inter_600SemiBold',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  chipRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    alignItems: 'center',
    minWidth: 60,
  },
  chipActive: {
    borderColor: colors.primary,
    backgroundColor: '#052e16',
  },
  chipLabel: {
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
    color: colors.text,
  },
  chipLabelActive: {
    color: colors.primary,
  },
  chipSub: {
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
    color: colors.textMuted,
    marginTop: 1,
  },
  chipSubActive: {
    color: colors.primary,
  },
  customRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.sm,
    gap: spacing.sm,
  },
  customInput: {
    flex: 1,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: colors.text,
    fontFamily: 'Inter_400Regular',
    fontSize: 15,
  },
  customUnit: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    color: colors.textMuted,
  },
  sheetMacroGrid: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  sheetMacroCard: {
    flex: 1,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.sm,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  sheetMacroVal: {
    fontSize: 16,
    fontFamily: 'Inter_700Bold',
    color: colors.text,
  },
  sheetMacroLbl: {
    fontSize: 10,
    fontFamily: 'Inter_400Regular',
    color: colors.textMuted,
    marginTop: 2,
  },
  mealTypeRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  mealTypeChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  mealTypeChipActive: {
    borderColor: colors.primary,
    backgroundColor: '#052e16',
  },
  mealTypeText: {
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
    color: colors.text,
  },
  mealTypeTextActive: {
    color: colors.primary,
  },
  addBtn: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md + 2,
    alignItems: 'center',
    marginTop: spacing.lg,
  },
  addBtnText: {
    fontSize: 16,
    fontFamily: 'Inter_700Bold',
    color: '#000',
  },
});

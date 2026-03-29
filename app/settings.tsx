import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Modal,
  Alert,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { router } from 'expo-router';
import { Picker } from '@react-native-picker/picker';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  colors,
  spacing,
  borderRadius,
  THEME_COLORS,
  DIET_PREFERENCES,
  GOAL_AGGRESSIVENESS,
  ACTIVITY_MULTIPLIERS,
} from '../lib/theme';
import { calculatePlan } from '../lib/planEngine';

const SCREEN_HEIGHT = Dimensions.get('window').height;
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!;

// ── Types ─────────────────────────────────────────────────────────────────────

type UserProfile = {
  user_id?: string;
  username?: string;
  age?: number;
  sex?: string;
  theme_color?: string;
  unit_system?: string;
  calorie_goal?: number;
  protein_goal?: number;
  carbs_goal?: number;
  fat_goal?: number;
  water_goal_oz?: number;
  height_inches?: number;
  current_weight_lbs?: number;
  coaching_enabled?: boolean;
  diet_preference?: string;
  goal_aggressiveness?: string;
  activity_level?: string;
  goal?: string;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function inchesToFtIn(totalIn: number): { ft: number; inches: number } {
  const ft = Math.floor(totalIn / 12);
  return { ft, inches: Math.round(totalIn % 12) };
}

function ftInToInches(ft: number, inches: number): number {
  return ft * 12 + inches;
}

function lbsToKg(lbs: number): number {
  return Math.round(lbs * 0.453592 * 10) / 10;
}

function kgToLbs(kg: number): number {
  return Math.round(kg * 2.20462 * 10) / 10;
}

function inchesToCm(inches: number): number {
  return Math.round(inches * 2.54);
}

function cmToInches(cm: number): number {
  return Math.round((cm / 2.54) * 10) / 10;
}

function ozToMl(oz: number): number {
  return Math.round(oz * 29.5735);
}

function mlToOz(ml: number): number {
  return Math.round(ml / 29.5735);
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function Settings() {
  const qc = useQueryClient();

  // ── 27 local state variables ──────────────────────────────────────────────

  // Profile
  const [name, setName]             = useState('');
  const [age, setAge]               = useState('');
  const [sex, setSex]               = useState<'male' | 'female'>('male');
  const [themeColor, setThemeColor] = useState(colors.primary);

  // Unit system
  const [unitSystem, setUnitSystem] = useState<'imperial' | 'metric'>('imperial');

  // Weight / height
  const [weightInput, setWeightInput]   = useState('');
  const [heightFt, setHeightFt]         = useState(5);
  const [heightIn, setHeightIn]         = useState(10);
  const [heightCm, setHeightCm]         = useState('178');

  // Goals
  const [calories, setCalories] = useState('2000');
  const [protein, setProtein]   = useState('150');
  const [carbs, setCarbs]       = useState('200');
  const [fat, setFat]           = useState('65');

  // Water
  const [waterGoalInput, setWaterGoalInput] = useState('64');

  // Saving flags
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingTheme, setSavingTheme]     = useState(false);
  const [savingGoals, setSavingGoals]     = useState(false);
  const [savingWater, setSavingWater]     = useState(false);

  // UI state
  const [savedMsg, setSavedMsg]               = useState<string | null>(null);
  const [coachingEnabled, setCoachingEnabled] = useState(false);
  const [dietPref, setDietPref]               = useState<keyof typeof DIET_PREFERENCES>('standard');
  const [aggressiveness, setAggressiveness]   = useState<keyof typeof GOAL_AGGRESSIVENESS>('moderate');

  // Modal / sheet state
  const [showDietSheet, setShowDietSheet]   = useState(false);
  const [pendingDiet, setPendingDiet]       = useState<keyof typeof DIET_PREFERENCES | null>(null);
  const [pendingDietPlan, setPendingDietPlan] = useState<ReturnType<typeof calculatePlan> | null>(null);
  const [showAggSheet, setShowAggSheet]     = useState(false);
  const [showCoachInfo, setShowCoachInfo]   = useState(false);
  const [recalcLoading, setRecalcLoading]   = useState(false);
  const [recalcResult, setRecalcResult]     = useState<ReturnType<typeof calculatePlan> | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [deleteError, setDeleteError]       = useState('');

  // Bottle preference (AsyncStorage)
  const [selectedBottleOz, setSelectedBottleOz] = useState<number | null>(null);

  // auto-clear saved message
  useEffect(() => {
    if (!savedMsg) return;
    const t = setTimeout(() => setSavedMsg(null), 2500);
    return () => clearTimeout(t);
  }, [savedMsg]);

  // load bottle preference from AsyncStorage
  useEffect(() => {
    AsyncStorage.getItem('defaultBottleOz').then(val => {
      if (val) setSelectedBottleOz(Number(val));
    });
  }, []);

  // ── Auth + queries ────────────────────────────────────────────────────────

  const { data: user } = useQuery({
    queryKey: ['auth_user'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      return user;
    },
  });
  const uid = user?.id;

  const { data: profile } = useQuery<UserProfile | null>({
    queryKey: ['user_profile', uid],
    enabled: !!uid,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('user_id', uid!)
        .maybeSingle();
      if (error) throw error;
      return data as UserProfile | null;
    },
  });

  // Coaching meta (unread dot)
  const { data: latestCoachingMeta } = useQuery<{ id: string; week_start: string; read_at: string | null } | null>({
    queryKey: ['coaching_reports', uid],
    enabled: !!uid,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('weekly_coaching_reports')
        .select('id, week_start, read_at')
        .eq('user_id', uid!)
        .order('week_start', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as { id: string; week_start: string; read_at: string | null } | null;
    },
  });

  // ── useEffect 1: Profile sync ─────────────────────────────────────────────

  useEffect(() => {
    if (!profile) return;
    const isMetric = profile.unit_system === 'metric';

    setName(profile.username ?? '');
    setAge(profile.age != null ? String(profile.age) : '');
    setSex((profile.sex as 'male' | 'female') ?? 'male');
    setThemeColor(profile.theme_color ?? colors.primary);
    setUnitSystem(isMetric ? 'metric' : 'imperial');
    setCoachingEnabled(profile.coaching_enabled ?? false);
    setDietPref((profile.diet_preference as keyof typeof DIET_PREFERENCES) ?? 'standard');
    setAggressiveness((profile.goal_aggressiveness as keyof typeof GOAL_AGGRESSIVENESS) ?? 'moderate');

    if (profile.current_weight_lbs != null) {
      setWeightInput(isMetric
        ? String(lbsToKg(profile.current_weight_lbs))
        : String(profile.current_weight_lbs));
    }
    if (profile.height_inches != null) {
      if (isMetric) {
        setHeightCm(String(inchesToCm(profile.height_inches)));
      } else {
        const { ft, inches } = inchesToFtIn(profile.height_inches);
        setHeightFt(ft);
        setHeightIn(inches);
      }
    }

    if (profile.calorie_goal != null) setCalories(String(profile.calorie_goal));
    if (profile.protein_goal != null) setProtein(String(profile.protein_goal));
    if (profile.carbs_goal != null)   setCarbs(String(profile.carbs_goal));
    if (profile.fat_goal != null)     setFat(String(profile.fat_goal));

    if (profile.water_goal_oz != null) {
      setWaterGoalInput(isMetric
        ? String(ozToMl(profile.water_goal_oz))
        : String(profile.water_goal_oz));
    }
  }, [profile]);

  // ── useEffect 2: Unit conversion on system change ─────────────────────────

  const prevUnitRef = { current: unitSystem };
  useEffect(() => {
    const prev = prevUnitRef.current;
    if (prev === unitSystem) return;
    prevUnitRef.current = unitSystem;

    // Convert weight
    const wNum = parseFloat(weightInput);
    if (!isNaN(wNum)) {
      setWeightInput(unitSystem === 'metric'
        ? String(lbsToKg(wNum))
        : String(kgToLbs(wNum)));
    }

    // Convert water goal
    const waterNum = parseFloat(waterGoalInput);
    if (!isNaN(waterNum)) {
      setWaterGoalInput(unitSystem === 'metric'
        ? String(ozToMl(waterNum))
        : String(mlToOz(waterNum)));
    }

    // Convert height
    if (unitSystem === 'metric') {
      setHeightCm(String(inchesToCm(ftInToInches(heightFt, heightIn))));
    } else {
      const totalIn = cmToInches(parseFloat(heightCm) || 0);
      const { ft, inches } = inchesToFtIn(totalIn);
      setHeightFt(ft);
      setHeightIn(inches);
    }
  }, [unitSystem]);

  // ── Mutations ─────────────────────────────────────────────────────────────

  const invalidateProfile = useCallback(() => {
    qc.invalidateQueries({ queryKey: ['user_profile', uid] });
  }, [qc, uid]);

  const saveProfileMutation = useMutation({
    mutationFn: async () => {
      if (!uid) throw new Error('Not authenticated');
      const isMetric = unitSystem === 'metric';
      const wNum = parseFloat(weightInput);
      const weightLbs = isNaN(wNum) ? undefined
        : isMetric ? kgToLbs(wNum) : wNum;

      let heightInchesVal: number | undefined;
      if (isMetric) {
        const cmNum = parseFloat(heightCm);
        heightInchesVal = isNaN(cmNum) ? undefined : cmToInches(cmNum);
      } else {
        heightInchesVal = ftInToInches(heightFt, heightIn);
      }

      const { error } = await supabase
        .from('user_profiles')
        .upsert({
          user_id: uid,
          username: name.trim() || undefined,
          age: age ? parseInt(age, 10) : undefined,
          sex,
          current_weight_lbs: weightLbs,
          height_inches: heightInchesVal,
          unit_system: unitSystem,
        }, { onConflict: 'user_id' });
      if (error) throw error;
    },
    onSuccess: () => {
      setSavedMsg('Profile saved!');
      invalidateProfile();
    },
    onError: (err: Error) => Alert.alert('Error', err.message),
  });

  const saveGoalsMutation = useMutation({
    mutationFn: async () => {
      if (!uid) throw new Error('Not authenticated');
      const { error } = await supabase
        .from('user_profiles')
        .update({
          calorie_goal: parseInt(calories, 10) || undefined,
          protein_goal: parseInt(protein, 10) || undefined,
          carbs_goal:   parseInt(carbs, 10)   || undefined,
          fat_goal:     parseInt(fat, 10)     || undefined,
        })
        .eq('user_id', uid);
      if (error) throw error;
    },
    onSuccess: () => {
      setSavedMsg('Goals saved!');
      invalidateProfile();
    },
    onError: (err: Error) => Alert.alert('Error', err.message),
  });

  const saveThemeMutation = useMutation({
    mutationFn: async (hex: string) => {
      if (!uid) throw new Error('Not authenticated');
      const { error } = await supabase
        .from('user_profiles')
        .update({ theme_color: hex })
        .eq('user_id', uid);
      if (error) throw error;
      return hex;
    },
    onSuccess: (hex) => {
      setThemeColor(hex);
      setSavedMsg('Theme updated!');
      invalidateProfile();
    },
    onError: (err: Error) => Alert.alert('Error', err.message),
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      await supabase.auth.signOut();
    },
    onSuccess: () => {
      router.replace('/(auth)/login');
    },
    onError: (err: Error) => Alert.alert('Error', err.message),
  });

  const saveWaterGoalMutation = useMutation({
    mutationFn: async () => {
      if (!uid) throw new Error('Not authenticated');
      const num = parseFloat(waterGoalInput);
      if (isNaN(num)) throw new Error('Invalid water goal');
      const ozVal = unitSystem === 'metric' ? mlToOz(num) : num;
      if (ozVal < 8) throw new Error('Water goal must be at least 8 oz');
      const { error } = await supabase
        .from('user_profiles')
        .update({ water_goal_oz: ozVal })
        .eq('user_id', uid);
      if (error) throw error;
    },
    onSuccess: () => {
      setSavedMsg('Water goal saved!');
      invalidateProfile();
    },
    onError: (err: Error) => Alert.alert('Error', err.message),
  });

  const toggleCoachingMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      if (!uid) throw new Error('Not authenticated');
      const { error } = await supabase
        .from('user_profiles')
        .update({ coaching_enabled: enabled })
        .eq('user_id', uid);
      if (error) throw error;
      return enabled;
    },
    onMutate: (enabled) => {
      // optimistic
      setCoachingEnabled(enabled);
    },
    onError: (err: Error, enabled) => {
      // revert
      setCoachingEnabled(!enabled);
      Alert.alert('Error', err.message);
    },
    onSuccess: () => invalidateProfile(),
  });

  const confirmDietChangeMutation = useMutation({
    mutationFn: async ({
      newDiet,
      plan,
    }: {
      newDiet: keyof typeof DIET_PREFERENCES;
      plan: ReturnType<typeof calculatePlan>;
    }) => {
      if (!uid) throw new Error('Not authenticated');
      const { error: profileErr } = await supabase
        .from('user_profiles')
        .update({
          diet_preference: newDiet,
          calorie_goal: plan.calories,
          protein_goal: plan.protein,
          carbs_goal: plan.carbs,
          fat_goal: plan.fat,
        })
        .eq('user_id', uid);
      if (profileErr) throw profileErr;
      const { error: histErr } = await supabase
        .from('goal_history')
        .insert({
          user_id: uid,
          changed_by: 'user',
          prev_calories: profile?.calorie_goal,
          prev_protein: profile?.protein_goal,
          prev_carbs: profile?.carbs_goal,
          prev_fat: profile?.fat_goal,
          new_calories: plan.calories,
          new_protein: plan.protein,
          new_carbs: plan.carbs,
          new_fat: plan.fat,
          reason: 'diet preference change',
        });
      if (histErr) throw histErr;
    },
    onSuccess: (_data, { newDiet, plan }) => {
      setDietPref(newDiet);
      setCalories(String(plan.calories));
      setProtein(String(plan.protein));
      setCarbs(String(plan.carbs));
      setFat(String(plan.fat));
      setPendingDiet(null);
      setPendingDietPlan(null);
      setSavedMsg('Diet & goals updated!');
      invalidateProfile();
    },
    onError: (err: Error) => Alert.alert('Error', err.message),
  });

  const changeAggressivenessMutation = useMutation({
    mutationFn: async ({
      newAgg,
      plan,
    }: {
      newAgg: keyof typeof GOAL_AGGRESSIVENESS;
      plan: ReturnType<typeof calculatePlan>;
    }) => {
      if (!uid) throw new Error('Not authenticated');
      const { error: profileErr } = await supabase
        .from('user_profiles')
        .update({
          goal_aggressiveness: newAgg,
          calorie_goal: plan.calories,
          protein_goal: plan.protein,
          carbs_goal: plan.carbs,
          fat_goal: plan.fat,
        })
        .eq('user_id', uid);
      if (profileErr) throw profileErr;
      const { error: histErr } = await supabase
        .from('goal_history')
        .insert({
          user_id: uid,
          changed_by: 'user',
          prev_calories: profile?.calorie_goal,
          prev_protein: profile?.protein_goal,
          prev_carbs: profile?.carbs_goal,
          prev_fat: profile?.fat_goal,
          new_calories: plan.calories,
          new_protein: plan.protein,
          new_carbs: plan.carbs,
          new_fat: plan.fat,
          reason: 'goal aggressiveness change',
        });
      if (histErr) throw histErr;
    },
    onSuccess: (_data, { newAgg, plan }) => {
      setAggressiveness(newAgg);
      setCalories(String(plan.calories));
      setProtein(String(plan.protein));
      setCarbs(String(plan.carbs));
      setFat(String(plan.fat));
      setShowAggSheet(false);
      setSavedMsg('Aggressiveness & goals updated!');
      invalidateProfile();
    },
    onError: (err: Error) => Alert.alert('Error', err.message),
  });

  const applyRecalcMutation = useMutation({
    mutationFn: async (plan: ReturnType<typeof calculatePlan>) => {
      if (!uid) throw new Error('Not authenticated');
      const { error: profileErr } = await supabase
        .from('user_profiles')
        .update({
          calorie_goal: plan.calories,
          protein_goal: plan.protein,
          carbs_goal: plan.carbs,
          fat_goal: plan.fat,
        })
        .eq('user_id', uid);
      if (profileErr) throw profileErr;
      const { error: histErr } = await supabase
        .from('goal_history')
        .insert({
          user_id: uid,
          changed_by: 'user',
          prev_calories: profile?.calorie_goal,
          prev_protein: profile?.protein_goal,
          prev_carbs: profile?.carbs_goal,
          prev_fat: profile?.fat_goal,
          new_calories: plan.calories,
          new_protein: plan.protein,
          new_carbs: plan.carbs,
          new_fat: plan.fat,
          reason: 'manual plan recalculation from settings',
        });
      if (histErr) throw histErr;
    },
    onSuccess: (_data, plan) => {
      setCalories(String(plan.calories));
      setProtein(String(plan.protein));
      setCarbs(String(plan.carbs));
      setFat(String(plan.fat));
      setRecalcResult(null);
      setSavedMsg('Plan applied!');
      invalidateProfile();
    },
    onError: (err: Error) => Alert.alert('Error', err.message),
  });

  // ── Delete account ────────────────────────────────────────────────────────

  async function handleDeleteAccount() {
    setDeletingAccount(true);
    setDeleteError('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('No active session');

      await fetch(`${SUPABASE_URL}/functions/v1/delete-account`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      await AsyncStorage.clear();
      await supabase.auth.signOut({ scope: 'global' });
      router.replace('/(auth)/login');
    } catch (e: any) {
      setDeleteError(e?.message ?? 'Something went wrong');
    } finally {
      setDeletingAccount(false);
    }
  }

  // ── recalculateEverything ─────────────────────────────────────────────────

  async function recalculateEverything() {
    if (!uid) return;
    setRecalcLoading(true);
    try {
      const { data: weightRow } = await supabase
        .from('weight_logs')
        .select('weight_lbs')
        .eq('user_id', uid)
        .order('logged_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      const currentWeightLbs =
        weightRow?.weight_lbs ??
        (profile?.current_weight_lbs ?? 0);
      const heightIn = profile?.height_inches ?? ftInToInches(heightFt, heightIn as unknown as number);
      const ageNum   = parseInt(age, 10) || profile?.age || 25;

      const plan = calculatePlan({
        weightLbs: currentWeightLbs,
        heightInches: heightIn,
        age: ageNum,
        sex: (profile?.sex as 'male' | 'female') ?? sex,
        goal: (profile?.goal as any) ?? 'cutting',
        activityLevel: (profile?.activity_level as keyof typeof ACTIVITY_MULTIPLIERS) ?? 'moderately_active',
        aggressiveness,
        dietPreference: dietPref,
      });
      setRecalcResult(plan);
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Could not recalculate');
    } finally {
      setRecalcLoading(false);
    }
  }

  // ── Bottle presets ────────────────────────────────────────────────────────

  const BOTTLE_PRESETS = [
    { label: 'Hydro Flask 32oz', oz: 32 },
    { label: 'Hydro Flask 40oz', oz: 40 },
    { label: 'Stanley 30oz',     oz: 30 },
    { label: 'Stanley 40oz',     oz: 40 },
    { label: 'Standard 500ml',   oz: Math.round(500 / 29.5735) },
  ];

  async function selectBottle(oz: number) {
    setSelectedBottleOz(oz);
    const displayVal = unitSystem === 'metric' ? String(ozToMl(oz)) : String(oz);
    setWaterGoalInput(displayVal);
    await AsyncStorage.setItem('defaultBottleOz', String(oz));
  }

  async function clearBottle() {
    setSelectedBottleOz(null);
    await AsyncStorage.removeItem('defaultBottleOz');
  }

  // ── Derived values ────────────────────────────────────────────────────────

  const avatarLetter = (name || user?.email || '?')[0].toUpperCase();
  const heightDisplay = unitSystem === 'metric'
    ? `${heightCm} cm`
    : `${heightFt}'${heightIn}"`;

  const weightUnit  = unitSystem === 'metric' ? 'kg' : 'lbs';
  const waterUnit   = unitSystem === 'metric' ? 'ml' : 'oz';

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>

      {/* ── Saved banner ── */}
      {savedMsg && (
        <View style={styles.savedBanner}>
          <Text style={styles.savedBannerText}>✓ {savedMsg}</Text>
        </View>
      )}

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >

          {/* ──────────── Profile Avatar + Quick Stats ──────────── */}
          <View style={styles.avatarSection}>
            <View style={[styles.avatarCircle, { borderColor: themeColor }]}>
              <Text style={[styles.avatarLetter, { color: themeColor }]}>{avatarLetter}</Text>
            </View>
            <View style={styles.avatarInfo}>
              <Text style={styles.avatarName} numberOfLines={1}>
                {name || 'Your Name'}
              </Text>
              <Text style={styles.avatarEmail} numberOfLines={1}>
                {user?.email ?? ''}
              </Text>
            </View>
          </View>

          {/* Quick stats row */}
          <View style={styles.quickStats}>
            <View style={styles.quickStatCell}>
              <Text style={styles.quickStatValue}>{heightDisplay}</Text>
              <Text style={styles.quickStatLabel}>Height</Text>
            </View>
            <View style={styles.quickStatDivider} />
            <View style={styles.quickStatCell}>
              <Text style={styles.quickStatValue}>{age || '—'}</Text>
              <Text style={styles.quickStatLabel}>Age</Text>
            </View>
            <View style={styles.quickStatDivider} />
            <View style={styles.quickStatCell}>
              <Text style={styles.quickStatValue}>{sex === 'male' ? 'M' : 'F'}</Text>
              <Text style={styles.quickStatLabel}>Sex</Text>
            </View>
          </View>

          {/* ──────────── Unit System Toggle ──────────── */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Unit System</Text>
            <View style={styles.unitToggleRow}>
              {(['imperial', 'metric'] as const).map(u => (
                <TouchableOpacity
                  key={u}
                  style={[
                    styles.unitPill,
                    unitSystem === u && { backgroundColor: themeColor + '22', borderColor: themeColor },
                  ]}
                  onPress={() => setUnitSystem(u)}
                >
                  <Text style={[
                    styles.unitPillText,
                    unitSystem === u && { color: themeColor },
                  ]}>
                    {u.charAt(0).toUpperCase() + u.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* ──────────── Edit Profile Card ──────────── */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Edit Profile</Text>

            {/* Name */}
            <Text style={styles.fieldLabel}>Name</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="Your name"
              placeholderTextColor={colors.textMuted}
              returnKeyType="done"
            />

            {/* Age */}
            <Text style={styles.fieldLabel}>Age</Text>
            <TextInput
              style={styles.input}
              value={age}
              onChangeText={setAge}
              placeholder="e.g. 28"
              placeholderTextColor={colors.textMuted}
              keyboardType="number-pad"
              returnKeyType="done"
            />

            {/* Sex */}
            <Text style={styles.fieldLabel}>Sex</Text>
            <View style={styles.pillRow}>
              {(['male', 'female'] as const).map(s => (
                <TouchableOpacity
                  key={s}
                  style={[
                    styles.selectionPill,
                    sex === s && { backgroundColor: themeColor + '22', borderColor: themeColor },
                  ]}
                  onPress={() => setSex(s)}
                >
                  <Text style={[
                    styles.selectionPillText,
                    sex === s && { color: themeColor },
                  ]}>
                    {s.charAt(0).toUpperCase() + s.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Weight */}
            <Text style={styles.fieldLabel}>Weight ({weightUnit})</Text>
            <TextInput
              style={styles.input}
              value={weightInput}
              onChangeText={setWeightInput}
              placeholder={`e.g. ${unitSystem === 'metric' ? '75' : '165'}`}
              placeholderTextColor={colors.textMuted}
              keyboardType="decimal-pad"
              returnKeyType="done"
            />

            {/* Height */}
            <Text style={styles.fieldLabel}>Height</Text>
            {unitSystem === 'metric' ? (
              <TextInput
                style={styles.input}
                value={heightCm}
                onChangeText={setHeightCm}
                placeholder="e.g. 178"
                placeholderTextColor={colors.textMuted}
                keyboardType="number-pad"
                returnKeyType="done"
              />
            ) : (
              <View style={styles.heightPickerRow}>
                <View style={styles.heightPickerWrap}>
                  <Picker
                    selectedValue={heightFt}
                    onValueChange={v => setHeightFt(v)}
                    style={styles.picker}
                    itemStyle={styles.pickerItem}
                  >
                    {Array.from({ length: 5 }, (_, i) => i + 3).map(ft => (
                      <Picker.Item key={ft} label={`${ft} ft`} value={ft} />
                    ))}
                  </Picker>
                </View>
                <View style={styles.heightPickerWrap}>
                  <Picker
                    selectedValue={heightIn}
                    onValueChange={v => setHeightIn(v)}
                    style={styles.picker}
                    itemStyle={styles.pickerItem}
                  >
                    {Array.from({ length: 12 }, (_, i) => i).map(inch => (
                      <Picker.Item key={inch} label={`${inch} in`} value={inch} />
                    ))}
                  </Picker>
                </View>
              </View>
            )}

            <TouchableOpacity
              style={[
                styles.saveBtn,
                { backgroundColor: themeColor },
                saveProfileMutation.isPending && styles.saveBtnDisabled,
              ]}
              onPress={() => saveProfileMutation.mutate()}
              disabled={saveProfileMutation.isPending}
            >
              {saveProfileMutation.isPending
                ? <ActivityIndicator color="#000" size="small" />
                : <Text style={styles.saveBtnText}>Save Profile</Text>}
            </TouchableOpacity>
          </View>

          {/* ──────────── Daily Targets Card ──────────── */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Daily Targets</Text>

            {/* Calories — large input */}
            <Text style={styles.fieldLabel}>Calories</Text>
            <TextInput
              style={[styles.calorieInput, { color: themeColor }]}
              value={calories}
              onChangeText={setCalories}
              keyboardType="number-pad"
              returnKeyType="done"
            />

            {/* Macro grid */}
            <View style={styles.macroGrid}>
              {[
                { label: 'Protein', color: '#ffa765', val: protein, set: setProtein },
                { label: 'Carbs',   color: '#64a8fe', val: carbs,   set: setCarbs },
                { label: 'Fat',     color: '#adaaaa', val: fat,     set: setFat },
              ].map(({ label, color, val, set }) => (
                <View key={label} style={styles.macroCell}>
                  <Text style={[styles.macroLabel, { color }]}>{label}</Text>
                  <View style={styles.macroInputWrap}>
                    <TextInput
                      style={[styles.macroInput, { color }]}
                      value={val}
                      onChangeText={set}
                      keyboardType="number-pad"
                      returnKeyType="done"
                    />
                    <Text style={[styles.macroUnit, { color }]}>g</Text>
                  </View>
                </View>
              ))}
            </View>

            <TouchableOpacity
              style={[
                styles.saveBtn,
                { backgroundColor: themeColor },
                saveGoalsMutation.isPending && styles.saveBtnDisabled,
              ]}
              onPress={() => saveGoalsMutation.mutate()}
              disabled={saveGoalsMutation.isPending}
            >
              {saveGoalsMutation.isPending
                ? <ActivityIndicator color="#000" size="small" />
                : <Text style={styles.saveBtnText}>Save Goals</Text>}
            </TouchableOpacity>
          </View>

          {/* ──────────── Coaching Card ──────────── */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Coaching</Text>

            {/* Coaching enabled toggle */}
            <TouchableOpacity
              style={styles.settingsRow}
              onPress={() => toggleCoachingMutation.mutate(!coachingEnabled)}
              activeOpacity={0.7}
            >
              <Text style={styles.settingsRowLabel}>Coaching enabled</Text>
              <View style={[styles.toggleTrack, coachingEnabled && { backgroundColor: themeColor }]}>
                <View style={[styles.toggleThumb, coachingEnabled && styles.toggleThumbOn]} />
              </View>
            </TouchableOpacity>

            {/* Diet preference */}
            <TouchableOpacity
              style={styles.settingsRow}
              onPress={() => setShowDietSheet(true)}
              activeOpacity={0.7}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.settingsRowLabel}>Diet preference</Text>
                <Text style={styles.settingsRowSub}>
                  {DIET_PREFERENCES[dietPref]?.emoji} {DIET_PREFERENCES[dietPref]?.label}
                </Text>
              </View>
              <Text style={styles.rowChevron}>›</Text>
            </TouchableOpacity>

            {/* Goal aggressiveness */}
            <TouchableOpacity
              style={styles.settingsRow}
              onPress={() => setShowAggSheet(true)}
              activeOpacity={0.7}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.settingsRowLabel}>Goal aggressiveness</Text>
                <Text style={styles.settingsRowSub}>
                  {GOAL_AGGRESSIVENESS[aggressiveness]?.label} · {GOAL_AGGRESSIVENESS[aggressiveness]?.desc}
                </Text>
              </View>
              <Text style={styles.rowChevron}>›</Text>
            </TouchableOpacity>

            {/* Recalculate button */}
            <TouchableOpacity
              style={[styles.recalcBtn, { borderColor: themeColor }]}
              onPress={recalculateEverything}
              disabled={recalcLoading}
            >
              {recalcLoading
                ? <ActivityIndicator color={themeColor} size="small" />
                : <Text style={[styles.recalcBtnText, { color: themeColor }]}>✨ Update my plan based on current stats</Text>}
            </TouchableOpacity>

            {/* Recalc preview card */}
            {recalcResult && (
              <View style={styles.recalcPreview}>
                <Text style={styles.recalcPreviewTitle}>New plan preview</Text>
                <View style={styles.recalcRow}>
                  <View style={styles.recalcCol}>
                    <Text style={styles.recalcColLabel}>Current</Text>
                    <Text style={styles.recalcColVal}>{profile?.calorie_goal ?? '—'} cal</Text>
                    <Text style={styles.recalcColSub}>P{profile?.protein_goal ?? '—'} C{profile?.carbs_goal ?? '—'} F{profile?.fat_goal ?? '—'}</Text>
                  </View>
                  <Text style={styles.recalcArrow}>→</Text>
                  <View style={[styles.recalcCol, { alignItems: 'flex-end' }]}>
                    <Text style={styles.recalcColLabel}>New</Text>
                    <Text style={[styles.recalcColVal, { color: themeColor }]}>{recalcResult.calories} cal</Text>
                    <Text style={styles.recalcColSub}>P{recalcResult.protein} C{recalcResult.carbs} F{recalcResult.fat}</Text>
                  </View>
                </View>
                <View style={styles.recalcActions}>
                  <TouchableOpacity
                    style={[styles.saveBtn, { backgroundColor: themeColor, flex: 1 }, applyRecalcMutation.isPending && styles.saveBtnDisabled]}
                    onPress={() => applyRecalcMutation.mutate(recalcResult)}
                    disabled={applyRecalcMutation.isPending}
                  >
                    {applyRecalcMutation.isPending
                      ? <ActivityIndicator color="#000" size="small" />
                      : <Text style={styles.saveBtnText}>Apply new goals</Text>}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.saveBtn, { backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border, flex: 1 }]}
                    onPress={() => setRecalcResult(null)}
                  >
                    <Text style={[styles.saveBtnText, { color: colors.textMuted }]}>Dismiss</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* View coaching history */}
            <TouchableOpacity
              style={styles.settingsRow}
              onPress={() => router.push('/coaching' as any)}
              activeOpacity={0.7}
            >
              <Text style={styles.settingsRowLabel}>View coaching history</Text>
              <View style={styles.rowRight}>
                {latestCoachingMeta?.read_at === null && <View style={styles.unreadDot} />}
                <Text style={styles.rowChevron}>›</Text>
              </View>
            </TouchableOpacity>

            {/* How coaching works */}
            <TouchableOpacity
              style={[styles.settingsRow, { borderBottomWidth: 0 }]}
              onPress={() => setShowCoachInfo(true)}
              activeOpacity={0.7}
            >
              <Text style={styles.settingsRowLabel}>How coaching works</Text>
              <Text style={styles.rowChevron}>›</Text>
            </TouchableOpacity>
          </View>

          {/* ──────────── Daily Water Intake Card ──────────── */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Daily Water Intake</Text>

            {/* Stepper */}
            <View style={styles.waterStepperRow}>
              <TouchableOpacity
                style={styles.stepperCircle}
                onPress={() => {
                  const step = unitSystem === 'metric' ? 250 : 8;
                  const cur = parseFloat(waterGoalInput) || 0;
                  setWaterGoalInput(String(Math.max(0, cur - step)));
                }}
              >
                <Text style={styles.stepperIcon}>−</Text>
              </TouchableOpacity>

              <View style={styles.waterInputWrap}>
                <TextInput
                  style={styles.waterInput}
                  value={waterGoalInput}
                  onChangeText={setWaterGoalInput}
                  keyboardType="number-pad"
                  returnKeyType="done"
                />
                <Text style={styles.waterUnit}>{waterUnit}</Text>
              </View>

              <TouchableOpacity
                style={styles.stepperCircle}
                onPress={() => {
                  const step = unitSystem === 'metric' ? 250 : 8;
                  const cur = parseFloat(waterGoalInput) || 0;
                  setWaterGoalInput(String(cur + step));
                }}
              >
                <Text style={styles.stepperIcon}>+</Text>
              </TouchableOpacity>
            </View>

            {/* Bottle presets */}
            <Text style={styles.fieldLabel}>Quick presets</Text>
            <View style={styles.bottlePresets}>
              {BOTTLE_PRESETS.map(preset => {
                const isSelected = selectedBottleOz === preset.oz;
                return (
                  <TouchableOpacity
                    key={preset.label}
                    style={[
                      styles.bottleChip,
                      isSelected && { borderColor: themeColor, backgroundColor: themeColor + '18' },
                    ]}
                    onPress={() => selectBottle(preset.oz)}
                  >
                    <Text style={[styles.bottleChipText, isSelected && { color: themeColor }]}>
                      {preset.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {selectedBottleOz && (
              <TouchableOpacity onPress={clearBottle} style={styles.clearBottleBtn}>
                <Text style={styles.clearBottleText}>Clear bottle preference</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={[
                styles.saveBtn,
                { backgroundColor: themeColor },
                saveWaterGoalMutation.isPending && styles.saveBtnDisabled,
              ]}
              onPress={() => saveWaterGoalMutation.mutate()}
              disabled={saveWaterGoalMutation.isPending}
            >
              {saveWaterGoalMutation.isPending
                ? <ActivityIndicator color="#000" size="small" />
                : <Text style={styles.saveBtnText}>Save Water Goal</Text>}
            </TouchableOpacity>
          </View>

          {/* ──────────── Interface Accent Card ──────────── */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Interface Accent</Text>
            <View style={styles.colorRow}>
              {Object.entries(THEME_COLORS).map(([key, { hex }]) => (
                <TouchableOpacity
                  key={key}
                  style={[
                    styles.colorCircle,
                    { backgroundColor: hex },
                    themeColor === hex && styles.colorCircleSelected,
                  ]}
                  onPress={() => {
                    setThemeColor(hex);
                    saveThemeMutation.mutate(hex);
                  }}
                >
                  {themeColor === hex && (
                    <Text style={styles.colorCheckmark}>✓</Text>
                  )}
                </TouchableOpacity>
              ))}
              {saveThemeMutation.isPending && (
                <ActivityIndicator color={themeColor} size="small" style={{ marginLeft: spacing.sm }} />
              )}
            </View>
          </View>

          {/* ──────────── Logout ──────────── */}
          <TouchableOpacity
            style={styles.logoutRow}
            onPress={() => {
              Alert.alert('Log out', 'Are you sure you want to log out?', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Log Out', style: 'destructive', onPress: () => logoutMutation.mutate() },
              ]);
            }}
            disabled={logoutMutation.isPending}
          >
            {logoutMutation.isPending
              ? <ActivityIndicator color={colors.textMuted} size="small" />
              : <Text style={styles.logoutText}>Log Out</Text>}
            <Text style={styles.logoutChevron}>›</Text>
          </TouchableOpacity>

          {/* ──────────── Delete Account ──────────── */}
          <TouchableOpacity
            style={styles.deleteAccountBtn}
            onPress={() => {
              setDeleteError('');
              setShowDeleteModal(true);
            }}
          >
            <Text style={styles.deleteAccountText}>Delete Account</Text>
          </TouchableOpacity>

          <View style={{ height: spacing.xl * 2 }} />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* ──────────── Delete Account Modal ──────────── */}
      <Modal
        visible={showDeleteModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowDeleteModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.deleteModal}>
            <Text style={styles.deleteModalTitle}>Delete Account</Text>
            <Text style={styles.deleteModalBody}>
              This will permanently delete your account and all associated data.
              This action cannot be undone.
            </Text>

            {deleteError ? (
              <Text style={styles.deleteModalError}>{deleteError}</Text>
            ) : null}

            <View style={styles.deleteModalBtns}>
              <TouchableOpacity
                style={styles.deleteModalCancel}
                onPress={() => {
                  setShowDeleteModal(false);
                  setDeleteError('');
                }}
                disabled={deletingAccount}
              >
                <Text style={styles.deleteModalCancelText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.deleteModalConfirm, deletingAccount && styles.saveBtnDisabled]}
                onPress={handleDeleteAccount}
                disabled={deletingAccount}
              >
                {deletingAccount
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={styles.deleteModalConfirmText}>Delete</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ──────────── Diet Sheet Modal ──────────── */}
      <Modal
        visible={showDietSheet}
        transparent
        animationType="slide"
        onRequestClose={() => setShowDietSheet(false)}
      >
        <View style={styles.sheetOverlay}>
          <View style={[styles.bottomSheet, { maxHeight: SCREEN_HEIGHT * 0.75 }]}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Diet Preference</Text>
            <ScrollView>
              {(Object.entries(DIET_PREFERENCES) as [keyof typeof DIET_PREFERENCES, typeof DIET_PREFERENCES[keyof typeof DIET_PREFERENCES]][]).map(([key, d]) => {
                const isSelected = dietPref === key;
                // preview plan if we have enough profile data
                const previewPlan = profile?.height_inches
                  ? calculatePlan({
                      weightLbs: profile?.current_weight_lbs ?? 165,
                      heightInches: profile.height_inches,
                      age: profile?.age ?? 25,
                      sex: (profile?.sex as 'male' | 'female') ?? 'male',
                      goal: (profile?.goal as any) ?? 'cutting',
                      activityLevel: (profile?.activity_level as keyof typeof ACTIVITY_MULTIPLIERS) ?? 'moderately_active',
                      aggressiveness,
                      dietPreference: key,
                    })
                  : null;
                return (
                  <TouchableOpacity
                    key={key}
                    style={[styles.dietOption, isSelected && { backgroundColor: themeColor + '14', borderColor: themeColor }]}
                    onPress={() => {
                      setPendingDiet(key);
                      setPendingDietPlan(previewPlan);
                      setShowDietSheet(false);
                    }}
                  >
                    <Text style={styles.dietEmoji}>{d.emoji}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.dietLabel, isSelected && { color: themeColor }]}>{d.label}</Text>
                      <Text style={styles.dietDesc}>{d.desc}</Text>
                      {previewPlan && (
                        <Text style={styles.dietMacroPreview}>
                          {previewPlan.calories} cal · P{previewPlan.protein} C{previewPlan.carbs} F{previewPlan.fat}
                        </Text>
                      )}
                    </View>
                    {isSelected && <Text style={[styles.dietCheck, { color: themeColor }]}>✓</Text>}
                  </TouchableOpacity>
                );
              })}
              <View style={{ height: spacing.xl }} />
            </ScrollView>
            <TouchableOpacity style={styles.sheetCancelBtn} onPress={() => setShowDietSheet(false)}>
              <Text style={styles.sheetCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ──────────── Diet Confirm Modal ──────────── */}
      <Modal
        visible={pendingDiet !== null}
        transparent
        animationType="fade"
        onRequestClose={() => { setPendingDiet(null); setPendingDietPlan(null); }}
      >
        <View style={styles.modalOverlay}>
          {pendingDiet && (
            <View style={styles.confirmModal}>
              <Text style={styles.confirmTitle}>
                Switch to {DIET_PREFERENCES[pendingDiet]?.emoji} {DIET_PREFERENCES[pendingDiet]?.label}?
              </Text>
              <Text style={styles.confirmBody}>
                {DIET_PREFERENCES[pendingDiet]?.desc}
              </Text>
              {pendingDietPlan && (
                <View style={styles.recalcRow}>
                  <View style={styles.recalcCol}>
                    <Text style={styles.recalcColLabel}>Current</Text>
                    <Text style={styles.recalcColVal}>{profile?.calorie_goal ?? '—'} cal</Text>
                    <Text style={styles.recalcColSub}>P{profile?.protein_goal ?? '—'} C{profile?.carbs_goal ?? '—'} F{profile?.fat_goal ?? '—'}</Text>
                  </View>
                  <Text style={styles.recalcArrow}>→</Text>
                  <View style={[styles.recalcCol, { alignItems: 'flex-end' }]}>
                    <Text style={styles.recalcColLabel}>New</Text>
                    <Text style={[styles.recalcColVal, { color: themeColor }]}>{pendingDietPlan.calories} cal</Text>
                    <Text style={styles.recalcColSub}>P{pendingDietPlan.protein} C{pendingDietPlan.carbs} F{pendingDietPlan.fat}</Text>
                  </View>
                </View>
              )}
              <View style={styles.deleteModalBtns}>
                <TouchableOpacity
                  style={styles.deleteModalCancel}
                  onPress={() => { setPendingDiet(null); setPendingDietPlan(null); }}
                  disabled={confirmDietChangeMutation.isPending}
                >
                  <Text style={styles.deleteModalCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.saveBtn, { backgroundColor: themeColor, flex: 1 }, confirmDietChangeMutation.isPending && styles.saveBtnDisabled]}
                  onPress={() => {
                    if (pendingDiet && pendingDietPlan) {
                      confirmDietChangeMutation.mutate({ newDiet: pendingDiet, plan: pendingDietPlan });
                    }
                  }}
                  disabled={confirmDietChangeMutation.isPending || !pendingDietPlan}
                >
                  {confirmDietChangeMutation.isPending
                    ? <ActivityIndicator color="#000" size="small" />
                    : <Text style={styles.saveBtnText}>Confirm</Text>}
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      </Modal>

      {/* ──────────── Aggressiveness Sheet Modal ──────────── */}
      <Modal
        visible={showAggSheet}
        transparent
        animationType="slide"
        onRequestClose={() => setShowAggSheet(false)}
      >
        <View style={styles.sheetOverlay}>
          <View style={styles.bottomSheet}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Goal Aggressiveness</Text>
            {(Object.entries(GOAL_AGGRESSIVENESS) as [keyof typeof GOAL_AGGRESSIVENESS, typeof GOAL_AGGRESSIVENESS[keyof typeof GOAL_AGGRESSIVENESS]][]).map(([key, a]) => {
              const isSelected = aggressiveness === key;
              const previewPlan = profile?.height_inches
                ? calculatePlan({
                    weightLbs: profile?.current_weight_lbs ?? 165,
                    heightInches: profile.height_inches,
                    age: profile?.age ?? 25,
                    sex: (profile?.sex as 'male' | 'female') ?? 'male',
                    goal: (profile?.goal as any) ?? 'cutting',
                    activityLevel: (profile?.activity_level as keyof typeof ACTIVITY_MULTIPLIERS) ?? 'moderately_active',
                    aggressiveness: key,
                    dietPreference: dietPref,
                  })
                : null;
              return (
                <TouchableOpacity
                  key={key}
                  style={[styles.dietOption, isSelected && { backgroundColor: themeColor + '14', borderColor: themeColor }]}
                  onPress={() => {
                    if (previewPlan) {
                      changeAggressivenessMutation.mutate({ newAgg: key, plan: previewPlan });
                    } else {
                      setAggressiveness(key);
                      setShowAggSheet(false);
                    }
                  }}
                  disabled={changeAggressivenessMutation.isPending}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.dietLabel, isSelected && { color: themeColor }]}>{a.label}</Text>
                    <Text style={styles.dietDesc}>{a.desc}</Text>
                    {previewPlan && (
                      <Text style={styles.dietMacroPreview}>
                        {previewPlan.calories} cal · P{previewPlan.protein} C{previewPlan.carbs} F{previewPlan.fat}
                      </Text>
                    )}
                  </View>
                  {isSelected && <Text style={[styles.dietCheck, { color: themeColor }]}>✓</Text>}
                  {changeAggressivenessMutation.isPending && changeAggressivenessMutation.variables?.newAgg === key && (
                    <ActivityIndicator color={themeColor} size="small" />
                  )}
                </TouchableOpacity>
              );
            })}
            <TouchableOpacity style={styles.sheetCancelBtn} onPress={() => setShowAggSheet(false)}>
              <Text style={styles.sheetCancelText}>Cancel</Text>
            </TouchableOpacity>
            <View style={{ height: spacing.lg }} />
          </View>
        </View>
      </Modal>

      {/* ──────────── Coach Info Modal ──────────── */}
      <Modal
        visible={showCoachInfo}
        transparent
        animationType="fade"
        onRequestClose={() => setShowCoachInfo(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.confirmModal}>
            <Text style={styles.confirmTitle}>✨ How coaching works</Text>
            <Text style={styles.howCoachBody}>
              {`Every Monday, your AI coach reviews your past week — calories, protein, workouts, and weight trend — and generates a personalized weekly report.\n\nYou can chat with the coach up to 5 times per day to refine its recommendations. When you accept a recommendation, your goals update immediately.\n\nYou can also request an early check-in once you've logged at least 3 days and your last report is more than 3 days old.\n\nAll coaching happens on-device via secure Edge Functions — your data stays private.`}
            </Text>
            <TouchableOpacity
              style={[styles.saveBtn, { backgroundColor: themeColor }]}
              onPress={() => setShowCoachInfo(false)}
            >
              <Text style={styles.saveBtnText}>Got it</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, paddingBottom: spacing.xl },

  // Saved banner
  savedBanner: {
    position: 'absolute',
    top: spacing.sm,
    left: spacing.md,
    right: spacing.md,
    zIndex: 100,
    backgroundColor: '#22c55e',
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    alignItems: 'center',
  },
  savedBannerText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    color: '#000',
  },

  // Avatar section
  avatarSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.md,
    marginTop: spacing.sm,
  },
  avatarCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 3,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: {
    fontFamily: 'Inter_700Bold',
    fontSize: 32,
  },
  avatarInfo: { flex: 1 },
  avatarName: {
    fontFamily: 'Inter_700Bold',
    fontSize: 18,
    color: colors.text,
  },
  avatarEmail: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 2,
  },

  // Quick stats
  quickStats: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.sm,
    padding: spacing.md,
  },
  quickStatCell: {
    flex: 1,
    alignItems: 'center',
  },
  quickStatValue: {
    fontFamily: 'Inter_700Bold',
    fontSize: 16,
    color: colors.text,
  },
  quickStatLabel: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  quickStatDivider: {
    width: 1,
    backgroundColor: colors.border,
    marginVertical: 4,
  },

  // Card
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: spacing.md,
  },

  // Unit toggle
  unitToggleRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  unitPill: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  unitPillText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    color: colors.textMuted,
  },

  // Field
  fieldLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: spacing.xs,
    marginTop: spacing.sm,
  },
  input: {
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

  // Sex / selection pills
  pillRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  selectionPill: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  selectionPillText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    color: colors.textMuted,
  },

  // Height pickers
  heightPickerRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  heightPickerWrap: {
    flex: 1,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    overflow: 'hidden',
  },
  picker: {
    color: colors.text,
    backgroundColor: colors.background,
  },
  pickerItem: {
    color: colors.text,
    fontSize: 15,
  },

  // Save button
  saveBtn: {
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm + 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.md,
  },
  saveBtnDisabled: { opacity: 0.5 },
  saveBtnText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
    color: '#000',
  },

  // Calorie input
  calorieInput: {
    fontFamily: 'Inter_700Bold',
    fontSize: 38,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    textAlign: 'center',
  },

  // Macro grid
  macroGrid: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  macroCell: {
    flex: 1,
    backgroundColor: colors.background,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm,
    alignItems: 'center',
  },
  macroLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: spacing.xs,
  },
  macroInputWrap: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 2,
  },
  macroInput: {
    fontFamily: 'Inter_700Bold',
    fontSize: 20,
    minWidth: 44,
    textAlign: 'center',
  },
  macroUnit: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
  },

  // Color row
  colorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    flexWrap: 'wrap',
  },
  colorCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  colorCircleSelected: {
    borderWidth: 3,
    borderColor: '#fff',
  },
  colorCheckmark: {
    color: '#fff',
    fontSize: 14,
    fontFamily: 'Inter_700Bold',
  },

  // Logout row
  logoutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  logoutText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
    color: colors.text,
  },
  logoutChevron: {
    fontFamily: 'Inter_400Regular',
    fontSize: 20,
    color: colors.textMuted,
  },

  // Delete account
  deleteAccountBtn: {
    borderWidth: 1,
    borderColor: '#ef4444',
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  deleteAccountText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
    color: '#ef4444',
  },

  // Delete modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.md,
  },
  deleteModal: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    width: '100%',
    maxWidth: 360,
    borderWidth: 1,
    borderColor: '#ef444455',
  },
  deleteModalTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 18,
    color: '#ef4444',
    marginBottom: spacing.sm,
  },
  deleteModalBody: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: colors.textMuted,
    lineHeight: 20,
    marginBottom: spacing.md,
  },
  deleteModalError: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: '#ef4444',
    marginBottom: spacing.sm,
  },
  deleteModalBtns: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  deleteModalCancel: {
    flex: 1,
    backgroundColor: colors.background,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm + 2,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  deleteModalCancelText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    color: colors.textMuted,
  },
  deleteModalConfirm: {
    flex: 1,
    backgroundColor: '#ef4444',
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm + 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteModalConfirmText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    color: '#fff',
  },

  // Settings rows
  settingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm + 2,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  settingsRowLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
    color: colors.text,
  },
  settingsRowSub: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  rowChevron: {
    fontFamily: 'Inter_400Regular',
    fontSize: 20,
    color: colors.textMuted,
  },
  rowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#ef4444',
  },

  // Toggle switch
  toggleTrack: {
    width: 44,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.border,
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  toggleThumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.textMuted,
  },
  toggleThumbOn: {
    alignSelf: 'flex-end',
    backgroundColor: '#000',
  },

  // Recalc
  recalcBtn: {
    borderWidth: 1,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm + 2,
    alignItems: 'center',
    marginTop: spacing.md,
  },
  recalcBtnText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
  },
  recalcPreview: {
    marginTop: spacing.md,
    backgroundColor: colors.background,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  recalcPreviewTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: spacing.sm,
  },
  recalcRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  recalcCol: {
    flex: 1,
  },
  recalcColLabel: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  recalcColVal: {
    fontFamily: 'Inter_700Bold',
    fontSize: 16,
    color: colors.text,
  },
  recalcColSub: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 1,
  },
  recalcArrow: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 18,
    color: colors.textMuted,
  },
  recalcActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },

  // Water stepper
  waterStepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  stepperCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperIcon: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 24,
    color: colors.text,
    lineHeight: 28,
  },
  waterInputWrap: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.xs,
    flex: 1,
    justifyContent: 'center',
  },
  waterInput: {
    fontFamily: 'Inter_700Bold',
    fontSize: 32,
    color: colors.text,
    textAlign: 'center',
    minWidth: 80,
  },
  waterUnit: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 16,
    color: colors.textMuted,
  },

  // Bottle presets
  bottlePresets: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  bottleChip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs + 2,
  },
  bottleChipText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: colors.textMuted,
  },
  clearBottleBtn: {
    marginTop: spacing.sm,
    alignSelf: 'center',
  },
  clearBottleText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: colors.textMuted,
    textDecorationLine: 'underline',
  },

  // Bottom sheet
  sheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  bottomSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderColor: colors.border,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    backgroundColor: colors.border,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: spacing.md,
  },
  sheetTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 17,
    color: colors.text,
    marginBottom: spacing.md,
  },
  sheetCancelBtn: {
    paddingVertical: spacing.md,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    marginTop: spacing.sm,
  },
  sheetCancelText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
    color: colors.textMuted,
  },

  // Diet options
  dietOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.xs,
  },
  dietEmoji: {
    fontSize: 24,
    width: 32,
    textAlign: 'center',
  },
  dietLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
    color: colors.text,
  },
  dietDesc: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 1,
  },
  dietMacroPreview: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 2,
  },
  dietCheck: {
    fontFamily: 'Inter_700Bold',
    fontSize: 16,
  },

  // Confirm modal
  confirmModal: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    width: '100%',
    maxWidth: 360,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.md,
  },
  confirmTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 17,
    color: colors.text,
  },
  confirmBody: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: colors.textMuted,
    lineHeight: 20,
  },
  howCoachBody: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: colors.textMuted,
    lineHeight: 22,
  },
});

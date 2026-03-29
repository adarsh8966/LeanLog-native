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

  // auto-clear saved message
  useEffect(() => {
    if (!savedMsg) return;
    const t = setTimeout(() => setSavedMsg(null), 2500);
    return () => clearTimeout(t);
  }, [savedMsg]);

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
});

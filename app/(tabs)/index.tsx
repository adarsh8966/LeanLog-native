import { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Animated,
  useAnimatedValue,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { differenceInDays, parseISO, startOfDay, subDays } from 'date-fns';
import { supabase } from '../../lib/supabase';
import { colors, spacing, borderRadius } from '../../lib/theme';
import MacroRings from '../../components/MacroRings';
import BentoWaterCard from '../../components/BentoWaterCard';
import BentoSuppsCard from '../../components/BentoSuppsCard';
import { Ionicons } from '@expo/vector-icons';

// ── Date helper (no toISOString) ──────────────────────────────────────────────
function todayStr() {
  return new Date().toLocaleDateString('en-CA');
}

function getLocalDateString(date?: Date): string {
  return (date ?? new Date()).toLocaleDateString('en-CA');
}

// ── Pure JS engines ────────────────────────────────────────────────────────────

type MealLog = {
  id: string;
  date: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
};

type ActivityLog = {
  id: string;
  calories_burned: number;
};

type DailyLog = {
  water_oz?: number;
  water_cups?: number;
  workout_completed: boolean;
  workout_type?: string;
  current_streak?: number;
  longest_streak?: number;
  daily_xp?: number;
};

type WeightLog = {
  id: string;
  weight_lbs: number;
  logged_at: string;
};

type WellnessLog = {
  mood?: number;
  sleep_hours?: number;
  energy_level?: number;
};

type UserProfile = {
  username?: string;
  theme_color?: string;
  calorie_goal?: number;
  protein_goal?: number;
  water_goal_oz?: number;
  target_date?: string;
  total_xp?: number;
  current_streak?: number;
  longest_streak?: number;
  supplement_streak?: number;
};

type CoachingReport = {
  id: string;
  week_start: string;
  coach_message: string;
  confidence?: string;
  recommended_calories?: number;
  read_at?: string | null;
};

function getWeeklyCompletion(mealDays: string[]) {
  const today = startOfDay(new Date());
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = subDays(today, 6 - i);
    return d.toLocaleDateString('en-CA');
  });
  const logged = days.map(d => mealDays.includes(d));
  const count = logged.filter(Boolean).length;
  const consistency = Math.round((count / 7) * 100);
  return { count, days, logged, consistency };
}

function calcTrackStatus(
  totalEaten: number,
  totalProtein: number,
  goals: { calories: number; protein: number }
) {
  if (totalEaten === 0) return 'no_data';
  const calDevAbs = Math.abs(totalEaten - goals.calories);
  const protPct = (totalProtein / goals.protein) * 100;
  if (calDevAbs > 300 || protPct < 50) return 'off_track';
  if (calDevAbs > 100 || protPct < 80) return 'slightly_off';
  return 'on_track';
}

function getInsight(
  netCals: number,
  goal: number,
  eaten: number,
  burned: number,
  streak: number
) {
  const diff = goal - netCals;
  if (eaten === 0)
    return { text: 'Start logging your meals to track your progress today.', emoji: '📋' };
  if (diff > 1000)
    return { text: `Net intake is ${Math.abs(diff)} kcal below goal — too restrictive`, emoji: '⚠️' };
  if (diff >= 400)
    return { text: `Great deficit day — ${diff} kcal under goal. Keep it up!`, emoji: '🎯' };
  if (diff >= 150)
    return { text: `On track — ${diff} kcal under goal. Solid day.`, emoji: '✅' };
  if (diff >= -100)
    return { text: `Right at your calorie target. Great discipline!`, emoji: '💪' };
  if (diff >= -300)
    return { text: `You're ${Math.abs(diff)} kcal over. A light walk can help.`, emoji: '🚶' };
  return { text: `Exceeded goal by ${Math.abs(diff)} kcal. Adjust tomorrow.`, emoji: '📊' };
}

type DailyBrief = {
  message: string;
  has_data: boolean;
};

async function fetchDailyBrief(
  uid: string,
  session: { access_token: string }
): Promise<DailyBrief | null> {
  const today = getLocalDateString();
  const cacheKey = `coaching_brief_${today}`;

  // Check cache first
  const cached = await AsyncStorage.getItem(cacheKey);
  if (cached) return JSON.parse(cached) as DailyBrief;

  // Compute yesterday
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = getLocalDateString(yesterday);

  // Call Edge Function
  const response = await fetch(
    `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/daily-coaching-brief`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ yesterday: yesterdayStr }),
    }
  );

  if (!response.ok) return null;
  const data = await response.json() as DailyBrief;

  // Cache it
  await AsyncStorage.setItem(cacheKey, JSON.stringify(data));
  return data;
}

const MOOD_EMOJI: Record<number, string> = { 1: '😞', 2: '😕', 3: '😐', 4: '🙂', 5: '😄' };

function energyLabel(level?: number) {
  if (!level) return '';
  if (level >= 4) return 'High';
  if (level >= 3) return 'Good';
  return 'Low';
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function Dashboard() {
  const today = todayStr();
  const xpBarWidth = useAnimatedValue(0);

  // ── Daily coaching brief state ────────────────────────────────────────────
  const [dailyBrief, setDailyBrief] = useState<DailyBrief | null>(null);
  const [briefLoading, setBriefLoading] = useState(true);
  const skeletonOpacity = useAnimatedValue(0.3);
  const skeletonAnimRef = useRef<ReturnType<typeof Animated.loop> | null>(null);

  // ── auth (must come before effects that use uid) ──────────────────────────
  const { data: user } = useQuery({
    queryKey: ['auth_user'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      return user;
    },
  });
  const uid = user?.id;

  // ── onboarding check ──────────────────────────────────────────────────────
  useEffect(() => {
    AsyncStorage.getItem('onboarding_complete').then(val => {
      if (!val) {
        router.replace('/onboarding');
      }
    });
  }, []);

  // ── Skeleton pulse animation ──────────────────────────────────────────────
  useEffect(() => {
    if (briefLoading) {
      skeletonAnimRef.current = Animated.loop(
        Animated.sequence([
          Animated.timing(skeletonOpacity, { toValue: 1, duration: 600, useNativeDriver: true }),
          Animated.timing(skeletonOpacity, { toValue: 0.3, duration: 600, useNativeDriver: true }),
        ])
      );
      skeletonAnimRef.current.start();
    } else {
      skeletonAnimRef.current?.stop();
    }
  }, [briefLoading]);

  // ── Fetch daily coaching brief once on mount (after auth) ─────────────────
  useEffect(() => {
    if (!uid) return;
    setBriefLoading(true);
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        setBriefLoading(false);
        return;
      }
      fetchDailyBrief(uid, session)
        .then(setDailyBrief)
        .catch(() => setDailyBrief(null))
        .finally(() => setBriefLoading(false));
    });
  }, [uid]);

  // ── 10 queries ────────────────────────────────────────────────────────────

  const { data: meals = [] } = useQuery<MealLog[]>({
    queryKey: ['meals', uid, today],
    enabled: !!uid,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('meal_logs')
        .select('id, date, calories, protein_g, carbs_g, fat_g')
        .eq('user_id', uid!)
        .eq('date', today);
      if (error) throw error;
      return data as MealLog[];
    },
  });

  const { data: activityLogs = [] } = useQuery<ActivityLog[]>({
    queryKey: ['activity', uid, today],
    enabled: !!uid,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('activity_logs')
        .select('id, calories_burned')
        .eq('user_id', uid!)
        .eq('date', today);
      if (error) throw error;
      return data as ActivityLog[];
    },
  });

  const { data: dailyLog } = useQuery<DailyLog | null>({
    queryKey: ['daily_log', uid, today],
    enabled: !!uid,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('daily_logs')
        .select('*')
        .eq('user_id', uid!)
        .eq('log_date', today)
        .maybeSingle();
      if (error) throw error;
      return data as DailyLog | null;
    },
  });

  const { data: supplementLog } = useQuery<{ taken_supplements: Record<string, boolean> } | null>({
    queryKey: ['supplements', uid, today],
    enabled: !!uid,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('supplements_logs')
        .select('taken_supplements')
        .eq('user_id', uid!)
        .eq('log_date', today)
        .maybeSingle();
      if (error) throw error;
      return data as { taken_supplements: Record<string, boolean> } | null;
    },
  });

  const { data: userSupplements = [] } = useQuery<{ id: string; name: string; sort_order: number }[]>({
    queryKey: ['user_supplements', uid],
    enabled: !!uid,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_supplements')
        .select('id, name, sort_order')
        .eq('user_id', uid!)
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const { data: historyDays = [] } = useQuery<string[]>({
    queryKey: ['history_deficit', uid],
    enabled: !!uid,
    queryFn: async () => {
      const sevenDaysAgo = subDays(new Date(), 7).toLocaleDateString('en-CA');
      const { data, error } = await supabase
        .from('meal_logs')
        .select('date')
        .eq('user_id', uid!)
        .gte('date', sevenDaysAgo);
      if (error) throw error;
      const unique = [...new Set((data as { date: string }[]).map(d => d.date))];
      return unique;
    },
  });

  const { data: wellnessLog } = useQuery<WellnessLog | null>({
    queryKey: ['wellness_today', uid, today],
    enabled: !!uid,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('wellness_logs')
        .select('mood, sleep_hours, energy_level')
        .eq('user_id', uid!)
        .eq('log_date', today)
        .maybeSingle();
      if (error) throw error;
      return data as WellnessLog | null;
    },
  });

  const { data: weightLogs = [] } = useQuery<WeightLog[]>({
    queryKey: ['weight_logs', uid],
    enabled: !!uid,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('weight_logs')
        .select('id, weight_lbs, logged_at')
        .eq('user_id', uid!)
        .order('logged_at', { ascending: true });
      if (error) throw error;
      return data as WeightLog[];
    },
  });

  const { data: dailyXpRow } = useQuery<{ daily_xp: number } | null>({
    queryKey: ['daily_xp', uid, today],
    enabled: !!uid,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('daily_logs')
        .select('daily_xp')
        .eq('user_id', uid!)
        .eq('log_date', today)
        .maybeSingle();
      if (error) throw error;
      return data as { daily_xp: number } | null;
    },
  });

  const { data: coachingReport } = useQuery<CoachingReport | null>({
    queryKey: ['latest_coaching_report', uid],
    enabled: !!uid,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('weekly_coaching_reports')
        .select('*')
        .eq('user_id', uid!)
        .order('week_start', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as CoachingReport | null;
    },
  });

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

  // ── Derived values ─────────────────────────────────────────────────────────

  const calorieGoal = profile?.calorie_goal ?? 2000;
  const proteinGoal = profile?.protein_goal ?? 150;
  const waterGoalOz = profile?.water_goal_oz ?? 64;
  const totalXp = profile?.total_xp ?? 0;

  const totalEaten = meals.reduce((s, m) => s + (m.calories ?? 0), 0);
  const totalProtein = meals.reduce((s, m) => s + (m.protein_g ?? 0), 0);
  const totalCarbs = meals.reduce((s, m) => s + (m.carbs_g ?? 0), 0);
  const totalFat = meals.reduce((s, m) => s + (m.fat_g ?? 0), 0);
  const burnedToday = activityLogs.reduce((s, a) => s + (a.calories_burned ?? 0), 0);
  const netCals = totalEaten - burnedToday;

  const waterOz =
    dailyLog?.water_oz ??
    (dailyLog?.water_cups != null ? dailyLog.water_cups * 8 : 0);

  // supplement counts
  const takenMap: Record<string, boolean> = supplementLog?.taken_supplements ?? {};
  const suppTotal = userSupplements.length;
  const suppTaken = userSupplements.filter(s => takenMap[s.id]).length;
  const nextSupp = userSupplements.find(s => !takenMap[s.id]);

  // weekly streak
  const weekly = getWeeklyCompletion(historyDays);

  // XP / level
  const level = Math.floor(totalXp / 100);
  const levelProgress = totalXp % 100;

  // track status
  const trackStatus = calcTrackStatus(totalEaten, totalProtein, {
    calories: calorieGoal,
    protein: proteinGoal,
  });

  const trackConfig: Record<string, { label: string; color: string }> = {
    on_track: { label: '🟢 On Track', color: '#22c55e' },
    slightly_off: { label: '🟡 Slightly Off', color: '#eab308' },
    off_track: { label: '🔴 Off Track', color: '#ef4444' },
    no_data: { label: '⚪ No Data', color: colors.textMuted },
  };
  const track = trackConfig[trackStatus];

  // insight
  const insight = getInsight(netCals, calorieGoal, totalEaten, burnedToday, profile?.current_streak ?? 0);

  // days left to target
  let daysLeft: number | null = null;
  if (profile?.target_date) {
    try {
      daysLeft = differenceInDays(parseISO(profile.target_date), startOfDay(new Date()));
    } catch {}
  }

  // weight delta
  const latestWeight = weightLogs.length > 0 ? weightLogs[weightLogs.length - 1] : null;
  const sevenDaysAgoStr = subDays(new Date(), 7).toLocaleDateString('en-CA');
  const weekAgoWt = [...weightLogs]
    .reverse()
    .find(w => w.logged_at <= sevenDaysAgoStr);
  const weightDelta =
    latestWeight && weekAgoWt
      ? latestWeight.weight_lbs - weekAgoWt.weight_lbs
      : null;

  // daily xp
  const dailyXP = dailyXpRow?.daily_xp ?? 0;

  // username avatar
  const username = profile?.username ?? user?.email?.split('@')[0] ?? 'User';
  const avatarColor = profile?.theme_color ?? colors.primary;
  const avatarLetter = username[0]?.toUpperCase() ?? '?';

  // ── Animated XP bar ──────────────────────────────────────────────────────
  // Kick off width animation whenever levelProgress changes
  const xpAnimRef = useRef(false);
  if (!xpAnimRef.current && levelProgress > 0) {
    xpAnimRef.current = true;
    Animated.timing(xpBarWidth, {
      toValue: levelProgress,
      duration: 800,
      useNativeDriver: false,
    }).start();
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      stickyHeaderIndices={[0]}
      showsVerticalScrollIndicator={false}
    >
      {/* ──────────────────── Section 1: Sticky Header ──────────────────── */}
      <View style={styles.stickyHeader}>
        <View style={styles.headerLeft}>
          <View style={[styles.avatar, { backgroundColor: avatarColor }]}>
            <Text style={styles.avatarText}>{avatarLetter}</Text>
          </View>
          <View>
            <Text style={styles.usernameLabel}>{username.toUpperCase()}</Text>
            {daysLeft !== null && (
              <View style={styles.daysLeftPill}>
                <Text style={styles.daysLeftText}>{daysLeft}d left</Text>
              </View>
            )}
          </View>
        </View>
        <View style={styles.headerRight}>
          <TouchableOpacity
            style={styles.streakBadge}
            onPress={() => router.push('/streak' as any)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.streakBadgeText}>
              🔥 {profile?.current_streak ?? 0}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => router.push('/settings' as any)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.settingsIcon}>⚙️</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ──────────────────── Section 2: Weekly / XP Card ──────────────── */}
      <View style={styles.card}>
        <View style={styles.weeklyRow}>
          <Text style={styles.weeklyStreak}>🔥 {weekly.count}/7 weekly streak</Text>
          <Text style={styles.xpLevel}>Lv {level}</Text>
        </View>

        {/* XP bar */}
        <View style={styles.xpBarBg}>
          <Animated.View
            style={[
              styles.xpBarFill,
              {
                width: xpBarWidth.interpolate({
                  inputRange: [0, 100],
                  outputRange: ['0%', '100%'],
                  extrapolate: 'clamp',
                }),
              },
            ]}
          />
        </View>
        <Text style={styles.xpLabel}>
          Level {level} · {levelProgress}/100 XP to next level
        </Text>

        <Text style={styles.weeklyInfo}>
          You logged {weekly.count}/7 days this week · Consistency: {weekly.consistency}%
        </Text>

        {weekly.count >= 5 && (
          <View style={styles.tipRow}>
            <Text style={styles.tipText}>✨ You're close to a perfect week.</Text>
          </View>
        )}
      </View>

      {/* ──────────────────── Daily Coaching Brief ──────────────────── */}
      {briefLoading ? (
        <View style={styles.briefCard}>
          <Animated.View style={[styles.briefSkeletonLine, { opacity: skeletonOpacity }]} />
          <Animated.View style={[styles.briefSkeletonLineShort, { opacity: skeletonOpacity }]} />
        </View>
      ) : dailyBrief ? (
        <View style={styles.briefCard}>
          <View style={styles.briefHeader}>
            <Ionicons name="sparkles-outline" size={14} color="#22c55e" />
            <Text style={styles.briefHeaderLabel}>Your Coach</Text>
          </View>
          <Text style={[styles.briefText, !dailyBrief.has_data && styles.briefTextMuted]}>
            {dailyBrief.message}
          </Text>
        </View>
      ) : null}

      {/* ──────────────────── Section 3: Calorie Donut ─────────────────── */}
      <View style={[styles.card, styles.centeredCard]}>
        <MacroRings
          totalEaten={totalEaten}
          burnedToday={burnedToday}
          calorieGoal={calorieGoal}
        />
      </View>

      {/* ──────────────────── Section 4: Macro Pills ───────────────────── */}
      <View style={styles.macroRow}>
        <View style={[styles.macroPill, { borderColor: '#ffa765' }]}>
          <Text style={[styles.macroPillLabel, { color: '#ffa765' }]}>Protein</Text>
          <Text style={[styles.macroPillValue, { color: '#ffa765' }]}>{Math.round(totalProtein)}g</Text>
        </View>
        <View style={[styles.macroPill, { borderColor: colors.primary }]}>
          <Text style={[styles.macroPillLabel, { color: colors.primary }]}>Carbs</Text>
          <Text style={[styles.macroPillValue, { color: colors.primary }]}>{Math.round(totalCarbs)}g</Text>
        </View>
        <View style={[styles.macroPill, { borderColor: '#ec4899' }]}>
          <Text style={[styles.macroPillLabel, { color: '#ec4899' }]}>Fat</Text>
          <Text style={[styles.macroPillValue, { color: '#ec4899' }]}>{Math.round(totalFat)}g</Text>
        </View>
      </View>

      {/* ──────────────────── Section 5: On-Track Chip ─────────────────── */}
      <View style={[styles.trackChip, { borderColor: track.color }]}>
        <Text style={[styles.trackChipText, { color: track.color }]}>{track.label}</Text>
      </View>

      {/* ──────────────────── Section 6: Weekly 7-Dot Grid ─────────────── */}
      <View style={styles.card}>
        <View style={styles.dotRow}>
          {weekly.logged.map((logged, i) => (
            <View
              key={i}
              style={[styles.dot, { backgroundColor: logged ? '#22c55e' : 'rgba(71,85,105,0.5)' }]}
            />
          ))}
        </View>
        <Text style={styles.dotInsight}>
          {weekly.consistency >= 70
            ? `${weekly.count}/7 days logged — great consistency!`
            : weekly.count > 0
            ? `${weekly.count}/7 days logged — keep building the habit.`
            : 'Start logging to build your streak.'}
        </Text>
      </View>

      {/* ──────────────────── Section 7: XP Pill ──────────────────────── */}
      <View style={styles.xpPill}>
        <Text style={styles.xpPillText}>⚡ Today's XP: {dailyXP}</Text>
      </View>

      {/* ──────────────────── Section 8: 2×2 Bento Grid ──────────────── */}
      <View style={styles.bentoRow}>
        <BentoWaterCard waterOz={waterOz} waterGoalOz={waterGoalOz} />
        <View style={{ width: spacing.sm }} />
        <BentoSuppsCard
          taken={suppTaken}
          total={suppTotal}
          nextSupplementName={nextSupp?.name}
        />
      </View>

      <View style={[styles.bentoRow, { marginTop: spacing.sm }]}>
        {/* Training card */}
        <TouchableOpacity
          style={styles.bentoCard}
          onPress={() => router.push('/activity' as any)}
          activeOpacity={0.75}
        >
          <Text style={styles.bentoIcon}>🏋️</Text>
          <Text style={styles.bentoTitle}>Training</Text>
          <Text style={styles.bentoValue}>
            {dailyLog?.workout_completed
              ? (dailyLog.workout_type ?? 'Workout').split(' ')[0]
              : 'Rest'}
          </Text>
          <Text style={styles.bentoSub}>
            {burnedToday > 0 ? `~${burnedToday} kcal burned` : 'No workout today'}
          </Text>
        </TouchableOpacity>

        <View style={{ width: spacing.sm }} />

        {/* Streak card */}
        <TouchableOpacity
          style={[styles.bentoCard, { borderColor: '#f59e0b33' }]}
          onPress={() => router.push('/streak' as any)}
          activeOpacity={0.75}
        >
          <Text style={styles.bentoIcon}>🔥</Text>
          <Text style={styles.bentoTitle}>Streak</Text>
          {(profile?.current_streak ?? 0) > 0 ? (
            <>
              <Text style={[styles.bentoValue, { color: '#f59e0b' }]}>
                {profile?.current_streak ?? 0}d
              </Text>
              <Text style={styles.bentoSub}>Best: {profile?.longest_streak ?? 0}d</Text>
            </>
          ) : (
            <Text style={styles.bentoSub}>Log meals to start</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* ──────────────────── Section 9: Weight Card ───────────────────── */}
      <TouchableOpacity
        style={styles.card}
        onPress={() => router.push('/wellness' as any)}
        activeOpacity={0.85}
      >
        <Text style={styles.cardTitle}>Weight</Text>
        {latestWeight ? (
          <View style={styles.weightRow}>
            <Text style={styles.weightValue}>{latestWeight.weight_lbs} lbs</Text>
            {weightDelta !== null && (
              <View
                style={[
                  styles.deltaBadge,
                  { backgroundColor: weightDelta <= 0 ? '#22c55e22' : '#ef444422' },
                ]}
              >
                <Text
                  style={[
                    styles.deltaText,
                    { color: weightDelta <= 0 ? '#22c55e' : '#ef4444' },
                  ]}
                >
                  {weightDelta <= 0 ? '↓' : '↑'} {Math.abs(weightDelta).toFixed(1)} lbs this week
                </Text>
              </View>
            )}
          </View>
        ) : (
          <Text style={styles.cardEmpty}>No weight logged yet</Text>
        )}
      </TouchableOpacity>

      {/* ──────────────────── Section 10: Wellness Pulse Card ─────────── */}
      <TouchableOpacity
        style={styles.card}
        onPress={() => router.push('/wellness' as any)}
        activeOpacity={0.85}
      >
        <Text style={styles.cardTitle}>Wellness Pulse</Text>
        {wellnessLog ? (
          <View style={styles.wellnessRow}>
            {wellnessLog.mood != null && (
              <Text style={styles.wellnessMood}>
                {MOOD_EMOJI[wellnessLog.mood] ?? '😐'}
              </Text>
            )}
            <View style={styles.wellnessStats}>
              {wellnessLog.sleep_hours != null && (
                <Text style={styles.wellnessStat}>
                  😴 {wellnessLog.sleep_hours}h sleep
                </Text>
              )}
              {wellnessLog.energy_level != null && (
                <Text style={styles.wellnessStat}>
                  ⚡ {energyLabel(wellnessLog.energy_level)} energy
                </Text>
              )}
            </View>
          </View>
        ) : (
          <View>
            <Text style={styles.wellnessLogTitle}>Log Wellness</Text>
            <Text style={styles.wellnessLogSub}>Sleep, mood &amp; energy</Text>
          </View>
        )}
      </TouchableOpacity>

      {/* ──────────────────── Section 11: AI Insight Card ─────────────── */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>AI Insight</Text>
        <View style={styles.insightRow}>
          <Text style={styles.insightEmoji}>{insight.emoji}</Text>
          <Text style={styles.insightText}>{insight.text}</Text>
        </View>
      </View>

      {/* ──────────────────── Section 12: Coaching Card ────────────────── */}
      <TouchableOpacity
        style={styles.card}
        onPress={() => router.push('/coaching' as any)}
        activeOpacity={0.85}
      >
        <View style={styles.coachHeader}>
          <Text style={styles.cardTitle}>Weekly Coach</Text>
          {coachingReport?.read_at === null && <View style={styles.unreadDot} />}
        </View>
        {coachingReport ? (
          <>
            <Text style={styles.coachMessage} numberOfLines={3}>
              {coachingReport.coach_message}
            </Text>
            <View style={styles.coachMeta}>
              {coachingReport.confidence && (
                <View style={styles.confidenceBadge}>
                  <Text style={styles.confidenceBadgeText}>
                    {coachingReport.confidence}
                  </Text>
                </View>
              )}
              {coachingReport.recommended_calories != null && (
                <Text style={styles.coachCals}>
                  Rec: {coachingReport.recommended_calories} kcal/day
                </Text>
              )}
            </View>
          </>
        ) : (
          <Text style={styles.cardEmpty}>No coaching report yet</Text>
        )}
      </TouchableOpacity>

      {/* Bottom padding so FAB doesn't cover last card */}
      <View style={{ height: 100 }} />

      {/* ──────────────────── FAB ──────────────────────────────────────── */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => router.push('/food' as any)}
        activeOpacity={0.85}
      >
        <Text style={styles.fabIcon}>+</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xl,
  },

  // Sticky header
  stickyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.background,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 16,
    color: '#000',
  },
  usernameLabel: {
    fontFamily: 'Inter_700Bold',
    fontSize: 15,
    color: colors.text,
    letterSpacing: 1.2,
  },
  daysLeftPill: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    marginTop: 2,
    borderWidth: 1,
    borderColor: colors.border,
    alignSelf: 'flex-start',
  },
  daysLeftText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11,
    color: colors.textMuted,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  streakBadge: {
    backgroundColor: '#f59e0b22',
    borderRadius: borderRadius.xl,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderWidth: 1,
    borderColor: '#f59e0b55',
  },
  streakBadgeText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    color: '#f59e0b',
  },
  settingsIcon: {
    fontSize: 20,
  },

  // Cards
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  centeredCard: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
  },
  cardTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: spacing.sm,
  },
  cardEmpty: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: colors.textMuted,
  },

  // Weekly / XP
  weeklyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  weeklyStreak: {
    fontFamily: 'Inter_700Bold',
    fontSize: 16,
    color: colors.text,
  },
  xpLevel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    color: colors.primary,
  },
  xpBarBg: {
    height: 6,
    backgroundColor: colors.border,
    borderRadius: 3,
    marginBottom: spacing.xs,
    overflow: 'hidden',
  },
  xpBarFill: {
    height: 6,
    backgroundColor: colors.primary,
    borderRadius: 3,
  },
  xpLabel: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: colors.textMuted,
    marginBottom: spacing.xs,
  },
  weeklyInfo: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: colors.textMuted,
  },
  tipRow: {
    marginTop: spacing.sm,
    backgroundColor: '#22c55e18',
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  tipText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    color: colors.primary,
  },

  // Macro pills
  macroRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  macroPill: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  macroPillLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  macroPillValue: {
    fontFamily: 'Inter_700Bold',
    fontSize: 18,
    marginTop: 2,
  },

  // Track chip
  trackChip: {
    alignSelf: 'center',
    borderWidth: 1,
    borderRadius: borderRadius.xl,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    marginBottom: spacing.sm,
  },
  trackChipText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
  },

  // 7-dot grid
  dotRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  dot: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  dotInsight: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: colors.textMuted,
  },

  // XP pill
  xpPill: {
    alignSelf: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  xpPillText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    color: colors.primary,
  },

  // Bento grid
  bentoRow: {
    flexDirection: 'row',
    marginBottom: 0,
  },
  bentoCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 110,
    justifyContent: 'space-between',
  },
  bentoIcon: {
    fontSize: 20,
    marginBottom: spacing.xs,
  },
  bentoTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  bentoValue: {
    fontFamily: 'Inter_700Bold',
    fontSize: 20,
    color: colors.text,
    marginTop: 2,
  },
  bentoSub: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 2,
  },

  // Weight card
  weightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  weightValue: {
    fontFamily: 'Inter_700Bold',
    fontSize: 28,
    color: colors.text,
  },
  deltaBadge: {
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  deltaText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
  },

  // Wellness
  wellnessRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  wellnessMood: {
    fontSize: 36,
  },
  wellnessStats: {
    gap: spacing.xs,
  },
  wellnessStat: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: colors.text,
  },
  wellnessLogTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 16,
    color: colors.text,
  },
  wellnessLogSub: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 2,
  },

  // Insight
  insightRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  insightEmoji: {
    fontSize: 24,
    lineHeight: 28,
  },
  insightText: {
    flex: 1,
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: colors.text,
    lineHeight: 20,
  },

  // Coaching
  coachHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#ef4444',
    marginLeft: spacing.xs,
    marginBottom: spacing.sm,
  },
  coachMessage: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: colors.text,
    lineHeight: 20,
    marginBottom: spacing.sm,
  },
  coachMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  confidenceBadge: {
    backgroundColor: colors.primary + '22',
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  confidenceBadgeText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11,
    color: colors.primary,
    textTransform: 'capitalize',
  },
  coachCals: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: colors.textMuted,
  },

  // Daily Coaching Brief card
  briefCard: {
    backgroundColor: '#111111',
    borderRadius: 12,
    padding: 16,
    marginBottom: spacing.sm,
    borderLeftWidth: 3,
    borderLeftColor: '#22c55e',
  },
  briefHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  briefHeaderLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
    color: '#888888',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  briefText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: '#ffffff',
    lineHeight: 22,
  },
  briefTextMuted: {
    color: '#888888',
  },
  briefSkeletonLine: {
    height: 12,
    backgroundColor: '#333333',
    borderRadius: 6,
    marginBottom: 10,
    width: '100%',
  },
  briefSkeletonLineShort: {
    height: 12,
    backgroundColor: '#333333',
    borderRadius: 6,
    width: '70%',
  },

  // FAB
  fab: {
    position: 'absolute',
    bottom: 88,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
  fabIcon: {
    fontFamily: 'Inter_700Bold',
    fontSize: 28,
    color: '#000',
    lineHeight: 32,
  },
});

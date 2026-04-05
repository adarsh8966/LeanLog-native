import { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { colors, spacing, borderRadius } from '../lib/theme';

// ── Date helpers ───────────────────────────────────────────────────────────────
function todayStr() {
  return new Date().toLocaleDateString('en-CA');
}

function fmtDate(iso: string) {
  const d = new Date(iso + 'T12:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function isOlderThan3Days(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  return ms > 3 * 24 * 60 * 60 * 1000;
}

// ── Style helpers ──────────────────────────────────────────────────────────────
function confidenceMeta(level?: string) {
  if (level === 'high')   return { label: 'High',   bg: '#22c55e18', border: '#22c55e55', color: '#22c55e' };
  if (level === 'medium') return { label: 'Medium', bg: '#f59e0b18', border: '#f59e0b55', color: '#f59e0b' };
  return                         { label: 'Low',    bg: '#6b728018', border: '#6b728055', color: '#6b7280' };
}

function ruleStyle(severity?: string) {
  if (severity === 'critical') return { bg: '#ef444418', border: '#ef444455', color: '#ef4444' };
  if (severity === 'warning')  return { bg: '#f59e0b18', border: '#f59e0b55', color: '#f59e0b' };
  return                              { bg: '#3b82f618', border: '#3b82f655', color: '#3b82f6' };
}

function statusStyle(status?: string) {
  if (status === 'accepted') return { bg: '#22c55e18', border: '#22c55e55', color: '#22c55e', label: 'Accepted' };
  if (status === 'declined') return { bg: '#ef444418', border: '#ef444455', color: '#ef4444', label: 'Declined' };
  if (status === 'modified') return { bg: '#818cf818', border: '#818cf855', color: '#818cf8', label: 'Modified' };
  return                            { bg: '#6b728018', border: '#6b728055', color: '#6b7280', label: 'Pending' };
}

function fmtTime(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  } catch {
    return '';
  }
}

function formatGoals(cal?: number, p?: number, c?: number, f?: number) {
  const parts: string[] = [];
  if (cal != null) parts.push(`${cal} cal`);
  if (p != null)   parts.push(`P${p}g`);
  if (c != null)   parts.push(`C${c}g`);
  if (f != null)   parts.push(`F${f}g`);
  return parts.join(' | ') || '—';
}

// ── Types ──────────────────────────────────────────────────────────────────────
type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
  created_at?: string;
};

type TriggeredRule = {
  rule_id?: string;
  label?: string;
  severity?: string;
};

type CoachingReport = {
  id: string;
  week_start: string;
  coach_message: string;
  confidence?: string;
  status?: string;
  responded_at?: string;
  generated_at?: string;
  recommended_calories?: number;
  recommended_protein?: number;
  recommended_carbs?: number;
  recommended_fat?: number;
  metrics_snapshot?: {
    avg_calories?: number;
    avg_protein?: number;
    weight_change?: number;
    workouts_completed?: number;
    workout_goal?: number;
    days_logged?: number;
  };
  triggered_rules?: TriggeredRule[];
  chat_messages?: ChatMessage[];
};

type GoalHistoryEntry = {
  id: string;
  changed_at: string;
  changed_by: string;
  prev_calories?: number;
  prev_protein?: number;
  prev_carbs?: number;
  prev_fat?: number;
  new_calories?: number;
  new_protein?: number;
  new_carbs?: number;
  new_fat?: number;
  reason?: string;
};

type UserProfile = {
  calorie_goal?: number;
  protein_goal?: number;
  carbs_goal?: number;
  fat_goal?: number;
};

type DraftRecommendation = {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  reason: string;
};

const QUICK_REPLIES = [
  'Make it more aggressive',
  "I've been stressed this week",
  "I'm not losing weight",
  'Increase my protein goal',
  'I feel too restricted',
  'Keep it the same',
];

// ── Typing indicator ──────────────────────────────────────────────────────────
function TypingDots() {
  const dots = [
    useRef(new Animated.Value(0)).current,
    useRef(new Animated.Value(0)).current,
    useRef(new Animated.Value(0)).current,
  ];

  useEffect(() => {
    const anims = dots.map((dot, i) => {
      const anim = Animated.loop(
        Animated.sequence([
          Animated.delay(i * 160),
          Animated.timing(dot, { toValue: 1, duration: 280, useNativeDriver: true }),
          Animated.timing(dot, { toValue: 0.2, duration: 280, useNativeDriver: true }),
        ])
      );
      anim.start();
      return anim;
    });
    return () => anims.forEach(a => a.stop());
  }, []);

  return (
    <View style={{ flexDirection: 'row', gap: 5, padding: 12, alignSelf: 'flex-start' }}>
      {dots.map((dot, i) => (
        <Animated.View
          key={i}
          style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: '#888888', opacity: dot }}
        />
      ))}
    </View>
  );
}

// ── Component ──────────────────────────────────────────────────────────────────
export default function Coaching() {
  const qc = useQueryClient();
  const today = todayStr();
  const chatScrollRef = useRef<ScrollView>(null);

  const [toast, setToast] = useState<string | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [draftRecommendation, setDraftRecommendation] = useState<DraftRecommendation | null>(null);
  const [expandedReports, setExpandedReports] = useState<Record<string, boolean>>({});
  const [howOpen, setHowOpen] = useState(false);

  // ── Chat tab state ──────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<'report' | 'chat'>('report');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const flatListRef = useRef<FlatList<ChatMessage>>(null);

  // auto-clear toast
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  // ── Auth ────────────────────────────────────────────────────────────────────
  const { data: user } = useQuery({
    queryKey: ['auth_user'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      return user;
    },
  });
  const uid = user?.id;

  // ── Queries ─────────────────────────────────────────────────────────────────
  const { data: reports = [], isLoading: reportsLoading } = useQuery<CoachingReport[]>({
    queryKey: ['coaching_reports', uid],
    enabled: !!uid,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('weekly_coaching_reports')
        .select('*')
        .eq('user_id', uid!)
        .order('week_start', { ascending: false })
        .limit(12);
      if (error) throw error;
      return data as CoachingReport[];
    },
  });

  const { data: goalHistory = [] } = useQuery<GoalHistoryEntry[]>({
    queryKey: ['goal_history', uid],
    enabled: !!uid,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('goal_history')
        .select('*')
        .eq('user_id', uid!)
        .order('changed_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data as GoalHistoryEntry[];
    },
  });

  const { data: profile } = useQuery<UserProfile | null>({
    queryKey: ['user_profile', uid],
    enabled: !!uid,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('calorie_goal, protein_goal, carbs_goal, fat_goal')
        .eq('user_id', uid!)
        .maybeSingle();
      if (error) throw error;
      return data as UserProfile | null;
    },
  });

  const { data: chatHistory = [] } = useQuery<ChatMessage[]>({
    queryKey: ['coaching-chat', uid],
    enabled: !!uid,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('coaching_history')
        .select('role, content, created_at')
        .eq('user_id', uid!)
        .eq('type', 'chat')
        .order('created_at', { ascending: true })
        .limit(50);
      if (error) throw error;
      return data as ChatMessage[];
    },
  });

  // Sync chat history into local state on first load
  useEffect(() => {
    if (chatHistory.length > 0 && messages.length === 0) {
      setMessages(chatHistory);
    }
  }, [chatHistory]);

  // ── Derived ─────────────────────────────────────────────────────────────────
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['coaching_reports', uid] });
    qc.invalidateQueries({ queryKey: ['user_profile', uid] });
  };

  const latestReport = reports[0] ?? null;
  const metrics = latestReport?.metrics_snapshot ?? {};
  const triggeredRules = latestReport?.triggered_rules ?? [];
  const chatMessages = latestReport?.chat_messages ?? [];
  const todaysChatCount = chatMessages.filter(
    m => m.created_at?.slice(0, 10) === today
  ).length;
  const remainingToday = Math.max(0, 5 - todaysChatCount);
  const canRequestEarlyCheckIn =
    (metrics.days_logged ?? 0) >= 3 &&
    (!latestReport?.generated_at || isOlderThan3Days(latestReport.generated_at));

  const suggestedGoals = draftRecommendation ?? {
    calories: latestReport?.recommended_calories,
    protein: latestReport?.recommended_protein,
    carbs: latestReport?.recommended_carbs,
    fat: latestReport?.recommended_fat,
  };

  // ── Mutations ────────────────────────────────────────────────────────────────
  const acceptMutation = useMutation({
    mutationFn: async () => {
      if (!latestReport || !uid) throw new Error('No report');
      const goals = {
        calorie_goal: suggestedGoals.calories,
        protein_goal: suggestedGoals.protein,
        carbs_goal: suggestedGoals.carbs,
        fat_goal: suggestedGoals.fat,
      };

      // 1. Update user_profiles
      const { error: profileErr } = await supabase
        .from('user_profiles')
        .update(goals)
        .eq('user_id', uid);
      if (profileErr) throw profileErr;

      // 2. Insert into goal_history
      const { error: histErr } = await supabase
        .from('goal_history')
        .insert({
          user_id: uid,
          changed_by: 'coach',
          prev_calories: profile?.calorie_goal,
          prev_protein: profile?.protein_goal,
          prev_carbs: profile?.carbs_goal,
          prev_fat: profile?.fat_goal,
          new_calories: suggestedGoals.calories,
          new_protein: suggestedGoals.protein,
          new_carbs: suggestedGoals.carbs,
          new_fat: suggestedGoals.fat,
          reason: draftRecommendation?.reason ?? latestReport.coach_message?.slice(0, 120),
          coach_report_id: latestReport.id,
        });
      if (histErr) throw histErr;

      // 3. Update coaching report status
      const { error: reportErr } = await supabase
        .from('weekly_coaching_reports')
        .update({ status: 'accepted', responded_at: new Date().toISOString() })
        .eq('id', latestReport.id);
      if (reportErr) throw reportErr;
    },
    onSuccess: () => {
      setToast('Goals updated successfully!');
      setDraftRecommendation(null);
      setChatOpen(false);
      invalidate();
    },
    onError: (err: Error) => Alert.alert('Error', err.message),
  });

  const declineMutation = useMutation({
    mutationFn: async () => {
      if (!latestReport) throw new Error('No report');
      const { error } = await supabase
        .from('weekly_coaching_reports')
        .update({ status: 'declined', responded_at: new Date().toISOString() })
        .eq('id', latestReport.id);
      if (error) throw error;
    },
    onSuccess: () => {
      setToast('Recommendation declined.');
      invalidate();
    },
    onError: (err: Error) => Alert.alert('Error', err.message),
  });

  const sendChatMutation = useMutation({
    mutationFn: async (message: string) => {
      if (!latestReport || !uid) throw new Error('No report');
      const { data, error } = await supabase.functions.invoke('weekly-coaching-chat', {
        body: {
          userId: uid,
          reportId: latestReport.id,
          message,
          chatHistory: chatMessages,
        },
      });
      if (error) throw error;
      return data as {
        reply: string;
        updatedMessages: ChatMessage[];
        recommendation?: DraftRecommendation;
      };
    },
    onSuccess: (data) => {
      if (data.recommendation) {
        setDraftRecommendation(data.recommendation);
      }
      // Update report with new chat messages + status
      supabase
        .from('weekly_coaching_reports')
        .update({
          chat_messages: data.updatedMessages,
          status: 'modified',
          ...(data.recommendation && {
            recommended_calories: data.recommendation.calories,
            recommended_protein: data.recommendation.protein,
            recommended_carbs: data.recommendation.carbs,
            recommended_fat: data.recommendation.fat,
          }),
        })
        .eq('id', latestReport!.id)
        .then(() => invalidate());
      setTimeout(() => chatScrollRef.current?.scrollToEnd({ animated: true }), 100);
    },
    onError: (err: Error) => Alert.alert('Error', err.message),
  });

  const earlyCheckInMutation = useMutation({
    mutationFn: async () => {
      if (!uid) throw new Error('Not authenticated');
      const { error } = await supabase.functions.invoke('weekly-coaching', {
        body: { userId: uid, manual: true },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setToast('Check-in requested! Report will appear shortly.');
      invalidate();
    },
    onError: (err: Error) => Alert.alert('Error', err.message),
  });

  // ── Handlers ──────────────────────────────────────────────────────────────
  function handleSendChat(text: string) {
    const msg = text.trim();
    if (!msg || remainingToday === 0) return;
    setChatInput('');
    sendChatMutation.mutate(msg);
  }

  function toggleReport(id: string) {
    setExpandedReports(prev => ({ ...prev, [id]: !prev[id] }));
  }

  async function sendMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed || isTyping) return;

    const userMsg: ChatMessage = {
      role: 'user',
      content: trimmed,
      created_at: new Date().toISOString(),
    };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsTyping(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('No session');

      const response = await fetch(
        `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/coaching-chat`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ message: trimmed }),
        }
      );

      const data = await response.json();
      if (data.reply) {
        const assistantMsg: ChatMessage = {
          role: 'assistant',
          content: data.reply,
          created_at: new Date().toISOString(),
        };
        setMessages(prev => [...prev, assistantMsg]);
      }
    } catch (err) {
      console.error('Chat error:', err);
    } finally {
      setIsTyping(false);
    }
  }

  // ── Loading / Empty ──────────────────────────────────────────────────────────
  if (reportsLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  if (!latestReport) {
    return (
      <View style={styles.centered}>
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>No coaching report yet</Text>
          <Text style={styles.emptyBody}>
            Keep logging and your first report will appear on Monday.
          </Text>
        </View>
      </View>
    );
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  const confidence = confidenceMeta(latestReport.confidence);
  const showRecommendation =
    latestReport.status === 'pending' &&
    (suggestedGoals.calories != null ||
      suggestedGoals.protein != null ||
      suggestedGoals.carbs != null ||
      suggestedGoals.fat != null);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* ── Toast ── */}
      {toast && (
        <View style={styles.toast}>
          <Text style={styles.toastText}>{toast}</Text>
        </View>
      )}

      {/* ── Tab Bar ── */}
      <View style={styles.tabBar}>
        {(['report', 'chat'] as const).map(tab => (
          <TouchableOpacity
            key={tab}
            style={styles.tab}
            onPress={() => setActiveTab(tab)}
            activeOpacity={0.7}
          >
            <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
              {tab === 'report' ? 'Report' : 'Chat'}
            </Text>
            {activeTab === tab && <View style={styles.tabUnderline} />}
          </TouchableOpacity>
        ))}
      </View>

      {activeTab === 'report' ? (
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {/* ────────── This Week's Report ────────── */}
        <View style={styles.card}>
          <View style={styles.reportHeader}>
            <Text style={styles.dateBadge}>{fmtDate(latestReport.week_start)}</Text>
            <View style={[styles.pill, { backgroundColor: confidence.bg, borderColor: confidence.border }]}>
              <Text style={[styles.pillText, { color: confidence.color }]}>
                {confidence.label} confidence
              </Text>
            </View>
          </View>

          <Text style={styles.coachMessage}>{latestReport.coach_message}</Text>

          {/* 2×2 metric grid */}
          <View style={styles.metricGrid}>
            <View style={styles.metricCell}>
              <Text style={styles.metricLabel}>Avg Calories</Text>
              <Text style={styles.metricValue}>
                {metrics.avg_calories != null ? Math.round(metrics.avg_calories) : '—'}
              </Text>
            </View>
            <View style={styles.metricCell}>
              <Text style={styles.metricLabel}>Avg Protein</Text>
              <Text style={styles.metricValue}>
                {metrics.avg_protein != null ? `${Math.round(metrics.avg_protein)}g` : '—'}
              </Text>
            </View>
            <View style={styles.metricCell}>
              <Text style={styles.metricLabel}>Weight Change</Text>
              <Text style={[
                styles.metricValue,
                metrics.weight_change != null && {
                  color: metrics.weight_change <= 0 ? '#22c55e' : '#ef4444',
                },
              ]}>
                {metrics.weight_change != null
                  ? `${metrics.weight_change > 0 ? '+' : ''}${metrics.weight_change.toFixed(1)} lbs`
                  : '—'}
              </Text>
            </View>
            <View style={styles.metricCell}>
              <Text style={styles.metricLabel}>Workouts</Text>
              <Text style={styles.metricValue}>
                {metrics.workouts_completed != null
                  ? `${metrics.workouts_completed}/${metrics.workout_goal ?? '?'}`
                  : '—'}
              </Text>
            </View>
          </View>

          {/* Triggered rules */}
          {triggeredRules.length > 0 && (
            <View style={styles.rulesRow}>
              {triggeredRules.map((rule, i) => {
                const rs = ruleStyle(rule.severity);
                return (
                  <View key={i} style={[styles.rulePill, { backgroundColor: rs.bg, borderColor: rs.border }]}>
                    <Text style={[styles.rulePillText, { color: rs.color }]}>
                      {rule.label ?? rule.rule_id ?? 'Rule'}
                    </Text>
                  </View>
                );
              })}
            </View>
          )}
        </View>

        {/* ────────── Recommendation Card ────────── */}
        {showRecommendation && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Recommended Changes</Text>

            {/* Current goals */}
            <View style={styles.goalsRow}>
              <Text style={styles.goalsLabel}>Current</Text>
              <View style={styles.goalsDark}>
                <Text style={styles.goalsText}>
                  {formatGoals(profile?.calorie_goal, profile?.protein_goal, profile?.carbs_goal, profile?.fat_goal)}
                </Text>
              </View>
            </View>

            {/* Suggested goals */}
            <View style={[styles.goalsRow, { marginTop: spacing.sm }]}>
              <Text style={styles.goalsLabel}>Suggested</Text>
              <View style={styles.goalsIndigo}>
                <Text style={[styles.goalsText, { color: '#818cf8' }]}>
                  {formatGoals(suggestedGoals.calories, suggestedGoals.protein, suggestedGoals.carbs, suggestedGoals.fat)}
                </Text>
              </View>
            </View>

            {/* Action buttons */}
            <View style={styles.actionRow}>
              <TouchableOpacity
                style={[styles.btnAccept, acceptMutation.isPending && styles.btnDisabled]}
                onPress={() => acceptMutation.mutate()}
                disabled={acceptMutation.isPending}
              >
                {acceptMutation.isPending
                  ? <ActivityIndicator color="#000" size="small" />
                  : <Text style={styles.btnAcceptText}>Accept Changes</Text>}
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.btnDecline, declineMutation.isPending && styles.btnDisabled]}
                onPress={() => declineMutation.mutate()}
                disabled={declineMutation.isPending}
              >
                {declineMutation.isPending
                  ? <ActivityIndicator color={colors.textMuted} size="small" />
                  : <Text style={styles.btnDeclineText}>Not Now</Text>}
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={styles.btnCustomize}
              onPress={() => setChatOpen(true)}
            >
              <Text style={styles.btnCustomizeText}>I want something different</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ────────── Coach Chat ────────── */}
        {chatOpen && (
          <View style={styles.card}>
            <View style={styles.chatHeader}>
              <Text style={styles.cardTitle}>Chat with Coach</Text>
              <Text style={styles.chatRemaining}>
                {remainingToday} chat{remainingToday !== 1 ? 's' : ''} remaining today
              </Text>
            </View>

            {/* Quick-reply chips */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.quickRepliesScroll}>
              {QUICK_REPLIES.map(qr => (
                <TouchableOpacity
                  key={qr}
                  style={styles.quickChip}
                  onPress={() => handleSendChat(qr)}
                  disabled={remainingToday === 0 || sendChatMutation.isPending}
                >
                  <Text style={styles.quickChipText}>{qr}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Message thread */}
            <ScrollView
              ref={chatScrollRef}
              style={styles.messageThread}
              nestedScrollEnabled
              onContentSizeChange={() => chatScrollRef.current?.scrollToEnd({ animated: false })}
            >
              {chatMessages.map((msg, i) => (
                <View
                  key={i}
                  style={[
                    styles.messageBubble,
                    msg.role === 'user' ? styles.bubbleUser : styles.bubbleAssistant,
                  ]}
                >
                  <Text
                    style={[
                      styles.messageText,
                      msg.role === 'user' ? styles.messageTextUser : styles.messageTextAssistant,
                    ]}
                  >
                    {msg.content}
                  </Text>
                </View>
              ))}
              {sendChatMutation.isPending && (
                <View style={[styles.messageBubble, styles.bubbleAssistant]}>
                  <ActivityIndicator color="#818cf8" size="small" />
                </View>
              )}
            </ScrollView>

            {/* Input row */}
            <View style={styles.inputRow}>
              <TextInput
                style={styles.chatInput}
                placeholder={
                  remainingToday === 0
                    ? 'Daily limit reached'
                    : 'Ask the coach…'
                }
                placeholderTextColor={colors.textMuted}
                value={chatInput}
                onChangeText={setChatInput}
                editable={remainingToday > 0}
                multiline
              />
              <Pressable
                style={[
                  styles.sendBtn,
                  (remainingToday === 0 || !chatInput.trim() || sendChatMutation.isPending) &&
                    styles.sendBtnDisabled,
                ]}
                onPress={() => handleSendChat(chatInput)}
                disabled={remainingToday === 0 || !chatInput.trim() || sendChatMutation.isPending}
              >
                <Text style={styles.sendBtnText}>Send</Text>
              </Pressable>
            </View>

            {/* Draft acceptance block */}
            {draftRecommendation && (
              <View style={styles.draftBlock}>
                <Text style={styles.draftTitle}>New Recommendation</Text>
                <Text style={styles.draftGoals}>
                  {formatGoals(
                    draftRecommendation.calories,
                    draftRecommendation.protein,
                    draftRecommendation.carbs,
                    draftRecommendation.fat
                  )}
                </Text>
                {draftRecommendation.reason ? (
                  <Text style={styles.draftReason}>{draftRecommendation.reason}</Text>
                ) : null}
                <View style={styles.draftActions}>
                  <TouchableOpacity
                    style={[styles.btnAccept, { flex: 1 }, acceptMutation.isPending && styles.btnDisabled]}
                    onPress={() => acceptMutation.mutate()}
                    disabled={acceptMutation.isPending}
                  >
                    {acceptMutation.isPending
                      ? <ActivityIndicator color="#000" size="small" />
                      : <Text style={styles.btnAcceptText}>Accept</Text>}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.btnDecline, { flex: 1 }]}
                    onPress={() => setDraftRecommendation(null)}
                  >
                    <Text style={styles.btnDeclineText}>Dismiss</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        )}

        {/* ────────── Previous Reports Accordion ────────── */}
        {reports.length > 1 && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Previous Reports</Text>
            {reports.slice(1).map(report => {
              const expanded = expandedReports[report.id] ?? false;
              const conf = confidenceMeta(report.confidence);
              const st = statusStyle(report.status);
              return (
                <View key={report.id} style={styles.accordionItem}>
                  <TouchableOpacity
                    style={styles.accordionHeader}
                    onPress={() => toggleReport(report.id)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.accordionDate}>{fmtDate(report.week_start)}</Text>
                    <View style={styles.accordionBadges}>
                      <View style={[styles.pillSm, { backgroundColor: conf.bg, borderColor: conf.border }]}>
                        <Text style={[styles.pillSmText, { color: conf.color }]}>{conf.label}</Text>
                      </View>
                      <View style={[styles.pillSm, { backgroundColor: st.bg, borderColor: st.border }]}>
                        <Text style={[styles.pillSmText, { color: st.color }]}>{st.label}</Text>
                      </View>
                    </View>
                    <Text style={styles.expandToggle}>{expanded ? '▲' : '▼'}</Text>
                  </TouchableOpacity>
                  {expanded && (
                    <View style={styles.accordionBody}>
                      <Text style={styles.accordionMessage}>{report.coach_message}</Text>
                    </View>
                  )}
                  {!expanded && (
                    <Text style={styles.accordionPreview} numberOfLines={2}>
                      {report.coach_message}
                    </Text>
                  )}
                </View>
              );
            })}
          </View>
        )}

        {/* ────────── Goal History ────────── */}
        {goalHistory.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Goal History</Text>
            {goalHistory.map(entry => (
              <View key={entry.id} style={styles.historyItem}>
                <View style={styles.historyItemHeader}>
                  <Text style={styles.historyDate}>{fmtDate(entry.changed_at)}</Text>
                  <View style={[
                    styles.pillSm,
                    entry.changed_by === 'coach'
                      ? { backgroundColor: '#818cf818', borderColor: '#818cf855' }
                      : { backgroundColor: '#22c55e18', borderColor: '#22c55e55' },
                  ]}>
                    <Text style={[
                      styles.pillSmText,
                      { color: entry.changed_by === 'coach' ? '#818cf8' : '#22c55e' },
                    ]}>
                      {entry.changed_by === 'coach' ? 'Coach' : 'You'}
                    </Text>
                  </View>
                </View>
                <Text style={styles.historyGoals}>
                  {formatGoals(entry.prev_calories, entry.prev_protein, entry.prev_carbs, entry.prev_fat)}
                  {'  →  '}
                  {formatGoals(entry.new_calories, entry.new_protein, entry.new_carbs, entry.new_fat)}
                </Text>
                {entry.reason ? (
                  <Text style={styles.historyReason}>{entry.reason}</Text>
                ) : null}
              </View>
            ))}
          </View>
        )}

        {/* ────────── How Coaching Works ────────── */}
        <View style={styles.card}>
          <TouchableOpacity
            style={styles.howHeader}
            onPress={() => setHowOpen(v => !v)}
            activeOpacity={0.7}
          >
            <Text style={styles.howTitle}>✨ How coaching works</Text>
            <Text style={styles.expandToggle}>{howOpen ? '▲' : '▼'}</Text>
          </TouchableOpacity>
          {howOpen && (
            <Text style={styles.howBody}>
              {`Every Monday, your coach reviews your past week — calories, protein, workouts, and weight trend — and generates a personalized report.\n\nYou can chat with the coach up to 5 times per day to refine the recommendations. When you accept a recommendation, your goals update immediately.\n\nYou can also request an early check-in once you've logged at least 3 days and your last report is more than 3 days old.`}
            </Text>
          )}
        </View>

        {/* ────────── Early Check-In Button ────────── */}
        {canRequestEarlyCheckIn && (
          <TouchableOpacity
            style={[styles.earlyCheckInBtn, earlyCheckInMutation.isPending && styles.btnDisabled]}
            onPress={() => earlyCheckInMutation.mutate()}
            disabled={earlyCheckInMutation.isPending}
          >
            {earlyCheckInMutation.isPending
              ? <ActivityIndicator color={colors.primary} size="small" />
              : <Text style={styles.earlyCheckInText}>⚡ Request Early Check-In</Text>}
          </TouchableOpacity>
        )}

        <View style={{ height: spacing.xl }} />
      </ScrollView>
      ) : (
      /* ── Chat Tab ── */
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}
      >
        <FlatList
          ref={flatListRef}
          data={[...messages].reverse()}
          inverted
          keyExtractor={(_, i) => String(i)}
          style={{ flex: 1 }}
          contentContainerStyle={styles.chatListContent}
          ListHeaderComponent={isTyping ? (
            <View style={styles.newBubbleAssistant}>
              <TypingDots />
            </View>
          ) : null}
          ListEmptyComponent={!isTyping ? (
            <View style={styles.chatEmpty}>
              <Text style={styles.chatEmptyText}>
                Ask your coach anything about your goals, nutrition, or progress.
              </Text>
            </View>
          ) : null}
          renderItem={({ item }) => (
            <View style={item.role === 'user' ? styles.msgWrapUser : styles.msgWrapAssistant}>
              <View style={[styles.newBubble, item.role === 'user' ? styles.newBubbleUser : styles.newBubbleAssistant]}>
                <Text style={[styles.newBubbleText, item.role === 'user' ? styles.newBubbleTextUser : styles.newBubbleTextAssistant]}>
                  {item.content}
                </Text>
              </View>
              {item.created_at ? (
                <Text style={[styles.msgTimestamp, item.role === 'user' && styles.msgTimestampRight]}>
                  {fmtTime(item.created_at)}
                </Text>
              ) : null}
            </View>
          )}
        />

        {/* Input bar */}
        <View style={styles.chatInputBar}>
          <TextInput
            style={styles.chatInputNew}
            placeholder="Message your coach..."
            placeholderTextColor="#888888"
            value={input}
            onChangeText={setInput}
            multiline
            maxHeight={88}
            editable={!isTyping}
            returnKeyType="default"
          />
          <TouchableOpacity
            style={[styles.chatSendBtn, (!input.trim() || isTyping) && styles.chatSendBtnDisabled]}
            onPress={() => sendMessage(input)}
            disabled={!input.trim() || isTyping}
            activeOpacity={0.8}
          >
            <Ionicons name="arrow-up" size={18} color={(!input.trim() || isTyping) ? '#555555' : '#000000'} />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
      )}
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  scroll: {
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
    padding: spacing.md,
  },

  // Toast
  toast: {
    position: 'absolute',
    top: spacing.sm,
    left: spacing.md,
    right: spacing.md,
    zIndex: 100,
    backgroundColor: '#4f46e5',
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    alignItems: 'center',
  },
  toastText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    color: '#fff',
  },

  // Empty state
  emptyCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    maxWidth: 320,
  },
  emptyTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 18,
    color: colors.text,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  emptyBody: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 20,
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

  // Report header
  reportHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  dateBadge: {
    fontFamily: 'Inter_700Bold',
    fontSize: 15,
    color: colors.text,
  },

  // Pills
  pill: {
    borderWidth: 1,
    borderRadius: borderRadius.xl,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  pillText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
  },
  pillSm: {
    borderWidth: 1,
    borderRadius: borderRadius.xl,
    paddingHorizontal: spacing.xs + 2,
    paddingVertical: 2,
  },
  pillSmText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 10,
  },

  // Coach message
  coachMessage: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: colors.text,
    lineHeight: 22,
    marginBottom: spacing.md,
  },

  // Metric grid
  metricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  metricCell: {
    flex: 1,
    minWidth: '44%',
    backgroundColor: colors.background,
    borderRadius: borderRadius.md,
    padding: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  metricLabel: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 3,
  },
  metricValue: {
    fontFamily: 'Inter_700Bold',
    fontSize: 18,
    color: colors.text,
  },

  // Rules row
  rulesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  rulePill: {
    borderWidth: 1,
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  rulePillText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11,
  },

  // Recommendation card
  goalsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  goalsLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
    color: colors.textMuted,
    width: 68,
  },
  goalsDark: {
    flex: 1,
    backgroundColor: colors.background,
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs + 2,
    borderWidth: 1,
    borderColor: colors.border,
  },
  goalsIndigo: {
    flex: 1,
    backgroundColor: '#818cf818',
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs + 2,
    borderWidth: 1,
    borderColor: '#818cf844',
  },
  goalsText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    color: colors.text,
  },
  actionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  btnAccept: {
    flex: 1,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm + 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnAcceptText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    color: '#000',
  },
  btnDecline: {
    flex: 1,
    backgroundColor: colors.background,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm + 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  btnDeclineText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    color: colors.textMuted,
  },
  btnCustomize: {
    marginTop: spacing.sm,
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  btnCustomizeText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    color: '#818cf8',
  },
  btnDisabled: {
    opacity: 0.5,
  },

  // Chat
  chatHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  chatRemaining: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: colors.textMuted,
  },
  quickRepliesScroll: {
    marginBottom: spacing.sm,
  },
  quickChip: {
    backgroundColor: '#818cf818',
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    borderColor: '#818cf844',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    marginRight: spacing.xs,
  },
  quickChipText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: '#818cf8',
  },
  messageThread: {
    maxHeight: 300,
    marginBottom: spacing.sm,
  },
  messageBubble: {
    maxWidth: '80%',
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs + 2,
    marginBottom: spacing.xs,
  },
  bubbleUser: {
    alignSelf: 'flex-end',
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  bubbleAssistant: {
    alignSelf: 'flex-start',
    backgroundColor: '#818cf818',
    borderWidth: 1,
    borderColor: '#818cf844',
  },
  messageText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    lineHeight: 20,
  },
  messageTextUser: {
    color: colors.text,
  },
  messageTextAssistant: {
    color: '#c7d2fe',
  },
  inputRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'flex-end',
  },
  chatInput: {
    flex: 1,
    fontFamily: 'Inter_400Regular',
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 14,
    color: colors.text,
    maxHeight: 100,
  },
  sendBtn: {
    backgroundColor: '#4f46e5',
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: {
    opacity: 0.4,
  },
  sendBtnText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    color: '#fff',
  },
  draftBlock: {
    marginTop: spacing.md,
    backgroundColor: '#818cf808',
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: '#818cf844',
    padding: spacing.md,
  },
  draftTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    color: '#818cf8',
    marginBottom: spacing.xs,
  },
  draftGoals: {
    fontFamily: 'Inter_700Bold',
    fontSize: 15,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  draftReason: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: colors.textMuted,
    marginBottom: spacing.sm,
    lineHeight: 18,
  },
  draftActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },

  // Previous reports accordion
  accordionItem: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
    marginTop: spacing.sm,
  },
  accordionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  accordionDate: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    color: colors.text,
    flex: 1,
  },
  accordionBadges: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  expandToggle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: colors.textMuted,
    marginLeft: spacing.xs,
  },
  accordionBody: {
    marginTop: spacing.sm,
  },
  accordionMessage: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: colors.text,
    lineHeight: 20,
  },
  accordionPreview: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: colors.textMuted,
    lineHeight: 18,
    marginTop: 4,
  },

  // Goal history
  historyItem: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
    marginTop: spacing.sm,
  },
  historyItemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: 4,
  },
  historyDate: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    color: colors.text,
    flex: 1,
  },
  historyGoals: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    color: colors.text,
    marginBottom: 3,
  },
  historyReason: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: colors.textMuted,
    lineHeight: 18,
  },

  // How coaching works
  howHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  howTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
    color: colors.text,
  },
  howBody: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: colors.textMuted,
    lineHeight: 20,
    marginTop: spacing.md,
  },

  // Tab bar
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.background,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 14,
    position: 'relative',
  },
  tabText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    color: '#888888',
  },
  tabTextActive: {
    color: '#ffffff',
  },
  tabUnderline: {
    position: 'absolute',
    bottom: 0,
    left: '20%',
    right: '20%',
    height: 2,
    borderRadius: 1,
    backgroundColor: '#22c55e',
  },

  // Chat tab
  chatListContent: {
    padding: spacing.md,
    flexGrow: 1,
  },
  chatEmpty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xl * 2,
  },
  chatEmptyText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: '#888888',
    textAlign: 'center',
    lineHeight: 22,
  },
  msgWrapUser: {
    alignItems: 'flex-end',
    marginBottom: spacing.sm,
  },
  msgWrapAssistant: {
    alignItems: 'flex-start',
    marginBottom: spacing.sm,
  },
  newBubble: {
    maxWidth: '80%',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  newBubbleUser: {
    backgroundColor: '#22c55e',
  },
  newBubbleAssistant: {
    backgroundColor: '#1a1a1a',
  },
  newBubbleText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    lineHeight: 20,
  },
  newBubbleTextUser: {
    color: '#000000',
  },
  newBubbleTextAssistant: {
    color: '#ffffff',
  },
  msgTimestamp: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: '#888888',
    marginTop: 4,
  },
  msgTimestampRight: {
    textAlign: 'right',
  },
  chatInputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    padding: spacing.md,
    paddingBottom: Platform.OS === 'ios' ? spacing.md : spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
  chatInputNew: {
    flex: 1,
    fontFamily: 'Inter_400Regular',
    fontSize: 15,
    color: '#ffffff',
    backgroundColor: '#111111',
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
  },
  chatSendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#22c55e',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chatSendBtnDisabled: {
    backgroundColor: '#1f2937',
  },

  // Early check-in
  earlyCheckInBtn: {
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    backgroundColor: '#22c55e10',
    marginTop: spacing.xs,
  },
  earlyCheckInText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
    color: colors.primary,
  },
});

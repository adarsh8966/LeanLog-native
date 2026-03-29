import { useState, useMemo } from 'react';
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
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { LineChart } from 'react-native-chart-kit';
import { supabase } from '../../lib/supabase';
import { colors, spacing, borderRadius } from '../../lib/theme';

const SCREEN_WIDTH = Dimensions.get('window').width;
// chart width accounts for ScrollView horizontal padding + card padding
const CHART_WIDTH = SCREEN_WIDTH - spacing.md * 4;

type WeightLog = {
  id: string;
  user_id: string;
  weight_lbs: number;
  logged_at: string;
};

function todayStr() {
  return new Date().toISOString().split('T')[0];
}

function fmtDate(dateStr: string) {
  const d = new Date(dateStr + 'T12:00:00');
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export default function Wellness() {
  const [weightInput, setWeightInput] = useState('');
  const [editMode, setEditMode] = useState(false);
  const qc = useQueryClient();

  // ── Data fetching ──────────────────────────────────────────────────────────
  const { data: logs = [], isLoading } = useQuery<WeightLog[]>({
    queryKey: ['weight_logs'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      const { data, error } = await supabase
        .from('weight_logs')
        .select('id, user_id, weight_lbs, logged_at')
        .eq('user_id', user.id)
        .order('logged_at', { ascending: false })
        .limit(14);
      if (error) throw error;
      return data as WeightLog[];
    },
  });

  const today = todayStr();
  const todayLog = logs.find(l => l.logged_at === today);
  const recentLogs = logs.slice(0, 7);
  // chart needs ascending order
  const chartLogs = useMemo(() => [...logs].reverse(), [logs]);

  // ── Mutations ──────────────────────────────────────────────────────────────
  const saveMutation = useMutation({
    mutationFn: async (weight: number) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      if (todayLog) {
        const { error } = await supabase
          .from('weight_logs')
          .update({ weight_lbs: weight })
          .eq('id', todayLog.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('weight_logs')
          .insert({ user_id: user.id, weight_lbs: weight, logged_at: today });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['weight_logs'] });
      setWeightInput('');
      setEditMode(false);
    },
    onError: (err: Error) => Alert.alert('Error', err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('weight_logs').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['weight_logs'] }),
    onError: (err: Error) => Alert.alert('Error', err.message),
  });

  // ── Handlers ───────────────────────────────────────────────────────────────
  function handleSave() {
    const val = parseFloat(weightInput);
    if (isNaN(val) || val <= 0) {
      Alert.alert('Invalid weight', 'Enter a valid weight in lbs.');
      return;
    }
    saveMutation.mutate(val);
  }

  function confirmDelete(id: string) {
    Alert.alert('Delete entry', 'Remove this weight entry?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteMutation.mutate(id) },
    ]);
  }

  // ── Chart data ─────────────────────────────────────────────────────────────
  const chartData = useMemo(() => {
    if (chartLogs.length < 2) return null;
    return {
      labels: chartLogs.map((l, i) =>
        // show every other label to avoid crowding
        i % 2 === 0 ? fmtDate(l.logged_at) : ''
      ),
      datasets: [{ data: chartLogs.map(l => l.weight_lbs) }],
    };
  }, [chartLogs]);

  // ── Render ─────────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.heading}>Wellness</Text>

      {/* ── Today's weight ── */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Today's Weight</Text>

        {todayLog && !editMode ? (
          <View style={styles.todayRow}>
            <Text style={styles.todayWeight}>{todayLog.weight_lbs} lbs</Text>
            <TouchableOpacity
              onPress={() => {
                setEditMode(true);
                setWeightInput(String(todayLog.weight_lbs));
              }}
            >
              <Text style={styles.editLink}>Edit</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <View style={styles.inputRow}>
              <TextInput
                style={styles.input}
                placeholder="e.g. 165.5"
                placeholderTextColor={colors.textMuted}
                value={weightInput}
                onChangeText={setWeightInput}
                keyboardType="decimal-pad"
                returnKeyType="done"
              />
              <TouchableOpacity
                style={[styles.saveBtn, saveMutation.isPending && styles.saveBtnDisabled]}
                onPress={handleSave}
                disabled={saveMutation.isPending}
              >
                {saveMutation.isPending ? (
                  <ActivityIndicator color="#000" size="small" />
                ) : (
                  <Text style={styles.saveBtnText}>
                    {todayLog ? 'Update' : 'Save'}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
            {editMode && (
              <TouchableOpacity onPress={() => { setEditMode(false); setWeightInput(''); }}>
                <Text style={styles.cancelLink}>Cancel</Text>
              </TouchableOpacity>
            )}
          </>
        )}
      </View>

      {/* ── 14-day trend chart ── */}
      {chartData ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>14-Day Trend</Text>
          <LineChart
            data={chartData}
            width={CHART_WIDTH}
            height={180}
            chartConfig={{
              backgroundColor: colors.surface,
              backgroundGradientFrom: colors.surface,
              backgroundGradientTo: colors.surface,
              decimalPlaces: 1,
              color: () => colors.primary,
              labelColor: () => colors.textMuted,
              propsForBackgroundLines: { stroke: 'transparent' },
              propsForDots: {
                r: '4',
                strokeWidth: '2',
                stroke: colors.primary,
                fill: colors.primary,
              },
            }}
            bezier
            withInnerLines={false}
            withOuterLines={false}
            style={{ borderRadius: borderRadius.md }}
          />
        </View>
      ) : logs.length === 1 ? (
        <View style={[styles.card, styles.emptyChart]}>
          <Text style={styles.emptyChartText}>
            Log at least 2 entries to see your trend.
          </Text>
        </View>
      ) : null}

      {/* ── Recent entries ── */}
      {recentLogs.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Recent Entries</Text>
          {recentLogs.map((log, index) => (
            <View
              key={log.id}
              style={[
                styles.entryRow,
                index < recentLogs.length - 1 && styles.entryRowBorder,
              ]}
            >
              <View>
                <Text style={styles.entryDate}>{fmtDate(log.logged_at)}</Text>
                {log.logged_at === today && (
                  <Text style={styles.todayBadge}>Today</Text>
                )}
              </View>
              <Text style={styles.entryWeight}>{log.weight_lbs} lbs</Text>
              <TouchableOpacity
                onPress={() => confirmDelete(log.id)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={styles.deleteBtn}>Delete</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      {logs.length === 0 && (
        <View style={styles.emptyState}>
          <Text style={styles.emptyStateText}>
            No weight entries yet. Log your first entry above.
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

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

  // Today's weight
  todayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  todayWeight: {
    fontFamily: 'Inter_700Bold',
    fontSize: 36,
    color: colors.primary,
  },
  editLink: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    color: colors.primary,
  },
  cancelLink: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: colors.textMuted,
    marginTop: spacing.sm,
  },

  // Input row
  inputRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  input: {
    flex: 1,
    fontFamily: 'Inter_400Regular',
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    fontSize: 16,
    color: colors.text,
  },
  saveBtn: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 80,
  },
  saveBtnDisabled: {
    opacity: 0.6,
  },
  saveBtnText: {
    fontFamily: 'Inter_600SemiBold',
    color: '#000',
    fontSize: 15,
  },

  // Chart empty
  emptyChart: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
  },
  emptyChartText: {
    fontFamily: 'Inter_400Regular',
    color: colors.textMuted,
    fontSize: 14,
  },

  // Recent entries
  entryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm + 2,
  },
  entryRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  entryDate: {
    fontFamily: 'Inter_400Regular',
    fontSize: 15,
    color: colors.text,
    minWidth: 48,
  },
  todayBadge: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: colors.primary,
    marginTop: 2,
  },
  entryWeight: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
    color: colors.text,
    flex: 1,
    textAlign: 'center',
  },
  deleteBtn: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: '#ef4444',
  },

  // Empty state
  emptyState: {
    alignItems: 'center',
    marginTop: spacing.xl,
  },
  emptyStateText: {
    fontFamily: 'Inter_400Regular',
    color: colors.textMuted,
    fontSize: 14,
    textAlign: 'center',
  },
});

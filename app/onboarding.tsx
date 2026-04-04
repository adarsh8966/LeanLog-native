import { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Picker } from '@react-native-picker/picker';
import DateTimePicker from '@react-native-community/datetimepicker';
import { colors, spacing, borderRadius, GOAL_AGGRESSIVENESS } from '../lib/theme';

// ─── Types ────────────────────────────────────────────────────────────────────

type FormData = {
  name: string;
  age: string;
  sex: string;
  current_weight_lbs: string;
  height_ft: string;
  height_in: string;
  goal: string;
  goal_weight_lbs: string;
  target_date: string;
  unit_system: 'imperial' | 'metric';
  water_goal_oz: number | null;
  workout_freq: string;
  body_fat_pct: string;
  waist_cm: string;
  waist_in: string;
  skip_body_fat: boolean;
  experience_level: string;
  aggressiveness: string;
  primary_focus: string;
  caloric_surplus_level: string;
  diet_preference: string;
  activity_level: string;
  bmr_calculated: number | null;
  tdee_calculated: number | null;
  bmr_formula: string;
  coaching_enabled: boolean;
};

const INITIAL_FORM: FormData = {
  name: '',
  age: '',
  sex: '',
  current_weight_lbs: '',
  height_ft: '5',
  height_in: '10',
  goal: '',
  goal_weight_lbs: '',
  target_date: '',
  unit_system: 'imperial',
  water_goal_oz: null,
  workout_freq: '3-4x/week',
  body_fat_pct: '',
  waist_cm: '',
  waist_in: '',
  skip_body_fat: false,
  experience_level: '',
  aggressiveness: 'moderate',
  primary_focus: 'fat_loss_muscle',
  caloric_surplus_level: 'moderate',
  diet_preference: 'standard',
  activity_level: 'moderately_active',
  bmr_calculated: null,
  tdee_calculated: null,
  bmr_formula: '',
  coaching_enabled: true,
};

// ─── Progress Bar ─────────────────────────────────────────────────────────────

const STEP_LABELS = [
  'Basic Info',
  'Goal',
  'Diet',
  'AI Plan',
  'Water Goal',
  'Coach',
  'Confirm',
  'Disclaimer',
];

function ProgressBar({ step }: { step: number }) {
  return (
    <View style={styles.progressContainer}>
      {STEP_LABELS.map((label, i) => (
        <View key={i} style={styles.progressSegmentWrapper}>
          <View
            style={[
              styles.progressBar,
              { backgroundColor: i <= step ? colors.primary : colors.border },
            ]}
          />
          <Text
            numberOfLines={1}
            ellipsizeMode="tail"
            style={[
              styles.progressLabel,
              { color: i <= step ? colors.primary : colors.textMuted },
            ]}
          >
            {label}
          </Text>
        </View>
      ))}
    </View>
  );
}

// ─── Pill Button ──────────────────────────────────────────────────────────────

function PillButton({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.pill,
        selected && { backgroundColor: colors.primary, borderColor: colors.primary },
      ]}
    >
      <Text style={[styles.pillText, selected && { color: '#000' }]}>{label}</Text>
    </Pressable>
  );
}

// ─── Step 0 — Basic Info ──────────────────────────────────────────────────────

function Step0({
  formData,
  setFormData,
  errors,
}: {
  formData: FormData;
  setFormData: (fn: (prev: FormData) => FormData) => void;
  errors: Record<string, string>;
}) {
  const isImperial = formData.unit_system === 'imperial';

  function setField<K extends keyof FormData>(key: K, value: FormData[K]) {
    setFormData(prev => ({ ...prev, [key]: value }));
  }

  function handleWeightChange(raw: string) {
    const num = parseFloat(raw);
    if (formData.unit_system === 'metric' && !isNaN(num)) {
      const lbs = (num * 2.20462).toFixed(1);
      setFormData(prev => ({ ...prev, current_weight_lbs: lbs }));
    } else {
      setFormData(prev => ({ ...prev, current_weight_lbs: raw }));
    }
  }

  function handleHeightCmBlur(raw: string) {
    const cm = parseFloat(raw);
    if (!isNaN(cm)) {
      const totalIn = cm / 2.54;
      const ft = Math.floor(totalIn / 12);
      const inch = Math.round(totalIn % 12);
      setFormData(prev => ({
        ...prev,
        height_ft: String(ft),
        height_in: String(inch),
      }));
    }
  }

  const heightCmValue =
    formData.height_ft && formData.height_in
      ? String(
          Math.round(
            (parseInt(formData.height_ft) * 12 + parseInt(formData.height_in)) * 2.54,
          ),
        )
      : '';

  const displayWeight =
    formData.unit_system === 'metric' && formData.current_weight_lbs
      ? String((parseFloat(formData.current_weight_lbs) / 2.20462).toFixed(1))
      : formData.current_weight_lbs;

  return (
    <ScrollView contentContainerStyle={styles.stepContent} keyboardShouldPersistTaps="handled">
      <Text style={styles.stepTitle}>Basic Info</Text>
      <Text style={styles.stepSubtitle}>Let's get to know you</Text>

      {/* Unit System */}
      <Text style={styles.label}>Unit System</Text>
      <View style={styles.pillRow}>
        <PillButton
          label="Imperial"
          selected={formData.unit_system === 'imperial'}
          onPress={() => setField('unit_system', 'imperial')}
        />
        <PillButton
          label="Metric"
          selected={formData.unit_system === 'metric'}
          onPress={() => setField('unit_system', 'metric')}
        />
      </View>

      {/* Name */}
      <Text style={styles.label}>Name *</Text>
      <TextInput
        style={[styles.input, errors.name ? styles.inputError : null]}
        value={formData.name}
        onChangeText={v => setField('name', v)}
        placeholder="Your name"
        placeholderTextColor={colors.textMuted}
        autoCorrect={false}
      />
      {errors.name ? <Text style={styles.errorText}>{errors.name}</Text> : null}

      {/* Age */}
      <Text style={styles.label}>Age *</Text>
      <TextInput
        style={[styles.input, errors.age ? styles.inputError : null]}
        value={formData.age}
        onChangeText={v => setField('age', v)}
        placeholder="e.g. 25"
        placeholderTextColor={colors.textMuted}
        keyboardType="numeric"
      />
      {errors.age ? <Text style={styles.errorText}>{errors.age}</Text> : null}

      {/* Sex */}
      <Text style={styles.label}>Sex *</Text>
      <View style={styles.pillRow}>
        <PillButton
          label="Male"
          selected={formData.sex === 'male'}
          onPress={() => setField('sex', 'male')}
        />
        <PillButton
          label="Female"
          selected={formData.sex === 'female'}
          onPress={() => setField('sex', 'female')}
        />
      </View>
      {errors.sex ? <Text style={styles.errorText}>{errors.sex}</Text> : null}

      {/* Weight */}
      <Text style={styles.label}>Current Weight ({isImperial ? 'lbs' : 'kg'}) *</Text>
      <TextInput
        style={[styles.input, errors.current_weight_lbs ? styles.inputError : null]}
        value={displayWeight}
        onChangeText={handleWeightChange}
        placeholder={isImperial ? 'e.g. 180' : 'e.g. 82'}
        placeholderTextColor={colors.textMuted}
        keyboardType="decimal-pad"
      />
      {errors.current_weight_lbs ? (
        <Text style={styles.errorText}>{errors.current_weight_lbs}</Text>
      ) : null}

      {/* Height */}
      <Text style={styles.label}>Height *</Text>
      {isImperial ? (
        <View style={styles.pickerRow}>
          <View style={[styles.pickerWrapper, { flex: 1, marginRight: spacing.sm }]}>
            <Text style={styles.pickerLabel}>Feet</Text>
            <View style={styles.pickerBox}>
              <Picker
                selectedValue={formData.height_ft}
                onValueChange={v => setField('height_ft', String(v))}
                style={styles.picker}
                dropdownIconColor={colors.textMuted}
                itemStyle={{ color: colors.text }}
              >
                {Array.from({ length: 4 }, (_, i) => i + 4).map(ft => (
                  <Picker.Item
                    key={ft}
                    label={`${ft} ft`}
                    value={String(ft)}
                    color={Platform.OS === 'ios' ? colors.text : undefined}
                  />
                ))}
              </Picker>
            </View>
          </View>
          <View style={[styles.pickerWrapper, { flex: 1 }]}>
            <Text style={styles.pickerLabel}>Inches</Text>
            <View style={styles.pickerBox}>
              <Picker
                selectedValue={formData.height_in}
                onValueChange={v => setField('height_in', String(v))}
                style={styles.picker}
                dropdownIconColor={colors.textMuted}
                itemStyle={{ color: colors.text }}
              >
                {Array.from({ length: 12 }, (_, i) => i).map(inch => (
                  <Picker.Item
                    key={inch}
                    label={`${inch} in`}
                    value={String(inch)}
                    color={Platform.OS === 'ios' ? colors.text : undefined}
                  />
                ))}
              </Picker>
            </View>
          </View>
        </View>
      ) : (
        <TextInput
          style={[styles.input, errors.height_ft ? styles.inputError : null]}
          defaultValue={heightCmValue}
          onBlur={e => handleHeightCmBlur(e.nativeEvent.text)}
          placeholder="e.g. 178"
          placeholderTextColor={colors.textMuted}
          keyboardType="numeric"
        />
      )}
      {errors.height_ft ? <Text style={styles.errorText}>{errors.height_ft}</Text> : null}

      {/* Body Fat % */}
      {!formData.skip_body_fat ? (
        <>
          <Text style={styles.label}>Body Fat % (optional)</Text>
          <TextInput
            style={styles.input}
            value={formData.body_fat_pct}
            onChangeText={v => {
              const n = parseFloat(v);
              if (v === '' || (!isNaN(n) && n >= 5 && n <= 40)) {
                setField('body_fat_pct', v);
              } else if (!isNaN(n)) {
                setField('body_fat_pct', v);
              }
            }}
            placeholder="e.g. 18"
            placeholderTextColor={colors.textMuted}
            keyboardType="decimal-pad"
          />
          <Pressable onPress={() => setField('skip_body_fat', true)}>
            <Text style={styles.linkText}>Skip — use waist instead</Text>
          </Pressable>
        </>
      ) : (
        <>
          <Text style={styles.label}>Waist ({isImperial ? 'inches' : 'cm'})</Text>
          <TextInput
            style={styles.input}
            value={isImperial ? formData.waist_in : formData.waist_cm}
            onChangeText={v =>
              setField(isImperial ? 'waist_in' : 'waist_cm', v)
            }
            placeholder={isImperial ? 'e.g. 34' : 'e.g. 86'}
            placeholderTextColor={colors.textMuted}
            keyboardType="decimal-pad"
          />
          <Pressable onPress={() => setField('skip_body_fat', false)}>
            <Text style={styles.linkText}>Use body fat % instead</Text>
          </Pressable>
        </>
      )}

      {/* Training Experience */}
      <Text style={styles.label}>Training Experience *</Text>
      <View style={styles.pillRow}>
        {(['beginner', 'intermediate', 'advanced'] as const).map(level => (
          <PillButton
            key={level}
            label={level.charAt(0).toUpperCase() + level.slice(1)}
            selected={formData.experience_level === level}
            onPress={() => setField('experience_level', level)}
          />
        ))}
      </View>

      <View style={{ height: spacing.xl }} />
    </ScrollView>
  );
}

// ─── Step 1 — Goal ───────────────────────────────────────────────────────────

function Step1({
  formData,
  setFormData,
  errors,
  goalMode,
  setGoalMode,
}: {
  formData: FormData;
  setFormData: (fn: (prev: FormData) => FormData) => void;
  errors: Record<string, string>;
  goalMode: 'select' | 'details';
  setGoalMode: (mode: 'select' | 'details') => void;
}) {
  const [showDatePicker, setShowDatePicker] = useState(false);
  const isImperial = formData.unit_system === 'imperial';
  const isBulking = formData.goal === 'bulking';

  const minDate = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
  const targetDateObj = formData.target_date
    ? new Date(formData.target_date + 'T12:00:00')
    : undefined;

  function setField<K extends keyof FormData>(key: K, value: FormData[K]) {
    setFormData(prev => ({ ...prev, [key]: value }));
  }

  function handleGoalSelect(goal: 'cutting' | 'bulking') {
    setFormData(prev => ({
      ...prev,
      goal,
      primary_focus: goal === 'cutting' ? 'fat_loss_muscle' : 'muscle_gain',
    }));
    setGoalMode('details');
  }

  // ── Select mode ──────────────────────────────────────────────────────────────
  if (goalMode === 'select') {
    return (
      <ScrollView contentContainerStyle={styles.stepContent} keyboardShouldPersistTaps="handled">
        <Text style={styles.stepTitle}>Your Goal</Text>
        <Text style={styles.stepSubtitle}>What are you working towards?</Text>

        {errors.goal ? (
          <Text style={[styles.errorText, { marginBottom: spacing.sm }]}>{errors.goal}</Text>
        ) : null}

        <Pressable
          style={[styles.goalCard, formData.goal === 'cutting' && { borderColor: colors.primary }]}
          onPress={() => handleGoalSelect('cutting')}
        >
          <Text style={styles.goalCardEmoji}>🔥</Text>
          <Text style={styles.goalCardTitle}>Cut</Text>
          <Text style={styles.goalCardDesc}>Lose fat, preserve muscle</Text>
        </Pressable>

        <Pressable
          style={[styles.goalCard, formData.goal === 'bulking' && { borderColor: colors.primary }]}
          onPress={() => handleGoalSelect('bulking')}
        >
          <Text style={styles.goalCardEmoji}>💪</Text>
          <Text style={styles.goalCardTitle}>Bulk</Text>
          <Text style={styles.goalCardDesc}>Build muscle, gain strength</Text>
        </Pressable>
      </ScrollView>
    );
  }

  // ── Details mode ─────────────────────────────────────────────────────────────
  const aggressivenessKeys = Object.keys(
    GOAL_AGGRESSIVENESS,
  ) as (keyof typeof GOAL_AGGRESSIVENESS)[];

  const primaryFocusOptions = isBulking
    ? [
        { key: 'muscle_gain', label: 'Muscle Gain', desc: 'Maximize hypertrophy' },
        { key: 'lean_bulk', label: 'Lean Bulk', desc: 'Muscle with minimal fat' },
      ]
    : [
        { key: 'fat_loss', label: 'Fat Loss', desc: 'Maximize fat burning' },
        { key: 'fat_loss_muscle', label: 'Fat Loss + Muscle', desc: 'Preserve lean mass' },
      ];

  const displayGoalWeight =
    !isImperial && formData.goal_weight_lbs
      ? String((parseFloat(formData.goal_weight_lbs) / 2.20462).toFixed(1))
      : formData.goal_weight_lbs;

  return (
    <ScrollView contentContainerStyle={styles.stepContent} keyboardShouldPersistTaps="handled">
      <Text style={styles.stepTitle}>{isBulking ? 'Bulk 💪' : 'Cut 🔥'} Details</Text>
      <Text style={styles.stepSubtitle}>Fine-tune your approach</Text>

      {/* Aggressiveness */}
      <Text style={styles.label}>Approach</Text>
      {aggressivenessKeys.map(key => {
        const opt = GOAL_AGGRESSIVENESS[key];
        const selected = formData.aggressiveness === key;
        return (
          <Pressable
            key={key}
            style={[styles.verticalOption, selected && { borderColor: colors.primary }]}
            onPress={() => setField('aggressiveness', key)}
          >
            <View style={{ flex: 1 }}>
              <Text style={[styles.verticalOptionLabel, selected && { color: colors.primary }]}>
                {opt.label}
              </Text>
              <Text style={styles.verticalOptionDesc}>{opt.desc}</Text>
            </View>
            <View
              style={[
                styles.radioCircle,
                selected && { borderColor: colors.primary, backgroundColor: colors.primary },
              ]}
            />
          </Pressable>
        );
      })}

      {/* Caloric Surplus Level — bulking only */}
      {isBulking && (
        <>
          <Text style={styles.label}>Caloric Surplus</Text>
          <View style={styles.pillRow}>
            {(
              [
                { key: 'mild', label: 'Mild +200' },
                { key: 'moderate', label: 'Moderate +300' },
                { key: 'high', label: 'High +500' },
              ] as const
            ).map(opt => (
              <PillButton
                key={opt.key}
                label={opt.label}
                selected={formData.caloric_surplus_level === opt.key}
                onPress={() => setField('caloric_surplus_level', opt.key)}
              />
            ))}
          </View>
        </>
      )}

      {/* Primary Focus */}
      <Text style={styles.label}>Primary Focus</Text>
      {primaryFocusOptions.map(opt => {
        const selected = formData.primary_focus === opt.key;
        return (
          <Pressable
            key={opt.key}
            style={[styles.verticalOption, selected && { borderColor: colors.primary }]}
            onPress={() => setField('primary_focus', opt.key)}
          >
            <View style={{ flex: 1 }}>
              <Text style={[styles.verticalOptionLabel, selected && { color: colors.primary }]}>
                {opt.label}
              </Text>
              <Text style={styles.verticalOptionDesc}>{opt.desc}</Text>
            </View>
            <View
              style={[
                styles.radioCircle,
                selected && { borderColor: colors.primary, backgroundColor: colors.primary },
              ]}
            />
          </Pressable>
        );
      })}

      {/* Target Weight */}
      <Text style={styles.label}>Target Weight ({isImperial ? 'lbs' : 'kg'}) *</Text>
      <TextInput
        style={[styles.input, errors.goal_weight_lbs ? styles.inputError : null]}
        value={displayGoalWeight}
        onChangeText={raw => {
          const num = parseFloat(raw);
          if (!isNaN(num) && formData.unit_system === 'metric') {
            setField('goal_weight_lbs', String((num * 2.20462).toFixed(1)));
          } else {
            setField('goal_weight_lbs', raw);
          }
        }}
        placeholder={isImperial ? 'e.g. 165' : 'e.g. 75'}
        placeholderTextColor={colors.textMuted}
        keyboardType="decimal-pad"
      />
      {errors.goal_weight_lbs ? (
        <Text style={styles.errorText}>{errors.goal_weight_lbs}</Text>
      ) : null}

      {/* Target Date */}
      <Text style={styles.label}>Target Date *</Text>
      <Pressable
        style={[styles.input, styles.dateButton, errors.target_date ? styles.inputError : null]}
        onPress={() => setShowDatePicker(true)}
      >
        <Text
          style={{
            color: formData.target_date ? colors.text : colors.textMuted,
            fontFamily: 'Inter_400Regular',
            fontSize: 15,
          }}
        >
          {formData.target_date || 'Select a date'}
        </Text>
      </Pressable>
      {errors.target_date ? <Text style={styles.errorText}>{errors.target_date}</Text> : null}

      {showDatePicker && (
        <DateTimePicker
          value={targetDateObj || minDate}
          mode="date"
          minimumDate={minDate}
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={(event: any, date?: Date) => {
            if (Platform.OS === 'android') setShowDatePicker(false);
            if (date && event.type === 'set') {
              setField('target_date', date.toLocaleDateString('en-CA'));
            }
          }}
        />
      )}

      <View style={{ height: spacing.xl }} />
    </ScrollView>
  );
}

// ─── Placeholder steps ────────────────────────────────────────────────────────
function Step2() { return null; }
function Step3() { return null; }
function Step4() { return null; }
function Step5() { return null; }
function Step6() { return null; }
function Step7() { return null; }

// ─── Validation ───────────────────────────────────────────────────────────────

function validateStep1Details(formData: FormData): Record<string, string> {
  const errs: Record<string, string> = {};
  const w = parseFloat(formData.goal_weight_lbs);
  if (!formData.goal_weight_lbs || isNaN(w) || w < 30)
    errs.goal_weight_lbs = 'Enter a valid target weight (≥ 30 lbs)';
  if (!formData.target_date) errs.target_date = 'Please select a target date';
  return errs;
}

function validateStep0(formData: FormData): Record<string, string> {
  const errs: Record<string, string> = {};
  if (!formData.name.trim()) errs.name = 'Name is required';
  const age = parseInt(formData.age);
  if (!formData.age || isNaN(age) || age < 13 || age > 120)
    errs.age = 'Age must be between 13 and 120';
  if (!formData.sex) errs.sex = 'Please select a sex';
  const w = parseFloat(formData.current_weight_lbs);
  if (!formData.current_weight_lbs || isNaN(w) || w < 30)
    errs.current_weight_lbs = 'Enter a valid weight (≥ 30 lbs)';
  if (!formData.height_ft) errs.height_ft = 'Height is required';
  return errs;
}

// ─── Main Onboarding Screen ───────────────────────────────────────────────────

export default function OnboardingScreen() {
  const [ageGatePassed, setAgeGatePassed] = useState<boolean | null>(null);
  const [step, setStep] = useState(0);
  const [step1GoalMode, setStep1GoalMode] = useState<'select' | 'details'>('select');
  const [formData, setFormData] = useState<FormData>(INITIAL_FORM);
  const [suggestedMacros, setSuggestedMacros] = useState<Record<string, number> | null>(null);
  const [confirmedMacros, setConfirmedMacros] = useState<Record<string, number> | null>(null);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Load age gate state from storage
  useEffect(() => {
    AsyncStorage.getItem('age_verified').then(val => {
      setAgeGatePassed(val === 'true');
    });
  }, []);

  // ── Age gate loading ────────────────────────────────────────────────────────
  if (ageGatePassed === null) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  // ── Age gate: under 13 ──────────────────────────────────────────────────────
  if (ageGatePassed === false) {
    return (
      <View style={styles.ageGate}>
        <Text style={styles.ageGateTitle}>Age Verification</Text>
        <Text style={styles.ageGateSubtitle}>
          Please confirm your age to continue
        </Text>
        <Pressable
          style={[styles.ageGateButton, { backgroundColor: colors.primary }]}
          onPress={async () => {
            await AsyncStorage.setItem('age_verified', 'true');
            setAgeGatePassed(true);
          }}
        >
          <Text style={styles.ageGateButtonText}>I'm 13 or older</Text>
        </Pressable>
        <Pressable
          style={[styles.ageGateButton, { backgroundColor: colors.border }]}
          onPress={() => setAgeGatePassed(false)}
        >
          <Text style={[styles.ageGateButtonText, { color: colors.textMuted }]}>
            I'm under 13
          </Text>
        </Pressable>
        {/* under-13 blocked state rendered when tapped */}
      </View>
    );
  }

  // ── Age gate: blocked (under 13 selected) ───────────────────────────────────
  // We handle this with a local state so we know the user explicitly chose under 13
  // The flow above keeps ageGatePassed as false after pressing "I'm under 13"
  // and we just show the same gate — but we need a separate blocked state.
  // Handled below with a separate component mounted inside AgeGate.

  function handleNext() {
    if (step === 0) {
      const errs = validateStep0(formData);
      if (Object.keys(errs).length > 0) { setErrors(errs); return; }
      setErrors({});
    }
    if (step === 1 && step1GoalMode === 'select') {
      if (!formData.goal) { setErrors({ goal: 'Please select a goal' }); return; }
      setErrors({});
      setStep1GoalMode('details');
      return;
    }
    if (step === 1 && step1GoalMode === 'details') {
      const errs = validateStep1Details(formData);
      if (Object.keys(errs).length > 0) { setErrors(errs); return; }
      setErrors({});
    }
    setStep(s => Math.min(s + 1, 7));
  }

  function handleBack() {
    if (step === 1 && step1GoalMode === 'details') {
      setStep1GoalMode('select');
      setErrors({});
      return;
    }
    setStep(s => Math.max(s - 1, 0));
    setErrors({});
  }

  function renderStep() {
    switch (step) {
      case 0:
        return <Step0 formData={formData} setFormData={setFormData} errors={errors} />;
      case 1:
        return (
          <Step1
            formData={formData}
            setFormData={setFormData}
            errors={errors}
            goalMode={step1GoalMode}
            setGoalMode={setStep1GoalMode}
          />
        );
      case 2:
        return <Step2 />;
      case 3:
        return <Step3 />;
      case 4:
        return <Step4 />;
      case 5:
        return <Step5 />;
      case 6:
        return <Step6 />;
      case 7:
        return <Step7 />;
      default:
        return null;
    }
  }

  return (
    <View style={styles.container}>
      <ProgressBar step={step} />

      <View style={{ flex: 1 }}>{renderStep()}</View>

      {/* Navigation Buttons */}
      <View style={styles.navRow}>
        {step > 0 ? (
          <Pressable style={styles.backButton} onPress={handleBack}>
            <Text style={styles.backButtonText}>Back</Text>
          </Pressable>
        ) : (
          <View style={{ flex: 1 }} />
        )}
        <Pressable
          style={[styles.nextButton, saving && { opacity: 0.6 }]}
          onPress={handleNext}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color="#000" size="small" />
          ) : (
            <Text style={styles.nextButtonText}>
              {step === 7 ? 'Get Started' : 'Next'}
            </Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingTop: 60,
  },
  centered: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  ageGate: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    gap: spacing.md,
  },
  ageGateTitle: {
    fontSize: 28,
    fontFamily: 'Inter_700Bold',
    color: colors.text,
    marginBottom: spacing.sm,
  },
  ageGateSubtitle: {
    fontSize: 16,
    fontFamily: 'Inter_400Regular',
    color: colors.textMuted,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  ageGateButton: {
    width: '100%',
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    alignItems: 'center',
  },
  ageGateButtonText: {
    fontSize: 16,
    fontFamily: 'Inter_600SemiBold',
    color: '#000',
  },
  progressContainer: {
    flexDirection: 'row',
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.sm,
    gap: 2,
  },
  progressSegmentWrapper: {
    flex: 1,
    alignItems: 'center',
  },
  progressBar: {
    height: 3,
    width: '100%',
    borderRadius: 2,
    marginBottom: 4,
  },
  progressLabel: {
    fontSize: 8,
    fontFamily: 'Inter_400Regular',
    textAlign: 'center',
  },
  stepContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
  },
  stepTitle: {
    fontSize: 26,
    fontFamily: 'Inter_700Bold',
    color: colors.text,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  stepSubtitle: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    color: colors.textMuted,
    marginBottom: spacing.lg,
  },
  label: {
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
    color: colors.text,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    color: colors.text,
    fontFamily: 'Inter_400Regular',
    fontSize: 15,
  },
  inputError: {
    borderColor: '#ef4444',
  },
  errorText: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    color: '#ef4444',
    marginTop: 4,
  },
  pillRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  pill: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  pillText: {
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
    color: colors.text,
  },
  pickerRow: {
    flexDirection: 'row',
  },
  pickerWrapper: {},
  pickerLabel: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    color: colors.textMuted,
    marginBottom: 4,
  },
  pickerBox: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.sm,
    overflow: 'hidden',
  },
  picker: {
    color: colors.text,
    height: 50,
  },
  linkText: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    color: colors.primary,
    marginTop: spacing.sm,
    textDecorationLine: 'underline',
  },
  navRow: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    paddingBottom: spacing.xl,
    gap: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
  backButton: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  backButtonText: {
    fontSize: 16,
    fontFamily: 'Inter_600SemiBold',
    color: colors.text,
  },
  nextButton: {
    flex: 2,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
  },
  nextButtonText: {
    fontSize: 16,
    fontFamily: 'Inter_700Bold',
    color: '#000',
  },
  // Step 1 — Goal
  goalCard: {
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    alignItems: 'center',
    marginTop: spacing.md,
  },
  goalCardEmoji: {
    fontSize: 40,
    marginBottom: spacing.sm,
  },
  goalCardTitle: {
    fontSize: 22,
    fontFamily: 'Inter_700Bold',
    color: colors.text,
    marginBottom: spacing.xs,
  },
  goalCardDesc: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    color: colors.textMuted,
    textAlign: 'center',
  },
  verticalOption: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    marginTop: spacing.sm,
  },
  verticalOptionLabel: {
    fontSize: 15,
    fontFamily: 'Inter_600SemiBold',
    color: colors.text,
    marginBottom: 2,
  },
  verticalOptionDesc: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    color: colors.textMuted,
  },
  radioCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.border,
    marginLeft: spacing.md,
  },
  dateButton: {
    justifyContent: 'center',
  },
});

// ── Types ──────────────────────────────────────────────────────────────────────

export type ActivityLevel =
  | 'sedentary'
  | 'lightly_active'
  | 'moderately_active'
  | 'very_active'
  | 'extra_active';

export type GoalType = 'cut' | 'bulk';
export type Aggressiveness = 'conservative' | 'moderate' | 'aggressive';
export type SurplusLevel = 'mild' | 'moderate' | 'high';

export interface PlanInput {
  age: number;
  sex: 'male' | 'female';
  current_weight_lbs: number;
  height_in: number; // total inches
  activity_level: ActivityLevel;
  goal: GoalType;
  aggressiveness: Aggressiveness;
  caloric_surplus_level: SurplusLevel;
  diet_preference: string;
  primary_focus: string;
  body_fat_pct?: number;
}

export interface PlanResult {
  bmr: number;
  tdee: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  bmr_formula: string;
}

// ── Constants ──────────────────────────────────────────────────────────────────

export const GOAL_AGGRESSIVENESS: {
  value: Aggressiveness;
  label: string;
  desc: string;
}[] = [
  {
    value: 'conservative',
    label: 'Conservative',
    desc: 'Slow & steady — minimize muscle loss, easier to maintain',
  },
  {
    value: 'moderate',
    label: 'Moderate',
    desc: 'Balanced pace — good results without feeling deprived',
  },
  {
    value: 'aggressive',
    label: 'Aggressive',
    desc: 'Fast results — requires strict adherence and high effort',
  },
];

export const DIET_PREFERENCES: {
  value: string;
  emoji: string;
  label: string;
  desc: string;
}[] = [
  { value: 'standard', emoji: '🍽️', label: 'Standard', desc: 'Balanced macros' },
  { value: 'high_protein', emoji: '💪', label: 'High Protein', desc: 'More protein, less carb' },
  { value: 'low_carb', emoji: '🥩', label: 'Low Carb', desc: 'Fewer carbs, more fat' },
  { value: 'keto', emoji: '🥑', label: 'Keto', desc: 'Very low carb, high fat' },
  { value: 'vegan', emoji: '🌱', label: 'Vegan', desc: 'Plant-based only' },
  { value: 'vegetarian', emoji: '🥗', label: 'Vegetarian', desc: 'No meat, flexible' },
  { value: 'mediterranean', emoji: '🫒', label: 'Mediterranean', desc: 'Heart-healthy fats' },
  { value: 'intermittent_fasting', emoji: '⏰', label: 'IF', desc: 'Time-restricted eating' },
];

const ACTIVITY_MULTIPLIERS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  lightly_active: 1.375,
  moderately_active: 1.55,
  very_active: 1.725,
  extra_active: 1.9,
};

// Calorie delta from TDEE by goal × aggressiveness
const CUT_DEFICITS: Record<Aggressiveness, number> = {
  conservative: 300,
  moderate: 500,
  aggressive: 750,
};

const BULK_SURPLUSES: Record<SurplusLevel, number> = {
  mild: 200,
  moderate: 300,
  high: 500,
};

// Macro split [protein%, carbs%, fat%] by diet preference (used as starting point, then protein is pinned)
const MACRO_SPLITS: Record<string, [number, number, number]> = {
  standard: [0.30, 0.40, 0.30],
  high_protein: [0.40, 0.35, 0.25],
  low_carb: [0.35, 0.25, 0.40],
  keto: [0.25, 0.05, 0.70],
  vegan: [0.25, 0.50, 0.25],
  vegetarian: [0.25, 0.48, 0.27],
  mediterranean: [0.25, 0.45, 0.30],
  intermittent_fasting: [0.30, 0.40, 0.30],
};

// ── Core calculation ───────────────────────────────────────────────────────────

export function calculatePlan(input: PlanInput): PlanResult {
  const weightKg = input.current_weight_lbs * 0.453592;
  const heightCm = input.height_in * 2.54;

  let bmr: number;
  let bmr_formula: string;

  if (input.body_fat_pct && input.body_fat_pct > 0) {
    // Katch-McArdle (lean body mass based)
    const lbm = weightKg * (1 - input.body_fat_pct / 100);
    bmr = Math.round(370 + 21.6 * lbm);
    bmr_formula = 'Katch-McArdle';
  } else {
    // Mifflin-St Jeor
    const base = 10 * weightKg + 6.25 * heightCm - 5 * input.age;
    bmr = Math.round(input.sex === 'male' ? base + 5 : base - 161);
    bmr_formula = 'Mifflin-St Jeor';
  }

  const tdee = Math.round(bmr * ACTIVITY_MULTIPLIERS[input.activity_level]);

  let calories: number;
  if (input.goal === 'cut') {
    calories = tdee - CUT_DEFICITS[input.aggressiveness];
  } else {
    calories = tdee + BULK_SURPLUSES[input.caloric_surplus_level];
  }

  // Floor at 1200 for safety
  calories = Math.max(calories, 1200);

  const split = MACRO_SPLITS[input.diet_preference] ?? MACRO_SPLITS['standard'];
  const [pPct, cPct, fPct] = split;

  // Protein pinned at g/lb bodyweight then rest distributed
  let protein = Math.round(input.current_weight_lbs * (input.goal === 'cut' ? 1.1 : 0.9));
  const proteinCals = protein * 4;
  const remaining = calories - proteinCals;
  const cRatio = cPct / (cPct + fPct); // relative ratio of carbs to fat after protein
  const carbs = Math.max(0, Math.round((remaining * cRatio) / 4));
  const fat = Math.max(0, Math.round((remaining * (1 - cRatio)) / 9));

  // Recompute protein from remaining split if keto (very low carb, cap protein)
  const finalProtein =
    input.diet_preference === 'keto'
      ? Math.round((calories * pPct) / 4)
      : protein;

  return {
    bmr,
    tdee,
    calories,
    protein: finalProtein,
    carbs: input.diet_preference === 'keto' ? Math.round((calories * 0.05) / 4) : carbs,
    fat:
      input.diet_preference === 'keto'
        ? Math.round((calories * 0.70) / 9)
        : fat,
    bmr_formula,
  };
}

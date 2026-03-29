import { DIET_PREFERENCES, GOAL_AGGRESSIVENESS, ACTIVITY_MULTIPLIERS } from './theme';

type PlanInput = {
  weightLbs: number;
  heightInches: number;
  age: number;
  sex: 'male' | 'female';
  goal: 'cutting' | 'bulking' | 'recomposition' | 'maintenance';
  primaryFocus?: string;
  activityLevel: keyof typeof ACTIVITY_MULTIPLIERS;
  aggressiveness: keyof typeof GOAL_AGGRESSIVENESS;
  dietPreference: keyof typeof DIET_PREFERENCES;
  bodyFatPct?: number;
};

type PlanResult = {
  formulaKey: 'katch-mcardle' | 'revised-harris-benedict' | 'mifflin-st-jeor';
  bmr: number;
  tdee: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
};

function round5(n: number): number {
  return Math.round(n / 5) * 5;
}

function bmi(weightLbs: number, heightInches: number): number {
  return (703 * weightLbs) / (heightInches * heightInches);
}

export function calculatePlan({
  weightLbs,
  heightInches,
  age,
  sex,
  goal,
  primaryFocus,
  activityLevel,
  aggressiveness,
  dietPreference,
  bodyFatPct,
}: PlanInput): PlanResult {
  const weightKg = weightLbs * 0.453592;
  const heightCm = heightInches * 2.54;
  const bmiVal   = bmi(weightLbs, heightInches);

  let bmr: number;
  let formulaKey: PlanResult['formulaKey'];

  if (bodyFatPct != null && bodyFatPct > 0 && bodyFatPct < 100) {
    // Katch-McArdle: BMR = 370 + (21.6 × lean mass kg)
    formulaKey = 'katch-mcardle';
    const leanMassKg = weightKg * (1 - bodyFatPct / 100);
    bmr = 370 + 21.6 * leanMassKg;
  } else if (bmiVal >= 30) {
    // Revised Harris-Benedict
    formulaKey = 'revised-harris-benedict';
    if (sex === 'male') {
      bmr = 88.362 + 13.397 * weightKg + 4.799 * heightCm - 5.677 * age;
    } else {
      bmr = 447.593 + 9.247 * weightKg + 3.098 * heightCm - 4.330 * age;
    }
  } else {
    // Mifflin-St Jeor
    formulaKey = 'mifflin-st-jeor';
    if (sex === 'male') {
      bmr = 10 * weightKg + 6.25 * heightCm - 5 * age + 5;
    } else {
      bmr = 10 * weightKg + 6.25 * heightCm - 5 * age - 161;
    }
  }

  const multiplier = ACTIVITY_MULTIPLIERS[activityLevel]?.value ?? 1.55;
  const tdee = bmr * multiplier;

  let calories: number;
  if (primaryFocus === 'recomposition' || goal === 'recomposition') {
    calories = tdee - 100;
  } else if (goal === 'bulking') {
    calories = tdee + (GOAL_AGGRESSIVENESS[aggressiveness]?.bulk_surplus ?? 250);
  } else {
    calories = tdee - (GOAL_AGGRESSIVENESS[aggressiveness]?.cut_deficit ?? 500);
  }
  calories = Math.max(round5(calories), 1200);

  const diet = DIET_PREFERENCES[dietPreference] ?? DIET_PREFERENCES.standard;

  let protein: number;
  let carbs: number;
  let fat: number;

  if (dietPreference === 'keto') {
    carbs   = 25;
    protein = round5((calories * diet.protein_pct) / 4);
    fat     = round5((calories - protein * 4 - carbs * 4) / 9);
  } else {
    protein = round5((calories * diet.protein_pct) / 4);
    carbs   = round5((calories * diet.carbs_pct)   / 4);
    fat     = round5((calories * diet.fat_pct)     / 9);
  }

  return {
    formulaKey,
    bmr:     Math.round(bmr),
    tdee:    Math.round(tdee),
    calories: round5(calories),
    protein,
    carbs,
    fat,
  };
}

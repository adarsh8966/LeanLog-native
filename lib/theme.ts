export const colors = {
  background: '#0a0a0a',
  surface: '#111827',
  border: '#1f2937',
  primary: '#22c55e',
  text: '#ffffff',
  textMuted: '#6b7280',
};

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 };

export const borderRadius = { sm: 8, md: 12, lg: 16, xl: 24 };

export const THEME_COLORS = {
  violet: { hex: '#8b5cf6', light: '#ede9fe' },
  blue:   { hex: '#3b82f6', light: '#dbeafe' },
  green:  { hex: '#22c55e', light: '#dcfce7' },
  orange: { hex: '#f97316', light: '#ffedd5' },
  pink:   { hex: '#ec4899', light: '#fce7f3' },
  red:    { hex: '#ef4444', light: '#fee2e2' },
};

export const DIET_PREFERENCES = {
  standard:     { label: 'Standard',      emoji: '🍽️',  desc: 'Balanced macros',           protein_pct: 0.30, carbs_pct: 0.40, fat_pct: 0.30 },
  high_protein: { label: 'High Protein',  emoji: '🥩',  desc: 'Max muscle retention',       protein_pct: 0.40, carbs_pct: 0.35, fat_pct: 0.25 },
  keto:         { label: 'Keto',          emoji: '🥑',  desc: 'Under 25g net carbs',        protein_pct: 0.25, carbs_pct: 0.05, fat_pct: 0.70 },
  low_carb:     { label: 'Low Carb',      emoji: '🥗',  desc: 'Under 100g carbs',           protein_pct: 0.35, carbs_pct: 0.20, fat_pct: 0.45 },
  carb_heavy:   { label: 'Carb Heavy',    emoji: '🍚',  desc: 'For endurance athletes',     protein_pct: 0.20, carbs_pct: 0.55, fat_pct: 0.25 },
  vegan:        { label: 'Vegan',         emoji: '🌱',  desc: 'Plant-based',                protein_pct: 0.25, carbs_pct: 0.50, fat_pct: 0.25 },
  vegetarian:   { label: 'Vegetarian',    emoji: '🥦',  desc: 'No meat',                    protein_pct: 0.25, carbs_pct: 0.45, fat_pct: 0.30 },
  pescatarian:  { label: 'Pescatarian',   emoji: '🐟',  desc: 'Fish + plant-based',         protein_pct: 0.30, carbs_pct: 0.40, fat_pct: 0.30 },
};

export const GOAL_AGGRESSIVENESS = {
  conservative: { label: 'Conservative', desc: 'Slow, sustainable',   cut_deficit: 250, bulk_surplus: 150 },
  moderate:     { label: 'Moderate',     desc: 'Balanced approach',   cut_deficit: 500, bulk_surplus: 250 },
  aggressive:   { label: 'Aggressive',   desc: 'Fast results',        cut_deficit: 750, bulk_surplus: 400 },
};

export const ACTIVITY_MULTIPLIERS = {
  sedentary:         { label: 'Sedentary',          value: 1.2   },
  lightly_active:    { label: 'Lightly Active',     value: 1.375 },
  moderately_active: { label: 'Moderately Active',  value: 1.55  },
  very_active:       { label: 'Very Active',        value: 1.725 },
  extra_active:      { label: 'Extra Active',       value: 1.9   },
};

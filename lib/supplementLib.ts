export type SupplementCategory =
  | 'Protein & Amino Acids'
  | 'Vitamins'
  | 'Minerals'
  | 'Omega & Heart Health'
  | 'Performance & Pre-workout'
  | 'Recovery & Sleep'
  | 'Gut & General Health'
  | 'Fat Loss';

export type SupplementLibraryItem = {
  name: string;
  category: SupplementCategory;
  defaultDose: string;
  defaultUnit: string;
  defaultTiming: string;
};

export const SUPPLEMENT_LIBRARY: SupplementLibraryItem[] = [
  // Protein & Amino Acids
  { name: 'Whey Protein', category: 'Protein & Amino Acids', defaultDose: '25', defaultUnit: 'g', defaultTiming: 'Post-workout' },
  { name: 'Casein Protein', category: 'Protein & Amino Acids', defaultDose: '25', defaultUnit: 'g', defaultTiming: 'Before bed' },
  { name: 'Plant Protein', category: 'Protein & Amino Acids', defaultDose: '25', defaultUnit: 'g', defaultTiming: 'Post-workout' },
  { name: 'Creatine', category: 'Protein & Amino Acids', defaultDose: '5', defaultUnit: 'g', defaultTiming: 'Any time' },
  { name: 'BCAA', category: 'Protein & Amino Acids', defaultDose: '5', defaultUnit: 'g', defaultTiming: 'During workout' },
  { name: 'EAA', category: 'Protein & Amino Acids', defaultDose: '10', defaultUnit: 'g', defaultTiming: 'During workout' },
  { name: 'L-Glutamine', category: 'Protein & Amino Acids', defaultDose: '5', defaultUnit: 'g', defaultTiming: 'Post-workout' },
  { name: 'L-Leucine', category: 'Protein & Amino Acids', defaultDose: '3', defaultUnit: 'g', defaultTiming: 'With meals' },
  { name: 'L-Citrulline', category: 'Protein & Amino Acids', defaultDose: '6', defaultUnit: 'g', defaultTiming: 'Pre-workout' },
  { name: 'Beta-Alanine', category: 'Protein & Amino Acids', defaultDose: '3.2', defaultUnit: 'g', defaultTiming: 'Pre-workout' },
  { name: 'Collagen Peptides', category: 'Protein & Amino Acids', defaultDose: '15', defaultUnit: 'g', defaultTiming: 'Morning' },

  // Vitamins
  { name: 'Multivitamin', category: 'Vitamins', defaultDose: '1', defaultUnit: 'tablet', defaultTiming: 'Morning' },
  { name: 'Vitamin D3', category: 'Vitamins', defaultDose: '2000', defaultUnit: 'IU', defaultTiming: 'Morning' },
  { name: 'Vitamin C', category: 'Vitamins', defaultDose: '1000', defaultUnit: 'mg', defaultTiming: 'Morning' },
  { name: 'Vitamin B12', category: 'Vitamins', defaultDose: '1000', defaultUnit: 'mcg', defaultTiming: 'Morning' },
  { name: 'Vitamin B Complex', category: 'Vitamins', defaultDose: '1', defaultUnit: 'tablet', defaultTiming: 'Morning' },
  { name: 'Vitamin E', category: 'Vitamins', defaultDose: '400', defaultUnit: 'IU', defaultTiming: 'With meals' },
  { name: 'Vitamin K2', category: 'Vitamins', defaultDose: '100', defaultUnit: 'mcg', defaultTiming: 'With meals' },
  { name: 'Vitamin A', category: 'Vitamins', defaultDose: '5000', defaultUnit: 'IU', defaultTiming: 'With meals' },
  { name: 'Folate', category: 'Vitamins', defaultDose: '400', defaultUnit: 'mcg', defaultTiming: 'Morning' },
  { name: 'Biotin', category: 'Vitamins', defaultDose: '5000', defaultUnit: 'mcg', defaultTiming: 'Morning' },

  // Minerals
  { name: 'Magnesium Glycinate', category: 'Minerals', defaultDose: '400', defaultUnit: 'mg', defaultTiming: 'Before bed' },
  { name: 'Magnesium Citrate', category: 'Minerals', defaultDose: '400', defaultUnit: 'mg', defaultTiming: 'Before bed' },
  { name: 'Zinc', category: 'Minerals', defaultDose: '15', defaultUnit: 'mg', defaultTiming: 'With meals' },
  { name: 'Iron', category: 'Minerals', defaultDose: '18', defaultUnit: 'mg', defaultTiming: 'Morning' },
  { name: 'Calcium', category: 'Minerals', defaultDose: '500', defaultUnit: 'mg', defaultTiming: 'With meals' },
  { name: 'Potassium', category: 'Minerals', defaultDose: '200', defaultUnit: 'mg', defaultTiming: 'With meals' },
  { name: 'Selenium', category: 'Minerals', defaultDose: '200', defaultUnit: 'mcg', defaultTiming: 'Morning' },
  { name: 'Iodine', category: 'Minerals', defaultDose: '150', defaultUnit: 'mcg', defaultTiming: 'Morning' },
  { name: 'Chromium', category: 'Minerals', defaultDose: '200', defaultUnit: 'mcg', defaultTiming: 'With meals' },

  // Omega & Heart Health
  { name: 'Fish Oil', category: 'Omega & Heart Health', defaultDose: '1000', defaultUnit: 'mg', defaultTiming: 'With meals' },
  { name: 'Omega-3', category: 'Omega & Heart Health', defaultDose: '1000', defaultUnit: 'mg', defaultTiming: 'With meals' },
  { name: 'Krill Oil', category: 'Omega & Heart Health', defaultDose: '500', defaultUnit: 'mg', defaultTiming: 'With meals' },
  { name: 'Algae Oil (Vegan Omega-3)', category: 'Omega & Heart Health', defaultDose: '500', defaultUnit: 'mg', defaultTiming: 'With meals' },
  { name: 'CoQ10', category: 'Omega & Heart Health', defaultDose: '100', defaultUnit: 'mg', defaultTiming: 'With meals' },
  { name: 'Berberine', category: 'Omega & Heart Health', defaultDose: '500', defaultUnit: 'mg', defaultTiming: 'With meals' },
  { name: 'Red Yeast Rice', category: 'Omega & Heart Health', defaultDose: '600', defaultUnit: 'mg', defaultTiming: 'With meals' },
  { name: 'Nattokinase', category: 'Omega & Heart Health', defaultDose: '100', defaultUnit: 'mg', defaultTiming: 'Morning' },

  // Performance & Pre-workout
  { name: 'Pre-workout', category: 'Performance & Pre-workout', defaultDose: '1', defaultUnit: 'scoop', defaultTiming: 'Pre-workout' },
  { name: 'Caffeine', category: 'Performance & Pre-workout', defaultDose: '200', defaultUnit: 'mg', defaultTiming: 'Pre-workout' },
  { name: 'Nitric Oxide Booster', category: 'Performance & Pre-workout', defaultDose: '3', defaultUnit: 'g', defaultTiming: 'Pre-workout' },
  { name: 'Taurine', category: 'Performance & Pre-workout', defaultDose: '2', defaultUnit: 'g', defaultTiming: 'Pre-workout' },
  { name: 'Electrolytes', category: 'Performance & Pre-workout', defaultDose: '1', defaultUnit: 'packet', defaultTiming: 'During workout' },
  { name: 'Carb Powder', category: 'Performance & Pre-workout', defaultDose: '50', defaultUnit: 'g', defaultTiming: 'During workout' },
  { name: 'Rhodiola Rosea', category: 'Performance & Pre-workout', defaultDose: '400', defaultUnit: 'mg', defaultTiming: 'Morning' },
  { name: 'Ashwagandha', category: 'Performance & Pre-workout', defaultDose: '600', defaultUnit: 'mg', defaultTiming: 'Morning' },

  // Recovery & Sleep
  { name: 'Melatonin', category: 'Recovery & Sleep', defaultDose: '3', defaultUnit: 'mg', defaultTiming: 'Before bed' },
  { name: 'L-Theanine', category: 'Recovery & Sleep', defaultDose: '200', defaultUnit: 'mg', defaultTiming: 'Before bed' },
  { name: 'Glycine', category: 'Recovery & Sleep', defaultDose: '3', defaultUnit: 'g', defaultTiming: 'Before bed' },
  { name: 'Valerian Root', category: 'Recovery & Sleep', defaultDose: '600', defaultUnit: 'mg', defaultTiming: 'Before bed' },
  { name: 'Tart Cherry Extract', category: 'Recovery & Sleep', defaultDose: '480', defaultUnit: 'mg', defaultTiming: 'Before bed' },
  { name: 'ZMA', category: 'Recovery & Sleep', defaultDose: '3', defaultUnit: 'capsules', defaultTiming: 'Before bed' },
  { name: 'Phosphatidylserine', category: 'Recovery & Sleep', defaultDose: '100', defaultUnit: 'mg', defaultTiming: 'Before bed' },
  { name: 'GABA', category: 'Recovery & Sleep', defaultDose: '750', defaultUnit: 'mg', defaultTiming: 'Before bed' },

  // Gut & General Health
  { name: 'Probiotics', category: 'Gut & General Health', defaultDose: '10', defaultUnit: 'billion CFU', defaultTiming: 'Morning' },
  { name: 'Prebiotics', category: 'Gut & General Health', defaultDose: '5', defaultUnit: 'g', defaultTiming: 'With meals' },
  { name: 'Digestive Enzymes', category: 'Gut & General Health', defaultDose: '1', defaultUnit: 'capsule', defaultTiming: 'With meals' },
  { name: 'Apple Cider Vinegar', category: 'Gut & General Health', defaultDose: '1', defaultUnit: 'tbsp', defaultTiming: 'Before meals' },
  { name: 'Psyllium Husk', category: 'Gut & General Health', defaultDose: '5', defaultUnit: 'g', defaultTiming: 'With meals' },
  { name: 'Spirulina', category: 'Gut & General Health', defaultDose: '3', defaultUnit: 'g', defaultTiming: 'Morning' },
  { name: 'Chlorella', category: 'Gut & General Health', defaultDose: '3', defaultUnit: 'g', defaultTiming: 'Morning' },
  { name: 'Turmeric / Curcumin', category: 'Gut & General Health', defaultDose: '500', defaultUnit: 'mg', defaultTiming: 'With meals' },

  // Fat Loss
  { name: 'Green Tea Extract', category: 'Fat Loss', defaultDose: '500', defaultUnit: 'mg', defaultTiming: 'Morning' },
  { name: 'CLA', category: 'Fat Loss', defaultDose: '3000', defaultUnit: 'mg', defaultTiming: 'With meals' },
  { name: 'L-Carnitine', category: 'Fat Loss', defaultDose: '2000', defaultUnit: 'mg', defaultTiming: 'Pre-workout' },
  { name: 'Acetyl-L-Carnitine', category: 'Fat Loss', defaultDose: '1000', defaultUnit: 'mg', defaultTiming: 'Morning' },
  { name: 'Garcinia Cambogia', category: 'Fat Loss', defaultDose: '500', defaultUnit: 'mg', defaultTiming: 'Before meals' },
  { name: 'Yohimbine', category: 'Fat Loss', defaultDose: '5', defaultUnit: 'mg', defaultTiming: 'Pre-workout' },
  { name: 'Synephrine', category: 'Fat Loss', defaultDose: '10', defaultUnit: 'mg', defaultTiming: 'Morning' },
];

export type UserSupplement = {
  id: string;
  user_id: string;
  name: string;
  dose: string;
  unit: string;
  timing: string;
  sort_order: number;
};

export const DEFAULT_SUPPLEMENTS: Omit<UserSupplement, 'id' | 'user_id'>[] = [
  { name: 'Creatine', dose: '5', unit: 'g', timing: 'Any time', sort_order: 0 },
  { name: 'Multivitamin', dose: '1', unit: 'tablet', timing: 'Morning', sort_order: 1 },
  { name: 'Vitamin D3', dose: '2000', unit: 'IU', timing: 'Morning', sort_order: 2 },
  { name: 'Fish Oil', dose: '1000', unit: 'mg', timing: 'With meals', sort_order: 3 },
  { name: 'Pre-workout', dose: '1', unit: 'scoop', timing: 'Pre-workout', sort_order: 4 },
];

export const DOSE_UNITS = [
  'g', 'mg', 'mcg', 'IU', 'ml',
  'tablet', 'capsule', 'capsules', 'scoop',
  'packet', 'tbsp', 'tsp',
  'billion CFU',
];

export const TIMING_OPTIONS = [
  'Morning',
  'Pre-workout',
  'During workout',
  'Post-workout',
  'With meals',
  'Before meals',
  'Before bed',
  'Any time',
];

export type AdequacyBadge = {
  label: string;
  color: string;
  explanation: string;
};

/** Returns adequacy badge based on supplement name + dose thresholds.
 *  Returns null for custom / unrecognized supplements. */
export function getAdequacyBadge(name: string, dose: string, unit: string): AdequacyBadge | null {
  const doseNum = parseFloat(dose);
  if (isNaN(doseNum)) return null;

  const nameLower = name.toLowerCase();

  // Creatine ≥3g → Optimal, else Under
  if (nameLower.includes('creatine')) {
    const grams = unit === 'g' ? doseNum : unit === 'mg' ? doseNum / 1000 : null;
    if (grams === null) return null;
    if (grams >= 3) return { label: 'Optimal', color: '#22c55e', explanation: 'Creatine ≥3g/day supports strength & power.' };
    return { label: 'Under', color: '#f59e0b', explanation: 'Aim for ≥3g/day for full creatine benefit.' };
  }

  // Vitamin D ≥1500 IU → Optimal
  if (nameLower.includes('vitamin d')) {
    const iu = unit === 'IU' ? doseNum : unit === 'mcg' ? doseNum * 40 : null;
    if (iu === null) return null;
    if (iu >= 1500) return { label: 'Optimal', color: '#22c55e', explanation: 'Vitamin D ≥1500 IU supports immune & bone health.' };
    return { label: 'Under', color: '#f59e0b', explanation: 'Most adults benefit from ≥1500 IU/day.' };
  }

  // Fish Oil / Omega-3 ≥1000mg → Optimal
  if (nameLower.includes('fish oil') || nameLower.includes('omega-3') || nameLower.includes('omega 3') || nameLower.includes('krill oil')) {
    const mg = unit === 'mg' ? doseNum : unit === 'g' ? doseNum * 1000 : null;
    if (mg === null) return null;
    if (mg >= 1000) return { label: 'Optimal', color: '#22c55e', explanation: 'Omega-3 ≥1000mg EPA+DHA supports heart health.' };
    return { label: 'Under', color: '#f59e0b', explanation: 'Aim for ≥1000mg combined EPA+DHA.' };
  }

  // Magnesium: women ≥310mg, men ≥400mg — use 310 as lower bound (Optimal if ≥310)
  if (nameLower.includes('magnesium')) {
    const mg = unit === 'mg' ? doseNum : unit === 'g' ? doseNum * 1000 : null;
    if (mg === null) return null;
    if (mg >= 400) return { label: 'Optimal', color: '#22c55e', explanation: 'Magnesium ≥400mg meets men\'s RDA.' };
    if (mg >= 310) return { label: 'Adequate', color: '#3b82f6', explanation: 'Magnesium ≥310mg meets women\'s RDA.' };
    return { label: 'Under', color: '#f59e0b', explanation: 'Aim for ≥310mg (women) or ≥400mg (men).' };
  }

  // Zinc: women ≥8mg, men ≥11mg — Optimal if ≥11, Adequate if ≥8
  if (nameLower.includes('zinc')) {
    const mg = unit === 'mg' ? doseNum : unit === 'g' ? doseNum * 1000 : null;
    if (mg === null) return null;
    if (mg >= 11) return { label: 'Optimal', color: '#22c55e', explanation: 'Zinc ≥11mg meets men\'s RDA.' };
    if (mg >= 8) return { label: 'Adequate', color: '#3b82f6', explanation: 'Zinc ≥8mg meets women\'s RDA.' };
    return { label: 'Under', color: '#f59e0b', explanation: 'Aim for ≥8mg (women) or ≥11mg (men).' };
  }

  return null;
}

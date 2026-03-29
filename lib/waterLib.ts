export type WaterEntry = {
  id: string;
  label: string;
  amount_oz: number;
  water_credit_pct: number;
  credited_oz: number;
  source: 'manual' | 'drink';
  logged_at: string; // ISO timestamp
};

export const addEntry = (breakdown: WaterEntry[], newEntry: WaterEntry): WaterEntry[] =>
  [...breakdown, newEntry];

export const deleteEntry = (breakdown: WaterEntry[], id: string): WaterEntry[] =>
  breakdown.filter(e => e.id !== id);

export const calcTotalOz = (breakdown: WaterEntry[]): number =>
  Math.round(breakdown.reduce((sum, e) => sum + e.credited_oz, 0) * 10) / 10;

export const defaultBottleKey = 'defaultBottleOz';

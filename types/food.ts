// ─── Food search result ───────────────────────────────────────────────────────

export type FoodSource = 'fatsecret' | 'usda' | 'openfoodfacts' | 'meal_photo';

/**
 * Normalised per-100g result returned by all search functions.
 * Macro values are per 100g of the food regardless of source.
 */
export type FoodResult = {
  /** Unique ID within the source system */
  id: string;
  name: string;
  /** kcal per 100g */
  calories100g: number;
  /** grams protein per 100g */
  protein100g: number;
  /** grams carbohydrates per 100g */
  carbs100g: number;
  /** grams fat per 100g */
  fat100g: number;
  /** Reference serving size in grams used to derive the per-100g values */
  servingG: number;
  /** Human-readable serving description, e.g. "1 cup (240g)" */
  householdServing: string;
  source: FoodSource;
  /** Permanent FatSecret food_id — only set for 'fatsecret' source */
  fatsecretFoodId: string | null;
  /** FatSecret serving_id used for the normalised values */
  fatsecretServingId: string | null;
  /** AI confidence level — only set for meal_photo source */
  confidence?: 'low' | 'medium' | 'high';
  /** AI estimate notes — only set for meal_photo source */
  notes?: string;
};

// ─── Serving option (from food.get.v4) ───────────────────────────────────────

/**
 * One serving entry from FatSecret food.get.v4.
 * Used to let the user pick the serving size when logging.
 */
export type ServingOption = {
  servingId: string;
  description: string;
  servingG: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
};

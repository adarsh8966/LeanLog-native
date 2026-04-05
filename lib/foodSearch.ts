/**
 * foodSearch.ts — unified food search for LeanLog native.
 *
 * Priority order:
 *   1. FatSecret  (via Supabase Edge Function /functions/v1/fatsecret-proxy)
 *   2. USDA FDC   (direct API, EXPO_PUBLIC_USDA_API_KEY)
 *   3. Open Food Facts (via Supabase Edge Function /functions/v1/off-proxy)
 *
 * All functions return FoodResult[] normalised to per-100g macros.
 */

import { supabase } from './supabase';
import type { FoodResult, ServingOption } from '../types/food';

// ─── Constants ────────────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const USDA_KEY = process.env.EXPO_PUBLIC_USDA_API_KEY ?? '';
const USDA_BASE = 'https://api.nal.usda.gov/fdc/v1';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Normalise a FatSecret food_id regardless of whether it's a string or object */
function normaliseFsId(raw: unknown): string {
  if (raw == null) return '';
  if (typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    return String(obj.value ?? obj.$t ?? Object.values(obj)[0] ?? '').trim();
  }
  return String(raw).trim();
}

/** Retrieve a supabase session token for Edge Function calls */
async function getSessionToken(): Promise<string | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}

/** Safe divide — returns 0 when denominator is 0 or NaN */
function safePer100(value: number, servingG: number): number {
  if (!servingG || isNaN(servingG)) return 0;
  return Math.round(((value / servingG) * 100 * 10) / 10); // 1 decimal
}

// ─── FatSecret ────────────────────────────────────────────────────────────────

/** Call the fatsecret-proxy Edge Function */
async function callFatSecretProxy(body: Record<string, unknown>): Promise<unknown> {
  const token = await getSessionToken();
  const resp = await fetch(`${SUPABASE_URL}/functions/v1/fatsecret-proxy`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`fatsecret-proxy ${resp.status}: ${txt}`);
  }
  return resp.json();
}

/** Parse a single FatSecret food entry into a FoodResult */
function parseFatSecretFood(food: Record<string, unknown>): FoodResult | null {
  try {
    const foodId = normaliseFsId(food.food_id);
    const name = String(food.food_name ?? '');

    // food_description is like: "Per 100g - Calories: 250kcal | Fat: 8.00g | Carbs: 35.00g | Protein: 10.00g"
    // servings.serving may also be present; prefer description parsing for search results
    const desc = String(food.food_description ?? '');

    // Extract macros from description string
    const cal = parseFloat(desc.match(/Calories:\s*([\d.]+)/i)?.[1] ?? '0');
    const fat = parseFloat(desc.match(/Fat:\s*([\d.]+)/i)?.[1] ?? '0');
    const carbs = parseFloat(desc.match(/Carbs:\s*([\d.]+)/i)?.[1] ?? '0');
    const protein = parseFloat(desc.match(/Protein:\s*([\d.]+)/i)?.[1] ?? '0');

    // Description values are per-serving; try to pull "Per Xg" portion size
    const servingGMatch = desc.match(/Per\s+([\d.]+)\s*g/i);
    const servingG = servingGMatch ? parseFloat(servingGMatch[1]) : 100;

    const calories100g = safePer100(cal, servingG) || cal;
    const protein100g = safePer100(protein, servingG) || protein;
    const carbs100g = safePer100(carbs, servingG) || carbs;
    const fat100g = safePer100(fat, servingG) || fat;

    // Serving description: type + optional brand
    const brand = food.brand_name ? ` (${food.brand_name})` : '';
    const typeLabel = String(food.food_type ?? '');
    const householdServing = typeLabel ? `${typeLabel}${brand}` : `${servingG}g${brand}`;

    return {
      id: foodId,
      name,
      calories100g,
      protein100g,
      carbs100g,
      fat100g,
      servingG,
      householdServing,
      source: 'fatsecret',
      fatsecretFoodId: foodId,
      fatsecretServingId: null,
    };
  } catch {
    return null;
  }
}

/** Search FatSecret via Edge Function. Returns [] on any failure. */
export async function searchFatSecret(query: string): Promise<FoodResult[]> {
  try {
    const data = (await callFatSecretProxy({
      method: 'foods.search',
      query,
      max_results: 10,
    })) as Record<string, unknown>;

    const foods = (data as Record<string, unknown>)?.foods as Record<string, unknown> | undefined;
    if (!foods) return [];

    // FatSecret returns an array when multiple results, single object when one
    const raw = foods.food;
    const list: Record<string, unknown>[] = Array.isArray(raw)
      ? (raw as Record<string, unknown>[])
      : raw != null
        ? [raw as Record<string, unknown>]
        : [];

    return list.map(parseFatSecretFood).filter((r): r is FoodResult => r !== null);
  } catch {
    return [];
  }
}

// ─── USDA FDC ─────────────────────────────────────────────────────────────────

type USDANutrient = { nutrientId: number; nutrientName: string; value: number; unitName: string };

const USDA_NUTRIENT = {
  energy: [1008, 2047, 2048],   // kcal
  protein: [1003],
  carbs: [1005],
  fat: [1004],
} as const;

function extractNutrient(nutrients: USDANutrient[], ids: readonly number[]): number {
  for (const id of ids) {
    const n = nutrients.find(n => n.nutrientId === id);
    if (n?.value != null) return n.value;
  }
  return 0;
}

/** Fetch a single USDA food by fdcId to get accurate serving size */
async function fetchUSDAFood(fdcId: number): Promise<{
  servingSize: number;
  servingSizeUnit: string;
  householdServing: string;
  nutrients: USDANutrient[];
} | null> {
  try {
    const url = `${USDA_BASE}/food/${fdcId}?api_key=${USDA_KEY}`;
    const resp = await fetch(url);
    if (!resp.ok) return null;
    const data = await resp.json();
    return {
      servingSize: data.servingSize ?? 100,
      servingSizeUnit: data.servingSizeUnit ?? 'g',
      householdServing: data.householdServingFullText ?? `${data.servingSize ?? 100}g`,
      nutrients: (data.foodNutrients ?? []).map((n: Record<string, unknown>) => ({
        nutrientId: (n.nutrient as Record<string, unknown>)?.id ?? n.nutrientId,
        nutrientName: (n.nutrient as Record<string, unknown>)?.name ?? '',
        value: n.amount ?? n.value ?? 0,
        unitName: (n.nutrient as Record<string, unknown>)?.unitName ?? '',
      })) as USDANutrient[],
    };
  } catch {
    return null;
  }
}

/** Convert a USDA search hit into a FoodResult */
async function usdaHitToResult(
  hit: Record<string, unknown>,
  isBranded: boolean,
): Promise<FoodResult | null> {
  try {
    const fdcId = Number(hit.fdcId);
    const name = String(hit.description ?? '');

    // Nutrients present on the search hit
    const rawNutrients = ((hit.foodNutrients ?? []) as Record<string, unknown>[]).map(n => ({
      nutrientId: Number(n.nutrientId ?? n.nutrientNumber ?? 0),
      nutrientName: String(n.nutrientName ?? ''),
      value: Number(n.value ?? 0),
      unitName: String(n.unitName ?? ''),
    }));

    let servingG = 100;
    let householdServing = '100g';
    let nutrients = rawNutrients;

    if (isBranded) {
      // Fetch full detail to get accurate serving size
      const detail = await fetchUSDAFood(fdcId);
      if (detail) {
        servingG =
          detail.servingSizeUnit.toLowerCase() === 'g'
            ? detail.servingSize
            : detail.servingSize * 28.3495; // oz → g fallback
        householdServing = detail.householdServing;
        nutrients = detail.nutrients;
      } else {
        servingG = Number(hit.servingSize ?? 100);
        householdServing = String(hit.householdServingFullText ?? `${servingG}g`);
      }
    }

    // For non-Branded (Foundation / SR Legacy) USDA reports per 100g already
    const cal = extractNutrient(nutrients, USDA_NUTRIENT.energy);
    const protein = extractNutrient(nutrients, USDA_NUTRIENT.protein);
    const carbs = extractNutrient(nutrients, USDA_NUTRIENT.carbs);
    const fat = extractNutrient(nutrients, USDA_NUTRIENT.fat);

    const calories100g = isBranded ? safePer100(cal, servingG) : cal;
    const protein100g = isBranded ? safePer100(protein, servingG) : protein;
    const carbs100g = isBranded ? safePer100(carbs, servingG) : carbs;
    const fat100g = isBranded ? safePer100(fat, servingG) : fat;

    const brand = hit.brandOwner ? ` (${hit.brandOwner})` : '';

    return {
      id: String(fdcId),
      name: `${name}${brand}`,
      calories100g,
      protein100g,
      carbs100g,
      fat100g,
      servingG,
      householdServing,
      source: 'usda',
      fatsecretFoodId: null,
      fatsecretServingId: null,
    };
  } catch {
    return null;
  }
}

/** Search USDA FDC — Branded first, then Foundation/SR Legacy */
export async function searchUSDA(query: string): Promise<FoodResult[]> {
  if (!USDA_KEY) return [];
  try {
    const [brandedResp, genericResp] = await Promise.all([
      fetch(
        `${USDA_BASE}/foods/search?query=${encodeURIComponent(query)}&dataType=Branded&pageSize=5&api_key=${USDA_KEY}`,
      ),
      fetch(
        `${USDA_BASE}/foods/search?query=${encodeURIComponent(query)}&dataType=Foundation,SR%20Legacy&pageSize=5&api_key=${USDA_KEY}`,
      ),
    ]);

    const [brandedData, genericData] = await Promise.all([
      brandedResp.ok ? brandedResp.json() : { foods: [] },
      genericResp.ok ? genericResp.json() : { foods: [] },
    ]);

    const brandedHits: Record<string, unknown>[] = brandedData.foods ?? [];
    const genericHits: Record<string, unknown>[] = genericData.foods ?? [];

    const [brandedResults, genericResults] = await Promise.all([
      Promise.all(brandedHits.map(h => usdaHitToResult(h, true))),
      Promise.all(genericHits.map(h => usdaHitToResult(h, false))),
    ]);

    return [
      ...brandedResults.filter((r): r is FoodResult => r !== null),
      ...genericResults.filter((r): r is FoodResult => r !== null),
    ];
  } catch {
    return [];
  }
}

// ─── Open Food Facts ──────────────────────────────────────────────────────────

/** Call the off-proxy Edge Function */
async function callOFFProxy(body: Record<string, unknown>): Promise<unknown> {
  const token = await getSessionToken();
  const resp = await fetch(`${SUPABASE_URL}/functions/v1/off-proxy`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`off-proxy ${resp.status}: ${txt}`);
  }
  return resp.json();
}

/** Parse an OFF product into a FoodResult */
function parseOFFProduct(product: Record<string, unknown>): FoodResult | null {
  try {
    const n = (product.nutriments ?? {}) as Record<string, unknown>;

    const calories100g = Number(n['energy-kcal_100g'] ?? n['energy_100g'] ?? 0);
    const protein100g = Number(n['proteins_100g'] ?? 0);
    const carbs100g = Number(n['carbohydrates_100g'] ?? 0);
    const fat100g = Number(n['fat_100g'] ?? 0);

    const name = String(product.product_name ?? product.product_name_en ?? '').trim();
    if (!name) return null;

    const id = String(product._id ?? product.id ?? product.code ?? '');
    const servingG = Number(product.serving_quantity ?? 100);
    const householdServing = String(product.serving_size ?? '100g');

    return {
      id,
      name,
      calories100g: Math.round(calories100g),
      protein100g: Math.round(protein100g * 10) / 10,
      carbs100g: Math.round(carbs100g * 10) / 10,
      fat100g: Math.round(fat100g * 10) / 10,
      servingG,
      householdServing,
      source: 'openfoodfacts',
      fatsecretFoodId: null,
      fatsecretServingId: null,
    };
  } catch {
    return null;
  }
}

/** Search Open Food Facts via Edge Function proxy */
export async function searchOFF(query: string): Promise<FoodResult[]> {
  try {
    const data = (await callOFFProxy({ barcode: null, query })) as Record<string, unknown>;

    const products: Record<string, unknown>[] = Array.isArray(data.products)
      ? (data.products as Record<string, unknown>[])
      : data.product != null
        ? [data.product as Record<string, unknown>]
        : [];

    return products.map(parseOFFProduct).filter((r): r is FoodResult => r !== null);
  } catch {
    return [];
  }
}

// ─── Unified search ───────────────────────────────────────────────────────────

/**
 * Search all sources in priority order (FatSecret → USDA → OFF).
 * Returns combined de-duplicated results — FatSecret results first.
 */
export async function searchFood(query: string): Promise<FoodResult[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  // Run all three in parallel; each swallows its own errors
  const [fsResults, usdaResults, offResults] = await Promise.all([
    searchFatSecret(trimmed),
    searchUSDA(trimmed),
    searchOFF(trimmed),
  ]);

  // Prioritise FatSecret, then USDA, then OFF
  return [...fsResults, ...usdaResults, ...offResults];
}

// ─── Barcode lookup ───────────────────────────────────────────────────────────

/**
 * Pad a 12-digit UPC-A barcode to a 13-digit GTIN-13 by prepending a zero.
 */
function padToGTIN13(barcode: string): string {
  const digits = barcode.replace(/\D/g, '');
  if (digits.length === 12) return '0' + digits;
  return digits;
}

/** Lookup a barcode — FatSecret first, then USDA, then OFF */
export async function lookupBarcode(barcode: string): Promise<FoodResult[]> {
  const gtin = padToGTIN13(barcode);

  // 1. FatSecret barcode lookup
  try {
    const data = (await callFatSecretProxy({
      method: 'food.find_id_for_barcode',
      barcode: gtin,
    })) as Record<string, unknown>;

    const rawId = normaliseFsId(
      (data.food_id as Record<string, unknown>) ?? data.food_id,
    );

    if (rawId) {
      // Fetch the detail to get proper nutrition
      const detail = await fetchFatSecretDetail(rawId);
      if (detail.length > 0) return detail;
    }
  } catch {
    // fall through to USDA
  }

  // 2. USDA barcode lookup
  try {
    const resp = await fetch(
      `${USDA_BASE}/foods/search?query=${encodeURIComponent(gtin)}&dataType=Branded&pageSize=3&api_key=${USDA_KEY}`,
    );
    if (resp.ok) {
      const data = await resp.json();
      const hits: Record<string, unknown>[] = data.foods ?? [];
      const results = await Promise.all(hits.map(h => usdaHitToResult(h, true)));
      const valid = results.filter((r): r is FoodResult => r !== null);
      if (valid.length > 0) return valid;
    }
  } catch {
    // fall through to OFF
  }

  // 3. Open Food Facts barcode lookup
  try {
    const data = (await callOFFProxy({ barcode: gtin, query: null })) as Record<string, unknown>;
    const product = data.product as Record<string, unknown> | undefined;
    if (product) {
      const result = parseOFFProduct(product);
      if (result) return [result];
    }
  } catch {
    // nothing found
  }

  return [];
}

// ─── FatSecret detail (food.get.v4) ──────────────────────────────────────────

/**
 * Fetch the full serving list for a FatSecret food_id.
 * Returns FoodResult[] — one entry per serving option, all normalised to per-100g.
 * Also returns raw ServingOption[] via the second element of a tuple for the
 * serving picker UI.
 */
export async function fetchFatSecretDetail(
  foodId: string,
): Promise<FoodResult[]> {
  try {
    const data = (await callFatSecretProxy({
      method: 'food.get.v4',
      food_id: foodId,
    })) as Record<string, unknown>;

    const food = (data as Record<string, unknown>).food as Record<string, unknown> | undefined;
    if (!food) return [];

    const name = String(food.food_name ?? '');
    const servingsWrapper = food.servings as Record<string, unknown> | undefined;
    if (!servingsWrapper) return [];

    const raw = servingsWrapper.serving;
    const servingList: Record<string, unknown>[] = Array.isArray(raw)
      ? (raw as Record<string, unknown>[])
      : raw != null
        ? [raw as Record<string, unknown>]
        : [];

    return servingList
      .map((s): FoodResult | null => {
        try {
          const servingId = String(s.serving_id ?? '');
          const servingG = parseFloat(String(s.metric_serving_amount ?? '100')) || 100;
          const cal = parseFloat(String(s.calories ?? '0'));
          const protein = parseFloat(String(s.protein ?? '0'));
          const carbs = parseFloat(String(s.carbohydrate ?? '0'));
          const fat = parseFloat(String(s.fat ?? '0'));

          const desc = String(
            s.serving_description ?? s.measurement_description ?? `${servingG}g`,
          );

          return {
            id: foodId,
            name,
            calories100g: safePer100(cal, servingG),
            protein100g: safePer100(protein, servingG),
            carbs100g: safePer100(carbs, servingG),
            fat100g: safePer100(fat, servingG),
            servingG,
            householdServing: desc,
            source: 'fatsecret',
            fatsecretFoodId: foodId,
            fatsecretServingId: servingId,
          };
        } catch {
          return null;
        }
      })
      .filter((r): r is FoodResult => r !== null);
  } catch {
    return [];
  }
}

/**
 * Fetch serving options for the serving picker UI.
 * Thin wrapper around fetchFatSecretDetail that maps to ServingOption shape.
 */
export async function fetchServingOptions(foodId: string): Promise<ServingOption[]> {
  try {
    const data = (await callFatSecretProxy({
      method: 'food.get.v4',
      food_id: foodId,
    })) as Record<string, unknown>;

    const food = (data as Record<string, unknown>).food as Record<string, unknown> | undefined;
    if (!food) return [];

    const servingsWrapper = food.servings as Record<string, unknown> | undefined;
    if (!servingsWrapper) return [];

    const raw = servingsWrapper.serving;
    const servingList: Record<string, unknown>[] = Array.isArray(raw)
      ? (raw as Record<string, unknown>[])
      : raw != null
        ? [raw as Record<string, unknown>]
        : [];

    return servingList
      .map((s): ServingOption | null => {
        try {
          return {
            servingId: String(s.serving_id ?? ''),
            description: String(
              s.serving_description ?? s.measurement_description ?? '',
            ),
            servingG: parseFloat(String(s.metric_serving_amount ?? '100')) || 100,
            calories: parseFloat(String(s.calories ?? '0')),
            protein: parseFloat(String(s.protein ?? '0')),
            carbs: parseFloat(String(s.carbohydrate ?? '0')),
            fat: parseFloat(String(s.fat ?? '0')),
          };
        } catch {
          return null;
        }
      })
      .filter((s): s is ServingOption => s !== null);
  } catch {
    return [];
  }
}

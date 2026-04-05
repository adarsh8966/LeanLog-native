/**
 * Module-level singleton for passing a barcode scan result back from
 * app/barcode.tsx → app/food-log.tsx via router.back().
 *
 * Usage:
 *   barcode.tsx   → setPendingBarcode(result)  → router.back()
 *   food-log.tsx  → useFocusEffect → takePendingBarcode()
 */
import type { FoodResult } from '../types/food';

let _pending: FoodResult | null = null;

export function setPendingBarcode(result: FoodResult): void {
  _pending = result;
}

export function takePendingBarcode(): FoodResult | null {
  const r = _pending;
  _pending = null;
  return r;
}

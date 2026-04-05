/**
 * Module-level singleton for passing a nutrition label scan result back from
 * app/label-scanner.tsx → app/food-log.tsx via router.back().
 *
 * Usage:
 *   label-scanner.tsx → setPendingLabel(result)  → router.back()
 *   food-log.tsx      → useFocusEffect → takePendingLabel()
 */
import type { FoodResult } from '../types/food';

let _pending: FoodResult | null = null;

export function setPendingLabel(result: FoodResult): void {
  _pending = result;
}

export function takePendingLabel(): FoodResult | null {
  const r = _pending;
  _pending = null;
  return r;
}

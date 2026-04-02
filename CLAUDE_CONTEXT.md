# LeanLog Native — Claude Code Context File
> Read this at the start of every Claude Code session before touching anything.

---

## What This App Is
LeanLog is a calorie and nutrition tracking app. Full Expo/React Native rewrite of the existing web app (`adarsh8966/calorie-tracker`). Targeting App Store submission via EAS.

---

## Repos
- **Native (this repo):** `github.com/adarsh8966/LeanLog-native`
- **Web app (reference):** `github.com/adarsh8966/calorie-tracker`
- **Supabase Project ID:** `qjczxnnuzvkuiwphfquk`
- **Supabase URL:** `https://qjczxnnuzvkuiwphfquk.supabase.co`

---

## Stack
- **Framework:** Expo (managed workflow) + TypeScript
- **Router:** expo-router (file-based, similar to Next.js)
- **Auth + DB:** Supabase (`@supabase/supabase-js`)
- **Session storage:** `@react-native-async-storage/async-storage`
- **Data fetching:** `@tanstack/react-query`
- **Charts:** `react-native-svg` + `react-native-reanimated`
- **Gestures:** `react-native-gesture-handler`
- **Drag/reorder:** `react-native-draggable-flatlist`
- **Bottom sheets:** `@gorhom/bottom-sheet`
- **Icons:** `@expo/vector-icons` (Ionicons)
- **Fonts:** Inter (via `expo-font`)

---

## Critical Rules — Read Before Touching Anything

1. **Never use `toISOString().split('T')[0]`** for dates — always use `new Date().toLocaleDateString('en-CA')` for local YYYY-MM-DD date strings. UTC mismatch causes daily log reset bugs.
2. **`toISOString()` is only acceptable for `logged_at` / `created_at` timestamps**, never for date keys.
3. **Never overwrite previous days' data** — all tables keyed by `user_id + date`. One row per user per day.
4. **React Query cache key discipline is critical.** Keys follow `['entity', uid, date?]` pattern. Never share a query key between two components that use different `select()` fields — causes cache overwrites.
5. **All Supabase upserts on daily tables use `onConflict: 'user_id,date'`** unless noted otherwise.
6. **`activity_logs` does NOT have a unique constraint on `user_id, date`** — allows multiple activity entries per day. Do not add `onConflict` there.
7. **Never call `refreshProfile()` inside a mutation `onSuccess`** — triggers full context re-renders that remount all consuming components.
8. **Always run `npx expo export`** after changes and confirm zero errors before finishing.
9. **Read relevant files before making changes.** Do not guess at structure.
10. **FatSecret Terms of Service:** only `fatsecret_food_id` may be stored permanently. Never store FatSecret nutrition data to any table — always re-fetch live.

---

## Folder Structure
```
app/
  _layout.tsx              ← Root Stack + GestureHandlerRootView + BottomSheetModalProvider + QueryClientProvider
  index.tsx                ← Redirects to (auth)/login or (tabs) based on session
  water.tsx                ← Water tracker (full screen)
  supplements.tsx          ← Supplement tracker (full screen)
  coaching.tsx             ← Coaching page (full screen)
  settings.tsx             ← Settings/Profile (full screen)
  food.tsx                 ← Food search + log (full screen) [TODO]
  streak.tsx               ← Streak page [TODO]
  weight.tsx               ← Weight page [TODO]
  onboarding.tsx           ← Onboarding flow [TODO]
  (auth)/
    login.tsx
    signup.tsx
  (tabs)/
    _layout.tsx            ← Bottom tab navigator
    index.tsx              ← Dashboard (home)
    log.tsx                ← Food log tab [TODO]
    activity.tsx           ← Activity tracker tab
    wellness.tsx           ← Weight + wellness tab
    settings.tsx           ← Settings tab (navigates to /settings)
lib/
  supabase.ts              ← Supabase client (AsyncStorage session, url polyfill)
  theme.ts                 ← colors, spacing, borderRadius constants
  waterLib.ts              ← addEntry, deleteEntry, calcTotalOz, defaultBottleKey
  supplementLib.ts         ← SUPPLEMENT_LIBRARY, DEFAULT_SUPPLEMENTS, getAdequacyBadge, DOSE_UNITS, TIMING_OPTIONS
components/
  MacroRings.tsx           ← Calorie donut ring (react-native-svg + reanimated)
  BentoWaterCard.tsx       ← Water bento card for dashboard
  BentoSuppsCard.tsx       ← Supplements bento card for dashboard
```

---

## Environment Variables
```
EXPO_PUBLIC_SUPABASE_URL=https://qjczxnnuzvkuiwphfquk.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon key>
```
Never use `VITE_` prefixes — this is Expo, not Vite.

---

## Theme (lib/theme.ts)
```typescript
colors.background  = '#0a0a0a'
colors.surface     = '#111111'
colors.primary     = '#22c55e'
colors.text        = '#ffffff'
colors.textMuted   = '#6b7280'
colors.border      = '#1f2937'
```
Always import from `lib/theme.ts`. Never hardcode colors inline.

---

## Database Tables
| Table | Purpose | Unique Constraint |
|---|---|---|
| `user_profiles` | Goals, streaks, personal info, theme | `user_id` |
| `daily_logs` | Per-day rollup: water_oz, water_breakdown (JSONB), daily_xp, xp_events (JSONB) | `user_id, date` |
| `meal_logs` | Individual food entries | `user_id, date` (not unique — multiple per day) |
| `activity_logs` | Workout logs, workout_done boolean | NO unique constraint |
| `supplements_logs` | Daily supplement checklist: taken_supplements (JSONB `{[id]: true}`) | `user_id, date` |
| `user_supplements` | User's supplement list: name, dose, timing, is_active, sort_order | `user_id` |
| `wellness_logs` | Mood (1-5), energy (1-5), sleep_hours, sleep_quality | `user_id, date` |
| `weight_logs` | Weight entries with logged_at timestamp | — |
| `weekly_coaching_reports` | Weekly AI coaching: coach_message, metrics_snapshot, triggered_rules, chat_messages, status | `user_id, week_start` |
| `goal_history` | All goal changes over time, changed_by 'user'/'coach' | — |

### user_profiles key columns
`id, user_id, name, sex, age, current_weight_lbs, goal_weight_lbs, height_in, activity_level, calorie_goal, protein_goal, carbs_goal, fat_goal, water_goal_oz, target_date, current_streak, longest_streak, hydration_streak, supplement_streak, total_xp, theme_color, unit_system, diet_preference, experience_level, onboarding_complete, disclaimer_accepted`

---

## React Query Key Conventions
```typescript
['user_profile', uid]
['daily_log', uid, today]
['meals', uid, today]
['activity', uid, today]
['supplements', uid, today]       // supplements_logs (taken map)
['user_supplements', uid]         // user's supplement list
['water', uid, today]             // isolated — do NOT share with daily_log
['weight_logs', uid]
['wellness_today', uid, today]
['coaching_reports', uid]
['goal_history', uid]
['daily_xp', uid, today]
['latest_coaching_report', uid]
['history_deficit', uid]
```

---

## Supabase Client Pattern
```typescript
import { supabase } from '@/lib/supabase'

// Get current user
const { data: { user } } = await supabase.auth.getUser()
const uid = user?.id

// Date (always local)
const today = new Date().toLocaleDateString('en-CA') // 'YYYY-MM-DD'

// Upsert daily table
await supabase.from('daily_logs')
  .upsert({ user_id: uid, date: today, water_oz: 32 }, { onConflict: 'user_id,date' })

// Fetch single row
const { data } = await supabase.from('daily_logs')
  .select('*').eq('user_id', uid).eq('date', today).maybeSingle()
```

---

## Navigation (expo-router)
```typescript
import { router } from 'expo-router'

router.push('/water')        // push screen
router.back()                // go back
router.replace('/(tabs)')    // replace (no back)
```

---

## Auth Flow
- `app/_layout.tsx` calls `supabase.auth.getSession()` on mount + subscribes to `onAuthStateChange`
- Session → redirect to `/(tabs)`, no session → redirect to `/(auth)/login`
- Session stored in AsyncStorage automatically via the Supabase client config

---

## Key Bugs Solved (Do Not Reintroduce)

### Date bugs
- **Never** use `new Date().toISOString().split('T')[0]` — returns UTC date, breaks for users west of UTC after 7pm. Always use `toLocaleDateString('en-CA')`.

### React Query cache poisoning
- WaterTracker query must use isolated key `['water', uid, today]` — never `['daily_log', uid, today]`. Sharing keys between components with different `select()` fields causes one to overwrite the other's cache.

### FatSecret food_id extraction
- FatSecret barcode API returns `{ "food_id": {"value": "5406437"} }` not a plain string. Always normalize:
```typescript
let foodId = response.food_id
if (typeof foodId === 'object' && foodId !== null) {
  foodId = foodId.$t || foodId.value || Object.values(foodId)[0]
}
foodId = String(foodId).trim()
```

### FatSecret OAuth
- Use **OAuth 1.0 HMAC-SHA1** only. Do not use OAuth 2.0 for any FatSecret endpoint — IP whitelisting issues. Consumer Key/Secret go in env vars as `EXPO_PUBLIC_FATSECRET_KEY` / `EXPO_PUBLIC_FATSECRET_SECRET` (or route through Supabase Edge Function to keep keys server-side).

### Delete account
- Must combine: server-side `adminClient.auth.admin.signOut()` + client-side `AsyncStorage.clear()` + `supabase.auth.signOut({ scope: 'global' })`. Doing only one leaves stale session state.

### Pre-workout gating
- Supplements with `timing === 'Pre-workout'` or name containing "pre-workout" must be grayed out if `workout_completed === false` for today. Re-check after workout is logged.

### Supabase Edge Function JWT
- Edge Functions that handle their own auth (delete-account, weekly-coaching-chat) must have "Verify JWT" disabled at the gateway level in Supabase dashboard.

### `onConflict` on activity_logs
- `activity_logs` intentionally has NO unique constraint on `user_id, date` (multiple activities allowed per day). Never add `onConflict` to inserts on this table.

---

## AI / Claude API Usage
- **Weekly Coaching** — Supabase Edge Function `weekly-coaching` called via `pg_cron` every Monday 9am UTC. Also callable manually via `supabase.functions.invoke('weekly-coaching', { body: { userId, manual: true } })`.
- **Coaching Chat** — Direct Anthropic API calls must go through a Supabase Edge Function (`weekly-coaching-chat`) to keep the API key server-side. Never call `api.anthropic.com` directly from the mobile client.
- Model: `claude-sonnet-4-20250514`, max_tokens: 350

---

## Food Data Sources (Priority Order)
1. FatSecret Restaurant
2. FatSecret Brand
3. USDA generic
4. USDA Branded
5. Open Food Facts

Only `fatsecret_food_id` stored permanently. Nutrition always re-fetched live.

---

## Monetization (Planned)
- 30-day free trial → hard paywall
- $6.99/month or $39.99/year
- RevenueCat for subscription management

---

## Screens Built (Phase 1–3)
- ✅ Auth (login, signup) with Supabase
- ✅ Bottom tab navigation (Home, Log, Activity, Wellness, Settings)
- ✅ Global theme + Inter font
- ✅ Wellness page (weight log, 14-day trend chart, recent entries)
- ✅ Activity page (workout toggle, activity level cards, today's summary)
- ✅ Water tracker (`/water`) — animated SVG bottle, quick-add presets, drink bottom sheet, swipe-to-delete, streak
- ✅ Supplements (`/supplements`) — DraggableFlatList, check-off toggles, adequacy badges, bottom sheet library search, custom supplements
- ✅ Dashboard (`/(tabs)/index`) — all 12 sections, calorie donut ring, macro pills, bento grid, coaching card, FAB
- ✅ Coaching page (`/coaching`) — full report, accept/decline/chat, goal history, early check-in
- 🔲 Settings/Profile (`/settings`)
- 🔲 Food search + log (`/food`)
- 🔲 Barcode scanner (expo-camera)
- 🔲 Onboarding flow
- 🔲 RevenueCat paywall
- 🔲 HealthKit integration
- 🔲 Streak page (`/streak`)
- 🔲 Weight page (`/weight`)
- 🔲 Food search + log (`/food`) — includes all 3 camera modes
- 🔲 Barcode scanner (expo-camera + ZXing/MLKit)
- 🔲 Nutrition label OCR (Claude Vision)
- 🔲 Meal photo recognition (Claude Vision)

## AI Camera Features (Phase 4 — Food Screen)

Three camera modes live inside the food log screen (`app/food.tsx`):

### 1. Barcode Scanner
- Uses `expo-camera` + ZXing in Expo (replaces web ZXing)
- Scans barcode → FatSecret lookup (OAuth 1.0) → fills food entry form
- GTIN-13 padding: 12-digit UPC-A barcodes get leading zero prepended
- food_id extraction: FatSecret returns `{"food_id": {"value": "5406437"}}` — always normalize before passing to food.get.v4
- Fallback order: FatSecret → USDA → Open Food Facts

### 2. Nutrition Label OCR
Two approaches — use whichever is available:
- **Option A (on-device, preferred):** `expo-camera` + Apple Vision framework via `react-native-vision-camera` with `VisionCamera` frame processor. Completely free, runs on-device, no API cost, no photo leaves the phone.
- **Option B (fallback):** Photo → base64 → Claude Vision API via Supabase Edge Function (never call Anthropic API directly from mobile client — key exposure risk)

Claude Vision prompt for label parsing:
```
Look at this nutrition facts label. Return ONLY a JSON object:
{
  "name": "product name if visible or null",
  "serving_size": "serving size text",
  "calories": number,
  "protein_g": number,
  "carbs_g": number,
  "fat_g": number,
  "saturated_fat_g": number or null,
  "sodium_mg": number or null,
  "fiber_g": number or null,
  "sugar_g": number or null
}
Return only JSON, nothing else.
```
- Compress image to max 1MB before sending
- On parse failure: show "Couldn't read label — enter manually"

### 3. Meal Photo Recognition
- User takes photo of any meal (plate of food, restaurant dish, homemade)
- Photo → base64 → Supabase Edge Function → Claude Vision API
- Claude estimates calories and macros based on visual portion size + food type + nutritional databases
- Returns multiple food items if meal has components (e.g. chicken + rice + broccoli)
- Each item shows estimated range (e.g. "~350-400 kcal") with confidence indicator
- User can adjust quantities before logging
- All AI camera calls go through Supabase Edge Function — never direct from client

### foodScanner.ts abstraction layer (lib/foodScanner.ts)
Structure all scanning behind an abstraction so swapping implementations is easy:
```typescript
// NATIVE: replace with expo-camera when converting
export const scanBarcode = async (): Promise<string>
// NATIVE: replace with VisionCamera frame processor for on-device OCR
export const scanNutritionLabel = async (imageBase64: string): Promise<NutritionData>
// NATIVE: stays the same, just uses Supabase Edge Function
export const recognizeMeal = async (imageBase64: string): Promise<FoodItem[]>
```
Comment every function with `// NATIVE: ...` so the swap points are obvious.
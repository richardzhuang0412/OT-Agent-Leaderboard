# Leaderboard Development Progress

## Latest Update: January 15, 2026

### New Feature: Configurable "Top N Performers by Benchmark" with Duplicate Support

Improved the "Top N Performers" filter to allow users to select which benchmark to sort by, with full support for duplicate benchmark handling.

**What Changed:**
- Added a benchmark selector dropdown next to the N selector in the ViewModeControls
- New UI: "Top [N dropdown] Performers by [Benchmark dropdown]"
- Default benchmark remains `dev_set_71_tasks`
- Users can now see top performers ranked by any available canonical benchmark

**Duplicate-Aware Sorting:**
- Dropdown only shows canonical benchmarks (duplicate benchmarks are excluded)
- When sorting by a canonical benchmark, models without the canonical result but with a duplicate benchmark result will use the duplicate's accuracy for sorting
- This ensures models are ranked correctly even when only duplicate benchmark results exist

**Files Modified:**
- `client/src/components/ViewModeControls.tsx` - Added benchmark selector dropdown and new props
- `client/src/pages/Leaderboard.tsx`:
  - Added `topPerformerBenchmark` state
  - Added `benchmarkDuplicateMap` and `canonicalToDuplicatesMap` for duplicate tracking
  - Added `canonicalBenchmarks` computed value to filter dropdown options
  - Updated `filteredByViewMode` with `getAccuracyForSorting` helper for duplicate fallback

---

## January 15, 2026

### New Feature: Duplicate-Aware Improvement Signal

Made the improvement signal compatible with duplicate model/benchmark handling. When duplicates are hidden, improvements are now calculated against the canonical model/benchmark instead of the duplicate.

**What Changed:**
1. **Duplicate Benchmarks:** When a duplicate benchmark result is merged into the canonical benchmark column, the improvement now compares to the base model's accuracy on the *canonical* benchmark (not the duplicate)
2. **Duplicate Base Models:** When the base model name is substituted with the canonical name, the improvement now compares to the *canonical* base model's accuracy (not the duplicate base model)

**Files Modified:**
- `create_leaderboard_view.sql` - Added 3 new accuracy fields for canonical comparisons:
  - `canonical_benchmark_base_model_accuracy`: Base model accuracy on canonical benchmark
  - `canonical_base_model_accuracy`: Canonical base model's accuracy on same benchmark
  - `canonical_both_base_model_accuracy`: Canonical base model on canonical benchmark
- `server/storage.ts` - Updated interface and mapping for new fields
- `server/routes.ts` - Pass through new accuracy fields to frontend
- `client/src/components/LeaderboardTableWithImprovement.tsx` - Added `recalculateImprovement` helper and updated `processedData` useMemo to dynamically recalculate improvements based on checkbox state

**Behavior Matrix:**

| Show Dup Models | Show Dup Benchmarks | Accuracy Used for Improvement |
|-----------------|---------------------|-------------------------------|
| ✓ (checked) | ✓ (checked) | Original `baseModelAccuracy` |
| ✓ (checked) | ✗ (unchecked) | `canonicalBenchmarkBaseModelAccuracy` |
| ✗ (unchecked) | ✓ (checked) | `canonicalBaseModelAccuracy` |
| ✗ (unchecked) | ✗ (unchecked) | `canonicalBothBaseModelAccuracy` |

**Note:** Run the updated `create_leaderboard_view.sql` in Supabase SQL Editor to apply database changes.

---

## January 13, 2026

### New Feature: Duplicate Benchmark & Model Handling

Added support for hiding/showing duplicate benchmarks and models with intelligent merging:

**UI Controls:**
- Two checkboxes near filter bars: "Show duplicate benchmarks" and "Show duplicate models"
- Default: unchecked (duplicates hidden and merged)
- Applied to both "Filtered View" and "All Models" tabs

**Duplicate Benchmarks (when hidden):**
- Duplicate benchmark columns are not displayed
- If a row has a result for a duplicate benchmark but NOT the canonical benchmark, the canonical column is filled with the duplicate's result

**Duplicate Models (when hidden):**
- Rows for duplicate models are filtered out
- Base model names are substituted with canonical model names

**Files Modified:**
- `create_leaderboard_view.sql` - Added `duplicate_of` fields and canonical name lookups via LEFT JOINs
- `server/storage.ts` - Added duplicate tracking fields to `BenchmarkResultWithImprovement` interface
- `server/routes.ts` - Updated `/api/leaderboard-pivoted-with-improvement` to include duplicate info
- `client/src/components/LeaderboardTableWithImprovement.tsx` - Added filtering/merging logic
- `client/src/pages/Leaderboard.tsx` - Added checkbox state and UI

**Note:** Run the updated `create_leaderboard_view.sql` in Supabase SQL Editor to apply database changes.

---

## Previous Features (Summarized)

### Phase 5: Full-Width Layout (Jan 13, 2026)
- Removed `max-w-7xl` constraint from header and main containers
- Table now expands to full browser window width

### Phase 4: Timestamps, Legends & Benchmark Exclusion (Nov 25, 2025)
- Added `ended_at` timestamp column with sorting (First Eval / Latest Eval)
- Unified leaderboard to always show improvement metrics (removed toggle)
- Added comprehensive legend documentation (metrics, sorting, traces)
- Created benchmark exclusion config (`benchmarkConfig.ts`)
- Visual indicators for excluded benchmarks in filter dropdown

### Phase 3: Model Improvement Metrics (Nov 18, 2025)
- Enhanced database view with base model information and accuracy
- New endpoint `/api/leaderboard-pivoted-with-improvement`
- `LeaderboardTableWithImprovement` component with per-benchmark Acc/Imp sort toggle
- Base Model column, search, and filter components
- Improvement displayed as percentage points (pp) with color coding

### Phase 2: UI/UX Enhancements (Nov 17, 2025)
- Frozen Model Name column during horizontal scroll
- Dual horizontal scrollbars (top and bottom, synced)
- Red warning flag for missing traces on `dev_set_71_tasks`
- Icon legend for trace link states

### Phase 1: Data Aggregation & Supabase Integration (Oct-Nov 2025)
- Switched from direct PostgreSQL to Supabase API
- Created `leaderboard_results` view aggregating `sandbox_jobs`
- Changed aggregation to keep earliest valid eval per (model, agent, benchmark)

---

## Key Files

| Layer | File | Purpose |
|-------|------|---------|
| Database | `create_leaderboard_view.sql` | Supabase view definition |
| Backend | `server/storage.ts` | Data interfaces and Supabase queries |
| Backend | `server/routes.ts` | API endpoints with pivoting logic |
| Frontend | `client/src/pages/Leaderboard.tsx` | Main page, state, filters |
| Frontend | `client/src/components/LeaderboardTableWithImprovement.tsx` | Table with sorting/filtering |
| Config | `client/src/config/benchmarkConfig.ts` | Benchmark exclusions, defaults |

---

## Known Limitations

1. No pagination - all results loaded at once (~1000 rows max recommended)
2. Improvement data requires base model evaluation for same benchmark
3. Red warning flag only for `dev_set_71_tasks` benchmark
4. Database view must be manually updated in Supabase SQL Editor

---

## Setup Checklist

1. Ensure `.env` has Supabase credentials (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`)
2. Run `create_leaderboard_view.sql` in Supabase SQL Editor
3. `npm install` and `npm run dev`
4. Open http://localhost:5000

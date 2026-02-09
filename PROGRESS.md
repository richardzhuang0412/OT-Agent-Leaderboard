# Leaderboard Development Progress

## Latest Update: February 9, 2026

### Feature: Show Models Without Evaluations on the Leaderboard

Models registered in the database but without evaluation results (`sandbox_jobs`) now appear on the leaderboard with "---" in all benchmark columns.

**Approach:** Separate query for all models from the `models` table, merged server-side into the existing pivoted response. No SQL view changes needed.

**Files Modified:**
- `server/storage.ts` - Added `ModelInfo` interface and `getAllModels()` method (queries `models` with `INNER JOIN agents`, resolves `base_model_id`/`duplicate_of` self-references in memory)
- `server/routes.ts` - In `/api/leaderboard-pivoted-with-improvement`: fetches all models, adds `modelCreatedAt` to all entries, creates new entries for models without evals (empty benchmarks)
- `client/src/components/LeaderboardTableWithImprovement.tsx` - Added `modelCreatedAt?: string` to `PivotedLeaderboardRowWithImprovement` interface
- `client/src/pages/Leaderboard.tsx` - "N Most Recent" uses `modelCreatedAt` as fallback when `latestEvalEndedAt` is absent

**Behavior:**
- Models without evals show "---" in all benchmark columns (already handled)
- They appear in "N Most Recent" via `modelCreatedAt` fallback timestamp
- Filter dropdowns automatically include them
- Sorting by benchmark pushes them to bottom (undefined handling already exists)
- "Top N Performers" naturally excludes them (no accuracy to rank by)
- Duplicate model handling works via `modelDuplicateOf` field from models query

---

## February 1, 2026

### Enhancement: Merge-Then-Threshold Selection Logic

Updated the result selection to merge results across duplicate benchmarks BEFORE applying threshold selection. This ensures the best valid result is selected from the entire pool of equivalent benchmarks.

**Previous Behavior:** Threshold selection was applied per-benchmark-id. A model with 0% on canonical benchmark and 45% on its duplicate would show 0% for the canonical column.

**New Behavior (Merge-Then-Threshold):**
1. For each (model, agent, canonical_benchmark), merge all results from canonical + duplicate benchmarks into one pool
2. From this merged pool, select the first evaluation with accuracy > 1.0%
3. If none meet threshold, fall back to earliest evaluation

**Implementation:**
- Changed `DISTINCT ON` from `(a.name, m.name, b.name)` to `(a.name, m.name, COALESCE(b_canonical.name, b.name))`
- Changed `ORDER BY` to group by canonical benchmark name
- Added `source_benchmark_name` and `source_benchmark_id` fields to track which actual benchmark the result came from
- Updated base model accuracy subqueries to also merge across duplicate benchmarks

**Files Modified:**
- `create_leaderboard_view.sql` - Merge-then-threshold logic, new source tracking fields
- `server/storage.ts` - Added `sourceBenchmarkName` and `sourceBenchmarkId` to interface
- `server/routes.ts` - Pass through new source fields to frontend
- `client/src/components/LeaderboardTableWithImprovement.tsx` - Updated interface for new fields
- `client/src/pages/Leaderboard.tsx` - Added "Result Selection" info section (both tabs)

**Note:** The "Show duplicate benchmarks" checkbox is now less relevant since merging happens at the SQL level. All benchmark columns show canonical names.

**Database Update Required:** Run the updated `create_leaderboard_view.sql` in Supabase SQL Editor.

---

### New Feature: Result Selection Info Section

Added a new informational section to the leaderboard UI explaining the merge-then-threshold result selection logic.

**Location:** Info panel on both "Filtered View" and "All Models" tabs (section 6 of 6)

---

### Previous: Threshold-Based Eval Result Selection

Fixed issue where early "glitchy" evaluations with 0% accuracy were displayed instead of correct results. The leaderboard now uses intelligent threshold-based selection.

**Problem:** The view used `ORDER BY timestamp ASC` keeping the earliest eval, but some early runs had 0% accuracy due to glitches.

**Solution:** For each (model, agent, benchmark) combination:
1. Prefer the **first evaluation with accuracy > 1.0%** (deprioritizes glitchy 0% runs)
2. If no evaluation meets the threshold, **fall back to the first evaluation** (still shows results when no good evals exist)

**Implementation:**
- Added CTE (`job_metrics`) to pre-compute accuracy before ordering
- Changed `ORDER BY` to use `CASE WHEN computed_accuracy > 1.0 THEN 0 ELSE 1 END` to prioritize above-threshold results
- Applied threshold-aware ordering to all 5 selection points: main query + 4 base model accuracy subqueries

**Files Modified:**
- `create_leaderboard_view.sql` - Added CTE with pre-computed accuracy, threshold-aware ordering in main query and all 4 base model accuracy subqueries
- `CLAUDE.md` - Updated documentation to describe new threshold behavior

**Note:** Run the updated `create_leaderboard_view.sql` in Supabase SQL Editor to apply database changes.

---

## January 15, 2026

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

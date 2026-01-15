# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

An LLM Agent Benchmark Leaderboard web application for displaying and comparing benchmark results across different models, agents, and benchmark types. Built as a full-stack TypeScript application with React frontend and Express backend, backed by Supabase PostgreSQL.

**Two-Part System:**
- **This repo (OT-Agent-Leaderboard)**: React/Express web frontend that reads and displays leaderboard data
- **dcagents-leaderboard/unified_db**: Python package that writes evaluation data to the database

## Development Commands

### Core Commands

```bash
# Development mode (with hot reload on port 5000)
npm run dev

# Production build (outputs to dist/)
npm run build

# Start production server (runs dist/index.js)
npm start

# Type checking only (no compilation)
npm run check
```

The application serves on port 5000 by default (configurable via `PORT` environment variable). In development, Vite provides HMR for the React frontend.

### Environment Setup

The `.env` file must contain Supabase credentials:
```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

**Database View Setup** (one-time only after `.env` is set):

The leaderboard requires a `leaderboard_results` database view to aggregate evaluation results. To set it up:

1. Go to your Supabase project dashboard → SQL Editor
2. Create a new query and paste the contents of `create_leaderboard_view.sql`
3. Execute the query

This view automatically aggregates the latest results per (model, agent, benchmark) combination from `sandbox_jobs`, parsing accuracy metrics from JSONB format.

## Architecture Overview

### Full-Stack Structure

- **Client**: `/client/src` - React 18 + TypeScript + Vite
- **Server**: `/server` - Express.js + TypeScript
- **Shared**: `/shared` - Common types and schemas used by both client and server
- **Database**: PostgreSQL accessed via Drizzle ORM

### Key Architectural Patterns

1. **Shared Schema Layer**: The `/shared/schema.ts` file defines both the database schema (Drizzle) and validation schemas (Zod), ensuring type consistency across the entire stack.

2. **Storage Abstraction**: `server/storage.ts` implements an `IStorage` interface with `DbStorage` class, allowing the data layer to be swapped without changing route handlers.

3. **Client State Management**: TanStack Query handles all server state with infinite stale time (manual refresh only). Local UI state uses React hooks.

4. **Path Aliases**:
   - `@/` → `client/src/`
   - `@shared/` → `shared/`
   - `@db` → `server/db.ts`

### Data Model

The application uses a Supabase database with the following key tables:
- `agents` - Agent definitions with version hashes
- `models` - Model metadata, training parameters, and references to agents
- `benchmarks` - Benchmark definitions with version hashes
- `sandbox_jobs` - Evaluation job records linking models, agents, and benchmarks
- `sandbox_trials` - Individual trial results for each job
- `sandbox_tasks` - Task definitions used in benchmarks

The leaderboard reads from a `leaderboard_results` view that aggregates data from `sandbox_jobs`, keeping the latest valid result per (model, agent, benchmark) combination.

### Database Schema (unified_db)

The full database schema is defined in `dcagents-leaderboard/unified_db/complete_schema.sql`. Key relationships:

```
agents (id, name, agent_version_hash)
   ↓
models (id, name, agent_id → agents.id, ...)
   ↓
sandbox_jobs (agent_id → agents.id, model_id → models.id, benchmark_id → benchmarks.id, metrics JSONB)
   ↓
leaderboard_results VIEW (aggregates sandbox_jobs by model/agent/benchmark, extracts accuracy metrics)
```

The `leaderboard_results` view extracts `accuracy` and `accuracy_stderr` from the `metrics` JSONB array in `sandbox_jobs`:
```sql
SELECT DISTINCT ON (a.name, m.name, b.name)
  m.name as model_name, a.name as agent_name, b.name as benchmark_name,
  (SELECT (elem->>'value')::float * 100 FROM jsonb_array_elements(sj.metrics) elem WHERE elem->>'name' = 'accuracy') as accuracy,
  (SELECT (elem->>'value')::float * 100 FROM jsonb_array_elements(sj.metrics) elem WHERE elem->>'name' = 'accuracy_stderr') as standard_error
FROM sandbox_jobs sj
JOIN agents a ON sj.agent_id = a.id
JOIN models m ON sj.model_id = m.id
JOIN benchmarks b ON sj.benchmark_id = b.id
ORDER BY a.name, m.name, b.name, COALESCE(sj.ended_at, sj.created_at) DESC;
```

### API Endpoints

All endpoints are under the `/api` prefix and query the Supabase `leaderboard_results` view:

**Primary Endpoint (Used by Frontend):**
- `GET /api/leaderboard-pivoted` - Returns pivoted leaderboard data where each row represents a (model, agent) pair with benchmarks as nested object with accuracy and standardError

**Legacy Endpoints (Not Actively Used):**
- `GET /api/benchmark-results` - Fetches all results in flat format (one row per benchmark result)
- `GET /api/benchmark-results/:id`, `POST /api/benchmark-results`, `DELETE /api/benchmark-results/:id` - Not implemented for view-based data

All data flows from Supabase → storage layer → routes → frontend. The pivoting logic (converting flat benchmark results into (model, agent) rows with benchmarks as columns) happens in the `/api/leaderboard-pivoted` route handler.

### Data Flow with TanStack Query

The frontend uses TanStack Query for server state management:

1. **Leaderboard.tsx** (page component) calls `useQuery` with key `['/api/leaderboard-pivoted']`
2. TanStack Query automatically fetches from the API endpoint (configured in `client/src/lib/queryClient.ts`)
3. Data is cached with infinite stale time (manual refresh only)
4. All filtering and sorting happen **client-side** after the full dataset is loaded
5. Filters are stored in local state: `modelSearch`, `agentSearch`, `benchmarkSearch`, etc.

Important: **No pagination or infinite scroll** - all data is loaded at once and filtered client-side. This works well for datasets up to ~1000 rows.

### Frontend Components

Main page: `client/src/pages/Leaderboard.tsx` (manages filters and data fetching)
- `SearchBar` - Separate search inputs (client-side filtering):
  - Model search: Filters which table **rows** are visible
  - Agent search: Filters which table **rows** are visible
  - Benchmark search: Filters which table **columns** are visible
- `FilterControls` - Multi-select dropdowns (client-side filtering):
  - Model/Agent filters: Control which **rows** are displayed
  - Benchmark filter: Controls which **columns** are displayed
- `ViewModeControls` - View mode filters (on "Filtered View" tab only):
  - Top N Performers: Select N and which benchmark to rank by (default: `dev_set_71_tasks`)
  - N Most Recent: Select N most recently evaluated models
  - Results are unioned (rows in either top N OR most recent N are shown)
- `LeaderboardTable` - Pivoted table component:
  - Fixed columns: Model Name, Agent Name
  - Dynamic columns: One column per visible benchmark showing "accuracy% ± standard_error"
  - Sortable: Click headers to sort by any column (model, agent, or benchmark score)
  - Missing data shown as "—" when a model+agent combo doesn't have a particular benchmark result
  - Includes HuggingFace traces link in each cell (if available)
- `ThemeToggle` - Dark/light mode switcher

UI components in `client/src/components/ui/` are shadcn/ui primitives (Radix UI + Tailwind CSS).

### Data Structures

**Pivoted Leaderboard Row (API Response):**
```typescript
interface PivotedLeaderboardRow {
  modelName: string;
  agentName: string;
  benchmarks: {
    [benchmarkName: string]: {
      accuracy: number;           // percentage (0-100)
      standardError: number;      // percentage (0-100)
      hfTracesLink?: string;      // optional HuggingFace traces URL
    }
  }
}
```

Each row represents a unique (model, agent) combination. Benchmarks appear as columns (not rows). The table dynamically generates columns based on available benchmarks in the data. This structure enables efficient client-side filtering where you can show/hide entire columns or rows.

**Flat Benchmark Result (from View):**
The underlying `leaderboard_results` Supabase view returns flat data:
```typescript
interface BenchmarkResult {
  id: string;
  modelName: string;
  agentName: string;
  benchmarkName: string;
  accuracy: number;
  standardError: number;
  hfTracesLink?: string;
}
```

The `/api/leaderboard-pivoted` endpoint transforms this flat data into the pivoted structure (see `server/routes.ts:60-102`).

### Development Environment

- **Development**: Server runs via `tsx` with Vite middleware for HMR
- **Production**: Vite builds to `dist/public`, esbuild bundles server to `dist/index.js`
- **Database**: SSL required in production, preferred in development

## Design Principles

From `design_guidelines.md`:
- Data-centric Material Design approach prioritizing information density
- Dark mode primary with light mode support
- Inter font for UI, JetBrains Mono for metrics
- Professional, research-appropriate aesthetic
- Full-width layout: Table expands to fill browser window (no max-width constraint)

## Common Tasks

### Understanding the Pivoted Table Display

The leaderboard displays results in a **pivoted (transposed) format** where benchmarks become columns:

```
| Model     | Agent  | Benchmark1 | Benchmark2 | Benchmark3 |
|-----------|--------|------------|------------|------------|
| GPT-4     | ReAct  | 89.2% ±0.12| 75.3% ±0.08| —          |
| Claude-3  | ReAct  | 92.1% ±0.09| 78.4% ±0.11| 85.0% ±0.15|
```

**Why this format?**
- Compare multiple benchmarks for the same model+agent pair in a single row
- Missing data ("—") shows when a particular combination hasn't been evaluated
- Space-efficient for many benchmarks, query-efficient in the database view

### How Filtering and Searching Works

**Client-side filtering** happens in `Leaderboard.tsx` using React state:

- **Model/Agent Search**: Real-time text search, filters which **rows** are displayed
- **Model/Agent Filters**: Multi-select dropdowns, filters which **rows** are displayed
- **Benchmark Search/Filter**: Text search and multi-select, filters which **columns** are visible

All filtering happens after the data is loaded, so it's instant. To understand the filter logic, look at the `useMemo` hooks and filter conditions in `client/src/pages/Leaderboard.tsx`.

### Adding or Updating Benchmark Data

Data comes from the Supabase `leaderboard_results` view, which aggregates from `sandbox_jobs`.

**Using the Python unified_db Package** (preferred method):

The `dcagents-leaderboard/unified_db` package provides Python functions to insert evaluation data:

```bash
cd dcagents-leaderboard
pip install -r requirements.txt
```

```python
from unified_db import (
    register_agent, register_benchmark, register_hf_model,
    register_sandbox_job, upload_eval_results
)

# Register prerequisites
agent = register_agent(name="MyAgent", agent_version_hash="abc123...")
benchmark = register_benchmark(name="GAIA", description="GAIA benchmark")
model = register_hf_model(repo_name="openai/gpt-4", agent_id=agent['agent']['id'], ...)

# Upload evaluation results
result = register_sandbox_job(
    job_name="Eval Run",
    agent_id=agent['agent']['id'],
    model_id=model['model']['id'],
    benchmark_id=benchmark['benchmark']['id'],
    metrics=[{"name": "accuracy", "value": 0.85}, {"name": "accuracy_stderr", "value": 0.02}],
    ...
)
```

Key unified_db functions:
- `register_agent()`, `register_benchmark()`, `register_hf_model()` - Create base entities
- `register_sandbox_job()` - Record evaluation runs with metrics
- `upload_eval_results()` - High-level function for complete eval result upload
- `upload_traces_to_hf()` - Upload traces to HuggingFace

**View Behavior:**
- The view deduplicates using `DISTINCT ON (a.name, m.name, b.name)` and orders by `ended_at DESC`, so only the **latest** job result for each combination appears
- Click the Refresh button on the leaderboard to reload data from the API

### Duplicate Benchmark and Model Handling

The database schema supports marking benchmarks and models as duplicates of canonical entries via `duplicate_of` foreign key fields. The leaderboard handles these intelligently:

**Database Schema:**
- `models.duplicate_of` - UUID reference to canonical model
- `benchmarks.duplicate_of` - UUID reference to canonical benchmark

**UI Controls:**
Two checkboxes near the filter controls (on both "Filtered View" and "All Models" tabs):
- "Show duplicate benchmarks" (default: unchecked)
- "Show duplicate models" (default: unchecked)

**Behavior when checkboxes are unchecked (default):**
1. **Duplicate Benchmarks**: Columns for duplicate benchmarks are hidden. If a row has a result for a duplicate benchmark but NOT the canonical benchmark, the canonical column is filled with the duplicate's result (intelligent merging).
2. **Duplicate Models**: Rows for duplicate models are filtered out. Base model names are substituted with canonical model names where applicable.

**Duplicate-Aware Improvement Signal:**

When duplicates are hidden, the improvement signal (pp) is recalculated to compare against canonical models/benchmarks instead of duplicates:

| Show Dup Models | Show Dup Benchmarks | Improvement Compares To |
|-----------------|---------------------|-------------------------|
| ✓ checked | ✓ checked | Original base model on original benchmark |
| ✓ checked | ✗ unchecked | Original base model on **canonical** benchmark |
| ✗ unchecked | ✓ checked | **Canonical** base model on original benchmark |
| ✗ unchecked | ✗ unchecked | **Canonical** base model on **canonical** benchmark |

The SQL view provides four accuracy values for this:
- `base_model_accuracy` - Original base model on original benchmark
- `canonical_benchmark_base_model_accuracy` - Original base model on canonical benchmark
- `canonical_base_model_accuracy` - Canonical base model on original benchmark
- `canonical_both_base_model_accuracy` - Canonical base model on canonical benchmark

The frontend's `processedData` useMemo in `LeaderboardTableWithImprovement.tsx` uses the `recalculateImprovement` helper to dynamically select the correct accuracy value based on checkbox state.

**Implementation layers:**
1. `create_leaderboard_view.sql` - Exposes `duplicate_of` fields, canonical names via LEFT JOINs, and 4 base model accuracy variants
2. `server/storage.ts` - `BenchmarkResultWithImprovement` interface includes duplicate tracking fields and canonical accuracy fields
3. `server/routes.ts` - API includes `modelDuplicateOf`, `canonicalModelName`, `benchmarkDuplicateOf`, `canonicalBenchmarkName`, and canonical accuracy values
4. `LeaderboardTableWithImprovement.tsx` - `processedData` useMemo handles filtering/merging and improvement recalculation based on checkbox state
5. `Leaderboard.tsx` - Manages `showDuplicateBenchmarks` and `showDuplicateModels` state

### Modifying the Data Transformation (Pivoting)

The transformation from flat results to pivoted rows happens in `server/routes.ts` at the `/api/leaderboard-pivoted` endpoint (lines 60-102):

1. Fetch flat data from `storage.getAllBenchmarkResults()` (which queries the `leaderboard_results` view)
2. Create a Map keyed by `modelName|||agentName` to group results by (model, agent) pair
3. For each result, add it to the benchmarks object under its benchmark name
4. Convert the Map to an array and sort by model name, then agent name
5. Return the pivoted structure to the frontend

To change how pivoting works (e.g., add new fields), modify lines 65-88 in `server/routes.ts`.

### Adding New API Endpoints

1. Define the new route handler in `server/routes.ts` (inside the `registerRoutes` function)
2. If the endpoint needs database access, add a method to the `DbStorage` class in `server/storage.ts`
3. The frontend can fetch from the new endpoint using TanStack Query, with the endpoint path as the query key (auto-configured in `queryClient.ts`)

## Important Notes

- **No authentication**: The leaderboard is publicly accessible (no login required)
- **No real-time updates**: Use the Refresh button to reload data. TanStack Query caches data with infinite stale time
- **No pagination**: All data is loaded at once (~1000 rows max recommended). Client-side filtering/sorting works after load
- **View-based data source**: The `leaderboard_results` Supabase view aggregates `sandbox_jobs`, deduplicating by (agent, model, benchmark) and keeping only the latest result per combination
- **Legacy code present**: The Drizzle ORM setup and `benchmark_results` table are included for historical reasons but not actively used. Data flows from `sandbox_jobs` → view → Supabase API → storage layer → routes → frontend
- **Shared schema layer**: The `/shared/schema.ts` file contains both Drizzle table definitions and Zod validation schemas, but only the types are used by the frontend and API (actual queries go through Supabase, not Drizzle ORM)

## Troubleshooting

### "SUPABASE_URL must be set"
- Ensure `.env` file exists in project root with `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`
- Verify environment variables are loaded: Add `console.log(process.env.SUPABASE_URL)` in `server/db.ts` to check
- Restart dev server after updating `.env` (the server loads `.env` on startup via `dotenv`)

### "relation 'leaderboard_results' does not exist"
- The database view hasn't been created in Supabase yet
- Go to Supabase → SQL Editor → New Query
- Copy and paste the contents of `create_leaderboard_view.sql`
- Execute the query
- Verify success: `SELECT COUNT(*) FROM leaderboard_results;` in Supabase

### "No results found" in leaderboard (empty table)
1. Check if Supabase has evaluation data: `SELECT COUNT(*) FROM sandbox_jobs WHERE metrics IS NOT NULL;`
2. Verify metrics JSONB format: `SELECT metrics FROM sandbox_jobs LIMIT 1;`
   - Should be an array like: `[{"name": "accuracy", "value": 0.85}, {"name": "accuracy_stderr", "value": 0.02}]`
3. Ensure foreign keys are set correctly: `SELECT COUNT(*) FROM sandbox_jobs s JOIN agents a ON s.agent_id = a.id;`
4. Check the view returns data: `SELECT COUNT(*) FROM leaderboard_results;`

### Port 5000 already in use
- Use a different port: `PORT=5001 npm run dev`
- Or kill the existing process: `lsof -ti:5000 | xargs kill`

### npm/yarn dependency issues
- Clean install: `rm -rf node_modules package-lock.json && npm install`
- If rollup issues persist (particularly on ARM64 macOS): `yarn install && yarn dev` (Yarn handles optional dependencies better)
- Alternatively: `npm ci` instead of `npm install` (uses exact versions from lock file)

## Modifications and Customization

### Adding New Benchmarks to the Leaderboard

Benchmarks are automatically discovered from the data:
1. Insert a new benchmark into the `benchmarks` table in Supabase
2. Add evaluation jobs to `sandbox_jobs` that reference this benchmark
3. Ensure jobs have `metrics` JSONB with `accuracy` and `accuracy_stderr` fields
4. The `leaderboard_results` view will automatically pick up the new benchmark
5. Click Refresh on the leaderboard to reload and see the new benchmark columns

The UI automatically discovers all available benchmarks from the data, so no code changes needed.

### Displaying Additional Metrics (Beyond Accuracy)

Currently shows `accuracy ± standard_error` per benchmark. To add new metrics (e.g., F1 score, precision):

1. **Update the Supabase view** (`create_leaderboard_view.sql`):
   ```sql
   -- Add new metric extraction, e.g.:
   (SELECT (elem->>'value')::float * 100
    FROM jsonb_array_elements(sj.metrics) elem
    WHERE elem->>'name' = 'f1_score' LIMIT 1) as f1_score
   ```
2. **Update the API response** in `server/routes.ts` (lines 68-69):
   ```typescript
   group.benchmarks[result.benchmarkName] = {
     accuracy: result.accuracy,
     standardError: result.standardError,
     f1Score: result.f1_score,  // Add new field
     hfTracesLink: result.hfTracesLink
   };
   ```
3. **Update the frontend table** in `client/src/components/LeaderboardTable.tsx` to display the new metric in table cells

### Customizing the Table UI

**Sorting**: Implemented in `LeaderboardTable.tsx` - click column headers to toggle ascending/descending

**Cell formatting**: Edit the cell rendering in `LeaderboardTable.tsx` to change how accuracy/error display (e.g., significant figures, colors)

**Color schemes**: Uses Tailwind CSS classes. Light/dark mode colors defined in `client/src/pages/Leaderboard.tsx` with `bg-background`, `text-foreground`, etc.

**Layout**: Follows Material Design principles from `design_guidelines.md` - data-focused, professional aesthetic

### Adding Columns to the Fixed Left Side

Currently fixed columns are: Model Name, Agent Name. To add more (e.g., Model Size, Agent Version):

1. Add field to the API response in `server/routes.ts` (in the `groupedData` map)
2. Modify `LeaderboardTable.tsx` to render additional fixed columns
3. Update the TypeScript interface `PivotedLeaderboardRow` to include the new field

## File Structure Reference

Key files for common modifications:
- **Client UI**: `client/src/pages/Leaderboard.tsx` - Main layout, state, filter/duplicate checkboxes
- **Data Display**: `client/src/components/LeaderboardTableWithImprovement.tsx` - Main table with improvement metrics, duplicate handling, sorting
- **Filtering**: `client/src/components/FilterControlsWithBaseModel.tsx` and `SearchBarWithBaseModel.tsx` - Filter/search UI
- **View Mode**: `client/src/components/ViewModeControls.tsx` - Top N Performers (by benchmark) and N Most Recent controls
- **Config**: `client/src/config/benchmarkConfig.ts` - Benchmark exclusions, default visible benchmarks
- **API**: `server/routes.ts` - `/api/leaderboard-pivoted-with-improvement` endpoint (data transformation)
- **Data Access**: `server/storage.ts` - Database query abstraction, `BenchmarkResultWithImprovement` interface
- **Database View**: `create_leaderboard_view.sql` - Supabase view with duplicate tracking fields
- **Types**: `shared/schema.ts` - Shared TypeScript types and Zod schemas

**Database Backend (dcagents-leaderboard/unified_db/):**
- `complete_schema.sql` - Full PostgreSQL schema with all tables (includes `duplicate_of` fields)
- `__init__.py` - Exported Python API functions
- `utils.py` - Core implementation of registration functions
- `models.py` - Pydantic models for data validation
- `config.py` - Supabase client configuration

## Related Repository

The `dcagents-leaderboard/unified_db` Python package manages all database writes. See its README for detailed API documentation including:
- Dataset registration (HuggingFace and local parquet)
- Model registration and training tracking
- Agent and benchmark management
- Sandbox evaluation job and trial recording
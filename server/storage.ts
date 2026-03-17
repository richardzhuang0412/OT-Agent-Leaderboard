import { type BenchmarkResult, type InsertBenchmarkResult } from "@shared/schema";
import { supabase } from "@db";
import { benchmarkResults } from "@shared/schema";
import { eq } from "drizzle-orm";

export type EvalSelectionMode = 'oldest' | 'latest' | 'highest';

export interface BenchmarkResultExtended extends BenchmarkResult {
  hfTracesLink?: string;
  endedAt?: string;
}

export interface BenchmarkResultWithImprovement extends BenchmarkResultExtended {
  modelId: string;
  baseModelId: string | null;
  baseModelName: string;
  baseModelAccuracy?: number;
  // Additional accuracy values for duplicate-aware improvement calculation
  canonicalBenchmarkBaseModelAccuracy?: number;  // Base model accuracy on canonical benchmark
  canonicalBaseModelAccuracy?: number;            // Canonical base model's accuracy on same benchmark
  canonicalBothBaseModelAccuracy?: number;        // Canonical base model on canonical benchmark
  agentId: string;
  benchmarkId: string;
  endedAt?: string;
  // Duplicate tracking fields
  modelDuplicateOf: string | null;
  canonicalModelName: string;
  baseModelDuplicateOf: string | null;
  canonicalBaseModelName: string;
  benchmarkDuplicateOf: string | null;
  canonicalBenchmarkName: string;
  // Source benchmark (tracks which actual benchmark the result came from after merging duplicates)
  sourceBenchmarkName: string;
  sourceBenchmarkId: string;
  // Eval config metadata
  timeoutMultiplier?: number;
  daytonaOverrideCpus?: number;
  daytonaOverrideMemoryMb?: number;
  daytonaOverrideStorageMb?: number;
  // Training type
  trainingType?: string;
  // Job status for progress tracking
  jobStatus: string | null;
  username: string | null;
}

export interface ModelInfo {
  modelId: string;
  modelName: string;
  agentId: string;
  agentName: string;
  baseModelId: string | null;
  baseModelName: string;
  modelDuplicateOf: string | null;
  canonicalModelName: string;
  baseModelDuplicateOf: string | null;
  canonicalBaseModelName: string;
  creationTime: string | null;
  trainingType: string | null;
}

// Raw row from the leaderboard_results view (all results, no deduplication)
interface RawLeaderboardRow {
  id: string;
  model_id: string;
  model_name: string;
  model_duplicate_of: string | null;
  canonical_model_name: string;
  base_model_id: string | null;
  base_model_name: string;
  base_model_duplicate_of: string | null;
  canonical_base_model_name: string;
  agent_name: string;
  agent_id: string;
  benchmark_name: string;
  benchmark_id: string;
  benchmark_duplicate_of: string | null;
  canonical_benchmark_name: string;
  source_benchmark_name: string;
  source_benchmark_id: string;
  accuracy: number | null;
  standard_error: number | null;
  hf_traces_link: string | null;
  ended_at: string | null;
  canonical_base_model_id: string | null;
  config: any;
  training_type: string | null;
  job_status: string | null;
  username: string | null;
}

const JOB_STATUS_PRIORITY: Record<string, number> = {
  'Finished': 0,
  'Started': 1,
  'Pending': 2,
};

/**
 * Select one result from a pool of results based on the eval selection mode.
 * Priority: Finished > Started > Pending. Among Finished results:
 * - oldest: prefer accuracy > 1% → then earliest timestamp
 * - latest: prefer accuracy > 1% → then latest timestamp
 * - highest: highest accuracy (no threshold)
 * Among non-Finished results (no accuracy): prefer Started over Pending, then latest timestamp.
 */
function selectResult(pool: RawLeaderboardRow[], mode: EvalSelectionMode): RawLeaderboardRow | null {
  if (pool.length === 0) return null;

  // Separate Finished (have accuracy) from Pending/Started
  const finished = pool.filter(r => r.accuracy !== null);
  const nonFinished = pool.filter(r => r.accuracy === null);

  // If we have any Finished results, use existing selection logic among those
  if (finished.length > 0) {
    if (mode === 'highest') {
      let best = finished[0];
      for (const row of finished) {
        if ((row.accuracy ?? 0) > (best.accuracy ?? 0)) {
          best = row;
        }
      }
      return best;
    }

    // For oldest/latest: prefer results with accuracy > 1%, then sort by timestamp
    const aboveThreshold = finished.filter(r => (r.accuracy ?? 0) > 1.0);
    const candidates = aboveThreshold.length > 0 ? aboveThreshold : finished;

    const sorted = [...candidates].sort((a, b) => {
      const tsA = a.ended_at ? new Date(a.ended_at).getTime() : 0;
      const tsB = b.ended_at ? new Date(b.ended_at).getTime() : 0;
      return mode === 'oldest' ? tsA - tsB : tsB - tsA;
    });

    return sorted[0];
  }

  // No Finished results — pick best non-Finished: Started > Pending, then latest timestamp
  const sorted = [...nonFinished].sort((a, b) => {
    const aPri = JOB_STATUS_PRIORITY[a.job_status ?? 'Pending'] ?? 3;
    const bPri = JOB_STATUS_PRIORITY[b.job_status ?? 'Pending'] ?? 3;
    if (aPri !== bPri) return aPri - bPri;
    const tsA = a.ended_at ? new Date(a.ended_at).getTime() : 0;
    const tsB = b.ended_at ? new Date(b.ended_at).getTime() : 0;
    return tsB - tsA; // latest first
  });

  return sorted[0];
}

function formatTimestampField(ts: string | null): string | undefined {
  if (!ts) return undefined;
  const d = new Date(ts);
  return d.toISOString().split('T')[0] + ' ' + d.toTimeString().split(' ')[0];
}

export interface IStorage {
  getAllBenchmarkResults(): Promise<BenchmarkResultExtended[]>;
  getAllBenchmarkResultsWithImprovement(mode?: EvalSelectionMode, hideNoTraceLink?: boolean): Promise<BenchmarkResultWithImprovement[]>;
  getAllModels(): Promise<ModelInfo[]>;
  getBenchmarkResult(id: string): Promise<BenchmarkResult | undefined>;
  createBenchmarkResult(result: InsertBenchmarkResult): Promise<BenchmarkResult>;
  deleteBenchmarkResult(id: string): Promise<void>;
}

export class DbStorage implements IStorage {
  /**
   * Fetch all raw rows from the leaderboard_results view (no deduplication).
   */
  private async fetchAllRawRows(): Promise<RawLeaderboardRow[]> {
    const { data, error } = await supabase
      .from('leaderboard_results')
      .select('*');

    if (error) {
      console.error('Error fetching leaderboard results:', error);
      throw error;
    }

    return (data ?? []) as RawLeaderboardRow[];
  }

  /**
   * Build an index grouping raw rows by (agentId, modelId, canonicalBenchmark).
   */
  private buildGroupIndex(rows: RawLeaderboardRow[]): Map<string, RawLeaderboardRow[]> {
    const index = new Map<string, RawLeaderboardRow[]>();
    for (const row of rows) {
      const key = `${row.agent_id}|||${row.model_id}|||${row.benchmark_name}`;
      const pool = index.get(key);
      if (pool) {
        pool.push(row);
      } else {
        index.set(key, [row]);
      }
    }
    return index;
  }

  async getAllBenchmarkResults(): Promise<BenchmarkResultExtended[]> {
    const allRows = await this.fetchAllRawRows();
    const index = this.buildGroupIndex(allRows);

    const results: BenchmarkResultExtended[] = [];
    for (const pool of Array.from(index.values())) {
      const selected = selectResult(pool, 'oldest');
      if (!selected) continue;

      results.push({
        id: selected.id,
        modelName: selected.model_name,
        agentName: selected.agent_name,
        benchmarkName: selected.benchmark_name,
        accuracy: selected.accuracy ?? 0,
        standardError: selected.standard_error ?? 0,
        hfTracesLink: selected.hf_traces_link ?? undefined,
        endedAt: formatTimestampField(selected.ended_at),
      });
    }

    return results;
  }

  async getAllBenchmarkResultsWithImprovement(mode: EvalSelectionMode = 'oldest', hideNoTraceLink: boolean = false): Promise<BenchmarkResultWithImprovement[]> {
    let allRows = await this.fetchAllRawRows();

    // Filter out rows without trace links before pool building
    if (hideNoTraceLink) {
      allRows = allRows.filter(row => row.hf_traces_link != null && row.hf_traces_link !== '');
    }

    const index = this.buildGroupIndex(allRows);

    const results: BenchmarkResultWithImprovement[] = [];

    for (const pool of Array.from(index.values())) {
      const selected = selectResult(pool, mode);
      if (!selected) continue;

      // Compute the 4 base model accuracy values by looking up base model pools

      // 1. base_model_accuracy: original base model on same canonical benchmark
      const baseModelAccuracy = this.lookupBaseModelAccuracy(
        index, selected.agent_id, selected.base_model_id, selected.benchmark_name, mode
      );

      // 2. canonical_benchmark_base_model_accuracy: same as base_model_accuracy
      //    (with merged approach, canonical benchmark is already the key)
      const canonicalBenchmarkBaseModelAccuracy = baseModelAccuracy;

      // 3. canonical_base_model_accuracy: canonical base model on same benchmark
      const canonicalBaseModelAccuracy = this.lookupBaseModelAccuracy(
        index, selected.agent_id, selected.canonical_base_model_id, selected.benchmark_name, mode
      );

      // 4. canonical_both_base_model_accuracy: canonical base model on canonical benchmark
      //    (same as #3 since benchmark_name is already canonical)
      const canonicalBothBaseModelAccuracy = canonicalBaseModelAccuracy;

      // Extract config fields
      const config = selected.config;
      const timeoutMultiplier = config?.timeout_multiplier ?? undefined;
      const daytonaOverrideCpus = config?.environment?.override_cpus ?? undefined;
      const daytonaOverrideMemoryMb = config?.environment?.override_memory_mb ?? undefined;
      const daytonaOverrideStorageMb = config?.environment?.override_storage_mb ?? undefined;

      results.push({
        id: selected.id,
        modelName: selected.model_name,
        agentName: selected.agent_name,
        benchmarkName: selected.benchmark_name,
        accuracy: selected.accuracy ?? 0,
        standardError: selected.standard_error ?? 0,
        hfTracesLink: selected.hf_traces_link ?? undefined,
        endedAt: formatTimestampField(selected.ended_at),
        modelId: selected.model_id,
        baseModelId: selected.base_model_id,
        baseModelName: selected.base_model_name,
        baseModelAccuracy,
        canonicalBenchmarkBaseModelAccuracy,
        canonicalBaseModelAccuracy,
        canonicalBothBaseModelAccuracy,
        agentId: selected.agent_id,
        benchmarkId: selected.benchmark_id,
        modelDuplicateOf: selected.model_duplicate_of ?? null,
        canonicalModelName: selected.canonical_model_name ?? selected.model_name,
        baseModelDuplicateOf: selected.base_model_duplicate_of ?? null,
        canonicalBaseModelName: selected.canonical_base_model_name ?? selected.base_model_name,
        benchmarkDuplicateOf: selected.benchmark_duplicate_of ?? null,
        canonicalBenchmarkName: selected.canonical_benchmark_name ?? selected.benchmark_name,
        sourceBenchmarkName: selected.source_benchmark_name ?? selected.benchmark_name,
        sourceBenchmarkId: selected.source_benchmark_id ?? selected.benchmark_id,
        timeoutMultiplier,
        daytonaOverrideCpus,
        daytonaOverrideMemoryMb,
        daytonaOverrideStorageMb,
        trainingType: selected.training_type ?? undefined,
        jobStatus: selected.job_status ?? null,
        username: selected.username ?? null,
      });
    }

    return results;
  }

  /**
   * Look up base model accuracy by finding the base model's results for the same
   * agent + canonical benchmark, then applying the same selection mode.
   */
  private lookupBaseModelAccuracy(
    index: Map<string, RawLeaderboardRow[]>,
    agentId: string,
    baseModelId: string | null,
    benchmarkName: string,
    mode: EvalSelectionMode
  ): number | undefined {
    if (!baseModelId) return undefined;

    const key = `${agentId}|||${baseModelId}|||${benchmarkName}`;
    const pool = index.get(key);
    if (!pool || pool.length === 0) return undefined;

    const selected = selectResult(pool, mode);
    if (!selected) return undefined;

    return selected.accuracy ?? undefined;
  }

  async getAllModels(): Promise<ModelInfo[]> {
    // Two separate queries — PostgREST can't resolve models→agents FK
    // due to unnamed constraint + multiple self-referencing FKs on models table
    const { data: modelsData, error: modelsError } = await supabase
      .from('models')
      .select('id, name, agent_id, base_model_id, duplicate_of, creation_time, training_type');

    if (modelsError) {
      console.error('Error fetching models:', modelsError);
      throw modelsError;
    }

    if (!modelsData) {
      return [];
    }

    const { data: agentsData, error: agentsError } = await supabase
      .from('agents')
      .select('id, name');

    if (agentsError) {
      console.error('Error fetching agents:', agentsError);
      throw agentsError;
    }

    // Build agent lookup map: agent_id -> agent_name
    const agentMap = new Map<string, string>();
    for (const agent of (agentsData || [])) {
      agentMap.set(agent.id, agent.name);
    }

    // Build model lookup map for resolving self-references (base_model_id, duplicate_of)
    const modelMap = new Map<string, any>();
    for (const row of modelsData) {
      modelMap.set(row.id, row);
    }

    return modelsData
      .filter(row => agentMap.has(row.agent_id))
      .map(row => {
        const agentName = agentMap.get(row.agent_id)!;

        // Resolve base model name from base_model_id
        const baseModel = row.base_model_id ? modelMap.get(row.base_model_id) : null;
        const baseModelName = baseModel ? baseModel.name : 'None';

        // Resolve canonical model name from duplicate_of
        const canonicalModel = row.duplicate_of ? modelMap.get(row.duplicate_of) : null;
        const canonicalModelName = canonicalModel ? canonicalModel.name : row.name;

        // Resolve base model's duplicate_of
        const baseModelDuplicateOf = baseModel ? (baseModel.duplicate_of ?? null) : null;
        const canonicalBaseModel = baseModelDuplicateOf ? modelMap.get(baseModelDuplicateOf) : null;
        const canonicalBaseModelName = canonicalBaseModel ? canonicalBaseModel.name : baseModelName;

        return {
          modelId: row.id,
          modelName: row.name,
          agentId: row.agent_id,
          agentName,
          baseModelId: row.base_model_id ?? null,
          baseModelName,
          modelDuplicateOf: row.duplicate_of ?? null,
          canonicalModelName,
          baseModelDuplicateOf,
          canonicalBaseModelName,
          creationTime: row.creation_time ?? null,
          trainingType: row.training_type ?? null,
        };
      });
  }

  async getBenchmarkResult(id: string): Promise<BenchmarkResult | undefined> {
    // Legacy method - not used by leaderboard
    throw new Error('getBenchmarkResult is not implemented for Supabase view-based leaderboard');
  }

  async createBenchmarkResult(result: InsertBenchmarkResult): Promise<BenchmarkResult> {
    // Legacy method - not used by leaderboard
    throw new Error('createBenchmarkResult is not implemented for Supabase view-based leaderboard');
  }

  async deleteBenchmarkResult(id: string): Promise<void> {
    // Legacy method - not used by leaderboard
    throw new Error('deleteBenchmarkResult is not implemented for Supabase view-based leaderboard');
  }
}

export const storage = new DbStorage();

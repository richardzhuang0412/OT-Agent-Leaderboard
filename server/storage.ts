import { type BenchmarkResult, type InsertBenchmarkResult } from "@shared/schema";
import { supabase } from "@db";
import { benchmarkResults } from "@shared/schema";
import { eq } from "drizzle-orm";

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
}

export interface IStorage {
  getAllBenchmarkResults(): Promise<BenchmarkResultExtended[]>;
  getAllBenchmarkResultsWithImprovement(): Promise<BenchmarkResultWithImprovement[]>;
  getAllModels(): Promise<ModelInfo[]>;
  getBenchmarkResult(id: string): Promise<BenchmarkResult | undefined>;
  createBenchmarkResult(result: InsertBenchmarkResult): Promise<BenchmarkResult>;
  deleteBenchmarkResult(id: string): Promise<void>;
}

export class DbStorage implements IStorage {
  async getAllBenchmarkResults(): Promise<BenchmarkResultExtended[]> {
    // Query the leaderboard_results view
    // This view aggregates data from sandbox_jobs, parsing metrics
    // and deduplicating by (agent, model, benchmark) keeping the earliest valid job
    const { data, error } = await supabase
      .from('leaderboard_results')
      .select('*');

    if (error) {
      console.error('Error fetching leaderboard results:', error);
      throw error;
    }

    if (!data) {
      return [];
    }

    return data.map(row => ({
      id: row.id,
      modelName: row.model_name,
      agentName: row.agent_name,
      benchmarkName: row.benchmark_name,
      accuracy: row.accuracy ?? 0,
      standardError: row.standard_error ?? 0,
      hfTracesLink: row.hf_traces_link,
      endedAt: row.ended_at ? new Date(row.ended_at).toISOString().split('T')[0] + ' ' + new Date(row.ended_at).toTimeString().split(' ')[0] : undefined,
    }));
  }

  async getAllBenchmarkResultsWithImprovement(): Promise<BenchmarkResultWithImprovement[]> {
    // Query the leaderboard_results view with improvement data
    // Includes base model information for calculating improvements
    const { data, error } = await supabase
      .from('leaderboard_results')
      .select('*');

    if (error) {
      console.error('Error fetching leaderboard results with improvement:', error);
      throw error;
    }

    if (!data) {
      return [];
    }

    return data.map(row => ({
      id: row.id,
      modelName: row.model_name,
      agentName: row.agent_name,
      benchmarkName: row.benchmark_name,
      accuracy: row.accuracy ?? 0,
      standardError: row.standard_error ?? 0,
      hfTracesLink: row.hf_traces_link,
      endedAt: row.ended_at ? new Date(row.ended_at).toISOString().split('T')[0] + ' ' + new Date(row.ended_at).toTimeString().split(' ')[0] : undefined,
      modelId: row.model_id,
      baseModelId: row.base_model_id,
      baseModelName: row.base_model_name,
      baseModelAccuracy: row.base_model_accuracy ?? undefined,
      // Additional accuracy values for duplicate-aware improvement calculation
      canonicalBenchmarkBaseModelAccuracy: row.canonical_benchmark_base_model_accuracy ?? undefined,
      canonicalBaseModelAccuracy: row.canonical_base_model_accuracy ?? undefined,
      canonicalBothBaseModelAccuracy: row.canonical_both_base_model_accuracy ?? undefined,
      agentId: row.agent_id,
      benchmarkId: row.benchmark_id,
      // Duplicate tracking fields
      modelDuplicateOf: row.model_duplicate_of ?? null,
      canonicalModelName: row.canonical_model_name ?? row.model_name,
      baseModelDuplicateOf: row.base_model_duplicate_of ?? null,
      canonicalBaseModelName: row.canonical_base_model_name ?? row.base_model_name,
      benchmarkDuplicateOf: row.benchmark_duplicate_of ?? null,
      canonicalBenchmarkName: row.canonical_benchmark_name ?? row.benchmark_name,
      // Source benchmark (tracks which actual benchmark the result came from after merging duplicates)
      sourceBenchmarkName: row.source_benchmark_name ?? row.benchmark_name,
      sourceBenchmarkId: row.source_benchmark_id ?? row.benchmark_id,
    }));
  }

  async getAllModels(): Promise<ModelInfo[]> {
    // Two separate queries — PostgREST can't resolve models→agents FK
    // due to unnamed constraint + multiple self-referencing FKs on models table
    const { data: modelsData, error: modelsError } = await supabase
      .from('models')
      .select('id, name, agent_id, base_model_id, duplicate_of, creation_time');

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
        };
      });
  }

  async getBenchmarkResult(id: string): Promise<BenchmarkResult | undefined> {
    // Legacy method - not used by leaderboard
    // Would need to query benchmark_results table if needed
    throw new Error('getBenchmarkResult is not implemented for Supabase view-based leaderboard');
  }

  async createBenchmarkResult(result: InsertBenchmarkResult): Promise<BenchmarkResult> {
    // Legacy method - not used by leaderboard
    // Leaderboard data comes from sandbox_jobs view, not direct inserts
    throw new Error('createBenchmarkResult is not implemented for Supabase view-based leaderboard');
  }

  async deleteBenchmarkResult(id: string): Promise<void> {
    // Legacy method - not used by leaderboard
    // Leaderboard data comes from sandbox_jobs view, not direct deletes
    throw new Error('deleteBenchmarkResult is not implemented for Supabase view-based leaderboard');
  }
}

export const storage = new DbStorage();

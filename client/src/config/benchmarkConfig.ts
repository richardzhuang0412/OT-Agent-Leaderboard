/**
 * Benchmark configuration for the leaderboard
 */

/**
 * Core benchmarks — the primary tracked set.
 */
export const CORE_BENCHMARKS = [
  'dev_set_v2',
  'swebench-verified-random-100-folders',
  'terminal_bench_2',
];

/**
 * Out-of-distribution benchmarks — used to probe generalization.
 * Order here defines the OOD section column order in the table.
 */
export const OOD_BENCHMARKS = [
  'aider_polyglot',
  'bfcl-parity',
  'medagentbench',
  'swebench-verified',
  'gaia_127',
  'financeagent_terminal',
];

export type BenchmarkCategory = 'core' | 'ood' | 'other';

export function classifyBenchmark(name: string): BenchmarkCategory {
  if (CORE_BENCHMARKS.includes(name)) return 'core';
  if (OOD_BENCHMARKS.includes(name)) return 'ood';
  return 'other';
}

/**
 * Compare two benchmark names for column ordering:
 * Core (in CORE_BENCHMARKS order) → OOD (in OOD_BENCHMARKS order) → Other (alphabetical).
 */
export function compareBenchmarks(a: string, b: string): number {
  const categoryRank = { core: 0, ood: 1, other: 2 } as const;
  const ca = categoryRank[classifyBenchmark(a)];
  const cb = categoryRank[classifyBenchmark(b)];
  if (ca !== cb) return ca - cb;
  if (ca === 0) return CORE_BENCHMARKS.indexOf(a) - CORE_BENCHMARKS.indexOf(b);
  if (ca === 1) return OOD_BENCHMARKS.indexOf(a) - OOD_BENCHMARKS.indexOf(b);
  return a.localeCompare(b);
}

/**
 * List of benchmarks to show by default in the leaderboard.
 * All other benchmarks are available in the filter but not selected by default.
 */
export const DEFAULT_VISIBLE_BENCHMARKS = CORE_BENCHMARKS;

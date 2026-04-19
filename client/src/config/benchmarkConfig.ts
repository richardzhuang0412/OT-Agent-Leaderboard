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
 */
export const OOD_BENCHMARKS = [
  'aider_polyglot',
  'bfcl-parity',
  'medagentbench',
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
 * List of benchmarks to show by default in the leaderboard.
 * All other benchmarks are available in the filter but not selected by default.
 */
export const DEFAULT_VISIBLE_BENCHMARKS = CORE_BENCHMARKS;

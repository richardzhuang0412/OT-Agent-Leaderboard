-- Create leaderboard_results view for the leaderboard application
-- Run this in Supabase SQL Editor: Project → SQL Editor → New Query

-- This view aggregates evaluation results from sandbox_jobs
-- It deduplicates by (agent, model, CANONICAL benchmark) keeping the best valid job
-- Parses accuracy and accuracy_stderr from the metrics JSONB array
-- Includes base model information for improvement calculations

-- MERGE-THEN-THRESHOLD LOGIC:
-- For each (model, agent, canonical_benchmark) combination:
-- 1. Merge all results from the canonical benchmark AND its duplicates into one pool
-- 2. From that merged pool, select the first evaluation with accuracy > 1.0%
-- 3. If no evaluation meets the threshold, fall back to the earliest evaluation
-- This ensures glitchy 0% runs are deprioritized while considering all equivalent benchmarks

-- ACCURACY_THRESHOLD: Jobs with accuracy <= 1.0% are considered "glitchy"
-- and deprioritized. To change threshold: update "> 1.0" occurrences below

-- Drop existing view to recreate with new columns
DROP VIEW IF EXISTS leaderboard_results CASCADE;

CREATE VIEW leaderboard_results AS
WITH job_metrics AS (
  -- Pre-compute accuracy for threshold-based ordering
  SELECT
    sj.*,
    COALESCE(sj.ended_at, sj.created_at) as job_timestamp,
    (SELECT (elem->>'value')::float * 100
     FROM jsonb_array_elements(sj.metrics) elem
     WHERE elem->>'name' = 'accuracy' LIMIT 1) as computed_accuracy,
    (SELECT (elem->>'value')::float * 100
     FROM jsonb_array_elements(sj.metrics) elem
     WHERE elem->>'name' = 'accuracy_stderr' LIMIT 1) as computed_accuracy_stderr
  FROM sandbox_jobs sj
  WHERE sj.metrics IS NOT NULL
)
-- Group by CANONICAL benchmark name (merges duplicates before threshold selection)
SELECT DISTINCT ON (a.name, m.name, COALESCE(b_canonical.name, b.name))
  gen_random_uuid()::text as id,
  m.id as model_id,
  m.name as model_name,
  m.duplicate_of as model_duplicate_of,
  COALESCE(m_canonical.name, m.name) as canonical_model_name,
  m.base_model_id,
  COALESCE(bm.name, 'None') as base_model_name,
  bm.duplicate_of as base_model_duplicate_of,
  COALESCE(bm_canonical.name, COALESCE(bm.name, 'None')) as canonical_base_model_name,
  a.name as agent_name,
  a.id as agent_id,
  -- Return CANONICAL benchmark name as primary identifier
  COALESCE(b_canonical.name, b.name) as benchmark_name,
  COALESCE(b.duplicate_of, b.id) as benchmark_id,
  -- Always NULL since we return canonical benchmarks (kept for API compatibility)
  NULL::uuid as benchmark_duplicate_of,
  COALESCE(b_canonical.name, b.name) as canonical_benchmark_name,
  -- Track which actual benchmark this result came from
  b.name as source_benchmark_name,
  b.id as source_benchmark_id,
  jm.computed_accuracy as accuracy,
  jm.computed_accuracy_stderr as standard_error,
  jm.hf_traces_link as hf_traces_link,
  jm.job_timestamp as ended_at,
  -- Get base model accuracy: merges across canonical benchmark + all duplicates
  -- Uses threshold-aware ordering: prefer accuracy > 1.0%, fall back to earliest
  (
    SELECT (elem->>'value')::float * 100
    FROM sandbox_jobs bsj
    INNER JOIN benchmarks bb ON bsj.benchmark_id = bb.id
    INNER JOIN jsonb_array_elements(bsj.metrics) elem ON TRUE
    WHERE bsj.agent_id = jm.agent_id
      AND bsj.model_id = m.base_model_id
      AND COALESCE(bb.duplicate_of, bb.id) = COALESCE(b.duplicate_of, b.id)  -- Same canonical benchmark
      AND elem->>'name' = 'accuracy'
      AND bsj.metrics IS NOT NULL
    ORDER BY
      CASE WHEN (elem->>'value')::float * 100 > 1.0 THEN 0 ELSE 1 END,
      COALESCE(bsj.ended_at, bsj.created_at) ASC
    LIMIT 1
  ) as base_model_accuracy,
  -- With merged approach, this is same as base_model_accuracy (kept for API compatibility)
  (
    SELECT (elem->>'value')::float * 100
    FROM sandbox_jobs bsj
    INNER JOIN benchmarks bb ON bsj.benchmark_id = bb.id
    INNER JOIN jsonb_array_elements(bsj.metrics) elem ON TRUE
    WHERE bsj.agent_id = jm.agent_id
      AND bsj.model_id = m.base_model_id
      AND COALESCE(bb.duplicate_of, bb.id) = COALESCE(b.duplicate_of, b.id)
      AND elem->>'name' = 'accuracy'
      AND bsj.metrics IS NOT NULL
    ORDER BY
      CASE WHEN (elem->>'value')::float * 100 > 1.0 THEN 0 ELSE 1 END,
      COALESCE(bsj.ended_at, bsj.created_at) ASC
    LIMIT 1
  ) as canonical_benchmark_base_model_accuracy,
  -- CANONICAL base model's accuracy (for duplicate base model handling)
  -- Also merges across benchmark duplicates
  (
    SELECT (elem->>'value')::float * 100
    FROM sandbox_jobs bsj
    INNER JOIN benchmarks bb ON bsj.benchmark_id = bb.id
    INNER JOIN jsonb_array_elements(bsj.metrics) elem ON TRUE
    WHERE bsj.agent_id = jm.agent_id
      AND bsj.model_id = COALESCE(bm.duplicate_of, m.base_model_id)
      AND COALESCE(bb.duplicate_of, bb.id) = COALESCE(b.duplicate_of, b.id)
      AND elem->>'name' = 'accuracy'
      AND bsj.metrics IS NOT NULL
    ORDER BY
      CASE WHEN (elem->>'value')::float * 100 > 1.0 THEN 0 ELSE 1 END,
      COALESCE(bsj.ended_at, bsj.created_at) ASC
    LIMIT 1
  ) as canonical_base_model_accuracy,
  -- CANONICAL base model on CANONICAL benchmark (same as above with merged approach)
  (
    SELECT (elem->>'value')::float * 100
    FROM sandbox_jobs bsj
    INNER JOIN benchmarks bb ON bsj.benchmark_id = bb.id
    INNER JOIN jsonb_array_elements(bsj.metrics) elem ON TRUE
    WHERE bsj.agent_id = jm.agent_id
      AND bsj.model_id = COALESCE(bm.duplicate_of, m.base_model_id)
      AND COALESCE(bb.duplicate_of, bb.id) = COALESCE(b.duplicate_of, b.id)
      AND elem->>'name' = 'accuracy'
      AND bsj.metrics IS NOT NULL
    ORDER BY
      CASE WHEN (elem->>'value')::float * 100 > 1.0 THEN 0 ELSE 1 END,
      COALESCE(bsj.ended_at, bsj.created_at) ASC
    LIMIT 1
  ) as canonical_both_base_model_accuracy
FROM job_metrics jm
INNER JOIN agents a ON jm.agent_id = a.id
INNER JOIN models m ON jm.model_id = m.id
INNER JOIN benchmarks b ON jm.benchmark_id = b.id
LEFT JOIN models bm ON m.base_model_id = bm.id
LEFT JOIN models m_canonical ON m.duplicate_of = m_canonical.id
LEFT JOIN models bm_canonical ON bm.duplicate_of = bm_canonical.id
LEFT JOIN benchmarks b_canonical ON b.duplicate_of = b_canonical.id
-- Order by CANONICAL benchmark name, then apply threshold logic within merged pool
ORDER BY a.name, m.name, COALESCE(b_canonical.name, b.name),
         CASE WHEN jm.computed_accuracy > 1.0 THEN 0 ELSE 1 END,
         jm.job_timestamp ASC;

-- Grant read access to the view
-- Adjust the role name based on your Supabase setup
GRANT SELECT ON leaderboard_results TO anon, authenticated;

-- Verify the view was created successfully
SELECT COUNT(*) as total_entries FROM leaderboard_results;

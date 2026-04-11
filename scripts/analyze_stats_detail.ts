import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

config({ path: new URL("../.env", import.meta.url).pathname });

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

async function main() {
  // 1. Find benchmark IDs matching "dev_set"
  const { data: benchmarks, error: bErr } = await supabase
    .from("benchmarks")
    .select("id, name")
    .ilike("name", "%dev_set%");

  if (bErr) { console.error("Error:", bErr); return; }

  // Focus on "dev_set_v2" and "dev_set_71_tasks" (canonical ones)
  const mainBenchmarks = (benchmarks ?? []).filter(b =>
    b.name === "dev_set_v2" || b.name === "dev_set_71_tasks" || b.name === "DCAgent_dev_set_v2"
  );
  console.log("=== Target benchmarks ===");
  for (const b of mainBenchmarks) console.log(`  ${b.id} -> ${b.name}`);
  console.log();

  const benchmarkIds = mainBenchmarks.map(b => b.id);

  // 2. Query sandbox_jobs - get all with stats
  const { data: jobs, error: jErr } = await supabase
    .from("sandbox_jobs")
    .select("id, job_status, n_trials, stats, metrics, created_at, ended_at, benchmark_id, model_id, agent_id")
    .in("benchmark_id", benchmarkIds)
    .order("created_at", { ascending: false })
    .limit(30);

  if (jErr) { console.error("Error:", jErr); return; }
  if (!jobs?.length) { console.log("No jobs found"); return; }

  // Get names
  const modelIds = [...new Set(jobs.map(j => j.model_id))];
  const agentIds = [...new Set(jobs.map(j => j.agent_id))];
  const [{ data: models }, { data: agents }] = await Promise.all([
    supabase.from("models").select("id, name").in("id", modelIds),
    supabase.from("agents").select("id, name").in("id", agentIds),
  ]);
  const modelMap = new Map((models ?? []).map(m => [m.id, m.name]));
  const agentMap = new Map((agents ?? []).map(a => [a.id, a.name]));
  const benchmarkMap = new Map(mainBenchmarks.map(b => [b.id, b.name]));

  // Summary table
  console.log("=== SUMMARY TABLE ===");
  console.log("JobID    | Status   | n_trials | stats.n_trials | eval.n_trials | reward_ct | exception_ct | n_errors | incomplete? | Model");
  console.log("-".repeat(160));

  for (const job of jobs) {
    const jobIdShort = job.id.substring(0, 8);
    const modelName = (modelMap.get(job.model_id) ?? "unknown").substring(0, 50);
    const stats = job.stats as any;

    if (!stats) {
      console.log(`${jobIdShort} | ${(job.job_status ?? "?").padEnd(8)} | ${String(job.n_trials).padEnd(8)} | NULL     | -     | -     | -     | -     | ${job.job_status !== "Finished" ? "YES(no stats)" : "???"} | ${modelName}`);
      continue;
    }

    const evals = stats.evals;
    if (!evals || typeof evals !== "object") {
      console.log(`${jobIdShort} | ${(job.job_status ?? "?").padEnd(8)} | ${String(job.n_trials).padEnd(8)} | ${stats.n_trials ?? "?"} | no evals | - | - | - | ??? | ${modelName}`);
      continue;
    }

    // There's typically 1 eval entry
    for (const [evalName, evalData] of Object.entries(evals)) {
      const e = evalData as any;

      let rewardCount = 0;
      if (e.reward_stats?.reward) {
        for (const trials of Object.values(e.reward_stats.reward)) {
          rewardCount += Array.isArray(trials) ? (trials as any[]).length : 0;
        }
      }

      let exceptionCount = 0;
      if (e.exception_stats) {
        for (const trials of Object.values(e.exception_stats)) {
          exceptionCount += Array.isArray(trials) ? (trials as any[]).length : 0;
        }
      }

      // Key insight: are reward and exception lists overlapping?
      // reward_stats lists trial IDs that got rewards (including 0.0 for failures)
      // exception_stats lists trial IDs that hit exceptions
      // A trial with an exception ALSO gets a 0.0 reward
      // So: n_trials should == reward_count, and n_errors should == exception_count
      // And reward_count includes exception trials (they overlap)

      const evalNTrials = e.n_trials ?? "?";
      const isIncomplete = (stats.n_trials !== job.n_trials) || (evalNTrials !== stats.n_trials);
      const incompleteReason = [];
      if (evalNTrials < job.n_trials) incompleteReason.push(`eval(${evalNTrials})<job(${job.n_trials})`);
      if (stats.n_trials < job.n_trials) incompleteReason.push(`stats(${stats.n_trials})<job(${job.n_trials})`);
      // Check if reward count matches eval n_trials (to validate overlap theory)
      if (rewardCount !== evalNTrials) incompleteReason.push(`reward(${rewardCount})!=eval_n_trials(${evalNTrials})`);

      console.log(`${jobIdShort} | ${(job.job_status ?? "?").padEnd(8)} | ${String(job.n_trials).padEnd(8)} | ${String(stats.n_trials).padEnd(14)} | ${String(evalNTrials).padEnd(13)} | ${String(rewardCount).padEnd(9)} | ${String(exceptionCount).padEnd(12)} | ${String(e.n_errors).padEnd(8)} | ${incompleteReason.length ? incompleteReason.join("; ") : "COMPLETE"} | ${modelName}`);
    }
  }

  // Deep analysis: verify overlap hypothesis
  console.log("\n=== OVERLAP ANALYSIS (first 3 Finished jobs with stats) ===");
  const finishedWithStats = jobs.filter(j => j.job_status === "Finished" && j.stats);

  for (const job of finishedWithStats.slice(0, 3)) {
    const stats = job.stats as any;
    const evalEntries = Object.entries(stats.evals);
    if (!evalEntries.length) continue;

    const [evalName, evalData] = evalEntries[0];
    const e = evalData as any;
    const jobIdShort = job.id.substring(0, 8);
    console.log(`\nJob ${jobIdShort}:`);

    // Collect all trial IDs from reward buckets
    const rewardTrialIds = new Set<string>();
    if (e.reward_stats?.reward) {
      for (const trials of Object.values(e.reward_stats.reward)) {
        if (Array.isArray(trials)) {
          for (const t of trials as string[]) rewardTrialIds.add(t);
        }
      }
    }

    // Collect all trial IDs from exception buckets
    const exceptionTrialIds = new Set<string>();
    if (e.exception_stats) {
      for (const trials of Object.values(e.exception_stats)) {
        if (Array.isArray(trials)) {
          for (const t of trials as string[]) exceptionTrialIds.add(t);
        }
      }
    }

    // Find overlap
    const overlap = [...exceptionTrialIds].filter(id => rewardTrialIds.has(id));
    const exceptionOnly = [...exceptionTrialIds].filter(id => !rewardTrialIds.has(id));
    const rewardOnly = [...rewardTrialIds].filter(id => !exceptionTrialIds.has(id));

    console.log(`  Reward trial IDs: ${rewardTrialIds.size}`);
    console.log(`  Exception trial IDs: ${exceptionTrialIds.size}`);
    console.log(`  Overlap (in both): ${overlap.length}`);
    console.log(`  Exception-only (not in reward): ${exceptionOnly.length}`);
    console.log(`  Reward-only (not in exception): ${rewardOnly.length}`);
    console.log(`  Union (unique trials): ${new Set([...rewardTrialIds, ...exceptionTrialIds]).size}`);
    console.log(`  eval.n_trials: ${e.n_trials} | stats.n_trials: ${stats.n_trials} | job.n_trials: ${job.n_trials}`);

    // Check: are all exception trials in the 0.0 reward bucket?
    if (e.reward_stats?.reward?.["0.0"] && Array.isArray(e.reward_stats.reward["0.0"])) {
      const zeroRewardIds = new Set(e.reward_stats.reward["0.0"] as string[]);
      const exceptionsInZero = overlap.filter(id => zeroRewardIds.has(id));
      const exceptionsNotInZero = overlap.filter(id => !zeroRewardIds.has(id));
      console.log(`  Exceptions in 0.0 bucket: ${exceptionsInZero.length}/${overlap.length}`);
      if (exceptionsNotInZero.length > 0) {
        console.log(`  WARNING: ${exceptionsNotInZero.length} exception trials NOT in 0.0 reward bucket`);
      }
    }

    // Check: does the union == n_trials?
    const unionSize = new Set([...rewardTrialIds, ...exceptionTrialIds]).size;
    if (unionSize === job.n_trials) {
      console.log(`  CONCLUSION: union == job.n_trials -> reward and exception OVERLAP, union is the real trial count`);
    } else if (rewardTrialIds.size === e.n_trials) {
      console.log(`  CONCLUSION: reward_count == eval.n_trials -> exceptions overlap with rewards`);
    }
  }

  // Final: check for truly incomplete evals (Started jobs, or Finished with eval.n_trials < n_trials)
  console.log("\n=== INCOMPLETENESS DETECTION SIGNALS ===");
  console.log("For detecting incomplete evals, the reliable signals are:");
  console.log("  1. job_status != 'Finished' AND stats is NULL -> job hasn't started running");
  console.log("  2. job_status == 'Finished' but eval.n_trials < job.n_trials -> some trials missing from stats");
  console.log("  3. stats.n_trials < job.n_trials -> job-level count mismatch");

  const incomplete = jobs.filter(j => {
    if (j.job_status !== "Finished") return true;
    const s = j.stats as any;
    if (!s) return true;
    if (s.n_trials < j.n_trials) return true;
    return false;
  });

  console.log(`\n  Incomplete jobs: ${incomplete.length}/${jobs.length}`);
  for (const j of incomplete) {
    const s = j.stats as any;
    console.log(`    ${j.id.substring(0, 8)} | status=${j.job_status} | n_trials=${j.n_trials} | stats.n_trials=${s?.n_trials ?? "NULL"} | model=${modelMap.get(j.model_id)}`);
  }
}

main().catch(console.error);

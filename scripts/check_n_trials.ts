import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

config({ path: new URL("../.env", import.meta.url).pathname });

const sb = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

async function main() {
  // Check the actual column name - is it n_trials or n_total_trials?
  const { data, error } = await sb
    .from("sandbox_jobs")
    .select("id, n_trials")
    .limit(3);

  console.log("n_trials column:", data, error);

  // Also check stats.n_trials vs job.n_trials for a few jobs
  const { data: jobs } = await sb
    .from("sandbox_jobs")
    .select("id, n_trials, stats")
    .not("stats", "is", null)
    .limit(3);

  for (const j of jobs ?? []) {
    const stats = j.stats as any;
    console.log(`Job ${j.id.substring(0, 8)}: job.n_trials=${j.n_trials}, stats.n_trials=${stats?.n_trials}`);
  }
}

main().catch(console.error);

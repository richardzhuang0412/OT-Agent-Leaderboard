import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  try {
    if (req.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    const payload = await req.json();
    const record = payload.record;

    if (!record) {
      return new Response(JSON.stringify({ error: "No record in payload" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const modelName = record.name || "Unknown Model";
    const modelId = record.id || "N/A";
    const agentId = record.agent_id || "N/A";
    const createdBy = record.created_by || "Unknown";
    const creationTime = record.creation_time || new Date().toISOString();
    const trainingType = record.training_type || "N/A";

    let agentName = `Agent ID: ${agentId}`;
    try {
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      );
      const { data: agent } = await supabase
        .from("agents")
        .select("name")
        .eq("id", agentId)
        .single();
      if (agent?.name) agentName = agent.name;
    } catch {
      /* fall back to agent ID */
    }

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) throw new Error("RESEND_API_KEY not set");

    const LEADERBOARD_URL = "https://ot-agent-leaderboard.replit.app";

    const emailHtml = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #1a1a1a; border-bottom: 2px solid #3b82f6; padding-bottom: 10px;">
          New Model Registered — Fire Eval
        </h2>
        <p>A new model has been added to the database and needs evaluation.</p>
        <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
          <tr><td style="padding: 8px 12px; background: #f3f4f6; font-weight: 600; width: 140px;">Model Name</td><td style="padding: 8px 12px; background: #f9fafb;">${modelName}</td></tr>
          <tr><td style="padding: 8px 12px; background: #f3f4f6; font-weight: 600;">Agent</td><td style="padding: 8px 12px; background: #f9fafb;">${agentName}</td></tr>
          <tr><td style="padding: 8px 12px; background: #f3f4f6; font-weight: 600;">Training Type</td><td style="padding: 8px 12px; background: #f9fafb;">${trainingType}</td></tr>
          <tr><td style="padding: 8px 12px; background: #f3f4f6; font-weight: 600;">Created By</td><td style="padding: 8px 12px; background: #f9fafb;">${createdBy}</td></tr>
          <tr><td style="padding: 8px 12px; background: #f3f4f6; font-weight: 600;">Timestamp</td><td style="padding: 8px 12px; background: #f9fafb;">${creationTime}</td></tr>
          <tr><td style="padding: 8px 12px; background: #f3f4f6; font-weight: 600;">Model ID</td><td style="padding: 8px 12px; background: #f9fafb; font-family: monospace; font-size: 12px;">${modelId}</td></tr>
        </table>
        <a href="${LEADERBOARD_URL}" style="display: inline-block; background: #3b82f6; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600;">
          View Leaderboard
        </a>
        <p style="color: #6b7280; font-size: 12px; margin-top: 30px;">Automated notification from the DC-Agents Leaderboard.</p>
      </div>
    `;

    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "DC-Agents Notifications <onboarding@resend.dev>",
        to: ["richardzhuang0412@berkeley.edu"],
        subject: `[Action Required] New model registered: ${modelName}`,
        html: emailHtml,
      }),
    });

    const resendResult = await resendResponse.json();
    if (!resendResponse.ok) {
      console.error("Resend API error:", resendResult);
      return new Response(
        JSON.stringify({ error: "Email send failed", details: resendResult }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, emailId: resendResult.id }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});

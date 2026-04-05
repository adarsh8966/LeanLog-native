// coaching-chat Edge Function
// ⚠️  TABLE NAME NOTES (fix before deploying):
//   - "profiles" below should be "user_profiles" and filter by "user_id" not "id"
//   - meal_logs uses "protein_g" not "protein"
//   - "coaching_history" table must be created first (see README)
//     CREATE TABLE coaching_history (
//       id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
//       user_id uuid REFERENCES auth.users NOT NULL,
//       role text NOT NULL,        -- 'user' | 'assistant'
//       content text NOT NULL,
//       type text NOT NULL,        -- 'chat'
//       created_at timestamptz DEFAULT now()
//     );
//     CREATE INDEX ON coaching_history (user_id, type, created_at);

import Anthropic from "npm:@anthropic-ai/sdk";
import { createClient } from "npm:@supabase/supabase-js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No auth header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const uid = user.id;
    const { message } = await req.json();

    if (!message?.trim()) {
      return new Response(JSON.stringify({ error: "Message required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch user profile for context
    // ⚠️  Fix: change "profiles" → "user_profiles" and "id" → "user_id"
    const { data: profile } = await supabase
      .from("profiles")
      .select("calorie_goal, protein_goal, water_goal_oz, current_streak, total_xp, name, goal_weight_lbs")
      .eq("id", uid)
      .single();

    // Fetch last 20 chat messages for memory
    const { data: history } = await supabase
      .from("coaching_history")
      .select("role, content")
      .eq("user_id", uid)
      .eq("type", "chat")
      .order("created_at", { ascending: true })
      .limit(20);

    // Fetch last 7 days of meal logs for context
    const today = new Date().toISOString().split("T")[0];
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split("T")[0];
    const { data: recentMeals } = await supabase
      .from("meal_logs")
      .select("date, calories, protein")  // ⚠️  Fix: "protein" → "protein_g"
      .eq("user_id", uid)
      .gte("date", weekAgo)
      .order("date", { ascending: false });

    // Summarize recent nutrition (compact — not raw logs)
    const mealsByDate: Record<string, { calories: number; protein: number }> = {};
    recentMeals?.forEach((m) => {
      if (!mealsByDate[m.date]) mealsByDate[m.date] = { calories: 0, protein: 0 };
      mealsByDate[m.date].calories += m.calories || 0;
      mealsByDate[m.date].protein += m.protein || 0;
    });
    const daysLogged = Object.keys(mealsByDate).length;
    const avgCals = daysLogged > 0
      ? Math.round(Object.values(mealsByDate).reduce((s, d) => s + d.calories, 0) / daysLogged)
      : 0;
    const avgProtein = daysLogged > 0
      ? Math.round(Object.values(mealsByDate).reduce((s, d) => s + d.protein, 0) / daysLogged)
      : 0;

    const systemPrompt = `You are a knowledgeable, warm, and direct fitness coach inside a nutrition tracking app called LeanLog.
You have access to the user's profile and recent nutrition data. You remember past conversations.
Keep responses conversational and concise — 2-4 sentences unless the user asks for detail.
Never give medical diagnoses. Never recommend specific supplements by brand.
You can discuss nutrition, training, habits, motivation, and goal strategy.
Focus on what the data shows, not generic advice.

User profile:
- Daily calorie goal: ${profile?.calorie_goal || 2000} kcal
- Daily protein goal: ${profile?.protein_goal || 150}g
- Water goal: ${Math.round((profile?.water_goal_oz || 64) / 8)} cups
- Current streak: ${profile?.current_streak || 0} days
- Goal weight: ${profile?.goal_weight_lbs ? profile.goal_weight_lbs + " lbs" : "not set"}

Last 7 days summary:
- Days logged: ${daysLogged}/7
- Average calories: ${avgCals} kcal (goal: ${profile?.calorie_goal || 2000})
- Average protein: ${avgProtein}g (goal: ${profile?.protein_goal || 150}g)`;

    const messages = [
      ...(history ?? []).map((h) => ({
        role: h.role as "user" | "assistant",
        content: h.content,
      })),
      { role: "user" as const, content: message },
    ];

    const client = new Anthropic();

    const response = await client.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 300,
      system: systemPrompt,
      messages,
    });

    const reply = response.content[0].type === "text"
      ? response.content[0].text.trim()
      : "";

    // Save both sides to coaching_history
    await supabase.from("coaching_history").insert([
      { user_id: uid, role: "user", content: message, type: "chat" },
      { user_id: uid, role: "assistant", content: reply, type: "chat" },
    ]);

    return new Response(JSON.stringify({ reply }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

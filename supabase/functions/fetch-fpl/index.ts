type Event = {
  id: number;
  name: string;
  deadline_time: string;
};

type PlayerElement = {
  id: number;
  first_name: string;
  second_name: string;
  team: number;
  element_type: number;
  now_cost: number;
};

type PlayerHistory = {
  round: number;
  minutes: number;
  goals_scored: number;
  assists: number;
  expected_goals: number;
  expected_assists: number;
  total_shots?: number;
  shots_total?: number;
  key_passes?: number;
  total_points: number;
  value: number;
  was_home: boolean;
  opponent_team: number;
};

type PlayerSummary = {
  history: PlayerHistory[];
};

type Bootstrap = {
  events: Event[];
  elements: PlayerElement[];
  teams: {
    id: number;
    name: string;
    short_name: string;
    strength: number;
  }[];
};

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const FPL_BOOTSTRAP = "https://fantasy.premierleague.com/api/bootstrap-static/";
const FPL_PLAYER_SUMMARY = (id: number) =>
  `https://fantasy.premierleague.com/api/element-summary/${id}/`;

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

Deno.serve(async () => {
  const bootstrapRes = await fetch(FPL_BOOTSTRAP);
  if (!bootstrapRes.ok) {
    return new Response("failed to fetch bootstrap", { status: 500 });
  }
  const bootstrap = (await bootstrapRes.json()) as Bootstrap;
  const players = bootstrap.elements;

  const teamRows = bootstrap.teams.map((t) => ({
    id: t.id,
    name: t.name,
    short_name: t.short_name,
    strength: t.strength,
  }));
  await supabase.from("teams").upsert(teamRows);

  const gws = bootstrap.events.map((e) => ({
    id: e.id,
    name: e.name,
    deadline: e.deadline_time,
  }));
  await supabase.from("gameweeks").upsert(gws);

  const playerRows = players.map((p) => ({
    id: p.id,
    first_name: p.first_name,
    second_name: p.second_name,
    team_id: p.team,
    position: p.element_type,
    now_cost: p.now_cost,
  }));
  await supabase.from("players").upsert(playerRows);

  for (const p of players) {
    const summaryRes = await fetch(FPL_PLAYER_SUMMARY(p.id));
    if (!summaryRes.ok) continue;
    const summary = (await summaryRes.json()) as PlayerSummary;

    const gwStats = summary.history.map((h) => ({
      player_id: p.id,
      gw: h.round,
      minutes: h.minutes,
      goals: h.goals_scored,
      assists: h.assists,
      xg: h.expected_goals,
      xa: h.expected_assists,
      shots: h.total_shots ?? h.shots_total ?? 0,
      key_passes: h.key_passes ?? 0,
      total_points: h.total_points,
      price: h.value,
      was_home: h.was_home,
      opponent_team: h.opponent_team,
    }));

    if (gwStats.length) {
      await supabase.from("player_gameweek_stats").upsert(gwStats);
    }
  }

  return new Response("ok");
});


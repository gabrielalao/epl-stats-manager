import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";

type Scope = "week" | "month" | "season";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const scope = (searchParams.get("scope") as Scope) || "season";
  const gw = Number(searchParams.get("gw") || 0);
  const position = Number(searchParams.get("position") || 0);
  const minMinutes = Number(searchParams.get("minMinutes") || 180);

  const supabase = getSupabaseServer();

  let gwFilter: number[] | null = null;
  if (scope === "week" && gw) gwFilter = [gw];
  if (scope === "month" && gw) gwFilter = Array.from({ length: 4 }, (_, i) => gw - i).filter(
    (n) => n > 0
  );

  const { data, error } = await supabase
    .from("player_gameweek_stats_per90")
    .select(
      "player_id, gw, points_per90, xgi_per90, shots_per90, key_passes_per90, goals_per90, assists_per90, minutes"
    )
    .gte("minutes", minMinutes)
    .in("gw", gwFilter ?? (scope === "season" ? undefined : [gw]))
    .order("points_per90", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const playerIds = [...new Set((data ?? []).map((r) => r.player_id))];
  const teamIds = [...new Set((data ?? []).map((r) => r.team_id ?? null).filter(Boolean))];
  const { data: players, error: playersError } = await supabase
    .from("players")
    .select("id, first_name, second_name, position, team_id, now_cost")
    .in("id", playerIds);

  if (playersError) {
    return NextResponse.json({ error: playersError.message }, { status: 500 });
  }

  const { data: teams } = await supabase.from("teams").select("id, name, short_name").in("id", teamIds);

  const filtered = position
    ? players?.filter((p) => p.position === position).map((p) => p.id) ?? []
    : playerIds;

  const rows = (data ?? [])
    .filter((r) => filtered.includes(r.player_id))
    .map((r) => {
      const meta = players?.find((p) => p.id === r.player_id);
      const price = (meta?.now_cost ?? 0) / 10;
      const teamName = teams?.find((t) => t.id === meta?.team_id)?.short_name ?? `Team ${meta?.team_id ?? ""}`;
      return {
        id: r.player_id,
        name: meta ? `${meta.first_name} ${meta.second_name}` : `#${r.player_id}`,
        position: meta?.position,
        team_id: meta?.team_id,
        teamName,
        price,
        gw: r.gw,
        pointsPer90: r.points_per90,
        xgiPer90: r.xgi_per90,
        shotsPer90: r.shots_per90,
        keyPassPer90: r.key_passes_per90,
        goalsPer90: r.goals_per90,
        assistsPer90: r.assists_per90,
        minutes: r.minutes,
        value: price ? +(r.points_per90 / price).toFixed(2) : 0,
      };
    });

  return NextResponse.json({ players: rows });
}


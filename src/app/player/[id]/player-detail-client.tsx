"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export type PlayerDetailClientProps = {
  playerId: number;
  season: string;
};

type PlayerRow = {
  id: number;
  name: string;
  position: number;
  team_id: number;
  teamName: string;
  price: number;
  pointsPer90: number;
  xgiPer90: number;
  shotsPer90: number;
  keyPassPer90: number;
  goalsPer90: number;
  assistsPer90: number;
  minutes: number;
  value: number;
  xgiPerPrice: number;
  formScore: number;
  priceBucket: "budget" | "mid" | "premium";
  valueBand?: "top" | "mid" | "low";
};

export function PlayerDetailClient({ playerId, season }: PlayerDetailClientProps) {
  const [player, setPlayer] = useState<PlayerRow | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let cachedFound: PlayerRow | null = null;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        // Optimistic: try cache first for instant render
        const cached = readCache(season);
        if (cached && !cancelled) {
          cachedFound = cached.map(sanitizePlayer).find((p) => p.id === playerId) || null;
          if (cachedFound) setPlayer(cachedFound);
        }

        let rows: PlayerRow[] = [];
        if (season === "current") {
          type LivePayload = {
            teams: Array<{ id: number; short_name: string }>;
            elements: Array<{
              id: number;
              first_name: string;
              second_name: string;
              element_type: number;
              team: number;
              now_cost: number;
              minutes: number;
              total_points: number;
              expected_goals?: number;
              expected_assists?: number;
              shots?: number;
              key_passes?: number;
              goals_scored: number;
              assists: number;
            }>;
          };
          const res = await fetch("/api/current", { cache: "no-store" });
          if (!res.ok) throw new Error(`Current season fetch failed (${res.status})`);
          const data = (await res.json()) as LivePayload;
          const teamMap = new Map<number, string>(data.teams.map((t) => [t.id, t.short_name]));
          rows = data.elements.map((e) => sanitizePlayer(mapElement(e, teamMap)));
        } else {
          const playersUrl = `https://raw.githubusercontent.com/vaastav/Fantasy-Premier-League/master/data/${season}/players_raw.csv`;
          const teamsUrl = `https://raw.githubusercontent.com/vaastav/Fantasy-Premier-League/master/data/${season}/teams.csv`;
          const [playersRes, teamsRes] = await Promise.all([
            fetch(playersUrl, { cache: "no-store", mode: "cors" }),
            fetch(teamsUrl, { cache: "no-store", mode: "cors" }),
          ]);
          if (!playersRes.ok) throw new Error("Failed to fetch players");
          if (!teamsRes.ok) throw new Error("Failed to fetch teams");
          const playersCsv = await playersRes.text();
          const teamsCsv = await teamsRes.text();
          type TeamRow = { id: string; short_name?: string; name?: string };
          const teamRows = parseCsv(teamsCsv) as TeamRow[];
          const teamMap = new Map<number, string>(
            teamRows.map((t) => [Number(t.id), t.short_name || t.name || `Team ${t.id}`])
          );
          type PlayerCsv = Record<string, string>;
          const playerRows = parseCsv(playersCsv) as PlayerCsv[];
          rows = playerRows.map((row) => sanitizePlayer(mapPlayerRow(row, teamMap)));
        }
        if (cancelled) return;
        const found = rows.find((p) => p.id === playerId) || null;
        if (found) {
          setPlayer(found);
        } else if (!cachedFound) {
          setError("Player not found");
        }
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Error loading player");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [playerId, season]);

  if (loading) {
    return (
      <div className="layout-single">
        <div className="hero-card skeleton" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="layout-single">
        <p className="error">Error: {error}</p>
        <Link href="/" className="pill pill-ghost" style={{ marginTop: 12, display: "inline-block" }}>
          Back
        </Link>
      </div>
    );
  }

  if (!player) {
    return (
      <div className="layout-single">
        <p className="muted-sm">Player not found.</p>
        <Link href="/" className="pill pill-ghost" style={{ marginTop: 12, display: "inline-block" }}>
          Back
        </Link>
      </div>
    );
  }

  const metrics = [
    { label: "Value (pts/£)", value: fmt(player.value) },
    { label: "Points/90", value: fmt(player.pointsPer90) },
    { label: "xGI/90", value: fmt(player.xgiPer90) },
    { label: "xGI/£", value: fmt(player.xgiPerPrice) },
    { label: "Goals/90", value: fmt(player.goalsPer90) },
    { label: "Assists/90", value: fmt(player.assistsPer90) },
    { label: "Shots/90", value: fmt(player.shotsPer90) },
    { label: "KeyPass/90", value: fmt(player.keyPassPer90) },
    { label: "Minutes", value: fmt(player.minutes, 0) },
    { label: "Price", value: `£${fmt(player.price, 1)}` },
  ];

  return (
    <div className="layout-single">
      <header className="hero-card">
        <div className="hero-overlay">
          <div className="hero-top">
            <Link href="/" className="pill pill-ghost">
              ← All Players
            </Link>
            <span className="badge">Season: {season === "current" ? "Current" : season}</span>
          </div>
          <div className="hero-body">
            <div>
              <div className="muted-sm">Position {player.position}</div>
              <h1 className="hero-title">{player.name}</h1>
              <div className="muted-sm">
                {player.teamName} · £{fmt(player.price, 1)} · {player.minutes} mins
              </div>
              <div className="hero-tags">
                <span className={`chip chip-${player.priceBucket}`}>{player.priceBucket}</span>
                {player.valueBand && <span className={`chip chip-${player.valueBand}`}>Value band: {player.valueBand}</span>}
              </div>
            </div>
            <div className="hero-metric">
              <div className="muted-sm">Value (pts/£)</div>
              <div className="hero-metric-value">{fmt(player.value)}</div>
              <div className="muted-sm">Form: {fmt(player.formScore)}</div>
            </div>
          </div>
        </div>
      </header>

      <section className="card-grid detail-grid">
        {metrics.map((m) => (
          <div key={m.label} className="card">
            <div className="muted-sm">{m.label}</div>
            <div className="card-value-lg">{m.value}</div>
          </div>
        ))}
      </section>
    </div>
  );
}

function mapPlayerRow(row: Record<string, string>, teamMap: Map<number, string>): PlayerRow {
  const minutes = Number(row.minutes ?? 0);
  const scale = minutes > 0 ? 90 / minutes : 0;
  const price = Number(row.now_cost ?? 0) / 10;
  const totalPoints = Number(row.total_points ?? 0);
  const xg = Number(row.expected_goals ?? 0);
  const xa = Number(row.expected_assists ?? 0);
  const shots = Number(row.shots ?? 0);
  const keyPass = Number(row.key_passes ?? 0);
  const goals = Number(row.goals_scored ?? 0);
  const assists = Number(row.assists ?? 0);
  const pointsPer90 = round(totalPoints * scale);
  const xgiPer90 = round((xg + xa) * scale);
  const shotsPer90 = round(shots * scale);
  const keyPassPer90 = round(keyPass * scale);
  const goalsPer90 = round(goals * scale);
  const assistsPer90 = round(assists * scale);
  const value = price ? round(pointsPer90 / price) : 0;

  const firstName = row.first_name ?? "";
  const secondName = row.second_name ?? "";
  const teamId = Number(row.team ?? 0);

  return sanitizePlayer({
    id: Number(row.id ?? 0),
    name: `${firstName} ${secondName}`.trim(),
    position: Number(row.element_type ?? 0),
    team_id: teamId,
    teamName: teamMap.get(teamId) ?? `Team ${teamId}`,
    price,
    pointsPer90,
    xgiPer90,
    shotsPer90,
    keyPassPer90,
    goalsPer90,
    assistsPer90,
    minutes,
    value,
    xgiPerPrice: 0,
    formScore: 0,
    priceBucket: "budget",
  });
}

function mapElement(
  e: {
    id: number;
    first_name: string;
    second_name: string;
    element_type: number;
    team: number;
    now_cost: number;
    minutes: number;
    total_points: number;
    expected_goals?: number;
    expected_assists?: number;
    shots?: number;
    key_passes?: number;
    goals_scored: number;
    assists: number;
  },
  teamMap: Map<number, string>
): PlayerRow {
  const minutes = e.minutes ?? 0;
  const scale = minutes > 0 ? 90 / minutes : 0;
  const price = e.now_cost ? e.now_cost / 10 : 0;
  const pointsPer90 = round((e.total_points ?? 0) * scale);
  const xgiPer90 = round(((e.expected_goals ?? 0) + (e.expected_assists ?? 0)) * scale);
  const shotsPer90 = round((e.shots ?? 0) * scale);
  const keyPassPer90 = round((e.key_passes ?? 0) * scale);
  const goalsPer90 = round((e.goals_scored ?? 0) * scale);
  const assistsPer90 = round((e.assists ?? 0) * scale);
  const value = price ? round(pointsPer90 / price) : 0;

  return sanitizePlayer({
    id: e.id,
    name: `${e.first_name} ${e.second_name}`,
    position: e.element_type,
    team_id: e.team,
    teamName: teamMap.get(e.team) ?? `Team ${e.team}`,
    price,
    pointsPer90,
    xgiPer90,
    shotsPer90,
    keyPassPer90,
    goalsPer90,
    assistsPer90,
    minutes,
    value,
    xgiPerPrice: 0,
    formScore: 0,
    priceBucket: "budget",
  });
}

function sanitizePlayer(p: PlayerRow): PlayerRow {
  const price = p.price ?? 0;
  const xgiPerPrice = p.xgiPerPrice ?? (price ? round(p.xgiPer90 / price) : 0);
  const formScore = p.formScore ?? round(0.6 * p.pointsPer90 + 0.4 * p.xgiPer90);
  const priceBucketValue = p.priceBucket ?? priceBucket(price);
  return {
    ...p,
    xgiPerPrice,
    formScore,
    priceBucket: priceBucketValue,
  };
}

// CSV helpers
function readCache(season: string): PlayerRow[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(`players-cache-${season}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { players: PlayerRow[] };
    return parsed.players ?? null;
  } catch {
    return null;
  }
}

function parseCsv(text: string): Record<string, string>[] {
  const lines = text.trim().split(/\r?\n/);
  if (!lines.length) return [];
  const headers = splitCsvLine(lines[0]);
  return lines
    .slice(1)
    .filter(Boolean)
    .map((line) => {
      const cols = splitCsvLine(line);
      const row: Record<string, string> = {};
      headers.forEach((h, i) => {
        row[h] = cols[i] ?? "";
      });
      return row;
    });
}

function splitCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

function priceBucket(price: number): "budget" | "mid" | "premium" {
  if (price <= 5.5) return "budget";
  if (price <= 7.5) return "mid";
  return "premium";
}

function round(n: number) {
  return Math.round(n * 100) / 100;
}

function fmt(n: number | undefined, digits = 2): string {
  if (typeof n !== "number" || !Number.isFinite(n)) return "—";
  return n.toFixed(digits);
}


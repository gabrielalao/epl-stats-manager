"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Scope = "week" | "month" | "season";

type PlayerRow = {
  id: number;
  name: string;
  position: number;
  team_id: number;
  teamName: string;
  price: number;
  gw?: number;
  pointsPer90: number;
  xgiPer90: number;
  shotsPer90: number;
  keyPassPer90: number;
  goalsPer90: number;
  assistsPer90: number;
  minutes: number;
  value: number;
};

const positions = [
  { id: 0, label: "All" },
  { id: 1, label: "GK" },
  { id: 2, label: "DEF" },
  { id: 3, label: "MID" },
  { id: 4, label: "FWD" },
];

const scopes: { id: Scope; label: string }[] = [
  { id: "week", label: "Gameweek" },
  { id: "month", label: "Last 4 GWs" },
  { id: "season", label: "Season" },
];

// Past seasons from the open-source dataset (vaastav/Fantasy-Premier-League) plus live current season
const seasons = ["current", "2023-24", "2022-23", "2021-22", "2020-21", "2019-20"];

const columns = [
  { key: "teamName", label: "Team" },
  { key: "value", label: "Value (pts/£)" },
  { key: "pointsPer90", label: "Pts/90" },
  { key: "xgiPer90", label: "xGI/90" },
  { key: "goalsPer90", label: "G/90" },
  { key: "assistsPer90", label: "A/90" },
  { key: "shotsPer90", label: "Shots/90" },
  { key: "keyPassPer90", label: "KeyPass/90" },
  { key: "minutes", label: "Minutes" },
  { key: "price", label: "Price" },
] as const;

type SortKey = (typeof columns)[number]["key"];

export default function Home() {
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [season, setSeason] = useState<string>(seasons[0]);
  const [scope, setScope] = useState<Scope>("season");
  const [gw, setGw] = useState<number>(0);
  const [position, setPosition] = useState<number>(3);
  const [minMinutes, setMinMinutes] = useState<number>(180);
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({
    key: "value",
    dir: "desc",
  });
  const [search, setSearch] = useState("");
  const mounted = useRef(true);

  const load = useCallback(async () => {
    if (!mounted.current) return;
    setLoading(true);
    setError(null);
    try {
      let mapped: PlayerRow[] = [];

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
        if (!res.ok) {
          const msg = await res.text();
          throw new Error(`Current season fetch failed (${res.status}): ${msg}`);
        }
        const data = (await res.json()) as LivePayload;

        type Team = { id: number; short_name: string };
        type Element = {
          id: number;
          first_name: string;
          second_name: string;
          element_type: number;
          team: number;
          now_cost: number;
          minutes: number;
          total_points: number;
          expected_goals: number;
          expected_assists: number;
          shots?: number;
          key_passes?: number;
          goals_scored: number;
          assists: number;
        };
        const teams = data.teams as Team[];
        const teamMap = new Map<number, string>(teams.map((t) => [t.id, t.short_name]));
        const elements = data.elements as Element[];
        mapped = elements.map((e) => mapElement(e, teamMap));
      } else {
        const playersUrl = `https://raw.githubusercontent.com/vaastav/Fantasy-Premier-League/master/data/${season}/players_raw.csv`;
        const teamsUrl = `https://raw.githubusercontent.com/vaastav/Fantasy-Premier-League/master/data/${season}/teams.csv`;

        const [playersRes, teamsRes] = await Promise.all([
          fetch(playersUrl, { cache: "no-store", mode: "cors" }),
          fetch(teamsUrl, { cache: "no-store", mode: "cors" }),
        ]);
        if (!playersRes.ok) throw new Error(`Failed to fetch players for season ${season}`);
        if (!teamsRes.ok) throw new Error(`Failed to fetch teams for season ${season}`);

        const playersCsv = await playersRes.text();
        const teamsCsv = await teamsRes.text();

        type TeamRow = { id: string; short_name?: string; name?: string };
        const teamRows = parseCsv(teamsCsv) as TeamRow[];
        const teamMap = new Map<number, string>(
          teamRows.map((t) => [Number(t.id), t.short_name || t.name || `Team ${t.id}`])
        );

        type PlayerCsv = Record<string, string>;
        const playerRows = parseCsv(playersCsv) as PlayerCsv[];

        mapped = playerRows.map((row) => mapPlayerRow(row, teamMap));
      }

      if (!mounted.current) return;
      setPlayers(mapped);
      const now = new Date();
      setLastUpdated(now);
      writeCache(season, { updated: now.getTime(), players: mapped });
    } catch (err) {
      if (!mounted.current) return;
      setError(err instanceof Error ? err.message : "Error loading data");
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [season]);

  const forceRefresh = useCallback(() => {
    clearCache(season);
    load();
  }, [load, season]);

  useEffect(() => {
    mounted.current = true;
    const cached = readCache(season);
    if (cached) {
      setPlayers(cached.players);
      setLastUpdated(new Date(cached.updated));
    }
    load(); // load once on mount and when season changes
    return () => {
      mounted.current = false;
    };
  }, [load, season]);

  const derivedPlayers = useMemo(() => {
    let data = [...players];
    if (position) data = data.filter((p) => p.position === position);
    if (minMinutes) data = data.filter((p) => p.minutes >= minMinutes);
    return data;
  }, [players, position, minMinutes]);

  const filtered = useMemo(() => {
    const term = search.toLowerCase();
    const sortValue = (p: PlayerRow, key: SortKey) => {
      switch (key) {
        case "teamName":
          return p.teamName;
        case "value":
          return p.value;
        case "pointsPer90":
          return p.pointsPer90;
        case "xgiPer90":
          return p.xgiPer90;
        case "goalsPer90":
          return p.goalsPer90;
        case "assistsPer90":
          return p.assistsPer90;
        case "shotsPer90":
          return p.shotsPer90;
        case "keyPassPer90":
          return p.keyPassPer90;
        case "minutes":
          return p.minutes;
        case "price":
          return p.price;
      }
    };

    return derivedPlayers
      .filter((p) => !term || p.name.toLowerCase().includes(term))
      .sort((a, b) => {
        const { key, dir } = sort;
        const delta = sortValue(a, key) > sortValue(b, key) ? 1 : -1;
        return dir === "asc" ? delta : -delta;
      });
  }, [derivedPlayers, search, sort]);

  const topByPosition = useMemo(() => {
    const grouped: Record<number, PlayerRow[]> = { 1: [], 2: [], 3: [], 4: [] };
    players.forEach((p) => {
      if (grouped[p.position]) grouped[p.position].push(p);
    });
    const result: Record<number, PlayerRow[]> = {};
    [1, 2, 3, 4].forEach((pos) => {
      result[pos] = (grouped[pos] ?? [])
        .sort((a, b) => b.value - a.value)
        .slice(0, 5);
    });
    return result;
  }, [players]);

  const toggleSort = (key: SortKey) => {
    setSort((s) =>
      s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "desc" }
    );
  };

  return (
    <main className="layout">
      <aside className="sidebar">
        <h2 className="sidebar-title">Positions</h2>
        <div className="sidebar-list">
          {positions
            .filter((p) => p.id !== 0)
            .map((p) => (
              <button
                key={p.id}
                className={`sidebar-item ${position === p.id ? "active" : ""}`}
                onClick={() => setPosition(p.id)}
              >
                {p.label}
              </button>
            ))}
        </div>
      </aside>

      <div className="content space-y-4">
        <header className="space-y-2">
          <h1 className="text-2xl font-semibold">EPL Per-90 Value Dashboard</h1>
          <p className="text-sm text-muted">
            Compare players fairly by normalizing to 90 minutes. Switch scope to GW, last 4 GWs, or full season.
          </p>
          <div className="muted-sm">
            {loading ? "Loading EPL data…" : "Data loaded"}
            {lastUpdated && ` · Updated ${lastUpdated.toLocaleTimeString()}`}
            <button className="pill pill-ghost" onClick={load} style={{ marginLeft: 8 }}>
              Refresh (fetch latest)
            </button>
            <button className="pill pill-ghost" onClick={forceRefresh} style={{ marginLeft: 8 }}>
              Force refresh (ignore cache)
            </button>
            {error && <span className="error"> · {error}</span>}
          </div>
          <div className="card-grid">
            {[1, 2, 3, 4].map((pos) => {
              const label = positions.find((p) => p.id === pos)?.label ?? `Pos ${pos}`;
              const items = topByPosition[pos] ?? [];
              return (
                <div key={pos} className="card">
                  <div className="card-head">
                    <span className="badge">{label}</span>
                    <span className="muted-sm">Top value (pts/£)</span>
                  </div>
                  <div className="card-list">
                    {items.length === 0 && <div className="muted-sm">No data yet</div>}
                    {items.map((p, idx) => (
                      <div key={p.id} className="card-row">
                        <div>
                          <div className="card-name">
                            {idx + 1}. {p.name}
                          </div>
                          <div className="muted-sm">
                            {p.teamName} · {p.minutes} mins · £{p.price.toFixed(1)}
                          </div>
                        </div>
                        <div className="card-metric">
                          <div className="card-value">{p.value.toFixed(2)}</div>
                          <div className="muted-sm">pts/£</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
        </div>

          <div className="filters">
            <div className="pills">
              {positions.map((p) => (
                <button
                  key={p.id}
                  className={`pill ${position === p.id ? "active" : ""}`}
                  onClick={() => setPosition(p.id)}
                >
                  {p.label}
                </button>
              ))}
            </div>

            <label>
              Season
              <select value={season} onChange={(e) => setSeason(e.target.value)}>
                {seasons.map((s) => (
                  <option key={s} value={s}>
                    {s === "current" ? "Current Season" : s}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Scope
              <select value={scope} onChange={(e) => setScope(e.target.value as Scope)}>
                {scopes.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>

            {scope !== "season" && (
              <label>
                Gameweek
                <input
                  type="number"
                  value={gw || ""}
                  onChange={(e) => setGw(Number(e.target.value) || 0)}
                  min={1}
                />
              </label>
            )}

            <label>
              Min minutes
              <input
                type="number"
                value={minMinutes}
                onChange={(e) => setMinMinutes(Number(e.target.value) || 0)}
                min={0}
              />
            </label>

            <label className="grow">
              Search
              <input
                type="search"
                placeholder="Player name"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
          </div>
        </header>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Player</th>
                {columns.map((col) => (
                  <th key={col.key} onClick={() => toggleSort(col.key)}>
                    <span className="th-label">
                      {col.label}{" "}
                      {sort.key === col.key ? <span className="sort">{sort.dir === "asc" ? "↑" : "↓"}</span> : null}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={`${p.id}-${p.gw}`}>
                  <td>{p.name}</td>
                  <td>{p.teamName}</td>
                  <td>{p.value.toFixed(2)}</td>
                  <td>{p.pointsPer90.toFixed(2)}</td>
                  <td>{p.xgiPer90.toFixed(2)}</td>
                  <td>{p.goalsPer90.toFixed(2)}</td>
                  <td>{p.assistsPer90.toFixed(2)}</td>
                  <td>{p.shotsPer90.toFixed(2)}</td>
                  <td>{p.keyPassPer90.toFixed(2)}</td>
                  <td>{p.minutes}</td>
                  <td>{p.price.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {loading && <div className="muted-sm">Loading live EPL data…</div>}
        {error && <div className="error">{error}</div>}
        </div>
      </main>
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

  return {
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
  };
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

  return {
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
  };
}

// Minimal CSV parser for simple, quoted CSV
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

type CachePayload = { updated: number; players: PlayerRow[] };

function readCache(season: string): CachePayload | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(`players-cache-${season}`);
    if (!raw) return null;
    return JSON.parse(raw) as CachePayload;
  } catch {
    return null;
  }
}

function writeCache(season: string, payload: CachePayload) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(`players-cache-${season}`, JSON.stringify(payload));
  } catch {
    // ignore storage errors
  }
}

function clearCache(season: string) {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(`players-cache-${season}`);
  } catch {
    // ignore storage errors
  }
}

function round(n: number) {
  return Math.round(n * 100) / 100;
}

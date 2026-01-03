create table if not exists players (
  id bigint primary key,
  first_name text,
  second_name text,
  team_id int,
  position int,
  now_cost int,
  created_at timestamptz default now()
);

create table if not exists teams (
  id int primary key,
  name text,
  short_name text,
  strength int,
  created_at timestamptz default now()
);

create table if not exists gameweeks (
  id int primary key,
  name text,
  deadline timestamptz
);

create table if not exists player_gameweek_stats (
  player_id bigint references players(id),
  gw int references gameweeks(id),
  minutes int,
  goals int,
  assists int,
  xg numeric,
  xa numeric,
  shots int,
  key_passes int,
  total_points int,
  price int,
  was_home boolean,
  opponent_team int,
  created_at timestamptz default now(),
  primary key (player_id, gw)
);

create view player_gameweek_stats_per90 as
select
  pgs.*,
  greatest(pgs.minutes, 1) as minutes_safe,
  round((pgs.total_points * 90.0) / greatest(pgs.minutes, 1), 2) as points_per90,
  round(((pgs.xg + pgs.xa) * 90.0) / greatest(pgs.minutes, 1), 2) as xgi_per90,
  round((pgs.shots * 90.0) / greatest(pgs.minutes, 1), 2) as shots_per90,
  round((pgs.key_passes * 90.0) / greatest(pgs.minutes, 1), 2) as key_passes_per90,
  round((pgs.goals * 90.0) / greatest(pgs.minutes, 1), 2) as goals_per90,
  round((pgs.assists * 90.0) / greatest(pgs.minutes, 1), 2) as assists_per90
from player_gameweek_stats pgs;


## EPL Per-90 Dashboard

Next.js + Supabase dashboard for EPL/FPL per-90 comparisons across gameweek, month (last 4 GWs), and season scopes.

### Prereqs
- Supabase project (grab `SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`).
- Node 18+.

### Environment
Create `.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

### Supabase schema
Run `supabase/schema.sql` in the Supabase SQL editor to create tables + view.

### Edge function (data ingestion)
Deploy `supabase/functions/fetch-fpl` in Supabase and schedule daily or post-GW to pull official FPL data (bootstrap + per-player summaries) and upsert into the tables.

### Develop
```bash
npm install
npm run dev
# open http://localhost:3000
```

### API
- `GET /api/per90?scope=week|month|season&gw=<number>&position=<1-4>&minMinutes=<int>`
  - `scope=month` uses a rolling 4-gameweek window.
  - `position` filters to FPL element types (1 GK, 2 DEF, 3 MID, 4 FWD).

### UI
- Filters: scope, gameweek (for week/month), position, min minutes, search.
- Sortable columns: value (pts/£), pts/90, xGI/90, G/90, A/90, shots/90, key-pass/90, minutes, price.

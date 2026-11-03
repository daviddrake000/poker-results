-- ============================================================================
-- Carried-over totals: results from before this app
--
-- Review it, then paste the whole file into the Supabase SQL editor and run it.
-- It is one transaction: if any statement fails, nothing changes. It's safe to
-- run again. It changes the schema only and loads no data.
--
-- What it does:
--   1. Adds a `carryover` table: per player, games played and net winnings
--      from before this app. It holds totals only, so those earlier nights
--      don't appear in game history.
--   2. Extends the `player_stats` view (the leaderboard) so games played and
--      net include the carried-over totals. Best and worst night still come
--      only from games played in this app. Three new columns are added at the
--      end; existing columns keep their names and types.
--
-- To load totals, create the players and insert one row each (made-up example;
-- nets across all players in a source should sum to exactly 0):
--
--   insert into players (name) values ('Ann'), ('Ben');
--   insert into carryover (player_id, source, as_of, games_played, net_cents)
--   select p.id, 'Old spreadsheet', date '2026-01-31', v.games, v.net
--   from (values ('Ann', 3, 1500), ('Ben', 3, -1500)) as v (name, games, net)
--   join players p on p.name = v.name;
-- ============================================================================

begin;

-- 1. Carry-over table --------------------------------------------------------

create table if not exists carryover (
  id            uuid primary key default gen_random_uuid(),
  player_id     uuid not null references players (id) on delete restrict,
  -- Where the totals came from, e.g. 'Old spreadsheet'.
  source        text not null,
  -- Totals as of this date.
  as_of         date not null,
  games_played  integer not null check (games_played >= 0),
  net_cents     bigint  not null,
  unique (player_id, source)
);

create index if not exists carryover_player_idx on carryover (player_id);

alter table carryover enable row level security;

-- Readable exactly when the player is readable, so this follows whichever
-- players policy is in force (public, or members-only after that SQL).
drop policy if exists carryover_read_with_player on carryover;
create policy carryover_read_with_player on carryover
  for select to anon, authenticated
  using (exists (select 1 from players p where p.id = carryover.player_id));

drop policy if exists carryover_admin_all on carryover;
create policy carryover_admin_all on carryover
  for all to authenticated using (is_admin()) with check (is_admin());

-- 2. Leaderboard view --------------------------------------------------------

create or replace view player_stats with (security_invoker = true) as
select
  p.id, p.name, p.active,
  (count(e.id) + coalesce(c.games_played, 0))::integer                    as games_played,
  (coalesce(sum(e.cash_out_cents - e.buy_in_cents), 0)
     + coalesce(c.net_cents, 0))::bigint                                   as net_cents,
  coalesce(sum(e.buy_in_cents), 0)::bigint                                 as total_buy_in_cents,
  coalesce(max(e.cash_out_cents - e.buy_in_cents), 0)::integer             as best_night_cents,
  coalesce(min(e.cash_out_cents - e.buy_in_cents), 0)::integer             as worst_night_cents,
  count(*) filter (where e.cash_out_cents > e.buy_in_cents)::integer       as winning_nights,
  -- New: the split between games played here and carried-over totals.
  count(e.id)::integer                                                     as tracked_games,
  coalesce(c.games_played, 0)::integer                                     as carried_games,
  coalesce(c.net_cents, 0)::bigint                                         as carried_net_cents
from players p
left join (
  select e.* from game_entries e
  join games g on g.id = e.game_id
  where g.status = 'final'
) e on e.player_id = p.id
left join (
  select player_id, sum(games_played) as games_played, sum(net_cents) as net_cents
  from carryover
  group by player_id
) c on c.player_id = p.id
group by p.id, p.name, p.active, c.games_played, c.net_cents;

commit;

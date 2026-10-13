-- Voorbeeldtabel voor de lijst in worker/routes/items.ts. Vervang hem door je eigen tabellen.
create table items (
  id integer primary key autoincrement,
  titel text not null,
  door text not null,
  gemaakt_op text not null default (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

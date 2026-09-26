-- Run this once in Supabase: SQL Editor -> New query -> paste -> Run.
create table if not exists csf_store (
  id int primary key,
  data jsonb not null
);
-- Lock the table so only the server (using the secret key) can read or write it.
alter table csf_store enable row level security;

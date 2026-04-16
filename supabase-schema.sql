-- Run this in your Supabase SQL editor.

create extension if not exists pgcrypto;

create table if not exists public.expenses (
  id uuid primary key,
  item_name text not null,
  amount numeric(12,2) not null,
  quantity integer not null,
  purchase_date date not null,
  category text not null,
  authorized_by text not null,
  proof_file_name text,
  receipt_url text,
  receipt_path text,
  created_at timestamptz not null default now()
);

alter table public.expenses enable row level security;

create policy "Allow all read access"
  on public.expenses
  for select
  using (true);

create policy "Allow all insert access"
  on public.expenses
  for insert
  with check (true);

create policy "Allow all update access"
  on public.expenses
  for update
  using (true)
  with check (true);

create policy "Allow all delete access"
  on public.expenses
  for delete
  using (true);

insert into storage.buckets (id, name, public)
values ('vrt-ledger-receipts', 'vrt-ledger-receipts', true)
on conflict (id) do nothing;

create policy "Public read receipts"
  on storage.objects
  for select
  using (bucket_id = 'vrt-ledger-receipts');

create policy "Public upload receipts"
  on storage.objects
  for insert
  with check (bucket_id = 'vrt-ledger-receipts');

create policy "Public update receipts"
  on storage.objects
  for update
  using (bucket_id = 'vrt-ledger-receipts')
  with check (bucket_id = 'vrt-ledger-receipts');

create policy "Public delete receipts"
  on storage.objects
  for delete
  using (bucket_id = 'vrt-ledger-receipts');

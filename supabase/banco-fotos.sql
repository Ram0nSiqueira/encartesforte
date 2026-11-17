-- EncartesForte — banco das fotos principais dos produtos (Supabase).
-- Rodar uma vez no Supabase: menu "SQL Editor" → "New query" → colar tudo → "Run".
-- Pode rodar de novo sem problema (não apaga nada).

-- 1) Tabela: cada chave (nome normalizado ou "codigo:<ean>") aponta para a foto do produto.
create table if not exists public.fotos_principais (
  chave         text primary key,          -- ex.: "arroz tio joao 5kg" ou "codigo:7891234567890"
  nome          text not null,             -- nome como foi digitado
  codigo        text,                      -- código de barras (opcional)
  arquivo       text not null,             -- caminho no Storage, ex.: "a1b2c3.png"
  sem_fundo     boolean not null default true,
  atualizado_em timestamptz not null default now()
);

create index if not exists fotos_principais_nome_idx on public.fotos_principais (nome);

-- 2) Pasta (bucket) pública com as imagens: <id>.png (sem fundo), <id>-branco.png, <id>-original.png.
insert into storage.buckets (id, name, public)
values ('fotos-produtos', 'fotos-produtos', true)
on conflict (id) do update set public = true;

-- 3) Permissões: o site (chave "anon") pode ler, salvar, trocar e apagar fotos.
alter table public.fotos_principais enable row level security;

drop policy if exists "site le fotos" on public.fotos_principais;
drop policy if exists "site salva fotos" on public.fotos_principais;
drop policy if exists "site atualiza fotos" on public.fotos_principais;
drop policy if exists "site apaga fotos" on public.fotos_principais;
create policy "site le fotos"       on public.fotos_principais for select using (true);
create policy "site salva fotos"    on public.fotos_principais for insert with check (true);
create policy "site atualiza fotos" on public.fotos_principais for update using (true) with check (true);
create policy "site apaga fotos"    on public.fotos_principais for delete using (true);

drop policy if exists "site le imagens" on storage.objects;
drop policy if exists "site envia imagens" on storage.objects;
drop policy if exists "site troca imagens" on storage.objects;
drop policy if exists "site apaga imagens" on storage.objects;
create policy "site le imagens"    on storage.objects for select using (bucket_id = 'fotos-produtos');
create policy "site envia imagens" on storage.objects for insert with check (bucket_id = 'fotos-produtos');
create policy "site troca imagens" on storage.objects for update using (bucket_id = 'fotos-produtos');
create policy "site apaga imagens" on storage.objects for delete using (bucket_id = 'fotos-produtos');

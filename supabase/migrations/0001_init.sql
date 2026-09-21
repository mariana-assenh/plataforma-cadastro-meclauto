-- Schema inicial: clientes e agendamentos da oficina
-- Rode isso no SQL editor do Supabase (ou via supabase CLI / migrations)

create extension if not exists pgcrypto;

create table if not exists clientes (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  email text,
  telefone text not null,
  endereco text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create unique index if not exists clientes_telefone_idx on clientes (telefone);

do $$ begin
  create type status_agendamento as enum ('pendente', 'confirmado', 'cancelado', 'concluido');
exception
  when duplicate_object then null;
end $$;

create table if not exists agendamentos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references clientes (id) on delete cascade,
  placa text not null,
  precisa_guincho boolean not null default false,
  descricao_problema text not null,
  data_agendamento date not null,
  hora_agendamento time not null,
  status status_agendamento not null default 'pendente',
  origem text not null default 'admin', -- 'publico' | 'admin'
  google_event_id text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index if not exists agendamentos_data_idx on agendamentos (data_agendamento, hora_agendamento);
create index if not exists agendamentos_cliente_idx on agendamentos (cliente_id);

-- atualiza atualizado_em automaticamente
create or replace function set_atualizado_em()
returns trigger as $$
begin
  new.atualizado_em = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_clientes_atualizado_em on clientes;
create trigger trg_clientes_atualizado_em
  before update on clientes
  for each row execute function set_atualizado_em();

drop trigger if exists trg_agendamentos_atualizado_em on agendamentos;
create trigger trg_agendamentos_atualizado_em
  before update on agendamentos
  for each row execute function set_atualizado_em();

-- RLS: ninguém acessa direto (nem anon, nem authenticated).
-- Só a service_role (usada pelo Worker) enxerga essas tabelas, porque
-- service_role sempre ignora RLS. O frontend nunca fala direto com o
-- Supabase para clientes/agendamentos — tudo passa pelo Worker.
alter table clientes enable row level security;
alter table agendamentos enable row level security;

-- MECLAUTO — reforço de segurança (rodar depois do 0001_init.sql)
-- Projeto Supabase exclusivo da MECLAUTO: nenhum dado da Five Garage vive aqui.
--
-- A RLS do 0001 já bloqueia leitura/escrita pelas chaves públicas. Aqui
-- tiramos também as permissões de tabela dos papéis anon/authenticated,
-- para que nem a chave pública nem um admin logado consigam acessar
-- clientes/agendamentos direto pelo navegador. Só o Worker (service_role)
-- acessa.

revoke all on table public.clientes     from anon, authenticated;
revoke all on table public.agendamentos from anon, authenticated;

-- Garante que o papel usado pelo Worker continua com acesso total.
grant all on table public.clientes     to service_role;
grant all on table public.agendamentos to service_role;

-- Valida os valores de origem (o 0001 só documentava em comentário).
do $$ begin
  alter table public.agendamentos
    add constraint agendamentos_origem_chk check (origem in ('publico', 'admin'));
exception
  when duplicate_object then null;
end $$;

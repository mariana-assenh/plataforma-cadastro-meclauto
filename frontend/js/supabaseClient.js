// Usa o Supabase JS só para autenticação do admin (login/logout).
// Nenhuma leitura/escrita de clientes/agendamentos acontece direto por
// aqui — isso sempre passa pelo Worker (que usa a service_role key).
window.getSupabaseClient = function () {
  const cfg = window.OFICINA_CONFIG;
  return window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
};

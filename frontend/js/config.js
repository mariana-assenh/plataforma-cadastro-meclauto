// Preencha com os dados reais do seu projeto antes do deploy.
// Nenhum valor aqui é secreto: a ANON_KEY do Supabase é feita para
// rodar no navegador (ela não dá acesso a clientes/agendamentos,
// porque a RLS bloqueia tudo que não for a service_role do Worker).
window.OFICINA_CONFIG = {
  WORKER_URL: "https://oficina-worker.SEU-SUBDOMINIO.workers.dev",
  SUPABASE_URL: "https://SEU-PROJETO.supabase.co",
  SUPABASE_ANON_KEY: "SUA_ANON_KEY_AQUI",
  TURNSTILE_SITE_KEY: "SUA_SITE_KEY_DO_TURNSTILE",
};

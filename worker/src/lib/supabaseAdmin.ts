import { createClient, SupabaseClient } from "@supabase/supabase-js";

export interface SupabaseEnv {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  SUPABASE_ANON_KEY: string;
}

// Cliente com a service_role key: ignora RLS. Só deve ser usado aqui
// dentro do Worker, nunca exposto ao frontend.
function exigir(env: SupabaseEnv, nome: keyof SupabaseEnv): void {
  if (!env[nome]) throw new Error(`${nome} não configurado no Worker meclauto-api (Settings → Variables and Secrets)`);
}

export function supabaseAdmin(env: SupabaseEnv): SupabaseClient {
  exigir(env, "SUPABASE_URL");
  exigir(env, "SUPABASE_SERVICE_ROLE_KEY");
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

// Cliente com a anon key, usado só para validar o token de login do
// admin (Supabase Auth). Não tem acesso de escrita às tabelas por causa
// da RLS.
export function supabaseAnon(env: SupabaseEnv): SupabaseClient {
  exigir(env, "SUPABASE_URL");
  exigir(env, "SUPABASE_ANON_KEY");
  return createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
}

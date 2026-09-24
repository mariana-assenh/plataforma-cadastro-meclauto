import { Hono } from "hono";
import { cors } from "hono/cors";
import { supabaseAdmin, supabaseAnon, SupabaseEnv } from "./lib/supabaseAdmin";
import { criarEventoGoogle, atualizarEventoGoogle, excluirEventoGoogle, CalendarEnv } from "./lib/googleCalendar";

type Bindings = SupabaseEnv &
  CalendarEnv & {
    ALLOWED_ORIGIN: string;
  };

type Variables = {
  adminUserId: string;
};

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

app.use("*", async (c, next) => {
  const middleware = cors({ origin: c.env.ALLOWED_ORIGIN, allowHeaders: ["Content-Type", "Authorization"] });
  return middleware(c, next);
});

// -----------------------------------------------------------------------
// Middleware: exige um login válido de admin (token do Supabase Auth)
// -----------------------------------------------------------------------
async function requireAdmin(c: any, next: any) {
  const authHeader = c.req.header("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return c.json({ error: "não autenticado" }, 401);

  const supa = supabaseAnon(c.env);
  const { data, error } = await supa.auth.getUser(token);
  if (error || !data.user) return c.json({ error: "token inválido ou expirado" }, 401);

  c.set("adminUserId", data.user.id);
  await next();
}

app.use("/admin/*", requireAdmin);

// -----------------------------------------------------------------------
// Rota pública: o próprio cliente solicita um agendamento
// -----------------------------------------------------------------------
app.post("/public/agendamentos", async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body) return c.json({ error: "corpo inválido" }, 400);

  const obrigatorios = ["nome", "telefone", "placa", "descricao_problema", "data_agendamento", "hora_agendamento"];
  for (const campo of obrigatorios) {
    if (!body[campo]) return c.json({ error: `campo obrigatório: ${campo}` }, 400);
  }

  const db = supabaseAdmin(c.env);

  // Reaproveita o cliente se o telefone já existir, senão cria um novo.
  const { data: existente } = await db.from("clientes").select("id").eq("telefone", body.telefone).maybeSingle();
  let clienteId = existente?.id as string | undefined;

  if (!clienteId) {
    const { data: novoCliente, error: erroCliente } = await db
      .from("clientes")
      .insert({ nome: body.nome, email: body.email ?? null, telefone: body.telefone, endereco: body.endereco ?? null })
      .select("id")
      .single();
    if (erroCliente) return c.json({ error: erroCliente.message }, 500);
    clienteId = novoCliente.id;
  }

  const { data: agendamento, error } = await db
    .from("agendamentos")
    .insert({
      cliente_id: clienteId,
      placa: body.placa,
      precisa_guincho: !!body.precisa_guincho,
      descricao_problema: body.descricao_problema,
      data_agendamento: body.data_agendamento,
      hora_agendamento: body.hora_agendamento,
      status: "pendente",
      origem: "publico",
    })
    .select()
    .single();

  if (error) return c.json({ error: error.message }, 500);

  // Não cria evento no Google Calendar ainda: só quando o admin confirmar.
  return c.json({ ok: true, agendamento });
});

// -----------------------------------------------------------------------
// Admin: clientes
// -----------------------------------------------------------------------
app.get("/admin/clientes", async (c) => {
  const db = supabaseAdmin(c.env);
  const { data, error } = await db.from("clientes").select("*").order("criado_em", { ascending: false });
  if (error) return c.json({ error: error.message }, 500);
  return c.json(data);
});

app.post("/admin/clientes", async (c) => {
  const body = await c.req.json();
  const db = supabaseAdmin(c.env);
  const { data, error } = await db
    .from("clientes")
    .insert({ nome: body.nome, email: body.email ?? null, telefone: body.telefone, endereco: body.endereco ?? null })
    .select()
    .single();
  if (error) return c.json({ error: error.message }, 500);
  return c.json(data);
});

app.put("/admin/clientes/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json();
  const db = supabaseAdmin(c.env);
  const { data, error } = await db
    .from("clientes")
    .update({ nome: body.nome, email: body.email, telefone: body.telefone, endereco: body.endereco })
    .eq("id", id)
    .select()
    .single();
  if (error) return c.json({ error: error.message }, 500);
  return c.json(data);
});

app.delete("/admin/clientes/:id", async (c) => {
  const id = c.req.param("id");
  const db = supabaseAdmin(c.env);
  const { error } = await db.from("clientes").delete().eq("id", id);
  if (error) return c.json({ error: error.message }, 500);
  return c.json({ ok: true });
});

// -----------------------------------------------------------------------
// Admin: agendamentos
// -----------------------------------------------------------------------
app.get("/admin/agendamentos", async (c) => {
  const db = supabaseAdmin(c.env);
  const status = c.req.query("status");
  let query = db
    .from("agendamentos")
    .select("*, clientes(*)")
    .order("data_agendamento", { ascending: true })
    .order("hora_agendamento", { ascending: true });
  if (status) query = query.eq("status", status);
  const { data, error } = await query;
  if (error) return c.json({ error: error.message }, 500);
  return c.json(data);
});

// Admin cria um agendamento diretamente (já nasce confirmado e ganha
// evento no Google Calendar na hora).
app.post("/admin/agendamentos", async (c) => {
  const body = await c.req.json();
  const db = supabaseAdmin(c.env);

  const { data: agendamento, error } = await db
    .from("agendamentos")
    .insert({
      cliente_id: body.cliente_id,
      placa: body.placa,
      precisa_guincho: !!body.precisa_guincho,
      descricao_problema: body.descricao_problema,
      data_agendamento: body.data_agendamento,
      hora_agendamento: body.hora_agendamento,
      status: "confirmado",
      origem: "admin",
    })
    .select("*, clientes(*)")
    .single();
  if (error) return c.json({ error: error.message }, 500);

  try {
    const eventId = await criarEventoGoogle(c.env, agendamento);
    await db.from("agendamentos").update({ google_event_id: eventId }).eq("id", agendamento.id);
    agendamento.google_event_id = eventId;
  } catch (e: any) {
    // Salva o agendamento mesmo se a Google Calendar falhar — o admin
    // pode tentar sincronizar de novo depois. Não perde o cadastro.
    return c.json({ ok: true, agendamento, aviso: `agendamento salvo, mas falhou ao criar evento no Google: ${e.message}` });
  }

  return c.json({ ok: true, agendamento });
});

// Edita um agendamento existente (dados, ou muda status: confirma,
// cancela, conclui) e mantém o Google Calendar sincronizado.
app.put("/admin/agendamentos/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json();
  const db = supabaseAdmin(c.env);

  const { data: atual, error: erroAtual } = await db.from("agendamentos").select("*, clientes(*)").eq("id", id).single();
  if (erroAtual || !atual) return c.json({ error: "agendamento não encontrado" }, 404);

  const { data: atualizado, error } = await db
    .from("agendamentos")
    .update({
      placa: body.placa ?? atual.placa,
      precisa_guincho: body.precisa_guincho ?? atual.precisa_guincho,
      descricao_problema: body.descricao_problema ?? atual.descricao_problema,
      data_agendamento: body.data_agendamento ?? atual.data_agendamento,
      hora_agendamento: body.hora_agendamento ?? atual.hora_agendamento,
      status: body.status ?? atual.status,
    })
    .eq("id", id)
    .select("*, clientes(*)")
    .single();
  if (error) return c.json({ error: error.message }, 500);

  try {
    if (atualizado.status === "cancelado" && atual.google_event_id) {
      await excluirEventoGoogle(c.env, atual.google_event_id);
      await db.from("agendamentos").update({ google_event_id: null }).eq("id", id);
      atualizado.google_event_id = null;
    } else if (atualizado.status === "confirmado") {
      if (atual.google_event_id) {
        await atualizarEventoGoogle(c.env, atual.google_event_id, atualizado);
      } else {
        const eventId = await criarEventoGoogle(c.env, atualizado);
        await db.from("agendamentos").update({ google_event_id: eventId }).eq("id", id);
        atualizado.google_event_id = eventId;
      }
    }
  } catch (e: any) {
    return c.json({ ok: true, agendamento: atualizado, aviso: `salvo, mas falhou ao sincronizar com o Google: ${e.message}` });
  }

  return c.json({ ok: true, agendamento: atualizado });
});

app.delete("/admin/agendamentos/:id", async (c) => {
  const id = c.req.param("id");
  const db = supabaseAdmin(c.env);
  const { data: atual } = await db.from("agendamentos").select("google_event_id").eq("id", id).single();
  if (atual?.google_event_id) {
    try {
      await excluirEventoGoogle(c.env, atual.google_event_id);
    } catch {
      // segue o baile mesmo se o Google falhar — o registro no banco é o que importa
    }
  }
  const { error } = await db.from("agendamentos").delete().eq("id", id);
  if (error) return c.json({ error: error.message }, 500);
  return c.json({ ok: true });
});

export default app;

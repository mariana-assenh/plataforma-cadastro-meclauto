// Integração com o Google Agenda via Google Apps Script (apps-script/Code.gs).
// A organização Google bloqueia chaves de conta de serviço, então o Worker
// chama um App da Web do Apps Script, que roda na conta dona da agenda.
//
// Secrets no painel da Cloudflare (projeto meclauto-api):
//   GOOGLE_SCRIPT_URL   — URL da implantação do App da Web (termina em /exec)
//   GOOGLE_SCRIPT_TOKEN — token gerado pela função configurar() do script

export interface CalendarEnv {
  GOOGLE_SCRIPT_URL: string;
  GOOGLE_SCRIPT_TOKEN: string;
}

export interface AgendamentoParaEvento {
  id: string;
  placa: string;
  precisa_guincho: boolean;
  descricao_problema: string;
  data_agendamento: string; // YYYY-MM-DD
  hora_agendamento: string; // HH:MM:SS
  duracao_minutos?: number;
  clientes?: { nome: string; telefone: string; email?: string | null } | null;
}

const DURACAO_PADRAO_MIN = 60;

// Monta "YYYY-MM-DDTHH:MM:SS" em hora de Brasília (sem fuso), somando minutos.
// O Apps Script interpreta esse texto como America/Sao_Paulo.
function horaLocal(data: string, hora: string, somarMin = 0): string {
  const hhmmss = hora.length === 5 ? `${hora}:00` : hora.slice(0, 8);
  const base = new Date(`${data}T${hhmmss}Z`); // só para fazer a conta
  return new Date(base.getTime() + somarMin * 60000).toISOString().slice(0, 19);
}

function montarEvento(a: AgendamentoParaEvento) {
  const duracao = a.duracao_minutos ?? DURACAO_PADRAO_MIN;
  const nomeCliente = a.clientes?.nome ?? "Cliente";

  const linhas = [
    `Placa: ${a.placa}`,
    `Guincho necessário: ${a.precisa_guincho ? "sim" : "não"}`,
    `Problema relatado: ${a.descricao_problema}`,
  ];
  if (a.clientes?.telefone) linhas.push(`Telefone: ${a.clientes.telefone}`);
  if (a.clientes?.email) linhas.push(`Email: ${a.clientes.email}`);

  return {
    titulo: `MECLAUTO — ${nomeCliente} (${a.placa})`,
    descricao: linhas.join("\n"),
    inicio: horaLocal(a.data_agendamento, a.hora_agendamento),
    fim: horaLocal(a.data_agendamento, a.hora_agendamento, duracao),
  };
}

type RespostaScript = { ok: boolean; eventId?: string; error?: string };

async function chamarScript(env: CalendarEnv, payload: Record<string, unknown>): Promise<RespostaScript> {
  if (!env.GOOGLE_SCRIPT_URL || !env.GOOGLE_SCRIPT_TOKEN) {
    throw new Error("GOOGLE_SCRIPT_URL / GOOGLE_SCRIPT_TOKEN não configurados no Worker");
  }
  const res = await fetch(env.GOOGLE_SCRIPT_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: env.GOOGLE_SCRIPT_TOKEN, ...payload }),
    redirect: "follow",
  });
  const texto = await res.text();
  let data: RespostaScript;
  try {
    data = JSON.parse(texto);
  } catch {
    throw new Error(`resposta inesperada do Apps Script (${res.status}): ${texto.slice(0, 200)}`);
  }
  if (!data.ok) throw new Error(`Apps Script: ${data.error ?? "erro desconhecido"}`);
  return data;
}

export async function criarEventoGoogle(env: CalendarEnv, agendamento: AgendamentoParaEvento): Promise<string> {
  const data = await chamarScript(env, { acao: "criar", evento: montarEvento(agendamento) });
  if (!data.eventId) throw new Error("Apps Script não devolveu o id do evento");
  return data.eventId;
}

export async function atualizarEventoGoogle(env: CalendarEnv, eventId: string, agendamento: AgendamentoParaEvento): Promise<void> {
  await chamarScript(env, { acao: "atualizar", eventId, evento: montarEvento(agendamento) });
}

export async function excluirEventoGoogle(env: CalendarEnv, eventId: string): Promise<void> {
  await chamarScript(env, { acao: "excluir", eventId });
}

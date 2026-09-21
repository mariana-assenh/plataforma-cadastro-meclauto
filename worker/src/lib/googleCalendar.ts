import { getGoogleAccessToken, GoogleEnv } from "./googleAuth";

export interface CalendarEnv extends GoogleEnv {
  GOOGLE_CALENDAR_ID: string;
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

function montarEvento(a: AgendamentoParaEvento) {
  const inicio = new Date(`${a.data_agendamento}T${a.hora_agendamento}`);
  const duracao = a.duracao_minutos ?? DURACAO_PADRAO_MIN;
  const fim = new Date(inicio.getTime() + duracao * 60000);
  const nomeCliente = a.clientes?.nome ?? "Cliente";

  const linhas = [
    `Placa: ${a.placa}`,
    `Guincho necessário: ${a.precisa_guincho ? "sim" : "não"}`,
    `Problema relatado: ${a.descricao_problema}`,
  ];
  if (a.clientes?.telefone) linhas.push(`Telefone: ${a.clientes.telefone}`);
  if (a.clientes?.email) linhas.push(`Email: ${a.clientes.email}`);

  return {
    summary: `Oficina — ${nomeCliente} (${a.placa})`,
    description: linhas.join("\n"),
    start: { dateTime: inicio.toISOString(), timeZone: "America/Sao_Paulo" },
    end: { dateTime: fim.toISOString(), timeZone: "America/Sao_Paulo" },
  };
}

export async function criarEventoGoogle(env: CalendarEnv, agendamento: AgendamentoParaEvento): Promise<string> {
  const token = await getGoogleAccessToken(env);
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(env.GOOGLE_CALENDAR_ID)}/events`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(montarEvento(agendamento)),
    }
  );
  const data = (await res.json()) as { id?: string; error?: unknown };
  if (!res.ok || !data.id) throw new Error(`Erro ao criar evento no Google Calendar: ${JSON.stringify(data)}`);
  return data.id;
}

export async function atualizarEventoGoogle(
  env: CalendarEnv,
  eventId: string,
  agendamento: AgendamentoParaEvento
): Promise<void> {
  const token = await getGoogleAccessToken(env);
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(env.GOOGLE_CALENDAR_ID)}/events/${eventId}`,
    {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(montarEvento(agendamento)),
    }
  );
  if (!res.ok) {
    const data = await res.json();
    throw new Error(`Erro ao atualizar evento no Google Calendar: ${JSON.stringify(data)}`);
  }
}

export async function excluirEventoGoogle(env: CalendarEnv, eventId: string): Promise<void> {
  const token = await getGoogleAccessToken(env);
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(env.GOOGLE_CALENDAR_ID)}/events/${eventId}`,
    { method: "DELETE", headers: { Authorization: `Bearer ${token}` } }
  );
  // 410/404 significa que o evento já não existe — trata como sucesso.
  if (!res.ok && res.status !== 410 && res.status !== 404) {
    const data = await res.json();
    throw new Error(`Erro ao excluir evento no Google Calendar: ${JSON.stringify(data)}`);
  }
}

/**
 * MECLAUTO — ponte entre o Worker (Cloudflare) e o Google Agenda.
 *
 * Roda dentro da conta Google dona da agenda, sem chave de conta de serviço.
 * O Worker manda um POST com { token, acao, eventId?, evento? } e este script
 * cria, atualiza ou exclui o evento na agenda da MECLAUTO.
 *
 * Configuração (uma vez só):
 *  1. Rode a função configurar() pelo editor (botão "Executar") e autorize.
 *     Ela gera o TOKEN e mostra no "Registro de execução" — copie para a
 *     Cloudflare como secret GOOGLE_SCRIPT_TOKEN.
 *  2. Em Configurações do projeto → Propriedades do script, preencha
 *     CALENDAR_ID com o ID da agenda MECLAUTO (termina em @group.calendar.google.com).
 *  3. Implantar → Nova implantação → Tipo "App da Web",
 *     Executar como: Eu | Quem pode acessar: Qualquer pessoa.
 *     Copie a URL (termina em /exec) para a Cloudflare como GOOGLE_SCRIPT_URL.
 */

const FUSO = "America/Sao_Paulo";

function configurar() {
  const props = PropertiesService.getScriptProperties();
  let token = props.getProperty("TOKEN");
  if (!token) {
    token = Utilities.getUuid().replace(/-/g, "") + Utilities.getUuid().replace(/-/g, "");
    props.setProperty("TOKEN", token);
  }
  if (!props.getProperty("CALENDAR_ID")) props.setProperty("CALENDAR_ID", "COLE_AQUI_O_ID_DA_AGENDA");
  // Força o pedido de permissão do Google Agenda
  CalendarApp.getDefaultCalendar();
  Logger.log("TOKEN (copie para GOOGLE_SCRIPT_TOKEN na Cloudflare): " + token);
}

function doPost(e) {
  try {
    const props = PropertiesService.getScriptProperties();
    const body = JSON.parse(e.postData.contents);

    if (!body.token || body.token !== props.getProperty("TOKEN")) {
      return responder({ ok: false, error: "token inválido" });
    }

    const agenda = CalendarApp.getCalendarById(props.getProperty("CALENDAR_ID"));
    if (!agenda) return responder({ ok: false, error: "agenda não encontrada — confira CALENDAR_ID" });

    if (body.acao === "criar") {
      const ev = body.evento;
      const evento = agenda.createEvent(ev.titulo, data(ev.inicio), data(ev.fim), { description: ev.descricao });
      return responder({ ok: true, eventId: evento.getId() });
    }

    if (body.acao === "atualizar") {
      const evento = agenda.getEventById(body.eventId);
      if (!evento) return responder({ ok: false, error: "evento não encontrado" });
      const ev = body.evento;
      evento.setTitle(ev.titulo);
      evento.setDescription(ev.descricao);
      evento.setTime(data(ev.inicio), data(ev.fim));
      return responder({ ok: true, eventId: evento.getId() });
    }

    if (body.acao === "excluir") {
      const evento = agenda.getEventById(body.eventId);
      if (evento) evento.deleteEvent(); // se já não existe, considera ok
      return responder({ ok: true });
    }

    return responder({ ok: false, error: "ação desconhecida" });
  } catch (err) {
    return responder({ ok: false, error: String(err) });
  }
}

// "2026-10-06T09:00:00" (hora de Brasília) -> Date
function data(texto) {
  return Utilities.parseDate(texto, FUSO, "yyyy-MM-dd'T'HH:mm:ss");
}

function responder(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

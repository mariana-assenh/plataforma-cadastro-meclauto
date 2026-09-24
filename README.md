# Plataforma de agendamento — Oficina Mecânica

Esqueleto inicial gerado com base nas decisões alinhadas em 21/09/2026.
Serve como ponto de partida — precisa de ajustes finos (validações,
regras de horário/duração, tratamento de erros) antes de ir pra produção.

## Como está organizado

```
frontend/         site estático (Cloudflare Pages)
  index.html       landing page + formulário público de agendamento (CSS e JS embutidos no próprio arquivo)
  admin.html       painel administrativo (login + gestão de clientes/agendamentos, também autocontido)
  assets/          logo da MECLAUTO
worker/            API/pipeline (Cloudflare Workers, Hono)
  src/index.ts      rotas públicas e administrativas
  src/lib/          Supabase, Google Calendar (Service Account)
supabase/
  migrations/       schema SQL (clientes, agendamentos)
.github/workflows/  deploy automático no push pra main
```

`index.html` e `admin.html` são arquivos únicos e autocontidos (HTML +
CSS + JS no mesmo arquivo, à exceção do script externo do Supabase,
carregado via CDN só no `admin.html`). Isso evita qualquer problema de
caminho relativo quebrado ao abrir o arquivo direto no navegador ou
pré-visualizar em alguma ferramenta.

## Fluxo

1. Cliente preenche o formulário público (`index.html`) → cria `cliente`
   (se novo) e `agendamento` com status `pendente`. Nenhum evento é
   criado no Google Calendar ainda.
2. Admin loga no painel (`admin.html`, Supabase Auth) e vê a lista de
   agendamentos. Pode confirmar, cancelar, concluir ou cadastrar um
   agendamento direto (nesse caso já nasce confirmado).
3. Ao confirmar, o Worker cria o evento na agenda única do Google da
   oficina (via conta de serviço, sem OAuth interativo). Ao cancelar,
   o evento é removido. Ao editar data/hora de um confirmado, o evento
   é atualizado.

Todo acesso a `clientes`/`agendamentos` passa pelo Worker — o frontend
nunca fala direto com o Supabase para essas tabelas (RLS bloqueia
qualquer coisa que não seja a `service_role`). O Supabase só é usado
direto no navegador para autenticação (login do admin).

## Configuração necessária

### 1. Supabase
- Crie o projeto (ou reaproveite a organização do outro projeto — free
  tier permite até 2 projetos ativos por organização).
- Rode `supabase/migrations/0001_init.sql` no SQL editor.
- Crie os usuários admin em Authentication → Users (email/senha).
- Pegue: `SUPABASE_URL`, `anon key` e `service_role key` em Project
  Settings → API.

### 2. Google Calendar (conta de serviço)
- No Google Cloud Console: crie um projeto, ative a "Google Calendar API".
- Crie uma Service Account e gere uma chave JSON.
- Na agenda do Google que vai receber os eventos: compartilhe com o
  email da service account (`...@...iam.gserviceaccount.com`), com
  permissão "fazer alterações em eventos".
- Guarde: `client_email` e `private_key` do JSON, e o ID da agenda
  (normalmente o próprio email do Google, ou em Configurações da
  agenda → "ID da agenda").

### 3. Variáveis e segredos

No topo do `<script>` de `index.html` (bloco `const CONFIG = {...}`):
`WORKER_URL`, `WHATSAPP_NUMERO` (com DDI, só dígitos) e
`WHATSAPP_MENSAGEM`.

> Nota: o formulário público não tem captcha/anti-spam por enquanto
> (removemos o Cloudflare Turnstile porque estava dando dor de cabeça
> nos testes e não é obrigatório pra funcionar). Dá pra adicionar de
> volta mais pra frente, com o site já publicado num domínio real, se
> começar a chegar spam.

No topo do `<script>` de `admin.html`: `WORKER_URL`, `SUPABASE_URL` e
`SUPABASE_ANON_KEY`. Nenhum desses valores é secreto — a anon key do
Supabase é feita pra rodar no navegador (RLS bloqueia qualquer escrita
em `clientes`/`agendamentos` que não venha da `service_role`, usada só
dentro do Worker).

No Worker (`cd worker`):
```
wrangler secret put SUPABASE_SERVICE_ROLE_KEY
wrangler secret put SUPABASE_ANON_KEY
wrangler secret put GOOGLE_CLIENT_EMAIL
wrangler secret put GOOGLE_PRIVATE_KEY
```
E ajuste `wrangler.toml` (`SUPABASE_URL`, `GOOGLE_CALENDAR_ID`,
`ALLOWED_ORIGIN`).

No GitHub (Settings → Secrets → Actions): `CF_API_TOKEN`,
`CF_ACCOUNT_ID`.

## Rodando localmente

```
cd worker && npm install && npm run dev
```
Abra `frontend/index.html` e `frontend/admin.html` direto no navegador
(dá pra abrir clicando duas vezes no arquivo — não dependem mais de
`css/`ou `js/` externos) ou sirva com `npx serve frontend`, apontando
`WORKER_URL` pro `http://localhost:8787` do `wrangler dev`.

## Identidade visual

Já aplicada com base na logo da MECLAUTO (`frontend/assets/logo-meclauto.png`):

- `--cor-primaria: #0d151e` — grafite escuro do fundo da logo (navbar, hero, rodapé)
- `--cor-destaque: #74b145` — verde do anel/"MECL" (botões, ações principais)
- `--cor-prata: #cbcdd6` — prata do anel/carro/chave de boca (detalhes, textos secundários)

`index.html` agora é uma landing page (inspirada em referências como a
Five Garage): navbar fixa, seção hero com título, botão "Falar no
WhatsApp" e botão "Agendar horário" (que rola até o formulário), uma
seção curta de serviços (Híbridos/Elétricos/Combustão) e a seção de
agendamento em si. Cada token de cor está no `:root` do `<style>`
dentro do próprio `index.html`/`admin.html` — ajustar um tom é mexer só
ali (duplicado nos dois arquivos, já que cada um é autocontido).

A imagem usada foi redimensionada para ~300px de largura (carrega
rápido); se quiser mais nitidez em telas grandes, troque por uma versão
maior ou, idealmente, um SVG da logo.

## Sobre custo (ver também o doc salvo no projeto "oficina")

Cloudflare (Workers + Pages): 100 mil requisições/dia grátis, por
conta — compartilhado entre os dois projetos se usarem a mesma conta.
Para o volume esperado de uma oficina, isso não deve ser um problema.

Supabase: até 2 projetos ativos grátis por organização — se reaproveitar
a mesma organização do outro projeto, esse aqui é o segundo e ainda
gratuito, mas não sobra vaga pra um terceiro sem virar Pro (US$25/mês).
Projeto free pausa depois de 7 dias sem atividade no banco — se o
painel for usado com pouca frequência, seja pra reativar manualmente
no dashboard de vez em quando.

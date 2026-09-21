(function () {
  const cfg = window.OFICINA_CONFIG;
  const supabase = window.getSupabaseClient();

  const cardLogin = document.getElementById("card-login");
  const painel = document.getElementById("painel");
  const loginMsg = document.getElementById("login-mensagem");
  const usuarioLogado = document.getElementById("usuario-logado");

  let sessaoAtual = null;

  async function chamarApi(caminho, opcoes = {}) {
    const headers = Object.assign(
      { "Content-Type": "application/json", Authorization: `Bearer ${sessaoAtual.access_token}` },
      opcoes.headers || {}
    );
    const resp = await fetch(`${cfg.WORKER_URL}${caminho}`, { ...opcoes, headers });
    const dados = await resp.json();
    if (!resp.ok) throw new Error(dados.error || "erro na requisição");
    return dados;
  }

  // ---------------- login ----------------
  document.getElementById("btn-login").addEventListener("click", async () => {
    const email = document.getElementById("login-email").value;
    const senha = document.getElementById("login-senha").value;
    loginMsg.textContent = "Entrando...";
    const { data, error } = await supabase.auth.signInWithPassword({ email, password: senha });
    if (error) {
      loginMsg.textContent = "Erro no login: " + error.message;
      return;
    }
    sessaoAtual = data.session;
    usuarioLogado.textContent = data.user.email;
    cardLogin.style.display = "none";
    painel.style.display = "block";
    carregarAgendamentos();
    carregarClientes();
  });

  document.getElementById("btn-logout").addEventListener("click", async () => {
    await supabase.auth.signOut();
    sessaoAtual = null;
    painel.style.display = "none";
    cardLogin.style.display = "block";
  });

  // ---------------- abas ----------------
  document.querySelectorAll("nav.abas button").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("nav.abas button").forEach((b) => b.classList.remove("ativa"));
      btn.classList.add("ativa");
      document.getElementById("aba-agendamentos").style.display = btn.dataset.aba === "agendamentos" ? "block" : "none";
      document.getElementById("aba-clientes").style.display = btn.dataset.aba === "clientes" ? "block" : "none";
    });
  });

  // ---------------- agendamentos ----------------
  async function carregarAgendamentos() {
    const status = document.getElementById("filtro-status").value;
    const query = status ? `?status=${status}` : "";
    const lista = await chamarApi(`/admin/agendamentos${query}`);
    const corpo = document.getElementById("tabela-agendamentos");
    corpo.innerHTML = "";
    for (const ag of lista) {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${ag.data_agendamento} ${ag.hora_agendamento?.slice(0, 5) ?? ""}</td>
        <td>${ag.clientes?.nome ?? ""}<br><small>${ag.clientes?.telefone ?? ""}</small></td>
        <td>${ag.placa}</td>
        <td>${ag.precisa_guincho ? "Sim" : "Não"}</td>
        <td>${ag.descricao_problema}</td>
        <td><span class="badge ${ag.status}">${ag.status}</span></td>
        <td class="acoes"></td>
      `;
      const acoes = tr.querySelector(".acoes");

      if (ag.status === "pendente") {
        const btnConfirmar = document.createElement("button");
        btnConfirmar.textContent = "Confirmar";
        btnConfirmar.onclick = () => mudarStatus(ag.id, "confirmado");
        acoes.appendChild(btnConfirmar);
      }
      if (ag.status !== "cancelado") {
        const btnCancelar = document.createElement("button");
        btnCancelar.textContent = "Cancelar";
        btnCancelar.className = "perigo";
        btnCancelar.onclick = () => mudarStatus(ag.id, "cancelado");
        acoes.appendChild(btnCancelar);
      }
      if (ag.status === "confirmado") {
        const btnConcluir = document.createElement("button");
        btnConcluir.textContent = "Concluir";
        btnConcluir.className = "secundario";
        btnConcluir.onclick = () => mudarStatus(ag.id, "concluido");
        acoes.appendChild(btnConcluir);
      }
      corpo.appendChild(tr);
    }
  }

  async function mudarStatus(id, status) {
    try {
      await chamarApi(`/admin/agendamentos/${id}`, { method: "PUT", body: JSON.stringify({ status }) });
      carregarAgendamentos();
    } catch (e) {
      alert("Erro: " + e.message);
    }
  }

  document.getElementById("filtro-status").addEventListener("change", carregarAgendamentos);

  // ---------------- clientes ----------------
  async function carregarClientes() {
    const lista = await chamarApi("/admin/clientes");
    const corpo = document.getElementById("tabela-clientes");
    corpo.innerHTML = "";
    for (const cli of lista) {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${cli.nome}</td><td>${cli.telefone}</td><td>${cli.email ?? ""}</td><td>${cli.endereco ?? ""}</td>
        <td class="acoes"></td>
      `;
      const acoes = tr.querySelector(".acoes");
      const btnEditar = document.createElement("button");
      btnEditar.textContent = "Editar";
      btnEditar.className = "secundario";
      btnEditar.onclick = () => editarCliente(cli);
      acoes.appendChild(btnEditar);

      const btnExcluir = document.createElement("button");
      btnExcluir.textContent = "Excluir";
      btnExcluir.className = "perigo";
      btnExcluir.onclick = () => excluirCliente(cli.id);
      acoes.appendChild(btnExcluir);

      corpo.appendChild(tr);
    }
  }

  async function editarCliente(cli) {
    const nome = prompt("Nome", cli.nome);
    if (nome === null) return;
    const telefone = prompt("Telefone", cli.telefone);
    if (telefone === null) return;
    const email = prompt("Email", cli.email ?? "");
    const endereco = prompt("Endereço", cli.endereco ?? "");
    try {
      await chamarApi(`/admin/clientes/${cli.id}`, { method: "PUT", body: JSON.stringify({ nome, telefone, email, endereco }) });
      carregarClientes();
    } catch (e) {
      alert("Erro: " + e.message);
    }
  }

  async function excluirCliente(id) {
    if (!confirm("Excluir este cliente e os agendamentos vinculados?")) return;
    try {
      await chamarApi(`/admin/clientes/${id}`, { method: "DELETE" });
      carregarClientes();
      carregarAgendamentos();
    } catch (e) {
      alert("Erro: " + e.message);
    }
  }

  document.getElementById("btn-novo-cliente").addEventListener("click", async () => {
    const nome = prompt("Nome");
    if (!nome) return;
    const telefone = prompt("Telefone");
    if (!telefone) return;
    const email = prompt("Email (opcional)") || null;
    const endereco = prompt("Endereço (opcional)") || null;
    try {
      await chamarApi("/admin/clientes", { method: "POST", body: JSON.stringify({ nome, telefone, email, endereco }) });
      carregarClientes();
    } catch (e) {
      alert("Erro: " + e.message);
    }
  });

  // Nota: essas telas usam prompt()/confirm() para o primeiro corte —
  // dá pra trocar por um modal de verdade depois sem mexer na API.
})();

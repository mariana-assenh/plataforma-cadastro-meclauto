(function () {
  const cfg = window.OFICINA_CONFIG;
  const form = document.getElementById("form-agendamento");
  const msg = document.getElementById("mensagem");

  function mostrarMensagem(texto, tipo) {
    msg.textContent = texto;
    msg.className = "mensagem " + tipo;
  }

  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    mostrarMensagem("Enviando...", "sucesso");

    const dados = Object.fromEntries(new FormData(form).entries());
    dados.precisa_guincho = form.precisa_guincho.checked;
    dados["cf-turnstile-response"] = form.querySelector('[name="cf-turnstile-response"]')?.value || "";

    try {
      const resp = await fetch(`${cfg.WORKER_URL}/public/agendamentos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(dados),
      });
      const resultado = await resp.json();
      if (!resp.ok) throw new Error(resultado.error || "erro ao enviar solicitação");

      mostrarMensagem(
        "Solicitação enviada! Assim que a equipe confirmar, você recebe um retorno pelo telefone informado.",
        "sucesso"
      );
      form.reset();
    } catch (erro) {
      mostrarMensagem("Não foi possível enviar: " + erro.message, "erro");
    }
  });
})();

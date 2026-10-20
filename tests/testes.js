// Testes das funções de js/conversao.js.
// No navegador: abra tests/testes.html. No terminal (na pasta do projeto): node tests/testes.js

const C = typeof module !== "undefined" ? require("../js/conversao.js") : Conversao;

const resultados = [];

function teste(nome, funcao) {
  try { funcao(); resultados.push({ nome, ok: true }); }
  catch (erro) { resultados.push({ nome, ok: false, erro: erro.message }); }
}

function igual(obtido, esperado) {
  if (obtido !== esperado) throw new Error(`esperava ${JSON.stringify(esperado)}, veio ${JSON.stringify(obtido)}`);
}

// Números decimais podem diferir na última casa; comparamos com uma margem minúscula
function proximo(obtido, esperado) {
  const margem = Math.abs(esperado) * 1e-9 || 1e-12;
  if (!(Math.abs(obtido - esperado) <= margem)) throw new Error(`esperava perto de ${esperado}, veio ${obtido}`);
}

const precos = { USD: 1, BRL: 0.2, BTC: 50000, EUR: 1.25 };

// ---- Conversão ----
teste("1 BTC vale 250.000 BRL (BTC = 50.000 USD, BRL = 0,2 USD)", () => proximo(C.converter(precos, 1, "BTC", "BRL"), 250000));
teste("1 BRL vale 0,2 USD", () => proximo(C.converter(precos, 1, "BRL", "USD"), 0.2));
teste("converter para a mesma moeda não muda o valor", () => proximo(C.converter(precos, 10, "BRL", "BRL"), 10));
teste("ida e volta devolve o valor original (USD → BTC → USD)", () => {
  const emBtc = C.converter(precos, 123.45, "USD", "BTC");
  proximo(C.converter(precos, emBtc, "BTC", "USD"), 123.45);
});
teste("passar pelo dólar dá o mesmo que a conta direta (EUR → BRL)", () => {
  const direto = C.converter(precos, 7, "EUR", "BRL");
  const viaUsd = C.converter(precos, C.converter(precos, 7, "EUR", "USD"), "USD", "BRL");
  proximo(viaUsd, direto);
});
teste("moeda sem cotação não gera resultado válido", () => {
  igual(C.temPreco(precos, "XYZ"), false);
  igual(Number.isNaN(C.converter(precos, 1, "XYZ", "BRL")), true);
});
teste("temPreco recusa zero e valores negativos", () => {
  igual(C.temPreco({ A: 0 }, "A"), false);
  igual(C.temPreco({ A: -1 }, "A"), false);
  igual(C.temPreco(precos, "BTC"), true);
});

// ---- Leitura de números ----
teste("lerNumero aceita vírgula, ponto e milhar", () => {
  igual(C.lerNumero("6,5"), 6.5);
  igual(C.lerNumero("6.5"), 6.5);
  igual(C.lerNumero("1.234,56"), 1234.56);
  igual(C.lerNumero("  10 "), 10);
});
teste("lerNumero devolve null para texto inválido ou vazio", () => {
  igual(C.lerNumero(""), null);
  igual(C.lerNumero("abc"), null);
  igual(C.lerNumero("1,2,3"), null);
});

// ---- Formatação ----
teste("casas decimais: cripto 8, valor pequeno 6, normal 2", () => {
  igual(C.casasDecimais("cripto", 5), 8);
  igual(C.casasDecimais("fiat", 0.0357), 6);
  igual(C.casasDecimais("fiat", 5.43), 2);
});

// ---- Montagem dos preços ----
teste("precosDeTaxas inverte as taxas e ignora moedas ausentes", () => {
  const r = C.precosDeTaxas({ BRL: 5, EUR: 0.8 }, ["BRL", "EUR", "ARS"]);
  proximo(r.BRL, 0.2);
  proximo(r.EUR, 1.25);
  igual("ARS" in r, false);
  igual(r.USD, 1);
});
teste("aplicarParesBRL usa o dólar em reais como base", () => {
  const dados = {
    USDBRL: { code: "USD", bid: "5", pctChange: "1" },
    EURBRL: { code: "EUR", bid: "6", pctChange: "-0.5" },
  };
  const r = C.aplicarParesBRL({ USD: 1 }, dados);
  proximo(r.precos.BRL, 0.2);
  proximo(r.precos.EUR, 1.2);
  proximo(C.converter(r.precos, 1, "USD", "BRL"), 5);
  proximo(C.converter(r.precos, 1, "EUR", "BRL"), 6);
  igual(r.variacoes.EUR, -0.5);
});
teste("aplicarParesBRL devolve null se faltar o dólar em reais", () => {
  igual(C.aplicarParesBRL({ USD: 1 }, { EURBRL: { code: "EUR", bid: "6", pctChange: "0" } }), null);
  igual(C.aplicarParesBRL({ USD: 1 }, null), null);
});

// ---- Alertas ----
teste("alerta 'acima' dispara quando o preço passa ou iguala o alvo", () => {
  const a = { cond: "acima", alvo: 6 };
  igual(C.avaliarAlerta(a, 5.99), false);
  igual(C.avaliarAlerta(a, 6), true);
  igual(C.avaliarAlerta(a, 6.5), true);
});
teste("alerta 'abaixo' dispara quando o preço cai ou iguala o alvo", () => {
  const a = { cond: "abaixo", alvo: 5 };
  igual(C.avaliarAlerta(a, 5.01), false);
  igual(C.avaliarAlerta(a, 5), true);
  igual(C.avaliarAlerta(a, 4.2), true);
});

// ---- Histórico ----
teste("preencherSerie repete o último valor nos dias sem cotação", () => {
  const r = C.preencherSerie(["d1", "d2", "d3", "d4"], { d2: 2, d4: 4 });
  igual(JSON.stringify(r), JSON.stringify([2, 2, 2, 4]));
});
teste("preencherSerie lança erro quando não há nenhum dado", () => {
  let lancou = false;
  try { C.preencherSerie(["d1", "d2"], {}); } catch { lancou = true; }
  igual(lancou, true);
});
teste("variacaoPercentual calcula alta e queda", () => {
  proximo(C.variacaoPercentual([100, 110]), 10);
  proximo(C.variacaoPercentual([200, 100]), -50);
});

// ---- Resultado ----
const falhas = resultados.filter(r => !r.ok).length;
const resumo = `${resultados.length - falhas} de ${resultados.length} testes passaram`;

if (typeof document !== "undefined") {
  document.querySelector("#resumo").textContent = resumo + (falhas ? ` · ${falhas} falharam` : " ✔");
  const lista = document.querySelector("#resultados");
  for (const r of resultados) {
    const item = document.createElement("div");
    item.className = "teste" + (r.ok ? "" : " falha");
    item.textContent = (r.ok ? "✔ " : "✘ ") + r.nome;
    if (!r.ok) {
      const msg = document.createElement("span");
      msg.className = "erro-msg";
      msg.textContent = r.erro;
      item.appendChild(msg);
    }
    lista.appendChild(item);
  }
} else {
  for (const r of resultados) console.log((r.ok ? "✔ " : "✘ ") + r.nome + (r.ok ? "" : "\n    " + r.erro));
  console.log("\n" + resumo);
  process.exitCode = falhas ? 1 : 0;
}

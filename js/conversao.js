// Funções "puras" do conversor: recebem dados e devolvem um resultado, sem mexer na página.
// Por isso podem ser testadas sozinhas (veja testes.html e testes.js).

const Conversao = {
  // Existe uma cotação válida para esse código?
  temPreco(precos, codigo) {
    return precos[codigo] > 0;
  },

  // `precos` guarda quanto vale 1 unidade de cada ativo em dólar.
  // Qualquer par vira uma conta só: quantidade * preço da origem / preço do destino.
  converter(precos, quantidade, de, para) {
    return quantidade * precos[de] / precos[para];
  },

  // Aceita "6,50", "6.5" e "1.234,56". Devolve null se não for um número.
  lerNumero(texto) {
    let t = String(texto).trim();
    if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
    const n = Number(t);
    return t === "" || Number.isNaN(n) ? null : n;
  },

  // Quantas casas decimais mostrar: criptos precisam de mais, e valores pequenos também.
  casasDecimais(tipo, numero) {
    if (tipo === "cripto") return 8;
    return Math.abs(numero) < 1 ? 6 : 2;
  },

  // A API diz "1 USD = X moeda". Nós guardamos "1 moeda = 1/X USD".
  precosDeTaxas(taxas, codigos) {
    const precos = { USD: 1 };
    for (const codigo of codigos) {
      if (taxas && taxas[codigo] > 0) precos[codigo] = 1 / taxas[codigo];
    }
    return precos;
  },

  // Usa as cotações "X em reais" (AwesomeAPI) para atualizar os preços em dólar.
  // Devolve null se a resposta não trouxer o dólar em reais.
  aplicarParesBRL(precos, dados) {
    const dolarEmReal = Number(dados && dados.USDBRL && dados.USDBRL.bid);
    if (!(dolarEmReal > 0)) return null;

    const novo = { ...precos, BRL: 1 / dolarEmReal };
    const variacoes = {};
    for (const par of Object.values(dados)) {
      const bid = Number(par.bid);
      if (par.code !== "USD" && bid > 0) novo[par.code] = bid * novo.BRL;
      variacoes[par.code] = Number(par.pctChange);
    }
    return { precos: novo, variacoes };
  },

  // O alerta foi atingido? Passar exatamente pelo valor também conta.
  avaliarAlerta(alerta, valorAtual) {
    return alerta.cond === "acima" ? valorAtual >= alerta.alvo : valorAtual <= alerta.alvo;
  },

  // Monta a série dia a dia: repete o último valor conhecido nos dias sem cotação
  // (fins de semana) e preenche o começo com o primeiro valor que existir.
  preencherSerie(dias, pontos) {
    const serie = [];
    let ultimo = null;
    for (const dia of dias) {
      if (pontos[dia] !== undefined) ultimo = pontos[dia];
      serie.push(ultimo);
    }
    const primeiro = serie.find(v => v !== null);
    if (primeiro === undefined) throw new Error("sem dados");
    for (let i = 0; i < serie.length && serie[i] === null; i++) serie[i] = primeiro;
    return serie;
  },

  variacaoPercentual(serie) {
    return (serie[serie.length - 1] / serie[0] - 1) * 100;
  },
};

// No Node (para rodar os testes pelo terminal) exportamos; no navegador, `Conversao` já é global.
if (typeof module !== "undefined") module.exports = Conversao;

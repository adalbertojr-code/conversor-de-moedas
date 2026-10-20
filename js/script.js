// ---------- 1. Catálogo de ativos ----------
const MOEDAS = [
  ["USD","Dólar americano"],["EUR","Euro"],["BRL","Real brasileiro"],["GBP","Libra esterlina"],["JPY","Iene japonês"],
  ["CAD","Dólar canadense"],["AUD","Dólar australiano"],["CHF","Franco suíço"],["CNY","Yuan chinês"],["NZD","Dólar neozelandês"],
  ["ARS","Peso argentino"],["MXN","Peso mexicano"],["CLP","Peso chileno"],["COP","Peso colombiano"],["PEN","Sol peruano"],
  ["UYU","Peso uruguaio"],["INR","Rupia indiana"],["KRW","Won sul-coreano"],["HKD","Dólar de Hong Kong"],["SGD","Dólar de Singapura"],
  ["TRY","Lira turca"],["ZAR","Rand sul-africano"],["AED","Dirham dos Emirados"],["SAR","Rial saudita"],["ILS","Novo shekel israelense"],
  ["EGP","Libra egípcia"],["SEK","Coroa sueca"],["NOK","Coroa norueguesa"],["DKK","Coroa dinamarquesa"],["PLN","Zloty polonês"],
  ["CZK","Coroa tcheca"],["HUF","Florim húngaro"],["THB","Baht tailandês"],["IDR","Rupia indonésia"],["MYR","Ringgit malaio"],
  ["PHP","Peso filipino"],["VND","Dong vietnamita"],["NGN","Naira nigeriana"],["UAH","Hryvnia ucraniana"],["RON","Leu romeno"],
];
const CRIPTOS = [
  ["BTC","Bitcoin","bitcoin"],["ETH","Ethereum","ethereum"],["BNB","BNB","binancecoin"],["SOL","Solana","solana"],
  ["XRP","XRP","ripple"],["USDT","Tether","tether"],["USDC","USD Coin","usd-coin"],["ADA","Cardano","cardano"],
  ["DOGE","Dogecoin","dogecoin"],["TRX","TRON","tron"],["TON","Toncoin","the-open-network"],["AVAX","Avalanche","avalanche-2"],
  ["DOT","Polkadot","polkadot"],["LINK","Chainlink","chainlink"],["POL","Polygon","polygon-ecosystem-token"],["LTC","Litecoin","litecoin"],
  ["SHIB","Shiba Inu","shiba-inu"],["BCH","Bitcoin Cash","bitcoin-cash"],["XLM","Stellar","stellar"],["ATOM","Cosmos","cosmos"],
  ["NEAR","NEAR Protocol","near"],["UNI","Uniswap","uniswap"],
];
const ATIVOS = [
  ...MOEDAS.map(([codigo, nome]) => ({ codigo, nome, tipo: "fiat" })),
  ...CRIPTOS.map(([codigo, nome, id]) => ({ codigo, nome, tipo: "cripto", id })),
];
const TICKER = [["USD","BRL"],["EUR","BRL"],["GBP","BRL"],["ARS","BRL"],["JPY","BRL"],["CAD","BRL"],["CHF","BRL"],
                ["BTC","BRL"],["ETH","BRL"],["BNB","BRL"],["SOL","BRL"],["XRP","BRL"],["DOGE","BRL"],["BTC","USD"]];
// Código da moeda -> código do país (para buscar a bandeira)
const PAISES = { USD:"us", EUR:"eu", BRL:"br", GBP:"gb", JPY:"jp", CAD:"ca", AUD:"au", CHF:"ch", CNY:"cn", NZD:"nz",
  ARS:"ar", MXN:"mx", CLP:"cl", COP:"co", PEN:"pe", UYU:"uy", INR:"in", KRW:"kr", HKD:"hk", SGD:"sg", TRY:"tr",
  ZAR:"za", AED:"ae", SAR:"sa", ILS:"il", EGP:"eg", SEK:"se", NOK:"no", DKK:"dk", PLN:"pl", CZK:"cz", HUF:"hu",
  THB:"th", IDR:"id", MYR:"my", PHP:"ph", VND:"vn", NGN:"ng", UAH:"ua", RON:"ro" };

// ---------- 2. Estado ----------
// Guardamos o valor de 1 unidade de cada ativo em DÓLAR. Converter qualquer par vira:
//   resultado = quantidade * usd[origem] / usd[destino]
// atraso: para cada ativo com cotação salva (não ao vivo), guarda a data em que ela foi obtida
const estado = { usd: {}, variacao24h: {}, aba: "todas", busca: "", periodo: 30,
                 variacaoBRL: {}, imagens: {}, brlAoVivo: false, atraso: {}, carregando: true };


// ---------- 3. Elementos ----------
const $ = (seletor) => document.querySelector(seletor);
const campoValor = $("#valor"), selectDe = $("#de"), selectPara = $("#para");
const lista = $("#lista");

// ---------- 4. Cotações ----------
async function buscarTaxasDiarias(codigos) {
  try {
    const r = await fetch("https://open.er-api.com/v6/latest/USD");
    if (!r.ok) throw new Error(r.status);
    const d = await r.json();
    if (d.result !== "success") throw new Error("falha");
    return d.rates;
  } catch {
    // Plano B: Frankfurter (cobre menos moedas)
    const r = await fetch(`https://api.frankfurter.dev/v1/latest?base=USD&symbols=${codigos.join(",")}`);
    if (!r.ok) throw new Error(r.status);
    return (await r.json()).rates;
  }
}

async function buscarFiat() {
  const codigos = MOEDAS.map(m => m[0]).filter(c => c !== "USD");
  let precos = { USD: 1 }, taxasOk = false, variacaoBRL = {}, brlAoVivo = false;

  try {
    precos = Conversao.precosDeTaxas(await buscarTaxasDiarias(codigos), codigos);
    taxasOk = true;
  } catch { /* ainda tentamos a AwesomeAPI abaixo */ }

  // Cotação do dia em tempo quase real para pares com o real (AwesomeAPI, cache de 1 minuto)
  try {
    const pares = ["USD","EUR","GBP","JPY","CAD","AUD","CHF","CNY","ARS"].map(c => c + "-BRL").join(",");
    const r = await fetch(`https://economia.awesomeapi.com.br/json/last/${pares}`);
    if (!r.ok) throw new Error(r.status);
    const resultado = Conversao.aplicarParesBRL(precos, await r.json());
    if (resultado) { precos = resultado.precos; variacaoBRL = resultado.variacoes; brlAoVivo = true; }
  } catch { /* sem problema: seguimos com a cotação diária */ }

  if (!taxasOk && !brlAoVivo) throw new Error("nenhuma fonte de moedas respondeu");
  return { precos, variacaoBRL, brlAoVivo };
}

async function buscarCripto() {
  const ids = CRIPTOS.map(c => c[2]).join(",");
  // /coins/markets devolve preço, variação de 24h e a imagem (logo) de cada moeda
  const r = await fetch(`https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${ids}&per_page=50&price_change_percentage=24h`);
  if (!r.ok) throw new Error(r.status);
  const d = await r.json();
  const precos = {}, variacoes = {}, imagens = {};
  for (const m of d) {
    const cripto = CRIPTOS.find(c => c[2] === m.id);
    if (!cripto) continue;
    precos[cripto[0]] = m.current_price;
    variacoes[cripto[0]] = m.price_change_percentage_24h;
    imagens[cripto[0]] = m.image;
  }
  return { precos, variacoes, imagens };
}

async function atualizarCotacoes() {
  definirStatus("carregando", "Buscando cotações…");
  const [fiat, cripto] = await Promise.allSettled([buscarFiat(), buscarCripto()]);
  const salvas = lerCotacoesSalvas();
  const agora = new Date().toISOString();
  const novo = { USD: 1 }, atraso = {};
  let falhas = 0;

  if (fiat.status === "fulfilled") {
    Object.assign(novo, fiat.value.precos);
    estado.variacaoBRL = fiat.value.variacaoBRL;
    estado.brlAoVivo = fiat.value.brlAoVivo;
    salvas.fiat = { precos: fiat.value.precos, quando: agora };
  } else {
    falhas++;
    estado.variacaoBRL = {};
    estado.brlAoVivo = false;
    if (salvas.fiat && salvas.fiat.precos) { // última cotação real que tínhamos, marcada como atrasada
      Object.assign(novo, salvas.fiat.precos);
      for (const c of Object.keys(salvas.fiat.precos)) if (c !== "USD") atraso[c] = salvas.fiat.quando || "sem data";
    }
  }

  if (cripto.status === "fulfilled") {
    Object.assign(novo, cripto.value.precos);
    estado.variacao24h = cripto.value.variacoes;
    Object.assign(estado.imagens, cripto.value.imagens);
    salvas.cripto = { precos: cripto.value.precos, variacoes: cripto.value.variacoes, imagens: cripto.value.imagens, quando: agora };
  } else {
    falhas++;
    if (salvas.cripto && salvas.cripto.precos) {
      Object.assign(novo, salvas.cripto.precos);
      estado.variacao24h = salvas.cripto.variacoes || {};
      for (const c of Object.keys(salvas.cripto.precos)) atraso[c] = salvas.cripto.quando || "sem data";
    }
  }

  estado.usd = novo;
  estado.atraso = atraso;
  estado.carregando = false;
  salvarCotacoes(salvas);

  if (falhas === 0) {
    definirStatus("ao-vivo", "Ao vivo · " + new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) + " · atualiza a cada 60 s");
  } else {
    const salvos = Object.keys(atraso).length;
    definirStatus("offline", (falhas === 2 ? "Sem conexão com as fontes" : "Uma fonte falhou") +
      (salvos > 0 ? " · mostrando cotações salvas (marcadas com ~)" : " · sem cotações salvas para essas moedas"));
  }
  renderizar();
  desenharTicker();
  verificarAlertas();
  desenharAlertas();
}

function definirStatus(tipo, texto) {
  $("#ponto").className = "ponto " + tipo;
  $("#status-texto").textContent = texto;
  $("#ticker-rotulo").textContent = tipo === "ao-vivo" ? "AO VIVO" : tipo === "carregando" ? "CARREGANDO" : "DESATUALIZADO";
}

// ---------- 5. Conversão e formatação ----------
const temPreco = (codigo) => Conversao.temPreco(estado.usd, codigo);
const converter = (qtd, de, para) => Conversao.converter(estado.usd, qtd, de, para);
const estimado = (codigo) => Boolean(estado.atraso[codigo]); // true = cotação salva, não ao vivo
const achar = (codigo) => ATIVOS.find(a => a.codigo === codigo);

function formatar(numero, codigoDestino) {
  const casas = Conversao.casasDecimais(achar(codigoDestino).tipo, numero);
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: casas }).format(numero);
}

function lerQuantidade() {
  const n = Conversao.lerNumero(campoValor.value);
  return n === null || n < 0 ? null : n;
}

function criarVariacao(codigo) {
  if (estimado(codigo)) return null; // variação antiga não é mostrada
  const v = estado.variacao24h[codigo];
  if (typeof v !== "number") return null;
  const el = document.createElement("span");
  el.className = "var " + (v >= 0 ? "alta" : "baixa");
  el.textContent = (v >= 0 ? "▲ +" : "▼ ") + v.toFixed(2).replace(".", ",") + "% em 24h";
  return el;
}

// ---------- Cotações salvas (última cotação REAL, com data) ----------
const CHAVE_COTACOES = "cambio:cotacoes";

function lerCotacoesSalvas() {
  try {
    const salvas = JSON.parse(localStorage.getItem(CHAVE_COTACOES));
    return salvas && typeof salvas === "object" ? salvas : {};
  } catch { return {}; }
}

function salvarCotacoes(salvas) {
  try { localStorage.setItem(CHAVE_COTACOES, JSON.stringify(salvas)); } catch { /* segue sem salvar */ }
}

// Ao abrir a página, mostra o que foi salvo da última visita, sempre marcado como estimado
function restaurarCotacoesSalvas() {
  const salvas = lerCotacoesSalvas();
  const usd = { USD: 1 }, atraso = {};
  if (salvas.fiat && salvas.fiat.precos) {
    Object.assign(usd, salvas.fiat.precos);
    for (const c of Object.keys(salvas.fiat.precos)) if (c !== "USD") atraso[c] = salvas.fiat.quando || "sem data";
  }
  if (salvas.cripto && salvas.cripto.precos) {
    Object.assign(usd, salvas.cripto.precos);
    estado.variacao24h = salvas.cripto.variacoes || {};
    Object.assign(estado.imagens, salvas.cripto.imagens || {});
    for (const c of Object.keys(salvas.cripto.precos)) atraso[c] = salvas.cripto.quando || "sem data";
  }
  estado.usd = usd;
  estado.atraso = atraso;
}

function dataHoraBR(iso) {
  const data = new Date(iso);
  return Number.isNaN(data.getTime()) ? "data desconhecida"
    : data.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function atualizarAvisoEstimado(de, para) {
  const datas = [de, para].filter(estimado).map(c => estado.atraso[c]).sort();
  const mostrar = datas.length > 0 && temPreco(de) && temPreco(para) && lerQuantidade() !== null;
  $("#resultado").classList.toggle("estimado", mostrar);
  $("#res-aviso").textContent = mostrar
    ? `⚠ Valor estimado: usa cotação salva em ${dataHoraBR(datas[0])}, sem conexão com a fonte ao vivo.` : "";
}

// ---------- 6. Desenhar ----------
function renderizar() {
  const de = selectDe.value, para = selectPara.value, qtd = lerQuantidade();
  const resValor = $("#res-valor");
  resValor.className = "valor" + (achar(para).tipo === "cripto" ? " cripto" : "");

  if (qtd === null) {
    resValor.innerHTML = '<span class="erro">Digite um número válido, como 100 ou 0,5.</span>';
    $("#res-origem").textContent = ""; $("#res-taxa").textContent = "";
  } else if (!temPreco(de) || !temPreco(para)) {
    resValor.innerHTML = `<span class="erro">${estado.carregando ? "Buscando cotações…" : "Cotação indisponível agora para este par."}</span>`;
    $("#res-origem").textContent = ""; $("#res-taxa").textContent = "";
  } else {
    $("#res-origem").textContent = `${formatar(qtd, de)} ${de} equivalem a`;
    resValor.textContent = `${formatar(converter(qtd, de, para), para)} ${para}`;
    $("#res-taxa").textContent = `1 ${de} = ${formatar(converter(1, de, para), para)} ${para}`;
  }
  atualizarAvisoEstimado(de, para);
  desenharPainel(de, para);
  atualizarIcones();
  salvarPreferencias();
}

function desenharPainel(de, para) {
  $("#painel-moeda").textContent = de;
  lista.innerHTML = "";
  const termo = estado.busca.toLowerCase();

  const visiveis = ATIVOS.filter(a =>
    a.codigo !== de && temPreco(a.codigo) &&
    (estado.aba === "todas" || a.tipo === estado.aba) &&
    (a.codigo.toLowerCase().includes(termo) || a.nome.toLowerCase().includes(termo))
  );

  if (visiveis.length === 0) {
    const vazio = document.createElement("li");
    vazio.className = "vazio";
    vazio.textContent = "Nenhum resultado. Tente outro nome ou código.";
    lista.appendChild(vazio);
    return;
  }

  for (const ativo of visiveis) {
    const li = document.createElement("li");
    const botao = document.createElement("button");
    botao.type = "button";
    botao.className = "item" + (ativo.tipo === "cripto" ? " cripto" : "") + (ativo.codigo === para ? " ativo" : "");
    botao.dataset.codigo = ativo.codigo;

    const selo = criarSelo(ativo.codigo);
    const info = document.createElement("span");
    const cod = document.createElement("span"); cod.className = "cod"; cod.textContent = ativo.codigo;
    const nome = document.createElement("span"); nome.className = "nome"; nome.textContent = ativo.nome;
    info.append(cod, nome);
    const num = document.createElement("span"); num.className = "num";
    const ehEstimado = estimado(de) || estimado(ativo.codigo);
    num.textContent = (ehEstimado ? "~ " : "") + formatar(converter(1, de, ativo.codigo), ativo.codigo);
    num.classList.toggle("estimado", ehEstimado);
    const v = criarVariacao(ativo.codigo);
    if (v) { v.style.display = "block"; num.appendChild(v); }

    botao.append(selo, info, num);
    li.appendChild(botao);
    lista.appendChild(li);
  }
}

// ---------- Preferências (localStorage) ----------
// localStorage guarda texto no navegador; por isso usamos JSON.stringify / JSON.parse.
const CHAVE = "cambio:preferencias";

function salvarPreferencias() {
  try {
    localStorage.setItem(CHAVE, JSON.stringify({
      valor: campoValor.value, de: selectDe.value, para: selectPara.value,
      aba: estado.aba, periodo: estado.periodo,
    }));
  } catch { /* navegador bloqueou o armazenamento: o app segue funcionando */ }
}

function carregarPreferencias() {
  try {
    const p = JSON.parse(localStorage.getItem(CHAVE));
    if (!p) return;
    if (p.valor) campoValor.value = p.valor;
    if (p.de && achar(p.de)) selectDe.value = p.de;
    if (p.para && achar(p.para)) selectPara.value = p.para;
    if (["todas", "fiat", "cripto"].includes(p.aba)) estado.aba = p.aba;
    if ([7, 30, 90, 365].includes(p.periodo)) estado.periodo = p.periodo;
  } catch { /* dados antigos ou inválidos: ignorar */ }
}

function marcarBotoes() {
  document.querySelectorAll("#abas .aba").forEach(b => b.classList.toggle("ativa", b.dataset.aba === estado.aba));
  document.querySelectorAll("#periodos .aba").forEach(b => b.classList.toggle("ativa", Number(b.dataset.dias) === estado.periodo));
}

// ---------- Histórico de preço ----------
const cacheHistorico = new Map();
const diaISO = (data) => data.toISOString().slice(0, 10);
const dataBR = (iso) => iso.split("-").reverse().join("/");

function listaDias(n) {
  const hoje = new Date(), dias = [];
  for (let i = n; i >= 0; i--) {
    dias.push(diaISO(new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), hoje.getUTCDate() - i))));
  }
  return dias;
}

// Devolve uma lista com o valor em DÓLAR de 1 unidade do ativo em cada dia
async function historicoUSD(codigo, n) {
  const chave = codigo + "|" + n;
  if (cacheHistorico.has(chave)) return cacheHistorico.get(chave);

  const ativo = achar(codigo), dias = listaDias(n), pontos = {};
  if (codigo === "USD") {
    dias.forEach(d => pontos[d] = 1);
  } else if (ativo.tipo === "cripto") {
    const r = await fetch(`https://api.coingecko.com/api/v3/coins/${ativo.id}/market_chart?vs_currency=usd&days=${n}&interval=daily`);
    if (!r.ok) throw new Error(r.status);
    const d = await r.json();
    for (const [momento, preco] of d.prices) pontos[diaISO(new Date(momento))] = preco;
  } else {
    const r = await fetch(`https://api.frankfurter.dev/v1/${dias[0]}..${dias[dias.length - 1]}?base=USD&symbols=${codigo}`);
    if (!r.ok) throw new Error(r.status);
    const d = await r.json();
    for (const [dia, taxas] of Object.entries(d.rates)) pontos[dia] = 1 / taxas[codigo];
  }

  // Fins de semana não têm cotação: repetimos o último valor conhecido (lança erro se não houver nenhum dado)
  const serie = Conversao.preencherSerie(dias, pontos);

  cacheHistorico.set(chave, serie);
  return serie;
}

let tokenGrafico = 0; // evita que uma resposta antiga sobrescreva uma mais nova

async function atualizarGrafico() {
  const meuToken = ++tokenGrafico;
  const de = selectDe.value, para = selectPara.value, n = estado.periodo;
  const area = $("#grafico");
  $("#grafico-titulo").textContent = `${de} em ${para}`;
  $("#grafico-stats").innerHTML = "";

  if (de === para) {
    area.innerHTML = '<p class="vazio">Escolha duas moedas diferentes para ver o histórico.</p>';
    return;
  }
  area.innerHTML = '<p class="vazio">Carregando histórico…</p>';

  try {
    const [a, b] = await Promise.all([historicoUSD(de, n), historicoUSD(para, n)]);
    if (meuToken !== tokenGrafico) return;
    desenharLinha(a.map((v, i) => v / b[i]), listaDias(n), para);
  } catch {
    if (meuToken !== tokenGrafico) return;
    area.innerHTML = '<p class="vazio">Histórico indisponível para este par. A fonte pode não cobrir uma das moedas ou o limite de consultas foi atingido; tente de novo em um minuto.</p>';
  }
}

let ultimoGrafico = null, tempoResize;

function redesenharGrafico() {
  if (ultimoGrafico && $("#grafico").clientWidth > 0) desenharLinha(ultimoGrafico.serie, ultimoGrafico.dias, ultimoGrafico.para);
}
window.addEventListener("resize", () => { clearTimeout(tempoResize); tempoResize = setTimeout(redesenharGrafico, 150); });

function desenharLinha(serie, dias, para) {
  ultimoGrafico = { serie, dias, para };
  const area = $("#grafico");
  area.className = achar(para).tipo === "cripto" ? "cripto" : "";

  // Largura = largura real da caixa, assim os textos do eixo ficam do tamanho certo em qualquer tela
  const W = Math.max(300, area.clientWidth || 640), H = 280;
  const min = Math.min(...serie), max = Math.max(...serie);
  const folga = (max - min) ? (max - min) * 0.08 : (Math.abs(max) * 0.01 || 1);
  const lo = min - folga, hi = max + folga;

  const eixoY = [hi, (hi + lo) / 2, lo];
  const fmtEixo = (v) => new Intl.NumberFormat("pt-BR", { maximumSignificantDigits: 5 }).format(v);
  const rotulosY = eixoY.map(fmtEixo);
  const PE = Math.max(...rotulosY.map(r => r.length)) * 8 + 16, PD = 12, PT = 14, PB = 32;

  const x = (i) => PE + i * (W - PE - PD) / (serie.length - 1);
  const y = (v) => PT + (H - PT - PB) * (1 - (v - lo) / (hi - lo));

  const linha = serie.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
  const fundo = `${linha} L${x(serie.length - 1).toFixed(1)} ${H - PB} L${x(0).toFixed(1)} ${H - PB} Z`;

  const grade = eixoY.map((v, k) => {
    const gy = y(v).toFixed(1);
    return `<line class="g-grade" x1="${PE}" x2="${W - PD}" y1="${gy}" y2="${gy}"/>` +
           `<text class="g-eixo" x="${PE - 8}" y="${(Number(gy) + 4).toFixed(1)}" text-anchor="end">${rotulosY[k]}</text>`;
  }).join("");

  // Datas: início, meio e fim
  const rotuloData = (iso) => { const [a, m, d] = iso.split("-"); return dias.length > 300 ? `${m}/${a.slice(2)}` : `${d}/${m}`; };
  const meio = Math.floor((serie.length - 1) / 2);
  const datas = [[0, "start"], [meio, "middle"], [serie.length - 1, "end"]].map(([i, ancora]) =>
    `<text class="g-eixo" x="${x(i).toFixed(1)}" y="${H - 8}" text-anchor="${ancora}">${rotuloData(dias[i])}</text>`).join("");

  area.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Gráfico de linha do histórico de preço">
    ${grade}${datas}
    <path d="${fundo}" fill="currentColor" fill-opacity="0.12"/>
    <path d="${linha}" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>
    <line class="g-mira" id="mira" y1="${PT}" y2="${H - PB}"/>
    <circle class="g-bola" id="bola" r="5"/>
  </svg>`;

  const svg = area.querySelector("svg"), mira = $("#mira"), bola = $("#bola");
  function mostrar(i) {
    mira.setAttribute("x1", x(i)); mira.setAttribute("x2", x(i));
    bola.setAttribute("cx", x(i)); bola.setAttribute("cy", y(serie[i]));
    $("#grafico-dica").textContent = `${dataBR(dias[i])} · ${formatar(serie[i], para)} ${para}`;
  }
  svg.addEventListener("pointermove", (event) => {
    const caixa = svg.getBoundingClientRect();
    const px = (event.clientX - caixa.left) * (W / caixa.width);
    const i = Math.round((px - PE) / (W - PE - PD) * (serie.length - 1));
    mostrar(Math.max(0, Math.min(serie.length - 1, i)));
  });
  svg.addEventListener("pointerleave", () => mostrar(serie.length - 1));
  mostrar(serie.length - 1);

  const variacao = Conversao.variacaoPercentual(serie);
  const stats = [
    ["Variação no período", (variacao >= 0 ? "▲ +" : "▼ ") + variacao.toFixed(2).replace(".", ",") + "%", variacao >= 0 ? "alta" : "baixa"],
    ["Mínimo", `${formatar(min, para)} ${para}`, ""],
    ["Máximo", `${formatar(max, para)} ${para}`, ""],
  ];
  $("#grafico-stats").innerHTML = "";
  for (const [rotulo, valor, classe] of stats) {
    const caixa = document.createElement("div"); caixa.className = "stat";
    const r = document.createElement("div"); r.className = "rot"; r.textContent = rotulo;
    const v = document.createElement("div"); v.className = "val " + classe; v.textContent = valor;
    caixa.append(r, v);
    $("#grafico-stats").appendChild(caixa);
  }
}

function mudouPar() { renderizar(); atualizarGrafico(); }

// ---------- Ícones: bandeiras e logos ----------
const imagensCarregadas = new Map(); // url -> <img> já carregada (evita piscar a cada redesenho)

function urlIcone(codigo) {
  if (achar(codigo).tipo === "cripto") return estado.imagens[codigo] || null;
  const pais = PAISES[codigo];
  return pais ? `https://flagcdn.com/w80/${pais}.png` : null;
}

// Mostra as letras do código e, quando a imagem carregar, troca pela bandeira/logo.
// Se a imagem falhar (sem internet), as letras continuam ali.
function criarSelo(codigo) {
  const selo = document.createElement("span");
  selo.className = "selo";
  selo.textContent = codigo.slice(0, 4);
  const url = urlIcone(codigo);
  if (!url) return selo;

  if (imagensCarregadas.has(url)) {
    selo.textContent = "";
    selo.appendChild(imagensCarregadas.get(url).cloneNode());
    return selo;
  }
  const img = new Image();
  img.alt = "";
  img.onload = () => {
    imagensCarregadas.set(url, img);
    selo.textContent = "";
    selo.appendChild(img.cloneNode());
  };
  img.src = url;
  return selo;
}

function atualizarIcones() {
  for (const [id, codigo] of [["icone-de", selectDe.value], ["icone-para", selectPara.value]]) {
    const novo = criarSelo(codigo);
    novo.id = id;
    novo.classList.add("grande");
    $("#" + id).replaceWith(novo);
  }
}

// ---------- Variação e faixa de notícias ----------
function variacaoPara(a, b) {
  if (estimado(a)) return undefined;
  if (achar(a).tipo === "cripto") return estado.variacao24h[a];
  if (b === "BRL" && estado.brlAoVivo) return estado.variacaoBRL[a];
  return undefined;
}

function badgeVar(v) {
  if (typeof v !== "number" || Number.isNaN(v)) return null;
  const el = document.createElement("span");
  el.className = "var " + (v >= 0 ? "alta" : "baixa");
  el.textContent = (v >= 0 ? "▲ +" : "▼ ") + v.toFixed(2).replace(".", ",") + "%";
  return el;
}

const tickerInfo = { inicio: performance.now(), duracao: 60 };

function desenharTicker() {
  const trilho = $("#ticker");
  // Guardamos em que ponto da animação estávamos, para não "voltar ao início" a cada atualização
  const fase = ((performance.now() - tickerInfo.inicio) / 1000 % tickerInfo.duracao) / tickerInfo.duracao;

  function criarItens() {
    const fragmento = document.createDocumentFragment();
    for (const [a, b] of TICKER) {
      if (!temPreco(a) || !temPreco(b)) continue;
      const item = document.createElement("div");
      item.className = "t-item";
      const selo = criarSelo(a); selo.classList.add("pequeno");
      const par = document.createElement("span"); par.className = "par"; par.textContent = `${a}/${b}`;
      const ehEstimado = estimado(a) || estimado(b);
      const preco = document.createElement("span");
      preco.className = "preco" + (ehEstimado ? " estimado" : "");
      preco.textContent = (ehEstimado ? "~ " : "") + formatar(converter(1, a, b), b);
      item.append(selo, par, preco);
      const v = badgeVar(variacaoPara(a, b));
      if (v) item.appendChild(v);
      fragmento.appendChild(item);
    }
    return fragmento;
  }

  trilho.innerHTML = "";
  trilho.append(criarItens(), criarItens()); // duas cópias para a rolagem não ter buraco
  const duracao = Math.max(30, trilho.scrollWidth / 2 / 55); // ~55 pixels por segundo
  trilho.style.setProperty("--dur", duracao + "s");
  trilho.style.animationDelay = -(fase * duracao) + "s";
  tickerInfo.inicio = performance.now() - fase * duracao * 1000;
  tickerInfo.duracao = duracao;
}

// ---------- Alertas de preço ----------
const CHAVE_ALERTAS = "cambio:alertas";
let alertas = []; // cada alerta: { id, de, para, cond: "acima"|"abaixo", alvo, disparadoEm }

function salvarAlertas() {
  try { localStorage.setItem(CHAVE_ALERTAS, JSON.stringify(alertas)); } catch { /* sem armazenamento: segue sem salvar */ }
}

function carregarAlertas() {
  try {
    const salvos = JSON.parse(localStorage.getItem(CHAVE_ALERTAS));
    if (Array.isArray(salvos)) alertas = salvos.filter(a => achar(a.de) && achar(a.para) && Number(a.alvo) > 0);
  } catch { /* dados inválidos: começar do zero */ }
}

let notificacaoFalhou = false;

function textoNotificacao() {
  if (notificacaoFalhou) return "Não foi possível enviar a notificação do navegador. O aviso aparece só na página.";
  if (!("Notification" in window)) return "Este navegador não suporta notificações: o aviso aparece só na página.";
  return {
    granted: "Notificações do navegador: ativadas.",
    denied: "Notificações do navegador: bloqueadas. O aviso aparece só na página.",
    default: "Ao criar o primeiro alerta, o navegador vai pedir permissão para notificar.",
  }[Notification.permission];
}

let temporizadorToast;
function mostrarToast(mensagem) {
  const toast = $("#toast");
  toast.textContent = mensagem;
  toast.classList.add("visivel");
  clearTimeout(temporizadorToast);
  temporizadorToast = setTimeout(() => toast.classList.remove("visivel"), 12000);
}

function verificarAlertas() {
  const mensagens = [];
  for (const a of alertas) {
    if (a.disparadoEm) continue; // já avisou; precisa ser reativado
    if (!temPreco(a.de) || !temPreco(a.para)) continue;
    if (estimado(a.de) || estimado(a.para)) continue; // nunca dispara com cotação salva ou desatualizada
    const agora = converter(1, a.de, a.para);
    if (!Conversao.avaliarAlerta(a, agora)) continue;

    a.disparadoEm = new Date().toISOString();
    const mensagem = `🔔 ${a.de} em ${a.para} ficou ${a.cond} de ${formatar(a.alvo, a.para)}. Agora: ${formatar(agora, a.para)} ${a.para}`;
    mensagens.push(mensagem);
    if ("Notification" in window && Notification.permission === "granted") {
      try { new Notification("Alerta de preço", { body: mensagem }); } catch { notificacaoFalhou = true; /* alguns celulares exigem service worker */ }
    }
  }
  if (mensagens.length > 0) {
    mostrarToast(mensagens.join("\n"));
    document.title = "🔔 Alerta de preço · Câmbio";
    salvarAlertas();
    desenharAlertas();
  }
}

function desenharAlertas() {
  $("#alerta-notif").textContent = textoNotificacao();
  const pendentes = alertas.filter(a => !a.disparadoEm).length;
  $("#contador-alertas").textContent = pendentes || "";
  const de = $("#alerta-de").value, para = $("#alerta-para").value;
  $("#alerta-dica").textContent = de !== para && temPreco(de) && temPreco(para)
    ? `Agora: 1 ${de} = ${formatar(converter(1, de, para), para)} ${para}` : "";

  const ul = $("#alertas-lista");
  ul.innerHTML = "";
  if (alertas.length === 0) {
    const vazio = document.createElement("li");
    vazio.className = "vazio";
    vazio.textContent = "Nenhum alerta ainda. Crie o primeiro acima.";
    ul.appendChild(vazio);
    return;
  }

  for (const a of alertas) {
    const li = document.createElement("li");
    li.className = "alerta" + (a.disparadoEm ? " disparado" : "");

    const selo = criarSelo(a.de); selo.classList.add("pequeno");
    const info = document.createElement("div"); info.className = "alerta-info";
    const titulo = document.createElement("strong"); titulo.textContent = `${a.de} em ${a.para}`;
    const regra = document.createElement("span");
    regra.textContent = `${a.cond === "acima" ? "acima de" : "abaixo de"} ${formatar(a.alvo, a.para)} ${a.para}`;
    const atual = document.createElement("span");
    atual.textContent = !(temPreco(a.de) && temPreco(a.para)) ? ""
      : (estimado(a.de) || estimado(a.para)) ? "cotação desatualizada: alerta em pausa"
      : `agora: ${formatar(converter(1, a.de, a.para), a.para)} ${a.para}`;
    info.append(titulo, regra, atual);

    const pilula = document.createElement("span"); pilula.className = "pilula";
    pilula.textContent = a.disparadoEm
      ? "Disparado em " + new Date(a.disparadoEm).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
      : "Aguardando";

    li.append(selo, info, pilula);
    if (a.disparadoEm) li.appendChild(criarBotaoAlerta("Reativar", "reativar", a.id));
    li.appendChild(criarBotaoAlerta("Remover", "remover", a.id));
    ul.appendChild(li);
  }
}

function criarBotaoAlerta(texto, acao, id) {
  const botao = document.createElement("button");
  botao.type = "button"; botao.className = "btn-mini";
  botao.textContent = texto; botao.dataset.acao = acao; botao.dataset.id = id;
  return botao;
}

function iniciarAlertas() {
  for (const select of [$("#alerta-de"), $("#alerta-para")]) select.innerHTML = selectDe.innerHTML;
  $("#alerta-de").value = "USD";
  $("#alerta-para").value = "BRL";
  carregarAlertas();
  desenharAlertas();
}

$("#form-alerta").addEventListener("submit", (event) => {
  event.preventDefault(); // impede a página de recarregar
  const de = $("#alerta-de").value, para = $("#alerta-para").value;
  const cond = $("#alerta-cond").value, alvo = Conversao.lerNumero($("#alerta-valor").value);
  const erro = $("#alerta-erro");
  erro.textContent = "";

  if (de === para) { erro.textContent = "Escolha duas moedas diferentes."; return; }
  if (alvo === null || alvo <= 0) { erro.textContent = "Digite um valor maior que zero, como 6 ou 0,5."; return; }

  alertas.push({ id: Date.now(), de, para, cond, alvo, disparadoEm: null });
  salvarAlertas();
  $("#alerta-valor").value = "";

  // O navegador só aceita pedir permissão como resposta a um clique do usuário
  if ("Notification" in window && Notification.permission === "default") {
    Notification.requestPermission().then(desenharAlertas);
  }
  verificarAlertas();
  desenharAlertas();
});

$("#alertas-lista").addEventListener("click", (event) => {
  const botao = event.target.closest("button[data-acao]");
  if (!botao) return;
  const id = Number(botao.dataset.id);
  if (botao.dataset.acao === "remover") alertas = alertas.filter(a => a.id !== id);
  else { const a = alertas.find(x => x.id === id); if (a) a.disparadoEm = null; }
  salvarAlertas();
  desenharAlertas();
});

$("#alerta-de").addEventListener("change", desenharAlertas);
$("#alerta-para").addEventListener("change", desenharAlertas);
$("#toast").addEventListener("click", () => $("#toast").classList.remove("visivel"));
window.addEventListener("focus", () => { document.title = "Câmbio — moedas e criptomoedas"; });

// ---------- Tema claro / escuro ----------
// As cores usam light-dark(); basta trocar o color-scheme da página.
const CHAVE_TEMA = "cambio:tema";

function aplicarTema(tema) {
  document.documentElement.style.colorScheme = tema;
  $("#btn-tema").textContent = tema === "light" ? "Tema escuro" : "Tema claro";
}

function iniciarTema() {
  let tema = null;
  try { tema = localStorage.getItem(CHAVE_TEMA); } catch { /* sem armazenamento */ }
  if (tema !== "light" && tema !== "dark") tema = matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  aplicarTema(tema);
}

$("#btn-tema").addEventListener("click", () => {
  const novo = document.documentElement.style.colorScheme === "light" ? "dark" : "light";
  aplicarTema(novo);
  try { localStorage.setItem(CHAVE_TEMA, novo); } catch { /* segue sem salvar */ }
});

// ---------- Abas das seções secundárias ----------
$("#abas-sec").addEventListener("click", (event) => {
  const botao = event.target.closest(".aba-sec");
  if (!botao) return;
  document.querySelectorAll(".aba-sec").forEach(b => b.classList.toggle("ativa", b === botao));
  for (const id of ["sec-historico", "sec-alertas"]) $("#" + id).hidden = id !== botao.dataset.alvo;
  if (botao.dataset.alvo === "sec-historico") redesenharGrafico(); // a largura só existe com a seção visível
});

// ---------- 7. Selects ----------
function montarSelects() {
  for (const select of [selectDe, selectPara]) {
    for (const [titulo, tipo] of [["Moedas", "fiat"], ["Criptomoedas", "cripto"]]) {
      const grupo = document.createElement("optgroup");
      grupo.label = titulo;
      for (const a of ATIVOS.filter(x => x.tipo === tipo)) {
        const opcao = document.createElement("option");
        opcao.value = a.codigo;
        opcao.textContent = `${a.codigo} · ${a.nome}`;
        grupo.appendChild(opcao);
      }
      select.appendChild(grupo);
    }
  }
  selectDe.value = "BTC";
  selectPara.value = "BRL";
}

// ---------- 8. Eventos ----------
campoValor.addEventListener("input", renderizar);
selectDe.addEventListener("change", mudouPar);
selectPara.addEventListener("change", mudouPar);
$("#btn-atualizar").addEventListener("click", atualizarCotacoes);

$("#btn-trocar").addEventListener("click", () => {
  const antigo = selectDe.value;
  selectDe.value = selectPara.value;
  selectPara.value = antigo;
  mudouPar();
});

$("#busca").addEventListener("input", (event) => {
  estado.busca = event.target.value.trim();
  renderizar();
});

$("#abas").addEventListener("click", (event) => {
  const botao = event.target.closest(".aba");
  if (!botao) return;
  estado.aba = botao.dataset.aba;
  marcarBotoes();
  renderizar();
});

lista.addEventListener("click", (event) => {
  const botao = event.target.closest(".item");
  if (!botao) return;
  selectPara.value = botao.dataset.codigo;
  mudouPar();
});

$("#periodos").addEventListener("click", (event) => {
  const botao = event.target.closest(".aba");
  if (!botao) return;
  estado.periodo = Number(botao.dataset.dias);
  marcarBotoes();
  salvarPreferencias();
  atualizarGrafico();
});

// ---------- 9. Início ----------
iniciarTema();
montarSelects();
iniciarAlertas();
carregarPreferencias();
marcarBotoes();
restaurarCotacoesSalvas();
renderizar();
desenharTicker();
atualizarGrafico();
atualizarCotacoes();
setInterval(atualizarCotacoes, 60000);

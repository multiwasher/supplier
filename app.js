/* ========= CONFIG ========= */

// ⚠️ Troca pelo teu URL publicado (/exec)
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwMssg6887iz4sKFolhkXuHshkiY4zj0itH7ofOmmIjDbZS1Zfvf-mVw3iylpnZakdK/exec';

// meses PT -> número
const MES_NOMES = {
  'janeiro': 1, 'fevereiro': 2, 'março': 3, 'marco': 3, 'abril': 4,
  'maio': 5, 'junho': 6, 'julho': 7, 'agosto': 8,
  'setembro': 9, 'outubro': 10, 'novembro': 11, 'dezembro': 12
};

const MESES_ABREV = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const MESES_FULL = ['JANEIRO', 'FEVEREIRO', 'MARÇO', 'ABRIL', 'MAIO', 'JUNHO', 'JULHO', 'AGOSTO', 'SETEMBRO', 'OUTUBRO', 'NOVEMBRO', 'DEZEMBRO'];

if (window.Chart && window.ChartDataLabels) {
  Chart.register(ChartDataLabels);
}

/* ========= STATE ========= */

let sessionInfo = null;

let allData = [];            // tudo o que vem do Apps Script (AppSheet_Backend + Respostas do Formulário 1)
let selectedYears = [];
let selectedMonths = [];
let selectedEntidades = [];  // multi-select; vazio => "todas"

let charts = {};
let isFirstLoad = true;

let entidadesDisponiveis = [];      // cache das entidades existentes
let entidadesSelecionadasTemp = []; // seleção temporária dentro do modal

/* ========= HELPERS ========= */

function $(id) { return document.getElementById(id); }

function showSpinner(show) {
  const el = $('loadingSpinner');
  if (!el) return;
  el.classList.toggle('hidden', !show);
}

function normalizeString(v) {
  return (v ?? '').toString().trim();
}

function toLowerTrim(v) {
  return normalizeString(v).toLowerCase();
}

function parseYear(row) {
  const v = row?.['Ano'] ?? row?.['ANO'] ?? row?.['ano'];
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function parseMonth(row) {
  const v = row?.['Mês'] ?? row?.['MÊS'] ?? row?.['MES'] ?? row?.['mes'] ?? row?.['mês'];
  if (v === null || v === undefined || v === '') return null;

  const n = Number(v);
  if (Number.isFinite(n) && n >= 1 && n <= 12) return n;

  const key = toLowerTrim(v);
  return MES_NOMES[key] ?? null;
}

function getEntidade(row) {
  return normalizeString(row?.['Entidade'] ?? row?.['ENTIDADE'] ?? row?.['entidade']);
}

function getStatus(row) {
  return toLowerTrim(row?.['Status'] ?? row?.['STATUS'] ?? row?.['status']);
}

function getKeyword(row) {
  const v = row?.['KEYWORD'] ?? row?.['Keyword'] ?? row?.['keyword'];
  return normalizeString(v);
}

function getTempoPrevisto(row) {
  const v = row?.['Tempo Previsto de Resolução (min)'] ?? row?.['tempo_resolucao_min'];
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function unique(arr) {
  return [...new Set(arr)];
}

function getEntitiesForBreakdown(data) {
  // Admin: se não seleciona nada => "todas" => usa as entidades presentes nos dados filtrados
  const ents = (selectedEntidades && selectedEntidades.length > 0)
    ? selectedEntidades.slice()
    : unique((data || []).map(getEntidade).filter(Boolean));

  return ents.sort((a, b) => a.localeCompare(b));
}

// cores consistentes por entidade (hash simples) – minimalista / suave
function colorForEntity(ent, alpha = 0.45) {
  const s = (ent || '').toString();
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    hash = (hash * 31 + s.charCodeAt(i)) >>> 0;
  }

  const hue = hash % 360;
  const saturation = 22;  // suave
  const lightness = 60;   // claro

  return {
    bg: `hsla(${hue}, ${saturation}%, ${lightness}%, ${alpha})`,
    border: `hsla(${hue}, ${saturation}%, ${lightness - 10}%, 0.9)`
  };
}

function waitTwoFrames() {
  return new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
}

/* ========= AUTH / LOGIN ========= */

function showLoginError(msg) {
  const err = $('loginError');
  const btn = $('loginBtn');
  if (!err || !btn) return;
  err.innerText = msg;
  err.classList.remove('hidden');
  btn.disabled = false;
  btn.innerText = "Aceder ao Painel";
}

// ✅ sem headers para evitar preflight/CORS
async function postAction(payload) {
  const res = await fetch(APPS_SCRIPT_URL, {
    method: 'POST',
    body: JSON.stringify(payload)
  });

  const text = await res.text();
  let json;
  try { json = JSON.parse(text); }
  catch { throw new Error(`Resposta inválida do servidor (status ${res.status}).`); }

  return json;
}

async function handleLogin() {
  const user = normalizeString($('userInput')?.value);
  const pass = normalizeString($('passInput')?.value);
  const btn = $('loginBtn');

  if (!user || !pass) return showLoginError("Preenche os dois campos.");

  if (btn) {
    btn.disabled = true;
    btn.innerText = "A validar...";
  }

  try {
    const res = await postAction({ action: 'checkLogin', user, pass });
    if (!res?.success) return showLoginError(res?.message || "Credenciais inválidas.");

    sessionInfo = res;
    startDashboard();
  } catch (e) {
    showLoginError(`Erro de ligação: ${e.message}`);
  }
}

/* ========= DASHBOARD FLOW ========= */

function startDashboard() {
  $('loginView')?.classList.add('hidden');
  $('mainView')?.classList.remove('hidden');

  const welcome = $('userWelcome');
  if (welcome) welcome.innerText = `Entidade: ${sessionInfo?.username ?? '-'}`;

  // master vê filtro de entidades
  if (sessionInfo?.filter === 'all') $('entidadeFilterContainer')?.classList.remove('hidden');

  fetchData();
}

async function fetchData() {
  showSpinner(true);

  try {
    const data = await postAction({ action: 'getSheetData' });

    if (!data?.success) {
      allData = [];
      initFilters();
      updateDashboard();
      throw new Error(data?.message || "Falha ao obter dados.");
    }

    allData = Array.isArray(data.data) ? data.data : [];
    initFilters();
    updateDashboard();

  } catch (e) {
    console.error(e);
    allData = [];
    initFilters();
    updateDashboard();
  } finally {
    showSpinner(false);
  }
}

async function refreshData() {
  console.log('🔄 refreshData() INICIADO - Limpando apenas "Análise em Detalhe"');
  
  const icon = $('refreshIcon');
  const btn = $('refreshDataBtn');

  if (btn) {
    btn.disabled = true;
    btn.classList.add('opacity-75');
  }
  if (icon) icon.style.animation = 'spin 1.2s linear infinite';

  try {
    // Limpar apenas os dados salvos da "Análise em Detalhe"
    console.log('🗑️  Limpando dados salvos da "Análise em Detalhe"...');
    localStorage.removeItem('detailedAnalysisData');
    console.log('✅ Cache de "Análise em Detalhe" removida');
    
    // Destruir apenas os gráficos da "Análise em Detalhe"
    console.log('📊 Destruindo gráficos da "Análise em Detalhe"...');
    const detailChartIds = [
      'detailComparison1',               // Análise Detalhada: Ano 1
      'detailComparison2',               // Análise Detalhada: Ano 2
      'detailTrendComparison'            // Análise Detalhada: Comparação Tendências
    ];
    
    detailChartIds.forEach(chartKey => {
      if (charts[chartKey]) {
        console.log(`  🗑️  Destruindo gráfico: ${chartKey}`);
        charts[chartKey].destroy();
        charts[chartKey] = null;
      }
    });
    
    // Limpar canvas dos gráficos de detalhe
    const detailCanvasIds = ['detailComparisonChartYear1', 'detailComparisonChartYear2', 'detailTrendComparisonChart'];
    detailCanvasIds.forEach(canvasId => {
      const canvas = $(canvasId);
      if (canvas) {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        console.log(`  ⬜ Canvas limpo: ${canvasId}`);
      }
    });
    console.log('✅ Gráficos de "Análise em Detalhe" destruídos');
    
    // Resetar campos de "Análise em Detalhe"
    console.log('📝 Resetando campos de "Análise em Detalhe"...');
    const detailFields = [
      'detailAnalysisYear1', 'detailAnalysisYear2',
      'detailMWS200Year1', 'detailMWS300Year1', 'detailMWS500Year1', 'detailMWS700Year1', 'detailMWS715Year1',
      'detailMWS200Year2', 'detailMWS300Year2', 'detailMWS500Year2', 'detailMWS700Year2', 'detailMWS715Year2',
      'detailAnalysisText'
    ];
    
    detailFields.forEach(fieldId => {
      const field = $(fieldId);
      if (field) {
        field.value = '';
        console.log(`  ✓ Campo ${fieldId} resetado`);
      }
    });
    console.log('✅ Campos resetados');
    
    // Recriar os gráficos de detalhe com dados vazios
    console.log('📊 Recriando gráficos de "Análise em Detalhe"...');
    updateDetailedAnalysisComparisonChart();
    console.log('✅ Gráficos recriados');
    
    alert(`"Análise em Detalhe" atualizada com sucesso!`);
  } catch (e) {
    console.error(e);
    alert(`Erro ao atualizar: ${e.message}`);
  } finally {
    if (icon) icon.style.animation = 'none';
    if (btn) {
      btn.disabled = false;
      btn.classList.remove('opacity-75');
    }
  }
}

/* ========= FILTERS ========= */

function initFilters() {
  const currentYear = new Date().getFullYear();

  // anos disponíveis nos dados (para botões)
  const anosNosDados = unique(allData.map(parseYear).filter(Boolean)).sort((a, b) => b - a);

  // se não houver anos nos dados, cria fallback
  const anos = anosNosDados.length
    ? anosNosDados
    : Array.from({ length: (currentYear - 2022 + 1) }, (_, i) => 2022 + i).sort((a, b) => b - a);

  const mesesCompletos = [1,2,3,4,5,6,7,8,9,10,11,12];

  // =========================
  // 1) PRIMEIRA CARGA
  // =========================
  if (isFirstLoad) {
    // ✅ só ano corrente (se existir nos dados; se não existir, cai no mais recente disponível)
    const anoInicial = anosNosDados.includes(currentYear)
      ? currentYear
      : (anosNosDados[0] ?? currentYear);

    selectedYears = [anoInicial];
    selectedMonths = [...mesesCompletos];

    // ✅ se não for admin, lock à entidade do login
    if (sessionInfo?.filter !== 'all') {
      selectedEntidades = [sessionInfo?.filter].filter(Boolean);
    } else {
      selectedEntidades = [];
    }

    isFirstLoad = false;
  }

  // =========================
  // 2) ENTIDADES DISPONÍVEIS (com dados no período activo)
  // =========================
  const dataPeriodo = allData.filter(r => {
    const y = parseYear(r);
    const m = parseMonth(r);

    const passaAno = selectedYears.length === 0 || (y && selectedYears.includes(y));
    const passaMes = selectedMonths.length === 0 || (m && selectedMonths.includes(m));

    // se não for admin, só entidade do login
    remember: if (sessionInfo?.filter && sessionInfo.filter !== 'all') {
      return passaAno && passaMes && toLowerTrim(getEntidade(r)) === toLowerTrim(sessionInfo.filter);
    }

    return passaAno && passaMes;
  });

  // só entidades que EXISTEM e têm registos nesse período
  const entidadesPeriodo = unique(dataPeriodo.map(getEntidade).filter(Boolean))
    .sort((a, b) => a.localeCompare(b));

  if (sessionInfo?.filter === 'all') {
    entidadesDisponiveis = entidadesPeriodo.slice();

    // se admin tinha entidades selecionadas que já não existem no período, limpa-as
    if (selectedEntidades.length) {
      const setDisp = new Set(entidadesDisponiveis.map(toLowerTrim));
      selectedEntidades = selectedEntidades.filter(e => setDisp.has(toLowerTrim(e)));
    }

    renderEntidadeTags();
    renderEntidadeModalList(entidadesDisponiveis, selectedEntidades);
  } else {
    entidadesDisponiveis = entidadesPeriodo.slice();
  }

  // =========================
  // 3) RENDER BOTÕES ANOS
  // =========================
  const yearContainer = $('yearCheckboxes');
  if (yearContainer) {
    yearContainer.innerHTML = '';
    anos.forEach(ano => {
      const btn = document.createElement('button');
      btn.id = `year_${ano}`;
      btn.innerText = ano;

      const active = selectedYears.includes(ano);
      btn.className = active
        ? "px-4 py-1.5 rounded-xl text-[11px] font-black transition-all bg-blue-600 text-white shadow-sm"
        : "px-4 py-1.5 rounded-xl text-[11px] font-black transition-all bg-white text-slate-400 border border-slate-200 hover:bg-slate-50";

      btn.onclick = () => toggleYear(ano);
      yearContainer.appendChild(btn);
    });
  }

  // =========================
  // 4) RENDER BOTÕES MESES
  // =========================
  const monthContainer = $('monthCheckboxes');
  if (monthContainer) {
    monthContainer.innerHTML = '';
    mesesCompletos.forEach(m => {
      const btn = document.createElement('button');
      btn.id = `month_${m}`;
      btn.innerText = MESES_FULL[m - 1];

      const active = selectedMonths.includes(m);
      btn.className = active
        ? "px-4 py-1.5 rounded-xl text-[11px] font-black transition-all bg-purple-600 text-white shadow-sm"
        : "px-4 py-1.5 rounded-xl text-[11px] font-black transition-all bg-white text-slate-400 border border-slate-200 hover:bg-slate-50";

      btn.onclick = () => toggleMonth(m);
      monthContainer.appendChild(btn);
    });
  }
}

function toggleYear(ano) {
  ano = Number(ano);
  const btn = $(`year_${ano}`);

  if (selectedYears.includes(ano)) {
    selectedYears = selectedYears.filter(y => y !== ano);
    if (btn) btn.className = "px-4 py-1.5 rounded-xl text-[11px] font-black transition-all bg-white text-slate-400 border border-slate-200 hover:bg-slate-50";
  } else {
    selectedYears.push(ano);
    if (btn) btn.className = "px-4 py-1.5 rounded-xl text-[11px] font-black transition-all bg-blue-600 text-white shadow-sm";
  }

  initFilters();
  updateDashboard();
}

function toggleMonth(m) {
  const btn = $(`month_${m}`);

  if (selectedMonths.includes(m)) {
    selectedMonths = selectedMonths.filter(x => x !== m);
    if (btn) btn.className = "px-4 py-1.5 rounded-xl text-[11px] font-black transition-all bg-white text-slate-400 border border-slate-200 hover:bg-slate-50";
  } else {
    selectedMonths.push(m);
    if (btn) btn.className = "px-4 py-1.5 rounded-xl text-[11px] font-black transition-all bg-purple-600 text-white shadow-sm";
  }

  initFilters();
  updateDashboard();
}

/* ========= MAIN UPDATE ========= */

function filterData() {
  const entFilter = (selectedEntidades || []).map(toLowerTrim);

  return allData.filter(row => {
    const y = parseYear(row);
    const m = parseMonth(row);

    const passaAno = selectedYears.length === 0 || (y && selectedYears.includes(y));
    const passaMes = selectedMonths.length === 0 || (m && selectedMonths.includes(m));

    const ent = toLowerTrim(getEntidade(row));
    const passaEnt = entFilter.length === 0 || entFilter.includes(ent);

    // se não for admin, força sempre a entidade
    if (sessionInfo?.filter && sessionInfo.filter !== 'all') {
      const lock = toLowerTrim(sessionInfo.filter);
      if (ent !== lock) return false;
    }

    return passaAno && passaMes && passaEnt;
  });
}

/* ========= INSIGHTS / ANALYSIS ========= */

function generateInsights(data) {
  if (!data || data.length === 0) {
    renderInsights([]);
    return;
  }

  const insights = [];

  // 1) Status & Closure Rate
  const abertas = data.filter(d => getStatus(d) === 'aberto').length;
  const fechadas = data.filter(d => getStatus(d) === 'fechado').length;
  const taxa = data.length > 0 ? Math.round((fechadas / data.length) * 100) : 0;

  // Comparação entre anos se há múltiplos anos
  let textoComparacao = '';
  if (selectedYears && selectedYears.length > 1) {
    const yearsOrdenados = selectedYears.sort((a, b) => b - a);
    const anoMaisRecente = yearsOrdenados[0];
    const anoAnterior = yearsOrdenados[1];
    
    const dataRecente = data.filter(d => parseYear(d) === anoMaisRecente);
    const dataAnterior = data.filter(d => parseYear(d) === anoAnterior);
    
    if (dataRecente.length > 0 && dataAnterior.length > 0) {
      const fechadasRecente = dataRecente.filter(d => getStatus(d) === 'fechado').length;
      const taxaRecente = Math.round((fechadasRecente / dataRecente.length) * 100);
      
      const fechadasAnterior = dataAnterior.filter(d => getStatus(d) === 'fechado').length;
      const taxaAnterior = Math.round((fechadasAnterior / dataAnterior.length) * 100);
      
      const variacao = taxaRecente - taxaAnterior;
      textoComparacao = ` Em ${anoMaisRecente}: ${taxaRecente}% vs ${taxaAnterior}% em ${anoAnterior} (${variacao > 0 ? '+' : ''}${variacao}pp).`;
    }
  }

  if (taxa < 50) {
    insights.push({
      type: 'alert',
      icon: '⚠️',
      title: 'Taxa de Resolução Baixa',
      text: `Apenas ${taxa}% das RNCs foram fechadas. Considere revisar o processo de resolução.${textoComparacao}`
    });
  } else if (taxa >= 80) {
    insights.push({
      type: 'success',
      icon: '✅',
      title: 'Excelente Taxa de Resolução',
      text: `${taxa}% das RNCs foram fechadas. Ótimo desempenho!${textoComparacao}`
    });
  } else {
    insights.push({
      type: 'info',
      icon: 'ℹ️',
      title: 'Taxa de Resolução Moderada',
      text: `${taxa}% das RNCs foram fechadas. Há margem para melhorias.${textoComparacao}`
    });
  }

  // 2) Open RNCs Alert
  if (abertas > data.length * 0.4) {
    insights.push({
      type: 'alert',
      icon: '🔴',
      title: 'Muitas RNCs em Aberto',
      text: `${abertas} RNCs ainda estão abertas. Priorize o encerramento destas.`
    });
  }

  // 3) Average Resolution Time
  const tempos = data.map(getTempoPrevisto).filter(t => Number.isFinite(t) && t >= 0);
  if (tempos.length > 0) {
    const tempoMedio = Math.round(tempos.reduce((a, b) => a + b, 0) / tempos.length);
    
    // Comparação entre anos se há múltiplos anos
    let tempoComparacao = '';
    if (selectedYears && selectedYears.length > 1) {
      const yearsOrdenados = selectedYears.sort((a, b) => b - a);
      const anoMaisRecente = yearsOrdenados[0];
      const anoAnterior = yearsOrdenados[1];
      
      const dataRecente = data.filter(d => parseYear(d) === anoMaisRecente);
      const dataAnterior = data.filter(d => parseYear(d) === anoAnterior);
      
      const temposRecente = dataRecente.map(getTempoPrevisto).filter(t => Number.isFinite(t) && t >= 0);
      const temposAnterior = dataAnterior.map(getTempoPrevisto).filter(t => Number.isFinite(t) && t >= 0);
      
      if (temposRecente.length > 0 && temposAnterior.length > 0) {
        const tempoMedioRecente = Math.round(temposRecente.reduce((a, b) => a + b, 0) / temposRecente.length);
        const tempoMedioAnterior = Math.round(temposAnterior.reduce((a, b) => a + b, 0) / temposAnterior.length);
        const variacao = tempoMedioRecente - tempoMedioAnterior;
        const direcao = variacao < 0 ? '✓ Melhorado' : variacao > 0 ? '✗ Piorado' : 'Estável';
        tempoComparacao = ` ${anoMaisRecente}: ${tempoMedioRecente}min vs ${tempoMedioAnterior}min em ${anoAnterior} (${direcao}).`;
      }
    }
    
    if (tempoMedio > 480) { // > 8 horas
      insights.push({
        type: 'alert',
        icon: '⏱️',
        title: 'Tempo Médio de Resolução Elevado',
        text: `Tempo médio de ${tempoMedio} minutos (${Math.round(tempoMedio / 60)} horas). Considere otimizar o processo.${tempoComparacao}`
      });
    } else if (tempoMedio < 120) {
      insights.push({
        type: 'success',
        icon: '⚡',
        title: 'Resolução Rápida',
        text: `Tempo médio de ${tempoMedio} minutos. Excelente resposta!${tempoComparacao}`
      });
    }
  }

  // 4) Entity Performance
  const entidades = getEntitiesForBreakdown(data);
  if (entidades.length > 1) {
    const entidadeStats = entidades.map(ent => {
      const entData = data.filter(d => toLowerTrim(getEntidade(d)) === toLowerTrim(ent));
      const abertasEnt = entData.filter(d => getStatus(d) === 'aberto').length;
      const fechadasEnt = entData.filter(d => getStatus(d) === 'fechado').length;
      const taxaEnt = entData.length > 0 ? Math.round((fechadasEnt / entData.length) * 100) : 0;
      return { ent, total: entData.length, abertas: abertasEnt, taxa: taxaEnt };
    });

    const worst = entidadeStats.reduce((a, b) => a.taxa < b.taxa ? a : b);
    const best = entidadeStats.reduce((a, b) => a.taxa > b.taxa ? a : b);

    if (worst.taxa < 40 && worst.total > 2) {
      insights.push({
        type: 'alert',
        icon: '📊',
        title: 'Entidade com Baixa Performance',
        text: `${worst.ent} tem taxa de resolução de ${worst.taxa}%. Investigação recomendada.`
      });
    }

    if (best.taxa > 85 && best.total > 2) {
      insights.push({
        type: 'success',
        icon: '⭐',
        title: 'Melhor Performer',
        text: `${best.ent} lidera com ${best.taxa}% de taxa de resolução.`
      });
    }
  }

  // 5) Keywords Trend
  const keywords = data
    .map(getKeyword)
    .filter(Boolean)
    .reduce((acc, kw) => { acc[kw] = (acc[kw] || 0) + 1; return acc; }, {});

  const topKeywords = Object.entries(keywords)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  if (topKeywords.length > 0) {
    const topKw = topKeywords[0];
    
    // Comparação entre anos se há múltiplos anos
    let keywordComparacao = '';
    if (selectedYears && selectedYears.length > 1) {
      const yearsOrdenados = selectedYears.sort((a, b) => b - a);
      const anoMaisRecente = yearsOrdenados[0];
      const anoAnterior = yearsOrdenados[1];
      
      const dataRecente = data.filter(d => parseYear(d) === anoMaisRecente);
      const dataAnterior = data.filter(d => parseYear(d) === anoAnterior);
      
      const keywordsRecente = dataRecente
        .map(getKeyword)
        .filter(Boolean)
        .reduce((acc, kw) => { acc[kw] = (acc[kw] || 0) + 1; return acc; }, {});
      
      const topKeywordRecente = Object.entries(keywordsRecente)
        .sort((a, b) => b[1] - a[1])[0];
      
      const keywordsAnterior = dataAnterior
        .map(getKeyword)
        .filter(Boolean)
        .reduce((acc, kw) => { acc[kw] = (acc[kw] || 0) + 1; return acc; }, {});
      
      const topKeywordAnterior = Object.entries(keywordsAnterior)
        .sort((a, b) => b[1] - a[1])[0];
      
      if (topKeywordRecente && topKeywordAnterior) {
        const mesmoKeyword = topKw[0] === topKeywordRecente[0];
        if (mesmoKeyword) {
          keywordComparacao = ` Em ${anoMaisRecente}: ${topKeywordRecente[1]}x vs ${topKeywordAnterior[1]}x em ${anoAnterior}.`;
        } else {
          keywordComparacao = ` Em ${anoMaisRecente}: "${topKeywordRecente[0]}" (${topKeywordRecente[1]}x). Mudança face a ${anoAnterior}: "${topKeywordAnterior[0]}" (${topKeywordAnterior[1]}x).`;
        }
      }
    }
    
    insights.push({
      type: 'info',
      icon: '🏷️',
      title: 'Issue Mais Frequente',
      text: `"${topKw[0]}" aparece ${topKw[1]}x nos registos. Esta é a questão mais comum.${keywordComparacao}`
    });
  }

  // 6) Year-over-Year Comparison
  if (selectedYears && selectedYears.length > 1) {
    const dataByYear = {};
    selectedYears.forEach(year => {
      const yearData = data.filter(d => parseYear(d) === year);
      if (yearData.length > 0) {
        const yearFechadas = yearData.filter(d => getStatus(d) === 'fechado').length;
        const yearTaxa = Math.round((yearFechadas / yearData.length) * 100);
        dataByYear[year] = { total: yearData.length, taxa: yearTaxa };
      }
    });

    const yearsComDados = Object.keys(dataByYear).map(Number).sort();
    if (yearsComDados.length > 1) {
      const anos = yearsComDados.sort((a, b) => b - a); // Descendente: mais recente primeiro
      const anoMaisRecente = anos[0];
      const anoAnterior = anos[1];

      const taxaRecente = dataByYear[anoMaisRecente].taxa;
      const taxaAnterior = dataByYear[anoAnterior].taxa;
      const variacao = taxaRecente - taxaAnterior;
      const variacaoPercent = variacao === 0 ? 0 : Math.round((variacao / taxaAnterior) * 100);

      let insightType = 'info';
      let icon = '📈';
      let titulo = 'Comparação Entre Anos';
      let descricao = '';

      if (variacao > 0) {
        insightType = 'success';
        icon = '📈';
        titulo = 'Melhoria Year-over-Year';
        descricao = `${anoMaisRecente} apresenta taxa de ${taxaRecente}% vs ${taxaAnterior}% em ${anoAnterior}. Melhoria de +${variacaoPercent}%!`;
      } else if (variacao < 0) {
        insightType = 'alert';
        icon = '📉';
        titulo = 'Redução de Performance';
        descricao = `${anoMaisRecente} apresenta taxa de ${taxaRecente}% vs ${taxaAnterior}% em ${anoAnterior}. Queda de ${variacaoPercent}%. Atenção necessária.`;
      } else {
        insightType = 'info';
        icon = '➡️';
        titulo = 'Performance Estável';
        descricao = `${anoMaisRecente} mantém performance estável em ${taxaRecente}%, igual a ${anoAnterior}.`;
      }

      insights.push({
        type: insightType,
        icon: icon,
        title: titulo,
        text: descricao
      });
    }
  }

  // 7) Data Volume
  const entidadesUnicas = unique(data.map(getEntidade).filter(Boolean)).length;
  if (data.length < 5) {
    insights.push({
      type: 'info',
      icon: 'ℹ️',
      title: 'Dados Limitados',
      text: `Apenas ${data.length} registos encontrados. Mais dados permitirão análises mais robustas.`
    });
  }

  renderInsights(insights);
}

function renderInsights(insights) {
  const container = $('insightsList');
  if (!container) return;

  if (insights.length === 0) {
    container.innerHTML = '<p class="text-slate-500 text-center py-8">Nenhuma análise disponível para estes dados.</p>';
    return;
  }

  container.innerHTML = insights.map(insight => {
    const bgColor = {
      success: 'bg-green-50 border-l-4 border-green-500',
      alert: 'bg-red-50 border-l-4 border-red-500',
      info: 'bg-blue-50 border-l-4 border-blue-500'
    }[insight.type] || 'bg-slate-50';

    const textColor = {
      success: 'text-green-800',
      alert: 'text-red-800',
      info: 'text-blue-800'
    }[insight.type] || 'text-slate-800';

    return `
      <div class="p-4 rounded-lg ${bgColor}">
        <div class="flex items-start gap-3">
          <span class="text-2xl flex-shrink-0">${insight.icon}</span>
          <div class="flex-1">
            <h4 class="font-bold ${textColor} mb-1">${insight.title}</h4>
            <p class="text-sm ${textColor} opacity-85">${insight.text}</p>
          </div>
        </div>
      </div>
    `;
  }).join('');
}


function updateDashboard() {
  const filtered = filterData();

  // KPIs
  const abertas = filtered.filter(r => getStatus(r) === 'aberto').length;
  const fechadas = filtered.filter(r => getStatus(r) === 'fechado').length;
  const taxa = filtered.length > 0 ? Math.round((fechadas / filtered.length) * 100) : 0;

  if ($('kpiTotal')) $('kpiTotal').innerText = filtered.length;

  const entidadesAtivas = unique(filtered.map(getEntidade).filter(Boolean)).length;
  if ($('kpiEntidades')) $('kpiEntidades').innerText = entidadesAtivas;

  if ($('kpiAberto')) $('kpiAberto').innerText = abertas;
  if ($('kpiTaxa')) $('kpiTaxa').innerText = `${taxa}%`;

  // Charts
  renderTrendChart(filtered);
  renderPieChart(abertas, fechadas);
  renderYearComparisonChart(filtered);
  renderKeywordCharts(filtered);
  renderTopKeywordByYear(filtered);
  renderTempoResolucaoChart(filtered);

  // Update detailed analysis section
  updateDetailedAnalysisSection(filtered);

  // Generate automatic insights
  generateInsights(filtered);
}

/* ========= CHART HELPERS ========= */

function destroyChart(key) {
  if (charts[key]) {
    charts[key].destroy();
    charts[key] = null;
  }
}

/* ========= CHARTS ========= */

// 1) Tendência Mensal — 1 dataset por Ano (cores distintas)
function renderTrendChart(data) {
  const porAno = {};

  (data || []).forEach(row => {
    const ano = parseYear(row);
    const mes = parseMonth(row);
    if (!ano || !mes) return;

    if (!porAno[ano]) porAno[ano] = Array(12).fill(0);
    porAno[ano][mes - 1] += 1;
  });

  const anosOrdenados = Object.keys(porAno).map(Number).sort((a, b) => a - b);

  const paletaCores = [
    { bg: 'rgba(59, 130, 246, 0.25)', border: 'rgb(59, 130, 246)' },
    { bg: 'rgba(34, 197, 94, 0.25)', border: 'rgb(34, 197, 94)' },
    { bg: 'rgba(239, 68, 68, 0.25)', border: 'rgb(239, 68, 68)' },
    { bg: 'rgba(249, 115, 22, 0.25)', border: 'rgb(249, 115, 22)' },
    { bg: 'rgba(168, 85, 247, 0.25)', border: 'rgb(168, 85, 247)' },
    { bg: 'rgba(14, 165, 233, 0.25)', border: 'rgb(14, 165, 233)' },
    { bg: 'rgba(236, 72, 153, 0.25)', border: 'rgb(236, 72, 153)' },
    { bg: 'rgba(107, 114, 128, 0.25)', border: 'rgb(107, 114, 128)' }
  ];

  const datasets = anosOrdenados.map((ano, idx) => {
    const cor = paletaCores[idx % paletaCores.length];
    return {
      label: String(ano),
      data: porAno[ano],
      borderColor: cor.border,
      backgroundColor: cor.bg,
      tension: 0.35,
      fill: true,
      pointRadius: 2,
      pointHoverRadius: 4
    };
  });

  destroyChart('trend');

  const canvas = $('lineTrendChart');
  if (!canvas) return;

  charts.trend = new Chart(canvas, {
    type: 'line',
    data: { labels: MESES_ABREV, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 450 },
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          position: 'bottom',
          labels: { usePointStyle: true, pointStyle: 'circle', font: { weight: 'bold' } }
        },
        datalabels: { display: false }
      },
      scales: {
        y: { beginAtZero: true, title: { display: true, text: 'Número de RNCs' } },
        x: { grid: { display: false } }
      }
    }
  });
}

function renderPieChart(aberto, fechado) {
  destroyChart('pie');

  const canvas = $('rncPieChart');
  if (!canvas) return;

  charts.pie = new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels: ['Aberto', 'Fechado'],
      datasets: [{ data: [aberto, fechado], borderWidth: 0 }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 450 },
      cutout: '75%',
      plugins: {
        legend: { position: 'bottom' },
        datalabels: {
          font: { weight: 'bold', size: 14 },
          formatter: (value) => value
        }
      }
    }
  });
}

function renderYearComparisonChart(data) {
  const canvas = $('yearComparisonChart');
  if (!canvas) return;

  const years = unique((data || []).map(parseYear).filter(Boolean)).sort((a, b) => a - b);
  const entidades = unique((data || []).map(getEntidade).filter(Boolean)).sort((a, b) => a.localeCompare(b));

  const datasets = entidades.map(ent => {
    const cor = colorForEntity(ent, 0.45);
    const values = years.map(y => (data || []).filter(r => parseYear(r) === y && getEntidade(r) === ent).length);

    return {
      label: ent,
      data: values,
      backgroundColor: cor.bg,
      borderColor: cor.border,
      borderWidth: 1,
      borderRadius: 10,
      barThickness: 22
    };
  });

  destroyChart('yearBar');

  charts.yearBar = new Chart(canvas, {
    type: 'bar',
    data: { labels: years.map(String), datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 450 },
      interaction: { mode: 'point', intersect: true },
      plugins: {
        legend: {
          position: 'bottom',
          labels: { usePointStyle: true, pointStyle: 'circle', font: { weight: 'bold' } }
        },
        tooltip: {
          enabled: true,
          callbacks: { label: (context) => context.dataset.label }
        },
        datalabels: { display: false }
      },
      scales: {
        y: { beginAtZero: true, ticks: { stepSize: 1 } },
        x: { grid: { display: false } }
      }
    }
  });
}

// 2) Top 5 Keywords — por entidade (quando multi-entidade), senão por ano
function renderKeywordCharts(data) {
  const listContainer = $('keywordPercentageList');
  const canvas = $('topKeywordsChart');

  if (!data || data.length === 0) {
    if (listContainer) listContainer.innerHTML = '<p class="text-slate-400 text-sm text-center py-8">Sem dados</p>';
    destroyChart('kwTop');
    return;
  }

  const countsGlobal = data.reduce((acc, r) => {
    const kw = getKeyword(r);
    if (!kw) return acc;
    acc[kw] = (acc[kw] || 0) + 1;
    return acc;
  }, {});

  const sortedGlobal = Object.entries(countsGlobal).sort((a, b) => b[1] - a[1]);
  const total = data.length;

  if (listContainer) {
    listContainer.innerHTML = sortedGlobal.map(([kw, count]) => {
      const perc = total > 0 ? ((count / total) * 100).toFixed(1) : '0.0';
      return `
        <div class="animate-fade p-2 hover:bg-slate-50 rounded-xl">
          <div class="flex justify-between items-center mb-1">
            <span class="text-[10px] font-bold text-slate-700 truncate">${kw}</span>
            <span class="text-[9px] font-black text-slate-600">${perc}%</span>
          </div>
          <div class="w-full bg-slate-100 rounded-full h-1">
            <div class="bg-slate-400 h-1 rounded-full" style="width:${perc}%"></div>
          </div>
        </div>
      `;
    }).join('');
  }

  if (!canvas) return;

  const entidades = getEntitiesForBreakdown(data);
  const multiEntidade = entidades.length > 1;
  const top5Keywords = sortedGlobal.slice(0, 5).map(x => x[0]);

  destroyChart('kwTop');

  if (multiEntidade) {
    const datasets = entidades.map(ent => {
      const cor = colorForEntity(ent, 0.45);
      const values = top5Keywords.map(kw => data.filter(r => getEntidade(r) === ent && getKeyword(r) === kw).length);

      return {
        label: ent,
        data: values,
        backgroundColor: cor.bg,
        borderColor: cor.border,
        borderWidth: 1,
        borderRadius: 10
      };
    });

    charts.kwTop = new Chart(canvas, {
      type: 'bar',
      data: { labels: top5Keywords, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 450 },
        interaction: { mode: 'point', intersect: true },
        plugins: {
          legend: { position: 'bottom', labels: { usePointStyle: true, pointStyle: 'circle', font: { weight: 'bold' } } },
          tooltip: { enabled: true, callbacks: { label: (c) => c.dataset.label } },
          datalabels: { display: false }
        },
        scales: {
          y: { beginAtZero: true, ticks: { stepSize: 1 } },
          x: { grid: { display: false } }
        }
      }
    });

    return;
  }

  const anosPresentes = unique(
    data.map(parseYear).filter(y => y && (selectedYears.length === 0 || selectedYears.includes(y)))
  ).sort((a, b) => a - b);

  const paletaAnosCores = [
    { bg: 'rgba(59, 130, 246, 0.45)', border: 'rgb(59, 130, 246)' },
    { bg: 'rgba(34, 197, 94, 0.45)', border: 'rgb(34, 197, 94)' },
    { bg: 'rgba(239, 68, 68, 0.45)', border: 'rgb(239, 68, 68)' },
    { bg: 'rgba(249, 115, 22, 0.45)', border: 'rgb(249, 115, 22)' },
    { bg: 'rgba(168, 85, 247, 0.45)', border: 'rgb(168, 85, 247)' },
    { bg: 'rgba(14, 165, 233, 0.45)', border: 'rgb(14, 165, 233)' },
    { bg: 'rgba(236, 72, 153, 0.45)', border: 'rgb(236, 72, 153)' },
    { bg: 'rgba(107, 114, 128, 0.45)', border: 'rgb(107, 114, 128)' }
  ];

  const datasets = anosPresentes.map((ano, idx) => {
    const cor = paletaAnosCores[idx % paletaAnosCores.length];
    const yearCounts = top5Keywords.map(kw => data.filter(r => parseYear(r) === ano && getKeyword(r) === kw).length);

    return {
      label: String(ano),
      data: yearCounts,
      backgroundColor: cor.bg,
      borderColor: cor.border,
      borderWidth: 1,
      borderRadius: 10
    };
  });

  charts.kwTop = new Chart(canvas, {
    type: 'bar',
    data: { labels: top5Keywords, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 450 },
      interaction: { mode: 'point', intersect: true },
      plugins: {
        legend: { position: 'bottom', labels: { usePointStyle: true, pointStyle: 'circle', font: { weight: 'bold' } } },
        tooltip: { enabled: true, callbacks: { label: (c) => c.dataset.label } },
        datalabels: { display: false }
      },
      scales: {
        y: { beginAtZero: true, ticks: { stepSize: 1 } },
        x: { grid: { display: false } }
      }
    }
  });
}

// 2.5) Top Keyword por Ano — layout largo (não cresce em altura à toa)
function renderTopKeywordByYear(data) {
  const container = $('topKeywordByYearContainer');
  if (!container) return;

  if (!data || data.length === 0) {
    container.innerHTML = `<p class="text-slate-400 text-sm text-center py-6">Sem dados</p>`;
    return;
  }

  const years = unique(data.map(parseYear).filter(Boolean)).sort((a, b) => b - a);
  const entidades = getEntitiesForBreakdown(data);
  const multiEntidade = entidades.length > 1;

  function topKeywordFor(subset) {
    const counts = {};
    subset.forEach(r => {
      const kw = getKeyword(r);
      if (!kw) return;
      counts[kw] = (counts[kw] || 0) + 1;
    });
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    return sorted.length ? { kw: sorted[0][0], count: sorted[0][1] } : { kw: '-', count: 0 };
  }

  if (!multiEntidade) {
    const rows = years.map(y => {
      const subset = data.filter(r => parseYear(r) === y);
      const t = topKeywordFor(subset);

      return `
        <div class="p-4 rounded-2xl border border-slate-200 bg-slate-50">
          <div class="flex items-center justify-between">
            <p class="text-[11px] font-black text-slate-700">${y}</p>
            <p class="text-[10px] font-bold text-slate-400">${t.count}</p>
          </div>
          <p class="mt-2 text-sm font-black text-slate-800 truncate">${t.kw}</p>
        </div>
      `;
    }).join('');

    container.innerHTML = `<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-3">${rows}</div>`;
    return;
  }

  const blocks = years.map(y => {
    const entidadesOrdenadas = entidades
      .map(ent => {
        const subset = data.filter(r => parseYear(r) === y && getEntidade(r) === ent);
        return { ent, count: subset.length };
      })
      .sort((a, b) => b.count - a.count)
      .map(item => item.ent);

    const perEnt = entidadesOrdenadas.map(ent => {
      const subset = data.filter(r => parseYear(r) === y && getEntidade(r) === ent);
      const t = topKeywordFor(subset);
      const cor = colorForEntity(ent, 0.12);

      return `
        <div class="p-3 rounded-2xl border border-slate-200 bg-white" style="border-left:6px solid ${cor.border}">
          <div class="flex items-center justify-between">
            <p class="text-[11px] font-black text-slate-700 truncate">${ent}</p>
            <p class="text-[10px] font-bold text-slate-400">${t.count}</p>
          </div>
          <p class="mt-1 text-[12px] font-black text-slate-900 truncate">${t.kw}</p>
        </div>
      `;
    }).join('');

    return `
      <div class="p-4 rounded-3xl border border-slate-200 bg-slate-50">
        <div class="flex items-center justify-between mb-3">
          <p class="text-[12px] font-black text-slate-800">Ano ${y}</p>
          <p class="text-[10px] font-bold text-slate-400">${entidades.length} entidades</p>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          ${perEnt}
        </div>
      </div>
    `;
  }).join('');

  container.innerHTML = `<div class="space-y-4">${blocks}</div>`;
}

// 3) Tempo Previsto de Resolução (min) — histograma
function renderTempoResolucaoChart(data) {
  const canvas = $('tempoResolucaoChart');
  const statsEl = $('tempoResolucaoStats');
  if (!canvas) return;

  const entidades = getEntitiesForBreakdown(data);
  const multiEntidade = entidades.length > 1;

  const temposPorEnt = {};
  entidades.forEach(e => temposPorEnt[e] = []);

  data.forEach(r => {
    const ent = getEntidade(r);
    const t = getTempoPrevisto(r);
    if (!ent || !Number.isFinite(t) || t < 0) return;
    if (!temposPorEnt[ent]) temposPorEnt[ent] = [];
    temposPorEnt[ent].push(t);
  });

  const allTempos = Object.values(temposPorEnt).flat();

  if (!allTempos.length) {
    destroyChart('tempoResolucao');
    if (statsEl) {
      statsEl.innerHTML = `
        <div class="bg-slate-50 p-4 rounded-xl">
          <p class="text-slate-400 text-[9px] font-bold uppercase mb-2">Tempo Médio (min)</p>
          <p class="text-2xl font-black text-teal-600" id="tempoMedio">-</p>
        </div>
        <div class="bg-slate-50 p-4 rounded-xl">
          <p class="text-slate-400 text-[9px] font-bold uppercase mb-2">Tempo Máximo (min)</p>
          <p class="text-2xl font-black text-orange-600" id="tempoMaximo">-</p>
        </div>
        <div class="bg-slate-50 p-4 rounded-xl">
          <p class="text-slate-400 text-[9px] font-bold uppercase mb-2">Tempo Mínimo (min)</p>
          <p class="text-2xl font-black text-green-600" id="tempoMinimo">-</p>
        </div>
        <div class="bg-slate-50 p-4 rounded-xl">
          <p class="text-slate-400 text-[9px] font-bold uppercase mb-2">Desvio Padrão</p>
          <p class="text-2xl font-black text-blue-600" id="tempoDesvio">-</p>
        </div>
      `;
    }
    return;
  }

  const labels = ['0-20min', '20-40min', '40+min'];
  const getBinIndex = (tempo) => (tempo < 20 ? 0 : (tempo < 40 ? 1 : 2));

  const datasets = entidades.map(ent => {
    const tempos = temposPorEnt[ent] || [];
    const bins = Array(labels.length).fill(0);

    tempos.forEach(t => { bins[getBinIndex(t)] += 1; });

    const cor = colorForEntity(ent, 0.35);
    return {
      label: ent,
      data: bins,
      backgroundColor: cor.bg,
      borderColor: cor.border,
      borderWidth: 1,
      borderRadius: 8
    };
  });

  destroyChart('tempoResolucao');

  charts.tempoResolucao = new Chart(canvas, {
    type: 'bar',
    data: { labels, datasets: multiEntidade ? datasets : [datasets[0]] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 450 },
      interaction: { mode: 'point', intersect: true },
      plugins: {
        legend: multiEntidade
          ? { position: 'bottom', labels: { usePointStyle: true, pointStyle: 'circle', font: { weight: 'bold' } } }
          : { display: false },
        tooltip: { enabled: true, callbacks: { label: (c) => c.dataset.label } },
        datalabels: { display: false }
      },
      scales: {
        y: { beginAtZero: true, ticks: { stepSize: 1 } },
        x: { title: { display: true, text: 'Tempo Previsto de Resolução (minutos)' }, grid: { display: false } }
      }
    }
  });

  // stats (mantive o teu bloco original sem mexer)
  if (!statsEl) return;

  if (!multiEntidade) {
    const tempos = temposPorEnt[entidades[0]] || [];
    const media = tempos.reduce((a, b) => a + b, 0) / tempos.length;
    const max = Math.max(...tempos);
    const min = Math.min(...tempos);
    const variancia = tempos.reduce((s, t) => s + Math.pow(t - media, 2), 0) / tempos.length;
    const desvio = Math.sqrt(variancia);

    statsEl.innerHTML = `
      <div class="bg-slate-50 p-4 rounded-xl">
        <p class="text-slate-400 text-[9px] font-bold uppercase mb-2">Tempo Médio (min)</p>
        <p class="text-2xl font-black text-teal-600" id="tempoMedio">${Math.round(media)}</p>
      </div>
      <div class="bg-slate-50 p-4 rounded-xl">
        <p class="text-slate-400 text-[9px] font-bold uppercase mb-2">Tempo Máximo (min)</p>
        <p class="text-2xl font-black text-orange-600" id="tempoMaximo">${max}</p>
      </div>
      <div class="bg-slate-50 p-4 rounded-xl">
        <p class="text-slate-400 text-[9px] font-bold uppercase mb-2">Tempo Mínimo (min)</p>
        <p class="text-2xl font-black text-green-600" id="tempoMinimo">${min}</p>
      </div>
      <div class="bg-slate-50 p-4 rounded-xl">
        <p class="text-slate-400 text-[9px] font-bold uppercase mb-2">Desvio Padrão</p>
        <p class="text-2xl font-black text-blue-600" id="tempoDesvio">${desvio.toFixed(1)}</p>
      </div>
    `;
    return;
  }

  const cards = entidades.map(ent => {
    const tempos = temposPorEnt[ent] || [];
    const cor = colorForEntity(ent, 0.12);

    if (!tempos.length) {
      return `
        <div class="bg-slate-50 p-4 rounded-2xl border border-slate-200" style="border-left:6px solid ${cor.border}">
          <p class="text-[11px] font-black text-slate-700 mb-2">${ent}</p>
          <p class="text-slate-400 text-sm">Sem dados de tempo</p>
        </div>
      `;
    }

    const media = tempos.reduce((a, b) => a + b, 0) / tempos.length;
    const max = Math.max(...tempos);
    const min = Math.min(...tempos);
    const variancia = tempos.reduce((s, t) => s + Math.pow(t - media, 2), 0) / tempos.length;
    const desvio = Math.sqrt(variancia);

    return `
      <div class="bg-slate-50 p-4 rounded-2xl border border-slate-200" style="border-left:6px solid ${cor.border}">
        <div class="flex items-center justify-between mb-3">
          <p class="text-[11px] font-black text-slate-700">${ent}</p>
          <p class="text-[10px] font-bold text-slate-400">${tempos.length} registos</p>
        </div>

        <div class="grid grid-cols-2 gap-3">
          <div class="bg-white p-3 rounded-xl border border-slate-200">
            <p class="text-slate-400 text-[9px] font-bold uppercase mb-1">Médio (min)</p>
            <p class="text-xl font-black text-teal-600">${Math.round(media)}</p>
          </div>
          <div class="bg-white p-3 rounded-xl border border-slate-200">
            <p class="text-slate-400 text-[9px] font-bold uppercase mb-1">Máximo</p>
            <p class="text-xl font-black text-orange-600">${max}</p>
          </div>
          <div class="bg-white p-3 rounded-xl border border-slate-200">
            <p class="text-slate-400 text-[9px] font-bold uppercase mb-1">Mínimo</p>
            <p class="text-xl font-black text-green-600">${min}</p>
          </div>
          <div class="bg-white p-3 rounded-xl border border-slate-200">
            <p class="text-slate-400 text-[9px] font-bold uppercase mb-1">Desvio</p>
            <p class="text-xl font-black text-blue-600">${desvio.toFixed(1)}</p>
          </div>
        </div>
      </div>
    `;
  }).join('');

  statsEl.innerHTML = `<div class="col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4">${cards}</div>`;
}

/* ========= PDF EXPORT (centrado, sem corte à direita, 1 página A4 e a ocupar a altura toda) ========= */

function safeCanvasDataUrl(canvasId) {
  const c = document.getElementById(canvasId);
  if (!c || typeof c.toDataURL !== 'function') return '';
  try { return c.toDataURL('image/png'); }
  catch (e) {
    console.warn(`Falha ao exportar canvas ${canvasId}:`, e);
    return '';
  }
}

function kpiBox(title, value, color) {
  return `
    <div style="border:1px solid #e2e8f0; padding:10px; border-radius:8px; text-align:center; box-sizing:border-box;">
      <p style="margin:0; font-size:8px; color:#94a3b8; font-weight:700; text-transform:uppercase;">${title}</p>
      <p style="margin:4px 0 0 0; font-size:22px; font-weight:800; color:${color};">${value}</p>
    </div>
  `;
}

function imgCard(title, imgDataUrl, chartHeightPx = 120) {
  if (!imgDataUrl) {
    return `
      <div style="border:1px solid #e2e8f0; padding:8px; border-radius:8px; box-sizing:border-box;">
        <h3 style="margin:0 0 6px 0; font-size:10px; font-weight:700; border-bottom:1px solid #e2e8f0; padding-bottom:4px;">${title}</h3>
        <p style="margin:0; font-size:10px; color:#94a3b8;">(Gráfico indisponível)</p>
      </div>
    `;
  }

  return `
    <div style="border:1px solid #e2e8f0; padding:8px; border-radius:8px; box-sizing:border-box;">
      <h3 style="margin:0 0 6px 0; font-size:10px; font-weight:700; border-bottom:1px solid #e2e8f0; padding-bottom:4px;">${title}</h3>
      <div style="height:${chartHeightPx}px; width:100%; display:flex; align-items:center; justify-content:center; overflow:hidden;">
        <img src="${imgDataUrl}" style="max-width:100%; max-height:100%; width:auto; height:auto; object-fit:contain;">
      </div>
    </div>
  `;
}

/*async function exportarRelatorio() {
  const btn = $('exportPdfBtn');
  if (btn) { btn.disabled = true; btn.classList.add('opacity-75'); }

  let prevDPR = null;

  // A4 em mm
  const PAGE_W_MM = 210;
  const PAGE_H_MM = 297;

  // margem “visual” dentro do A4 (controlada por nós, e NÃO pelo html2pdf)
  const PAD_MM = 8;

  // área útil
  const CONTENT_H_MM = PAGE_H_MM - (2 * PAD_MM);

  // limites de auto-fit (para caber + preencher)
  const LIMITS = {
    row1: { min: 80,  max: 170 },  // Tendência + Status
    row2: { min: 85,  max: 175 },  // Ano + Top Keywords
    row3: { min: 85,  max: 175 }   // Tempo Previsto
  };

  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

  try {
    const filtered = filterData();

    // 1) estabiliza charts
    Object.values(charts || {}).forEach(ch => { try { ch?.update?.('none'); } catch {} });
    await waitTwoFrames();

    // 2) aumenta definição dos charts durante o export
    if (window.Chart?.defaults) {
      prevDPR = Chart.defaults.devicePixelRatio;
      Chart.defaults.devicePixelRatio = 3;
      Object.values(charts || {}).forEach(ch => { try { ch?.resize?.(); ch?.update?.('none'); } catch {} });
      await waitTwoFrames();
    }

    // 3) textos / KPIs
    const anosTexto = selectedYears.length ? selectedYears.slice().sort((a,b)=>a-b).join(', ') : 'Todos';
    const mesesTexto = selectedMonths.length
      ? selectedMonths.slice().sort((a,b)=>a-b).map(m => MESES_FULL[m - 1]).join(', ')
      : 'Todos';

    const entidadeTexto = (sessionInfo?.filter && sessionInfo.filter !== 'all')
      ? sessionInfo.filter
      : (selectedEntidades.length ? selectedEntidades.join(', ') : 'Todas');

    const periodoTexto = `${mesesTexto} (${anosTexto})`;

    const abertas = filtered.filter(d => getStatus(d) === 'aberto').length;
    const fechadas = filtered.filter(d => getStatus(d) === 'fechado').length;
    const taxa = filtered.length > 0 ? Math.round((fechadas / filtered.length) * 100) : 0;
    const entidadesUnicas = unique(filtered.map(getEntidade).filter(Boolean)).length;

    const tempos = filtered.map(getTempoPrevisto).filter(t => Number.isFinite(t) && t >= 0);
    const tempoMedio = tempos.length ? Math.round(tempos.reduce((a,b)=>a+b,0)/tempos.length) : '-';
    const tempoMax = tempos.length ? Math.max(...tempos) : '-';
    const tempoMin = tempos.length ? Math.min(...tempos) : '-';
    const tempoDesvio = (() => {
      if (!tempos.length) return '-';
      const m = tempos.reduce((a,b)=>a+b,0)/tempos.length;
      const v = tempos.reduce((s,t)=>s+Math.pow(t-m,2),0)/tempos.length;
      return Math.sqrt(v).toFixed(1);
    })();

    // 4) imagens (já em alta definição)
    const trendChartImg = safeCanvasDataUrl('lineTrendChart');
    const yearChartImg = safeCanvasDataUrl('yearComparisonChart');
    const pieChartImg = safeCanvasDataUrl('rncPieChart');
    const topKeywordsImg = safeCanvasDataUrl('topKeywordsChart');
    const tempoResolucaoImg = safeCanvasDataUrl('tempoResolucaoChart');

    // 5) Stage (NO VIEWPORT, sem cortar; invisível mas renderiza)
    const stage = document.createElement('div');
    stage.id = 'pdfStage';
    stage.style.position = 'fixed';
    stage.style.left = '0';
    stage.style.top = '0';
    stage.style.width = '100vw';
    stage.style.height = '100vh';
    stage.style.display = 'flex';
    stage.style.justifyContent = 'center';
    stage.style.alignItems = 'flex-start';
    stage.style.pointerEvents = 'none';
    stage.style.zIndex = '2147483647';
    stage.style.opacity = '0.001';     // ✅ não “hidden” (hidden = html2canvas ignora em muitos casos)
    stage.style.background = '#fff';
    document.body.appendChild(stage);

    // wrapper com TAMANHO EXACTO A4 (isto resolve o “corta à direita”)
    const wrapper = document.createElement('div');
    wrapper.style.width = `${PAGE_W_MM}mm`;
    wrapper.style.height = `${PAGE_H_MM}mm`;
    wrapper.style.background = '#fff';
    wrapper.style.boxSizing = 'border-box';
    wrapper.style.padding = `${PAD_MM}mm`;
    wrapper.style.overflow = 'hidden';
    stage.appendChild(wrapper);

    // alturas (vamos ajustar)
    let hRow1 = 118;
    let hRow2 = 128;
    let hRow3 = 128;

    const buildHtml = () => `
      <style>
        #pdfRoot, #pdfRoot * { box-sizing: border-box; }
        #pdfRoot { width:100%; max-width:100%; overflow:hidden; font-family: Arial, sans-serif; background:#fff; color:#0f172a; }
        .pdfRow { margin-bottom:8px; }
      </style>

      <div id="pdfRoot">
        <div style="margin-bottom:10px; padding-bottom:8px; border-bottom:3px solid #0f172a;">
          <div style="display:flex; align-items:center; gap:10px; margin-bottom:6px;">
            <img src="https://static.wixstatic.com/media/a6967f_4036f3eb3c1b4a47988293dd3da29925~mv2.png" style="height:32px;">
          </div>
          <h1 style="margin:0; font-size:18px; font-weight:700;">Dashboard de Qualidade</h1>
          <p style="margin:2px 0 0 0; font-size:11px; color:#64748b;">Sistema de Análise de Não Conformidades</p>
        </div>

        <div class="pdfRow" style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; font-size:10px;">
          <div style="background:#f1f5f9; padding:8px; border-radius:6px; border-left:3px solid #3b82f6;">
            <p style="margin:0; font-weight:700; font-size:8px; text-transform:uppercase; color:#64748b;">Entidade</p>
            <p style="margin:3px 0 0 0; font-weight:700; font-size:11px; line-height:1.2;">${entidadeTexto}</p>
          </div>
          <div style="background:#f1f5f9; padding:8px; border-radius:6px; border-left:3px solid #8b5cf6;">
            <p style="margin:0; font-weight:700; font-size:8px; text-transform:uppercase; color:#64748b;">Período</p>
            <p style="margin:3px 0 0 0; font-weight:700; font-size:9px; line-height:1.3;">${periodoTexto}</p>
          </div>
        </div>

        <div class="pdfRow" style="display:grid; grid-template-columns: repeat(4, 1fr); gap:8px;">
          ${kpiBox('Total Registos', filtered.length, '#0f172a')}
          ${kpiBox('Entidades Ativas', entidadesUnicas, '#2563eb')}
          ${kpiBox('RNCs em Aberto', abertas, '#ef4444')}
          ${kpiBox('Taxa de Resolução', taxa + '%', '#16a34a')}
        </div>

        <div class="pdfRow" style="display:grid; grid-template-columns: 2fr 1fr; gap:10px;">
          ${imgCard('Tendência Mensal (por Ano)', trendChartImg, hRow1)}
          ${imgCard('Status Geral RNCs', pieChartImg, hRow1)}
        </div>

        <div class="pdfRow" style="display:grid; grid-template-columns: 1fr 1fr; gap:10px;">
          ${imgCard('Total RNCs por Ano', yearChartImg, hRow2)}
          ${imgCard('Top 5 Keywords', topKeywordsImg, hRow2)}
        </div>

        <div class="pdfRow" style="display:grid; grid-template-columns: 1fr 1fr; gap:10px;">
          ${imgCard('Tempo Previsto de Resolução', tempoResolucaoImg, hRow3)}
          <div style="border:1px solid #e2e8f0; padding:8px; border-radius:8px; box-sizing:border-box;">
            <h3 style="margin:0 0 8px 0; font-size:10px; font-weight:700; border-bottom:1px solid #e2e8f0; padding-bottom:4px;">
              Estatísticas de Resolução
            </h3>
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:8px;">
              ${kpiBox('Tempo Médio (min)', tempoMedio, '#0f766e')}
              ${kpiBox('Tempo Máximo (min)', tempoMax, '#ea580c')}
              ${kpiBox('Tempo Mínimo (min)', tempoMin, '#16a34a')}
              ${kpiBox('Desvio Padrão', tempoDesvio, '#2563eb')}
            </div>
          </div>
        </div>

        <div style="margin-top:6px; display:flex; justify-content:flex-end;">
          <img src="https://static.wixstatic.com/media/a6967f_0db968f0a9864debae3bd716ad0ebeb6~mv2.png" style="height:20px; opacity:0.75;">
        </div>
      </div>
    `;

    wrapper.innerHTML = buildHtml();
    await waitTwoFrames();

    // aguarda fontes + imagens
    if (document.fonts?.ready) await document.fonts.ready;
    const imgs = Array.from(wrapper.querySelectorAll('img'));
    await Promise.all(imgs.map(img => {
      if (img.complete && img.naturalWidth > 0) return Promise.resolve();
      return new Promise(resolve => { img.onload = resolve; img.onerror = resolve; });
    }));
    await waitTwoFrames();

    const root = wrapper.querySelector('#pdfRoot');

    // alvo de altura em px: usa mm->px real da largura renderizada (sem supor 96dpi)
    const pxPerMm = wrapper.getBoundingClientRect().width / PAGE_W_MM;
    const targetHeightPx = CONTENT_H_MM * pxPerMm;

    // AUTO-FIT: encolhe se excede; aumenta se sobra espaço (para ocupar a altura toda)
    for (let i = 0; i < 12; i++) {
      const currentH = root.scrollHeight;
      const diff = targetHeightPx - currentH;

      if (Math.abs(diff) < 6) break;

      // ajuste suave (evita “ping-pong”)
      const step = diff * 0.35;

      hRow1 = clamp(Math.round(hRow1 + step * 0.45), LIMITS.row1.min, LIMITS.row1.max);
      hRow2 = clamp(Math.round(hRow2 + step * 0.30), LIMITS.row2.min, LIMITS.row2.max);
      hRow3 = clamp(Math.round(hRow3 + step * 0.25), LIMITS.row3.min, LIMITS.row3.max);

      wrapper.innerHTML = buildHtml();
      await waitTwoFrames();
    }

    // 6) Export: SEM margens do html2pdf (porque o wrapper já tem padding interno)
    const opt = {
      margin: 0,
      filename: `Relatorio_Qualidade_${new Date().toISOString().slice(0,10)}.pdf`,
      image: { type: 'png' },
      html2canvas: {
        scale: 3,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
        scrollX: 0,
        scrollY: 0,
        windowWidth: Math.ceil(wrapper.getBoundingClientRect().width),
        windowHeight: Math.ceil(wrapper.getBoundingClientRect().height)
      },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      pagebreak: { mode: ['avoid-all'], before: [] }
    };

    await html2pdf().set(opt).from(wrapper).save();

    document.body.removeChild(stage);

  } catch (e) {
    console.error(e);
    alert(`Erro ao exportar PDF: ${e.message}`);
  } finally {
    if (prevDPR !== null && window.Chart?.defaults) {
      Chart.defaults.devicePixelRatio = prevDPR;
      Object.values(charts || {}).forEach(ch => { try { ch?.resize?.(); ch?.update?.('none'); } catch {} });
    }
    if (btn) { btn.disabled = false; btn.classList.remove('opacity-75'); }
  }
}*/

/*async function exportarRelatorio() {
  const btn = $('exportPdfBtn');
  if (btn) { btn.disabled = true; btn.classList.add('opacity-75'); }

  let prevDPR = null;
  let stage = null;

  // A4
  const PAGE_W_MM = 210;
  const PAGE_H_MM = 297;
  const PAD_MM = 8;
  const CONTENT_W_MM = PAGE_W_MM - (2 * PAD_MM);
  const CONTENT_H_MM = PAGE_H_MM - (2 * PAD_MM);

  // px fixos (layout estável)
  const PX_PER_MM = 96 / 25.4;
  const PAGE_W_PX = Math.round(PAGE_W_MM * PX_PER_MM);
  const PAGE_H_PX = Math.round(PAGE_H_MM * PX_PER_MM);
  const PAD_PX = Math.round(PAD_MM * PX_PER_MM);

  const LIMITS = {
    row1: { min: 80,  max: 170 },
    row2: { min: 85,  max: 175 },
    row3: { min: 85,  max: 175 }
  };
  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

  // lock scroll
  const oldScrollX = window.scrollX || window.pageXOffset || 0;
  const oldScrollY = window.scrollY || window.pageYOffset || 0;
  const prevOverflowHtml = document.documentElement.style.overflow;
  const prevOverflowBody = document.body.style.overflow;

  try {
    if (typeof html2canvas !== 'function') {
      throw new Error('html2canvas não está carregado. Verifica o <script> no index.html.');
    }
    if (!window.jspdf?.jsPDF) {
      throw new Error('jsPDF não está carregado (window.jspdf.jsPDF). Verifica o <script> do jsPDF.');
    }

    const filtered = filterData();

    // 1) estabiliza charts
    Object.values(charts || {}).forEach(ch => { try { ch?.update?.('none'); } catch {} });
    await waitTwoFrames();

    // 2) aumenta definição dos charts durante o export
    if (window.Chart?.defaults) {
      prevDPR = Chart.defaults.devicePixelRatio;
      Chart.defaults.devicePixelRatio = 3;
      Object.values(charts || {}).forEach(ch => { try { ch?.resize?.(); ch?.update?.('none'); } catch {} });
      await waitTwoFrames();
    }

    // 3) textos / KPIs
    const anosTexto = selectedYears.length ? selectedYears.slice().sort((a,b)=>a-b).join(', ') : 'Todos';
    const mesesTexto = selectedMonths.length
      ? selectedMonths.slice().sort((a,b)=>a-b).map(m => MESES_FULL[m - 1]).join(', ')
      : 'Todos';

    const entidadeTexto = (sessionInfo?.filter && sessionInfo.filter !== 'all')
      ? sessionInfo.filter
      : (selectedEntidades.length ? selectedEntidades.join(', ') : 'Todas');

    const periodoTexto = `${mesesTexto} (${anosTexto})`;

    const abertas = filtered.filter(d => getStatus(d) === 'aberto').length;
    const fechadas = filtered.filter(d => getStatus(d) === 'fechado').length;
    const taxa = filtered.length > 0 ? Math.round((fechadas / filtered.length) * 100) : 0;
    const entidadesUnicas = unique(filtered.map(getEntidade).filter(Boolean)).length;

    const tempos = filtered.map(getTempoPrevisto).filter(t => Number.isFinite(t) && t >= 0);
    const tempoMedio = tempos.length ? Math.round(tempos.reduce((a,b)=>a+b,0)/tempos.length) : '-';
    const tempoMax = tempos.length ? Math.max(...tempos) : '-';
    const tempoMin = tempos.length ? Math.min(...tempos) : '-';
    const tempoDesvio = (() => {
      if (!tempos.length) return '-';
      const m = tempos.reduce((a,b)=>a+b,0)/tempos.length;
      const v = tempos.reduce((s,t)=>s+Math.pow(t-m,2),0)/tempos.length;
      return Math.sqrt(v).toFixed(1);
    })();

    // 4) imagens dos charts
    const trendChartImg = safeCanvasDataUrl('lineTrendChart');
    const yearChartImg = safeCanvasDataUrl('yearComparisonChart');
    const pieChartImg = safeCanvasDataUrl('rncPieChart');
    const topKeywordsImg = safeCanvasDataUrl('topKeywordsChart');
    const tempoResolucaoImg = safeCanvasDataUrl('tempoResolucaoChart');

    // 5) congela scroll / topo
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    window.scrollTo(0, 0);
    await waitTwoFrames();

    // 6) stage no viewport, sem flex
    stage = document.createElement('div');
    stage.id = 'pdfStage';
    stage.style.position = 'fixed';
    stage.style.left = '0';
    stage.style.top = '0';
    stage.style.width = `${PAGE_W_PX}px`;
    stage.style.height = `${PAGE_H_PX}px`;
    stage.style.background = '#fff';
    stage.style.zIndex = '2147483647';
    stage.style.pointerEvents = 'none';
    stage.style.opacity = '0.01';
    stage.style.overflow = 'hidden';
    stage.style.transform = 'none';
    stage.style.zoom = '1';
    document.body.appendChild(stage);

    const wrapper = document.createElement('div');
    wrapper.id = 'pdfWrapper';
    wrapper.style.position = 'absolute';
    wrapper.style.left = '0';
    wrapper.style.top = '0';
    wrapper.style.width = `${PAGE_W_PX}px`;
    wrapper.style.height = `${PAGE_H_PX}px`;
    wrapper.style.background = '#fff';
    wrapper.style.boxSizing = 'border-box';
    wrapper.style.padding = `${PAD_PX}px`;
    wrapper.style.overflow = 'hidden';
    wrapper.style.transform = 'none';
    wrapper.style.zoom = '1';
    stage.appendChild(wrapper);

    // alturas a ajustar
    let hRow1 = 118;
    let hRow2 = 128;
    let hRow3 = 128;

    const buildHtml = () => `
      <style>
        #pdfRoot, #pdfRoot * { box-sizing: border-box; }
        #pdfRoot { width:100%; max-width:100%; overflow:hidden; font-family: Arial, sans-serif; background:#fff; color:#0f172a; }
        .pdfRow { margin-bottom:8px; }
      </style>

      <div id="pdfRoot">
        <div style="margin-bottom:10px; padding-bottom:8px; border-bottom:3px solid #0f172a;">
          <div style="display:flex; align-items:center; gap:10px; margin-bottom:6px;">
            <img src="https://static.wixstatic.com/media/a6967f_4036f3eb3c1b4a47988293dd3da29925~mv2.png" style="height:32px;">
          </div>
          <h1 style="margin:0; font-size:18px; font-weight:700;">Dashboard de Qualidade</h1>
          <p style="margin:2px 0 0 0; font-size:11px; color:#64748b;">Sistema de Análise de Não Conformidades</p>
        </div>

        <div class="pdfRow" style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; font-size:10px;">
          <div style="background:#f1f5f9; padding:8px; border-radius:6px; border-left:3px solid #3b82f6;">
            <p style="margin:0; font-weight:700; font-size:8px; text-transform:uppercase; color:#64748b;">Entidade</p>
            <p style="margin:3px 0 0 0; font-weight:700; font-size:11px; line-height:1.2;">${entidadeTexto}</p>
          </div>
          <div style="background:#f1f5f9; padding:8px; border-radius:6px; border-left:3px solid #8b5cf6;">
            <p style="margin:0; font-weight:700; font-size:8px; text-transform:uppercase; color:#64748b;">Período</p>
            <p style="margin:3px 0 0 0; font-weight:700; font-size:9px; line-height:1.3;">${periodoTexto}</p>
          </div>
        </div>

        <div class="pdfRow" style="display:grid; grid-template-columns: repeat(4, 1fr); gap:8px;">
          ${kpiBox('Total Registos', filtered.length, '#0f172a')}
          ${kpiBox('Entidades Ativas', entidadesUnicas, '#2563eb')}
          ${kpiBox('RNCs em Aberto', abertas, '#ef4444')}
          ${kpiBox('Taxa de Resolução', taxa + '%', '#16a34a')}
        </div>

        <div class="pdfRow" style="display:grid; grid-template-columns: 2fr 1fr; gap:10px;">
          ${imgCard('Tendência Mensal (por Ano)', trendChartImg, hRow1)}
          ${imgCard('Status Geral RNCs', pieChartImg, hRow1)}
        </div>

        <div class="pdfRow" style="display:grid; grid-template-columns: 1fr 1fr; gap:10px;">
          ${imgCard('Total RNCs por Ano', yearChartImg, hRow2)}
          ${imgCard('Top 5 Keywords', topKeywordsImg, hRow2)}
        </div>

        <div class="pdfRow" style="display:grid; grid-template-columns: 1fr 1fr; gap:10px;">
          ${imgCard('Tempo Previsto de Resolução', tempoResolucaoImg, hRow3)}
          <div style="border:1px solid #e2e8f0; padding:8px; border-radius:8px; box-sizing:border-box;">
            <h3 style="margin:0 0 8px 0; font-size:10px; font-weight:700; border-bottom:1px solid #e2e8f0; padding-bottom:4px;">
              Estatísticas de Resolução
            </h3>
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:8px;">
              ${kpiBox('Tempo Médio (min)', tempoMedio, '#0f766e')}
              ${kpiBox('Tempo Máximo (min)', tempoMax, '#ea580c')}
              ${kpiBox('Tempo Mínimo (min)', tempoMin, '#16a34a')}
              ${kpiBox('Desvio Padrão', tempoDesvio, '#2563eb')}
            </div>
          </div>
        </div>

        <div style="margin-top:6px; display:flex; justify-content:flex-end;">
          <img src="https://static.wixstatic.com/media/a6967f_0db968f0a9864debae3bd716ad0ebeb6~mv2.png" style="height:20px; opacity:0.75;">
        </div>
      </div>
    `;

    wrapper.innerHTML = buildHtml();
    await waitTwoFrames();

    // aguarda fontes + imagens
    if (document.fonts?.ready) await document.fonts.ready;
    const imgs = Array.from(wrapper.querySelectorAll('img'));
    await Promise.all(imgs.map(img => {
      if (img.complete && img.naturalWidth > 0) return Promise.resolve();
      return new Promise(resolve => { img.onload = resolve; img.onerror = resolve; });
    }));
    await waitTwoFrames();

    // AUTO-FIT altura
    let root = wrapper.querySelector('#pdfRoot');
    const targetHeightPx = Math.round(CONTENT_H_MM * PX_PER_MM);

    for (let i = 0; i < 12; i++) {
      const currentH = root.scrollHeight;
      const diff = targetHeightPx - currentH;
      if (Math.abs(diff) < 6) break;

      const step = diff * 0.35;
      hRow1 = clamp(Math.round(hRow1 + step * 0.45), LIMITS.row1.min, LIMITS.row1.max);
      hRow2 = clamp(Math.round(hRow2 + step * 0.30), LIMITS.row2.min, LIMITS.row2.max);
      hRow3 = clamp(Math.round(hRow3 + step * 0.25), LIMITS.row3.min, LIMITS.row3.max);

      wrapper.innerHTML = buildHtml();
      await waitTwoFrames();
      root = wrapper.querySelector('#pdfRoot');
    }

    // 7) CAPTURA: html2canvas directo (aqui é que acaba o "corte")
    const canvas = await html2canvas(wrapper, {
      backgroundColor: '#ffffff',
      scale: 3,
      useCORS: true,
      allowTaint: true,

      // ✅ compensação que evita "fatia à esquerda"
      scrollX: -oldScrollX,
      scrollY: -oldScrollY,

      // ✅ força o tamanho exacto do wrapper
      width: PAGE_W_PX,
      height: PAGE_H_PX,
      windowWidth: PAGE_W_PX,
      windowHeight: PAGE_H_PX
    });

    const imgData = canvas.toDataURL('image/png', 1.0);

    // 8) PDF: addImage exactamente no A4 (com padding em mm)
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });

    // Page 1: Main dashboard
    pdf.addImage(imgData, 'PNG', PAD_MM, PAD_MM, CONTENT_W_MM, CONTENT_H_MM, undefined, 'FAST');

    // Page 2: Detailed Analysis
    pdf.addPage();
    
    const stage2Canvas = document.createElement('div');
    stage2Canvas.id = 'pdfStage2';
    stage2Canvas.style.position = 'fixed';
    stage2Canvas.style.left = '0';
    stage2Canvas.style.top = '0';
    stage2Canvas.style.width = `${PAGE_W_PX}px`;
    stage2Canvas.style.height = `${PAGE_H_PX}px`;
    stage2Canvas.style.background = '#fff';
    stage2Canvas.style.zIndex = '2147483646';
    stage2Canvas.style.pointerEvents = 'none';
    stage2Canvas.style.opacity = '0.01';
    stage2Canvas.style.overflow = 'hidden';
    stage2Canvas.style.transform = 'none';
    stage2Canvas.style.zoom = '1';
    document.body.appendChild(stage2Canvas);

    const wrapper2 = document.createElement('div');
    wrapper2.id = 'pdfWrapper2';
    wrapper2.style.position = 'absolute';
    wrapper2.style.left = '0';
    wrapper2.style.top = '0';
    wrapper2.style.width = `${PAGE_W_PX}px`;
    wrapper2.style.height = `${PAGE_H_PX}px`;
    wrapper2.style.background = '#fff';
    wrapper2.style.boxSizing = 'border-box';
    wrapper2.style.padding = `${PAD_PX}px`;
    wrapper2.style.overflow = 'hidden';
    wrapper2.style.transform = 'none';
    wrapper2.style.zoom = '1';
    stage2Canvas.appendChild(wrapper2);

    // Get selected years for PDF labels
    const pdfYear1 = $('detailYear1Select')?.value || 'Ano 1';
    const pdfYear2 = $('detailYear2Select')?.value || 'Ano 2';
    const pdfYear1Label = `Ano ${pdfYear1}`;
    const pdfYear2Label = `Ano ${pdfYear2}`;
    const pdfTrendTitle = `Comparação de Tendências - ${pdfYear1Label} vs ${pdfYear2Label}`;

    const buildHtml2 = () => `
      <style>
        #pdfRoot2, #pdfRoot2 * { box-sizing: border-box; }
        #pdfRoot2 { width:100%; max-width:100%; overflow:hidden; font-family: Arial, sans-serif; background:#fff; color:#0f172a; }
        .pdfRow2 { margin-bottom:8px; }
      </style>
      <div id="pdfRoot2">
        <div style="margin-bottom:10px; padding-bottom:8px; border-bottom:3px solid #0f172a;">
          <h2 style="margin:0; font-size:16px; font-weight:700; display:flex; align-items:center; gap:6px;">
            <span style="width:8px; height:8px; background:#a855f7; border-radius:50%;"></span>Análise em Detalhe
          </h2>
        </div>
        
        <div class="pdfRow2" style="display:grid; grid-template-columns: 1fr 1fr; gap:10px;">
          <div style="border:1px solid #e2e8f0; padding:8px; border-radius:8px; background:#f8f6ff;">
            <h3 style="margin:0 0 8px 0; font-size:9px; font-weight:700; color:#6b21a8; border-bottom:1px solid #e9d5ff; padding-bottom:4px;">
              ${pdfYear1Label} - Distribuição de Equipamentos
            </h3>
            <div style="text-align:center; height:180px; display:flex; align-items:center; justify-content:center;">
              ${detailChartYear1Img ? `<img src="${detailChartYear1Img}" style="max-width:100%; max-height:100%; object-fit:contain;">` : '<p style="color:#94a3b8; font-size:9px;">Sem dados</p>'}
            </div>
          </div>
          <div style="border:1px solid #e2e8f0; padding:8px; border-radius:8px; background:#f8f6ff;">
            <h3 style="margin:0 0 8px 0; font-size:9px; font-weight:700; color:#6b21a8; border-bottom:1px solid #e9d5ff; padding-bottom:4px;">
              ${pdfYear2Label} - Distribuição de Equipamentos
            </h3>
            <div style="text-align:center; height:180px; display:flex; align-items:center; justify-content:center;">
              ${detailChartYear2Img ? `<img src="${detailChartYear2Img}" style="max-width:100%; max-height:100%; object-fit:contain;">` : '<p style="color:#94a3b8; font-size:9px;">Sem dados</p>'}
            </div>
          </div>
        </div>

        <div class="pdfRow2" style="border:1px solid #e2e8f0; padding:8px; border-radius:8px; background:#f8f6ff;">
          <h3 style="margin:0 0 8px 0; font-size:9px; font-weight:700; color:#6b21a8; border-bottom:1px solid #e9d5ff; padding-bottom:4px;">
            ${pdfTrendTitle}
          </h3>
          <div style="text-align:center; height:180px; display:flex; align-items:center; justify-content:center;">
            ${detailTrendChartImg ? `<img src="${detailTrendChartImg}" style="max-width:100%; max-height:100%; object-fit:contain;">` : '<p style="color:#94a3b8; font-size:9px;">Sem dados</p>'}
          </div>
        </div>

        <div class="pdfRow2" style="border:1px solid #e2e8f0; padding:8px; border-radius:8px; background:#f1f5f9;">
          <h3 style="margin:0 0 8px 0; font-size:9px; font-weight:700; border-bottom:1px solid #cbd5e1; padding-bottom:4px;">
            Análise Pessoal Detalhada
          </h3>
          ${(() => {
            const key = (() => {
              const ents = selectedEntidades.length > 0 ? selectedEntidades.sort().join(',') : 'todas';
              const anos = selectedYears.length > 0 ? selectedYears.sort().join(',') : 'todos';
              return \`\${ents}_\${anos}\`;
            })();
            const allData = (() => {
              const stored = localStorage.getItem(DETAILED_ANALYSIS_STORAGE_KEY);
              return stored ? JSON.parse(stored) : {};
            })();
            const saved = allData[key];
            
            if (!saved || !saved.analysis) return '<p style="margin:0; font-size:9px; color:#94a3b8;">Sem análise registada</p>';
            
            return \`<p style="margin:0; font-size:8px; line-height:1.5; color:#0f172a; white-space:pre-wrap; word-wrap:break-word;">\${saved.analysis}</p>\`;
          })()}
        </div>
      </div>
    `;

    wrapper2.innerHTML = buildHtml2();
    await waitTwoFrames();

    // Load images
    const imgs2 = Array.from(wrapper2.querySelectorAll('img'));
    await Promise.all(imgs2.map(img => {
      if (img.complete && img.naturalWidth > 0) return Promise.resolve();
      return new Promise(resolve => { img.onload = resolve; img.onerror = resolve; });
    }));
    await waitTwoFrames();

    // Capture page 2
    const canvas2 = await html2canvas(wrapper2, {
      backgroundColor: '#ffffff',
      scale: 3,
      useCORS: true,
      allowTaint: true,
      scrollX: -oldScrollX,
      scrollY: -oldScrollY,
      width: PAGE_W_PX,
      height: PAGE_H_PX,
      windowWidth: PAGE_W_PX,
      windowHeight: PAGE_H_PX
    });

    const imgData2 = canvas2.toDataURL('image/png', 1.0);
    pdf.addImage(imgData2, 'PNG', PAD_MM, PAD_MM, CONTENT_W_MM, CONTENT_H_MM, undefined, 'FAST');

    // Clean up stage2
    if (stage2Canvas && stage2Canvas.parentNode) stage2Canvas.parentNode.removeChild(stage2Canvas);

    pdf.save(`Relatorio_Qualidade_${new Date().toISOString().slice(0,10)}.pdf`);

  } catch (e) {
    console.error(e);
    alert(`Erro ao exportar PDF: ${e.message}`);
  } finally {
    // restore scroll / overflow
    document.documentElement.style.overflow = prevOverflowHtml;
    document.body.style.overflow = prevOverflowBody;
    try { window.scrollTo(oldScrollX, oldScrollY); } catch {}

    if (stage && stage.parentNode) stage.parentNode.removeChild(stage);

    if (prevDPR !== null && window.Chart?.defaults) {
      Chart.defaults.devicePixelRatio = prevDPR;
      Object.values(charts || {}).forEach(ch => { try { ch?.resize?.(); ch?.update?.('none'); } catch {} });
    }

    if (btn) { btn.disabled = false; btn.classList.remove('opacity-75'); }
  }
}*/

async function exportarRelatorio() {
  const btn = $('exportPdfBtn');
  const loadingBtn = $('loadingBtn');
  if (btn) { btn.disabled = true; btn.classList.add('opacity-75'); }
  if (loadingBtn) { loadingBtn.classList.remove('hidden'); }

  let prevDPR = null;
  let stage = null;
  let stage2 = null;

  // A4
  const PAGE_W_MM = 210;
  const PAGE_H_MM = 297;
  const PAD_MM = 8;
  const CONTENT_W_MM = PAGE_W_MM - (2 * PAD_MM);
  const CONTENT_H_MM = PAGE_H_MM - (2 * PAD_MM);

  // px fixos (layout estável)
  const PX_PER_MM = 96 / 25.4;
  const PAGE_W_PX = Math.round(PAGE_W_MM * PX_PER_MM);
  const PAGE_H_PX = Math.round(PAGE_H_MM * PX_PER_MM);
  const PAD_PX = Math.round(PAD_MM * PX_PER_MM);

  const LIMITS = {
    row1: { min: 80,  max: 170 },
    row2: { min: 85,  max: 175 },
    row3: { min: 85,  max: 175 }
  };
  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

  // lock scroll
  const oldScrollX = window.scrollX || window.pageXOffset || 0;
  const oldScrollY = window.scrollY || window.pageYOffset || 0;
  const prevOverflowHtml = document.documentElement.style.overflow;
  const prevOverflowBody = document.body.style.overflow;

  try {
    if (typeof html2canvas !== 'function') {
      throw new Error('html2canvas não está carregado. Verifica o <script> no index.html.');
    }
    if (!window.jspdf?.jsPDF) {
      throw new Error('jsPDF não está carregado (window.jspdf.jsPDF). Verifica o <script> do jsPDF.');
    }

    const filtered = filterData();

    // 1) estabiliza charts
    Object.values(charts || {}).forEach(ch => { try { ch?.update?.('none'); } catch {} });
    await waitTwoFrames();

    // 2) aumenta definição dos charts durante o export
    if (window.Chart?.defaults) {
      prevDPR = Chart.defaults.devicePixelRatio;
      Chart.defaults.devicePixelRatio = 3;
      Object.values(charts || {}).forEach(ch => { try { ch?.resize?.(); ch?.update?.('none'); } catch {} });
      await waitTwoFrames();
    }

    // 3) textos / KPIs
    const anosTexto = selectedYears.length ? selectedYears.slice().sort((a,b)=>a-b).join(', ') : 'Todos';
    const mesesTexto = selectedMonths.length
      ? selectedMonths.slice().sort((a,b)=>a-b).map(m => MESES_FULL[m - 1]).join(', ')
      : 'Todos';

    const entidadeTexto = (sessionInfo?.filter && sessionInfo.filter !== 'all')
      ? sessionInfo.filter
      : (selectedEntidades.length ? selectedEntidades.join(', ') : 'Todas');

    const periodoTexto = `${mesesTexto} (${anosTexto})`;

    const abertas = filtered.filter(d => getStatus(d) === 'aberto').length;
    const fechadas = filtered.filter(d => getStatus(d) === 'fechado').length;
    const taxa = filtered.length > 0 ? Math.round((fechadas / filtered.length) * 100) : 0;
    const entidadesUnicas = unique(filtered.map(getEntidade).filter(Boolean)).length;

    const tempos = filtered.map(getTempoPrevisto).filter(t => Number.isFinite(t) && t >= 0);
    const tempoMedio = tempos.length ? Math.round(tempos.reduce((a,b)=>a+b,0)/tempos.length) : '-';
    const tempoMax = tempos.length ? Math.max(...tempos) : '-';
    const tempoMin = tempos.length ? Math.min(...tempos) : '-';
    const tempoDesvio = (() => {
      if (!tempos.length) return '-';
      const m = tempos.reduce((a,b)=>a+b,0)/tempos.length;
      const v = tempos.reduce((s,t)=>s+Math.pow(t-m,2),0)/tempos.length;
      return Math.sqrt(v).toFixed(1);
    })();

    // 4) imagens dos charts - main dashboard
    const trendChartImg = safeCanvasDataUrl('lineTrendChart');
    const yearChartImg = safeCanvasDataUrl('yearComparisonChart');
    const pieChartImg = safeCanvasDataUrl('rncPieChart');
    const topKeywordsImg = safeCanvasDataUrl('topKeywordsChart');
    const tempoResolucaoImg = safeCanvasDataUrl('tempoResolucaoChart');
    
    // Detailed Analysis charts - page 2
    const detailChartYear1Img = safeCanvasDataUrl('detailComparisonChartYear1');
    const detailChartYear2Img = safeCanvasDataUrl('detailComparisonChartYear2');
    const detailTrendChartImg = safeCanvasDataUrl('detailTrendComparisonChart');

    // 5) congela scroll / topo
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    window.scrollTo(0, 0);
    await waitTwoFrames();

    // 6) stage no viewport, sem flex
    stage = document.createElement('div');
    stage.id = 'pdfStage';
    stage.style.position = 'fixed';
    stage.style.left = '0';
    stage.style.top = '0';
    stage.style.width = `${PAGE_W_PX}px`;
    stage.style.height = `${PAGE_H_PX}px`;
    stage.style.background = '#fff';
    stage.style.zIndex = '2147483647';
    stage.style.pointerEvents = 'none';
    stage.style.opacity = '0.01';
    stage.style.overflow = 'hidden';
    stage.style.transform = 'none';
    stage.style.zoom = '1';
    document.body.appendChild(stage);

    const wrapper = document.createElement('div');
    wrapper.id = 'pdfWrapper';
    wrapper.style.position = 'absolute';
    wrapper.style.left = '0';
    wrapper.style.top = '0';
    wrapper.style.width = `${PAGE_W_PX}px`;
    wrapper.style.height = `${PAGE_H_PX}px`;
    wrapper.style.background = '#fff';
    wrapper.style.boxSizing = 'border-box';
    wrapper.style.padding = `${PAD_PX}px`;
    wrapper.style.overflow = 'hidden';
    wrapper.style.transform = 'none';
    wrapper.style.zoom = '1';
    stage.appendChild(wrapper);

    // alturas a ajustar
    let hRow1 = 118;
    let hRow2 = 128;
    let hRow3 = 128;

    const buildHtml = () => `
      <style>
        #pdfRoot, #pdfRoot * { box-sizing: border-box; }
        #pdfRoot { width:100%; max-width:100%; overflow:hidden; font-family: Arial, sans-serif; background:#fff; color:#0f172a; }
        .pdfRow { margin-bottom:8px; }
      </style>

      <div id="pdfRoot">
        <div style="margin-bottom:10px; padding-bottom:8px; border-bottom:3px solid #0f172a;">
          <div style="display:flex; align-items:center; gap:10px; margin-bottom:6px;">
            <img src="https://static.wixstatic.com/media/a6967f_eee0d017524f4a48bf2870cc2385c10b~mv2.png" style="height:32px;">
          </div>
          <h1 style="margin:0; font-size:18px; font-weight:700;">Dashboard de Qualidade</h1>
          <p style="margin:2px 0 0 0; font-size:11px; color:#64748b;">Sistema de Análise de Não Conformidades</p>
        </div>

        <div class="pdfRow" style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; font-size:10px;">
          <div style="background:#f1f5f9; padding:8px; border-radius:6px; border-left:3px solid #3b82f6;">
            <p style="margin:0; font-weight:700; font-size:8px; text-transform:uppercase; color:#64748b;">Entidade</p>
            <p style="margin:3px 0 0 0; font-weight:700; font-size:11px; line-height:1.2;">${entidadeTexto}</p>
          </div>
          <div style="background:#f1f5f9; padding:8px; border-radius:6px; border-left:3px solid #8b5cf6;">
            <p style="margin:0; font-weight:700; font-size:8px; text-transform:uppercase; color:#64748b;">Período</p>
            <p style="margin:3px 0 0 0; font-weight:700; font-size:9px; line-height:1.3;">${periodoTexto}</p>
          </div>
        </div>

        <div class="pdfRow" style="display:grid; grid-template-columns: repeat(4, 1fr); gap:8px;">
          ${kpiBox('Total Registos', filtered.length, '#0f172a')}
          ${kpiBox('Entidades Ativas', entidadesUnicas, '#2563eb')}
          ${kpiBox('RNCs em Aberto', abertas, '#ef4444')}
          ${kpiBox('Taxa de Resolução', taxa + '%', '#16a34a')}
        </div>

        <div class="pdfRow" style="display:grid; grid-template-columns: 2fr 1fr; gap:10px;">
          ${imgCard('Tendência Mensal (por Ano)', trendChartImg, hRow1)}
          ${imgCard('Status Geral RNCs', pieChartImg, hRow1)}
        </div>

        <div class="pdfRow" style="display:grid; grid-template-columns: 1fr 1fr; gap:10px;">
          ${imgCard('Total RNCs por Ano', yearChartImg, hRow2)}
          ${imgCard('Top 5 Keywords', topKeywordsImg, hRow2)}
        </div>

        <div class="pdfRow" style="display:grid; grid-template-columns: 1fr 1fr; gap:10px;">
          ${imgCard('Tempo Previsto de Resolução', tempoResolucaoImg, hRow3)}
          <div style="border:1px solid #e2e8f0; padding:8px; border-radius:8px; box-sizing:border-box;">
            <h3 style="margin:0 0 8px 0; font-size:10px; font-weight:700; border-bottom:1px solid #e2e8f0; padding-bottom:4px;">
              Estatísticas de Resolução
            </h3>
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:8px;">
              ${kpiBox('Tempo Médio (min)', tempoMedio, '#0f766e')}
              ${kpiBox('Tempo Máximo (min)', tempoMax, '#ea580c')}
              ${kpiBox('Tempo Mínimo (min)', tempoMin, '#16a34a')}
              ${kpiBox('Desvio Padrão', tempoDesvio, '#2563eb')}
            </div>
          </div>
        </div>

        <div style="margin-top:6px; display:flex; justify-content:flex-end;">
          <img src="https://static.wixstatic.com/media/a6967f_0db968f0a9864debae3bd716ad0ebeb6~mv2.png" style="height:20px; opacity:0.75;">
        </div>
      </div>
    `;

    wrapper.innerHTML = buildHtml();
    await waitTwoFrames();

    // aguarda fontes + imagens
    if (document.fonts?.ready) await document.fonts.ready;
    const imgs = Array.from(wrapper.querySelectorAll('img'));
    await Promise.all(imgs.map(img => {
      if (img.complete && img.naturalWidth > 0) return Promise.resolve();
      return new Promise(resolve => { img.onload = resolve; img.onerror = resolve; });
    }));
    await waitTwoFrames();

    // AUTO-FIT altura
    let root = wrapper.querySelector('#pdfRoot');
    const targetHeightPx = Math.round(CONTENT_H_MM * PX_PER_MM);

    for (let i = 0; i < 12; i++) {
      const currentH = root.scrollHeight;
      const diff = targetHeightPx - currentH;
      if (Math.abs(diff) < 6) break;

      const step = diff * 0.35;
      hRow1 = clamp(Math.round(hRow1 + step * 0.45), LIMITS.row1.min, LIMITS.row1.max);
      hRow2 = clamp(Math.round(hRow2 + step * 0.30), LIMITS.row2.min, LIMITS.row2.max);
      hRow3 = clamp(Math.round(hRow3 + step * 0.25), LIMITS.row3.min, LIMITS.row3.max);

      wrapper.innerHTML = buildHtml();
      await waitTwoFrames();
      root = wrapper.querySelector('#pdfRoot');
    }

    // 7) CAPTURA: html2canvas directo (aqui é que acaba o “corte”)
    const canvas = await html2canvas(wrapper, {
      backgroundColor: '#ffffff',
      scale: 3,
      useCORS: true,
      allowTaint: true,

      // ✅ compensação que evita “fatia à esquerda”
      scrollX: -oldScrollX,
      scrollY: -oldScrollY,

      // ✅ força o tamanho exacto do wrapper
      width: PAGE_W_PX,
      height: PAGE_H_PX,
      windowWidth: PAGE_W_PX,
      windowHeight: PAGE_H_PX
    });

    const imgData = canvas.toDataURL('image/png', 1.0);

    // 8) PDF: addImage exactamente no A4 (com padding em mm)
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });

    // Page 1: Main dashboard
    pdf.addImage(imgData, 'PNG', PAD_MM, PAD_MM, CONTENT_W_MM, CONTENT_H_MM, undefined, 'FAST');

    // ✅ Page 2: só se houver dados na "Análise em Detalhe"
    const includeDetailPage = detailedAnalysisHasData();

    if (includeDetailPage) {
      pdf.addPage();
      
      stage2 = document.createElement('div');
      stage2.id = 'pdfStage2';
      stage2.style.position = 'fixed';
      stage2.style.left = '0';
      stage2.style.top = '0';
      stage2.style.width = `${PAGE_W_PX}px`;
      stage2.style.height = `${PAGE_H_PX}px`;
      stage2.style.background = '#fff';
      stage2.style.zIndex = '2147483646';
      stage2.style.pointerEvents = 'none';
      stage2.style.opacity = '0.01';
      stage2.style.overflow = 'hidden';
      stage2.style.transform = 'none';
      stage2.style.zoom = '1';
      document.body.appendChild(stage2);

      const wrapper2 = document.createElement('div');
      wrapper2.id = 'pdfWrapper2';
      wrapper2.style.position = 'absolute';
      wrapper2.style.left = '0';
      wrapper2.style.top = '0';
      wrapper2.style.width = `${PAGE_W_PX}px`;
      wrapper2.style.height = `${PAGE_H_PX}px`;
      wrapper2.style.background = '#fff';
      wrapper2.style.boxSizing = 'border-box';
      wrapper2.style.padding = `${PAD_PX}px`;
      wrapper2.style.overflow = 'hidden';
      wrapper2.style.transform = 'none';
      wrapper2.style.zoom = '1';
      stage2.appendChild(wrapper2);

      // Get selected years for PDF labels
      const pdfYear1 = $('detailAnalysisYear1')?.value || 'Ano 1';
      const pdfYear2 = $('detailAnalysisYear2')?.value || 'Ano 2';
      const pdfYear1Label = `Ano ${pdfYear1}`;
      const pdfYear2Label = `Ano ${pdfYear2}`;
      const pdfTrendTitle = `Comparação de Tendências - ${pdfYear1Label} vs ${pdfYear2Label}`;

      const buildHtml2 = () => `
        <style>
          #pdfRoot2, #pdfRoot2 * { box-sizing: border-box; }
          #pdfRoot2 { width:100%; max-width:100%; overflow:hidden; font-family: Arial, sans-serif; background:#fff; color:#0f172a; }
          .pdfRow2 { margin-bottom:12px; }
        </style>
        <div id="pdfRoot2">
          <div style="margin-bottom:12px; padding-bottom:8px; border-bottom:3px solid #0f172a;">
            <h2 style="margin:0; font-size:16px; font-weight:700; display:flex; align-items:center; gap:6px;">
              <span style="width:8px; height:8px; background:#a855f7; border-radius:50%;"></span>Análise em Detalhe
            </h2>
          </div>
          
          <div class="pdfRow2" style="display:grid; grid-template-columns: 1fr 1fr; gap:12px;">
            <div style="border:1px solid #e2e8f0; padding:10px; border-radius:8px; background:#f8f6ff;">
              <h3 style="margin:0 0 10px 0; font-size:10px; font-weight:700; color:#6b21a8; border-bottom:2px solid #e9d5ff; padding-bottom:6px;">
                ${pdfYear1Label} - Distribuição de Equipamentos
              </h3>
              <div style="text-align:center; height:200px; display:flex; align-items:center; justify-content:center;">
                ${detailChartYear1Img ? `<img src="${detailChartYear1Img}" style="max-width:100%; max-height:100%; object-fit:contain;">` : '<p style="color:#94a3b8; font-size:10px;">Sem dados</p>'}
              </div>
            </div>
            <div style="border:1px solid #e2e8f0; padding:10px; border-radius:8px; background:#f8f6ff;">
              <h3 style="margin:0 0 10px 0; font-size:10px; font-weight:700; color:#6b21a8; border-bottom:2px solid #e9d5ff; padding-bottom:6px;">
                ${pdfYear2Label} - Distribuição de Equipamentos
              </h3>
              <div style="text-align:center; height:200px; display:flex; align-items:center; justify-content:center;">
                ${detailChartYear2Img ? `<img src="${detailChartYear2Img}" style="max-width:100%; max-height:100%; object-fit:contain;">` : '<p style="color:#94a3b8; font-size:10px;">Sem dados</p>'}
              </div>
            </div>
          </div>

          <div class="pdfRow2" style="border:1px solid #e2e8f0; padding:10px; border-radius:8px; background:#f8f6ff;">
            <h3 style="margin:0 0 10px 0; font-size:10px; font-weight:700; color:#6b21a8; border-bottom:2px solid #e9d5ff; padding-bottom:6px;">
              ${pdfTrendTitle}
            </h3>
            <div style="text-align:center; height:200px; display:flex; align-items:center; justify-content:center;">
              ${detailTrendChartImg ? `<img src="${detailTrendChartImg}" style="max-width:100%; max-height:100%; object-fit:contain;">` : '<p style="color:#94a3b8; font-size:10px;">Sem dados</p>'}
            </div>
          </div>

          <div class="pdfRow2" style="border:1px solid #e2e8f0; padding:10px; border-radius:8px; background:#f1f5f9;">
            <h3 style="margin:0 0 10px 0; font-size:10px; font-weight:700; border-bottom:1px solid #cbd5e1; padding-bottom:6px;">
              Análise Pessoal Detalhada
            </h3>
            ${(() => {
              const key = (() => {
                const ents = selectedEntidades.length > 0 ? selectedEntidades.sort().join(',') : 'todas';
                const anos = selectedYears.length > 0 ? selectedYears.sort().join(',') : 'todos';
                return ents + '_' + anos;
              })();
              const allData = (() => {
                const stored = localStorage.getItem(DETAILED_ANALYSIS_STORAGE_KEY);
                return stored ? JSON.parse(stored) : {};
              })();
              const saved = allData[key];
              
              if (!saved || !saved.analysis) return '<p style="margin:0; font-size:10px; color:#94a3b8; font-style:italic;">Sem análise registada</p>';
              
              return '<p style="margin:0; font-size:9px; line-height:1.6; color:#0f172a; white-space:pre-wrap; word-wrap:break-word;">' + (saved.analysis || '') + '</p>';
            })()}
          </div>

          <div style="margin-top:10px; display:flex; justify-content:flex-end;">
            <img src="https://static.wixstatic.com/media/a6967f_0db968f0a9864debae3bd716ad0ebeb6~mv2.png" style="height:20px; opacity:0.75;">
          </div>
        </div>
      `;

      wrapper2.innerHTML = buildHtml2();
      await waitTwoFrames();

      // Load images for page 2
      const imgs2 = Array.from(wrapper2.querySelectorAll('img'));
      await Promise.all(imgs2.map(img => {
        if (img.complete && img.naturalWidth > 0) return Promise.resolve();
        return new Promise(resolve => { img.onload = resolve; img.onerror = resolve; });
      }));
      await waitTwoFrames();

      // Capture page 2
      const canvas2 = await html2canvas(wrapper2, {
        backgroundColor: '#ffffff',
        scale: 3,
        useCORS: true,
        allowTaint: true,
        scrollX: -oldScrollX,
        scrollY: -oldScrollY,
        width: PAGE_W_PX,
        height: PAGE_H_PX,
        windowWidth: PAGE_W_PX,
        windowHeight: PAGE_H_PX
      });

      const imgData2 = canvas2.toDataURL('image/png', 1.0);
      pdf.addImage(imgData2, 'PNG', PAD_MM, PAD_MM, CONTENT_W_MM, CONTENT_H_MM, undefined, 'FAST');
    }

    pdf.save(`Relatorio_Qualidade_${new Date().toISOString().slice(0,10)}.pdf`);

  } catch (e) {
    console.error(e);
    alert(`Erro ao exportar PDF: ${e.message}`);
  } finally {
    // restore scroll / overflow
    document.documentElement.style.overflow = prevOverflowHtml;
    document.body.style.overflow = prevOverflowBody;
    try { window.scrollTo(oldScrollX, oldScrollY); } catch {}

    if (stage && stage.parentNode) stage.parentNode.removeChild(stage);
    if (stage2 && stage2.parentNode) stage2.parentNode.removeChild(stage2);

    if (prevDPR !== null && window.Chart?.defaults) {
      Chart.defaults.devicePixelRatio = prevDPR;
      Object.values(charts || {}).forEach(ch => { try { ch?.resize?.(); ch?.update?.('none'); } catch {} });
    }

    if (btn) { btn.disabled = false; btn.classList.remove('opacity-75'); }
    if (loadingBtn) { loadingBtn.classList.add('hidden'); }
  }
}



/* ========= MODAL / UI ========= */

function updateButtonColor() {
  const closeBtn = $('closeEntidadeModal');
  if (!closeBtn) return;

  if (entidadesSelecionadasTemp && entidadesSelecionadasTemp.length > 0) {
    closeBtn.style.backgroundColor = 'rgb(34, 197, 94)'; // verde
  } else {
    closeBtn.style.backgroundColor = 'rgb(71, 85, 105)'; // cinzento
  }
  closeBtn.style.cursor = 'pointer';
}

/* ========= MODAL ENTIDADES ========= */

function openEntidadeModal() {
  entidadesSelecionadasTemp = selectedEntidades.slice();

  const search = $('entidadeSearch');
  if (search) search.value = '';

  renderEntidadeModalList(entidadesDisponiveis, entidadesSelecionadasTemp);
  $('entidadeModal')?.classList.remove('hidden');
}

function closeEntidadeModal(apply = true) {
  if (apply) {
    selectedEntidades = entidadesSelecionadasTemp.slice();
    renderEntidadeTags();
    initFilters();
    updateDashboard();
  }
  $('entidadeModal')?.classList.add('hidden');
}

function renderEntidadeModalList(lista, selecionadas) {
  const boxContainer = $('entidadeCheckboxes');
  if (!boxContainer) return;

  const selectedLower = (selecionadas || []).map(e => e.toLowerCase());
  boxContainer.innerHTML = '';

  if (!lista || lista.length === 0) {
    boxContainer.innerHTML = `<p class="text-slate-400 text-sm text-center py-8">Sem entidades</p>`;
    updateButtonColor();
    return;
  }

  lista.forEach(ent => {
    const wrapper = document.createElement('label');
    wrapper.className = "flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-slate-50 cursor-pointer select-none border border-transparent hover:border-slate-200 transition";

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.value = ent;
    cb.className = "accent-blue-600";
    cb.checked = selectedLower.includes(ent.toLowerCase());

    cb.addEventListener('change', () => {
      const val = cb.value;
      const has = entidadesSelecionadasTemp.some(x => x.toLowerCase() === val.toLowerCase());

      if (cb.checked && !has) entidadesSelecionadasTemp.push(val);
      if (!cb.checked && has) entidadesSelecionadasTemp = entidadesSelecionadasTemp.filter(x => x.toLowerCase() !== val.toLowerCase());

      updateButtonColor();
    });

    const span = document.createElement('span');
    span.className = "text-slate-800 text-[12px] font-bold";
    span.innerText = ent;

    wrapper.appendChild(cb);
    wrapper.appendChild(span);
    boxContainer.appendChild(wrapper);
  });

  updateButtonColor();
}

function renderEntidadeTags() {
  const tagsEl = $('entidadeTags');
  const emptyEl = $('entidadeTagsEmpty');
  if (!tagsEl || !emptyEl) return;

  tagsEl.innerHTML = '';

  if (!selectedEntidades || selectedEntidades.length === 0) {
    emptyEl.classList.remove('hidden');
    return;
  }

  emptyEl.classList.add('hidden');

  selectedEntidades.forEach(ent => {
    const tag = document.createElement('div');
    tag.className = "flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-700 text-white text-[11px] font-black";

    const name = document.createElement('span');
    name.innerText = ent;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = "w-5 h-5 rounded-full bg-slate-600 hover:bg-red-600 transition flex items-center justify-center text-[12px] leading-none";
    btn.innerText = "×";
    btn.title = "Remover";

    btn.addEventListener('click', () => {
      selectedEntidades = selectedEntidades.filter(x => x.toLowerCase() !== ent.toLowerCase());
      renderEntidadeTags();
      initFilters();
      updateDashboard();
    });

    tag.appendChild(name);
    tag.appendChild(btn);
    tagsEl.appendChild(tag);
  });
}

/* ========= DETAILED ANALYSIS SECTION ========= */

// Storage key para análises em detalhe
const DETAILED_ANALYSIS_STORAGE_KEY = 'detailedAnalysisData';

function getDetailedAnalysisData() {
  const stored = localStorage.getItem(DETAILED_ANALYSIS_STORAGE_KEY);
  return stored ? JSON.parse(stored) : {};
}

function saveDetailedAnalysisData(key, data) {
  const all = getDetailedAnalysisData();
  all[key] = data;
  localStorage.setItem(DETAILED_ANALYSIS_STORAGE_KEY, JSON.stringify(all));
}

function deleteDetailedAnalysisData(key) {
  const all = getDetailedAnalysisData();
  delete all[key];
  localStorage.setItem(DETAILED_ANALYSIS_STORAGE_KEY, JSON.stringify(all));
}

function getDetailedAnalysisKey() {
  // Key format: "entidades_anos" (ex: "todos_2024,2025")
  const ents = selectedEntidades.length > 0 ? selectedEntidades.sort().join(',') : 'todas';
  const anos = selectedYears.length > 0 ? selectedYears.sort().join(',') : 'todos';
  return `${ents}_${anos}`;
}

function detailedAnalysisHasData() {
  // Verifica se há dados salvos na análise detalhada
  const key = getDetailedAnalysisKey();
  const data = getDetailedAnalysisData();
  const saved = data[key];
  
  if (!saved) return false;
  
  // Verifica se algum campo tem dados
  const hasEquipmentData = (
    saved.mws200Year1 || saved.mws300Year1 || saved.mws500Year1 || saved.mws700Year1 || saved.mws715Year1 ||
    saved.mws200Year2 || saved.mws300Year2 || saved.mws500Year2 || saved.mws700Year2 || saved.mws715Year2
  );
  
  const hasAnalysisText = !!(saved.analysis && saved.analysis.trim());
  const hasYearSelection = !!(saved.year1 || saved.year2);
  
  return hasEquipmentData || hasAnalysisText || hasYearSelection;
}

function updateDetailedAnalysisSection(filtered) {
  const section = $('detailedAnalysisSection');
  if (!section) return;

  // Mostrar/esconder o container conforme haja dados
  if (filtered.length === 0) {
    section.classList.add('hidden');
    return;
  }

  section.classList.remove('hidden');

  // Gerar range de anos (2022 até futuro, independentemente dos filtros)
  const currentYear = new Date().getFullYear();
  const futureYears = [];
  for (let y = 2022; y <= currentYear + 5; y++) {
    futureYears.push(y);
  }

  const yearSelect1 = $('detailAnalysisYear1');
  const yearSelect2 = $('detailAnalysisYear2');
  
  if (yearSelect1) {
    const currentValue1 = yearSelect1.value;
    yearSelect1.innerHTML = '<option value="">-- Selecionar --</option>' +
      futureYears.map(a => `<option value="${a}">${a}</option>`).join('');
    yearSelect1.value = currentValue1;
  }

  if (yearSelect2) {
    const currentValue2 = yearSelect2.value;
    yearSelect2.innerHTML = '<option value="">-- Selecionar --</option>' +
      futureYears.map(a => `<option value="${a}">${a}</option>`).join('');
    yearSelect2.value = currentValue2;
  }

  // Carregar dados salvos (se existirem)
  const key = getDetailedAnalysisKey();
  const saved = getDetailedAnalysisData()[key];
  
  if (saved) {
    if (yearSelect1) yearSelect1.value = saved.year1 || '';
    if (yearSelect2) yearSelect2.value = saved.year2 || '';
    $('detailMWS200Year1').value = saved.mws200Year1 || '';
    $('detailMWS300Year1').value = saved.mws300Year1 || '';
    $('detailMWS500Year1').value = saved.mws500Year1 || '';
    $('detailMWS700Year1').value = saved.mws700Year1 || '';
    $('detailMWS715Year1').value = saved.mws715Year1 || '';
    $('detailMWS200Year2').value = saved.mws200Year2 || '';
    $('detailMWS300Year2').value = saved.mws300Year2 || '';
    $('detailMWS500Year2').value = saved.mws500Year2 || '';
    $('detailMWS700Year2').value = saved.mws700Year2 || '';
    $('detailMWS715Year2').value = saved.mws715Year2 || '';
    $('detailAnalysisText').value = saved.analysis || '';
  }

  // Setup chart update listeners and update charts
  setupDetailedAnalysisChartListeners();
  updateDetailedAnalysisComparisonChart();
}

function updateDetailedAnalysisComparisonChart() {
  updateDetailedAnalysisChartForYear(1);
  updateDetailedAnalysisChartForYear(2);
  updateDetailedAnalysisTrendChart();
}

function updateDetailedAnalysisChartForYear(year) {
  const canvasId = `detailComparisonChartYear${year}`;
  const canvas = $(canvasId);
  if (!canvas) return;

  const suffix = `Year${year}`;
  const mws200 = parseInt($(`detailMWS200${suffix}`).value || 0);
  const mws300 = parseInt($(`detailMWS300${suffix}`).value || 0);
  const mws500 = parseInt($(`detailMWS500${suffix}`).value || 0);
  const mws700 = parseInt($(`detailMWS700${suffix}`).value || 0);
  const mws715 = parseInt($(`detailMWS715${suffix}`).value || 0);

  const total = mws200 + mws300 + mws500 + mws700 + mws715;

  // Destroy existing chart
  const chartKey = `detailComparison${year}`;
  if (charts[chartKey]) {
    charts[chartKey].destroy();
    charts[chartKey] = null;
  }

  if (total === 0) {
    // Show empty state
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    return;
  }

  // Create pie chart
  charts[chartKey] = new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels: ['MWS200', 'MWS300', 'MWS500', 'MWS700', 'MWS715'],
      datasets: [{
        data: [mws200, mws300, mws500, mws700, mws715],
        backgroundColor: [
          'rgba(59, 130, 246, 0.8)',    // Blue
          'rgba(34, 197, 94, 0.8)',     // Green
          'rgba(239, 68, 68, 0.8)',     // Red
          'rgba(249, 115, 22, 0.8)',    // Orange
          'rgba(168, 85, 247, 0.8)'     // Purple
        ],
        borderColor: [
          'rgb(59, 130, 246)',
          'rgb(34, 197, 94)',
          'rgb(239, 68, 68)',
          'rgb(249, 115, 22)',
          'rgb(168, 85, 247)'
        ],
        borderWidth: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      layout: {
        padding: {
          left: 0
        }
      },
      plugins: {
        legend: {
          position: 'left',
          align: 'center',
          labels: {
            font: { size: 10, weight: 'bold' },
            padding: 12,
            usePointStyle: true,
            pointStyle: 'circle',
            textAlign: 'left'
          }
        },
        datalabels: { display: false },
        tooltip: {
          callbacks: {
            label: (context) => {
              const value = context.parsed;
              const percentage = ((value / total) * 100).toFixed(1);
              return `${value} (${percentage}%)`;
            }
          }
        }
      }
    }
  });
}

function updateDetailedAnalysisTrendChart() {
  const canvas = $('detailTrendComparisonChart');
  if (!canvas) return;

  const mws200Year1 = parseInt($('detailMWS200Year1').value || 0);
  const mws300Year1 = parseInt($('detailMWS300Year1').value || 0);
  const mws500Year1 = parseInt($('detailMWS500Year1').value || 0);
  const mws700Year1 = parseInt($('detailMWS700Year1').value || 0);
  const mws715Year1 = parseInt($('detailMWS715Year1').value || 0);

  const mws200Year2 = parseInt($('detailMWS200Year2').value || 0);
  const mws300Year2 = parseInt($('detailMWS300Year2').value || 0);
  const mws500Year2 = parseInt($('detailMWS500Year2').value || 0);
  const mws700Year2 = parseInt($('detailMWS700Year2').value || 0);
  const mws715Year2 = parseInt($('detailMWS715Year2').value || 0);

  // Destroy existing chart
  if (charts.detailTrendComparison) {
    charts.detailTrendComparison.destroy();
    charts.detailTrendComparison = null;
  }

  const hasData = mws200Year1 > 0 || mws300Year1 > 0 || mws500Year1 > 0 || mws700Year1 > 0 || mws715Year1 > 0 ||
                  mws200Year2 > 0 || mws300Year2 > 0 || mws500Year2 > 0 || mws700Year2 > 0 || mws715Year2 > 0;

  if (!hasData) {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    return;
  }

  // Get year labels from dropdowns
  const year1Elem = $('detailYear1Select');
  const year2Elem = $('detailYear2Select');
  const year1Label = year1Elem ? `Ano ${year1Elem.value}` : 'Ano 1';
  const year2Label = year2Elem ? `Ano ${year2Elem.value}` : 'Ano 2';

  // Update pie chart labels
  const chartYear1Label = $('detailChartYear1Label');
  const chartYear2Label = $('detailChartYear2Label');
  if (chartYear1Label) chartYear1Label.textContent = `${year1Label} - Distribuição de Equipamentos`;
  if (chartYear2Label) chartYear2Label.textContent = `${year2Label} - Distribuição de Equipamentos`;

  // Create line chart
  charts.detailTrendComparison = new Chart(canvas, {
    type: 'line',
    data: {
      labels: ['MWS200', 'MWS300', 'MWS500', 'MWS700', 'MWS715'],
      datasets: [
        {
          label: year1Label,
          data: [mws200Year1, mws300Year1, mws500Year1, mws700Year1, mws715Year1],
          borderColor: 'rgb(59, 130, 246)',
          backgroundColor: 'rgba(59, 130, 246, 0.1)',
          borderWidth: 3,
          pointRadius: 5,
          pointBackgroundColor: 'rgb(59, 130, 246)',
          pointBorderColor: '#fff',
          pointBorderWidth: 2,
          tension: 0.3,
          fill: true
        },
        {
          label: year2Label,
          data: [mws200Year2, mws300Year2, mws500Year2, mws700Year2, mws715Year2],
          borderColor: 'rgb(34, 197, 94)',
          backgroundColor: 'rgba(34, 197, 94, 0.1)',
          borderWidth: 3,
          pointRadius: 5,
          pointBackgroundColor: 'rgb(34, 197, 94)',
          pointBorderColor: '#fff',
          pointBorderWidth: 2,
          tension: 0.3,
          fill: true
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false
      },
      plugins: {
        legend: {
          position: 'top',
          labels: {
            font: { size: 11, weight: 'bold' },
            padding: 15,
            usePointStyle: true,
            pointStyle: 'circle'
          }
        },
        datalabels: { display: false },
        tooltip: {
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          padding: 10,
          titleFont: { size: 12, weight: 'bold' },
          bodyFont: { size: 11 },
          callbacks: {
            label: (context) => {
              return `${context.dataset.label}: ${context.parsed.y}`;
            }
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          title: { display: true, text: 'Quantidade' },
          grid: { color: 'rgba(0, 0, 0, 0.05)' }
        },
        x: {
          title: { display: true, text: 'Equipamentos' },
          grid: { display: false }
        }
      }
    }
  });
}

function setupDetailedAnalysisChartListeners() {
  const inputsYear1 = ['detailMWS200Year1', 'detailMWS300Year1', 'detailMWS500Year1', 'detailMWS700Year1', 'detailMWS715Year1'];
  const inputsYear2 = ['detailMWS200Year2', 'detailMWS300Year2', 'detailMWS500Year2', 'detailMWS700Year2', 'detailMWS715Year2'];
  const allInputs = [...inputsYear1, ...inputsYear2];
  
  allInputs.forEach(id => {
    const elem = $(id);
    if (elem) {
      elem.addEventListener('input', updateDetailedAnalysisComparisonChart);
      elem.addEventListener('change', updateDetailedAnalysisComparisonChart);
    }
  });
}

function initDetailedAnalysisEvents() {
  const saveBtn = $('saveDetailedAnalysisBtn');
  if (!saveBtn) return;

  saveBtn.addEventListener('click', () => {
    const year1 = $('detailAnalysisYear1').value || '';
    const year2 = $('detailAnalysisYear2').value || '';
    const mws200Year1 = $('detailMWS200Year1').value || '';
    const mws300Year1 = $('detailMWS300Year1').value || '';
    const mws500Year1 = $('detailMWS500Year1').value || '';
    const mws700Year1 = $('detailMWS700Year1').value || '';
    const mws715Year1 = $('detailMWS715Year1').value || '';
    const mws200Year2 = $('detailMWS200Year2').value || '';
    const mws300Year2 = $('detailMWS300Year2').value || '';
    const mws500Year2 = $('detailMWS500Year2').value || '';
    const mws700Year2 = $('detailMWS700Year2').value || '';
    const mws715Year2 = $('detailMWS715Year2').value || '';
    const analysis = $('detailAnalysisText').value || '';

    // Verificar se há dados preenchidos
    const hasData = year1 || year2 || mws200Year1 || mws300Year1 || mws500Year1 || mws700Year1 || mws715Year1 || 
                    mws200Year2 || mws300Year2 || mws500Year2 || mws700Year2 || mws715Year2 || analysis;

    const key = getDetailedAnalysisKey();
    
    if (hasData) {
      saveDetailedAnalysisData(key, {
        year1, year2, 
        mws200Year1, mws300Year1, mws500Year1, mws700Year1, mws715Year1,
        mws200Year2, mws300Year2, mws500Year2, mws700Year2, mws715Year2,
        analysis
      });
      alert('Análise guardada com sucesso!');
    } else {
      deleteDetailedAnalysisData(key);
      alert('Análise limpa!');
    }
  });
}

/* ========= EVENTS ========= */

window.addEventListener('DOMContentLoaded', () => {
  $('loginBtn')?.addEventListener('click', handleLogin);
  $('refreshDataBtn')?.addEventListener('click', refreshData);
  $('exportPdfBtn')?.addEventListener('click', exportarRelatorio);
  $('logoutBtn')?.addEventListener('click', () => location.reload());

  // Initialize detailed analysis events
  initDetailedAnalysisEvents();

  $('passInput')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleLogin();
  });

  // Modal Entidades (admin)
  $('openEntidadeModal')?.addEventListener('click', openEntidadeModal);
  $('closeEntidadeModal')?.addEventListener('click', () => closeEntidadeModal(true));
  $('entidadeModalOverlay')?.addEventListener('click', () => closeEntidadeModal(true));

  $('entSelectAll')?.addEventListener('click', () => {
    entidadesSelecionadasTemp = entidadesDisponiveis.slice();
    renderEntidadeModalList(entidadesDisponiveis, entidadesSelecionadasTemp);
  });

  $('entClearAll')?.addEventListener('click', () => {
    entidadesSelecionadasTemp = [];
    renderEntidadeModalList(entidadesDisponiveis, entidadesSelecionadasTemp);
  });

  $('entidadeSearch')?.addEventListener('input', (e) => {
    const q = (e.target.value || '').toLowerCase().trim();
    const filtradas = !q ? entidadesDisponiveis : entidadesDisponiveis.filter(x => x.toLowerCase().includes(q));
    renderEntidadeModalList(filtradas, entidadesSelecionadasTemp);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const modal = $('entidadeModal');
      if (modal && !modal.classList.contains('hidden')) closeEntidadeModal(true);
    }
  });
});

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
  const icon = $('refreshIcon');
  const btn = $('refreshDataBtn');

  if (btn) {
    btn.disabled = true;
    btn.classList.add('opacity-75');
  }
  if (icon) icon.style.animation = 'spin 1.2s linear infinite';

  try {
    await fetchData();
    alert(`Dados atualizados com sucesso! (${allData.length} registos)`);
  } catch (e) {
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

async function exportarRelatorio() {
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
      pagebreak: { mode: ['avoid-all'] }
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

/* ========= EVENTS ========= */

window.addEventListener('DOMContentLoaded', () => {
  $('loginBtn')?.addEventListener('click', handleLogin);
  $('refreshDataBtn')?.addEventListener('click', refreshData);
  $('exportPdfBtn')?.addEventListener('click', exportarRelatorio);
  $('logoutBtn')?.addEventListener('click', () => location.reload());

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

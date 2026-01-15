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

Chart.register(ChartDataLabels);

/* ========= STATE ========= */

let sessionInfo = null;

let allData = [];            // tudo o que vem do Apps Script (AppSheet_Backend + Respostas do Formulário 1)
let selectedYears = [];
let selectedMonths = [];
let selectedEntidades = [];  // multi-select; vazio => "todas"

let charts = {};
let isFirstLoad = true;

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
  const v = row['Ano'] ?? row['ANO'] ?? row['ano'];
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function parseMonth(row) {
  const v = row['Mês'] ?? row['MÊS'] ?? row['MES'] ?? row['mes'] ?? row['mês'];
  if (v === null || v === undefined || v === '') return null;

  const n = Number(v);
  if (Number.isFinite(n) && n >= 1 && n <= 12) return n;

  const key = toLowerTrim(v);
  return MES_NOMES[key] ?? null;
}

function getEntidade(row) {
  return normalizeString(row['Entidade'] ?? row['ENTIDADE'] ?? row['entidade']);
}

function getStatus(row) {
  return toLowerTrim(row['Status'] ?? row['STATUS'] ?? row['status']);
}

function getKeyword(row) {
  const v = row['KEYWORD'] ?? row['Keyword'] ?? row['keyword'];
  return normalizeString(v);
}

function getTempoPrevisto(row) {
  const v = row['Tempo Previsto de Resolução (min)'] ?? row['tempo_resolucao_min'];
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function unique(arr) {
  return [...new Set(arr)];
}

/* ========= AUTH / LOGIN ========= */

function showLoginError(msg) {
  const err = $('loginError');
  const btn = $('loginBtn');
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
  const user = normalizeString($('userInput').value);
  const pass = normalizeString($('passInput').value);
  const btn = $('loginBtn');

  if (!user || !pass) return showLoginError("Preenche os dois campos.");

  btn.disabled = true;
  btn.innerText = "A validar...";

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
  $('loginView').classList.add('hidden');
  $('mainView').classList.remove('hidden');

  $('userWelcome').innerText = `Entidade: ${sessionInfo.username}`;

  // master vê filtro de entidades
  if (sessionInfo.filter === 'all') $('entidadeFilterContainer').classList.remove('hidden');

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

  btn.disabled = true;
  btn.classList.add('opacity-75');
  icon.style.animation = 'spin 1.2s linear infinite';

  try {
    await fetchData();
    alert(`Dados atualizados com sucesso! (${allData.length} registos)`);
  } catch (e) {
    alert(`Erro ao atualizar: ${e.message}`);
  } finally {
    icon.style.animation = 'none';
    btn.disabled = false;
    btn.classList.remove('opacity-75');
  }
}

/* ========= FILTERS ========= */

function initFilters() {
  const anosNosDados = unique(allData.map(parseYear).filter(Boolean)).sort((a, b) => b - a);
  const entidades = unique(allData.map(getEntidade).filter(Boolean)).sort((a, b) => a.localeCompare(b));

  const currentYear = new Date().getFullYear();
  const anos = anosNosDados.length
    ? anosNosDados
    : Array.from({ length: (currentYear - 2022 + 1) }, (_, i) => 2022 + i).sort((a, b) => b - a);

  const mesesCompletos = [1,2,3,4,5,6,7,8,9,10,11,12];

  // primeira carga: seleciona tudo
  if (isFirstLoad) {
    selectedYears = [...anos];
    selectedMonths = [...mesesCompletos];

    // se não for admin, “lock” à entidade do login
    if (sessionInfo.filter !== 'all') {
      selectedEntidades = [sessionInfo.filter];
    } else {
      selectedEntidades = []; // vazio = todas
    }

    isFirstLoad = false;
  }

  // ===== Entidades (multi-select) — apenas admin =====
  if (sessionInfo.filter === 'all') {
    const boxContainer = $('entidadeCheckboxes');
    if (boxContainer) {
      boxContainer.innerHTML = '';

      const selectedLower = selectedEntidades.map(e => e.toLowerCase());

      entidades.forEach(ent => {
        const safeId = ent.replace(/[^\w\-]/g, '_');
        const id = `ent_${safeId}`;

        const wrapper = document.createElement('label');
        wrapper.className = "flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-slate-700/40 cursor-pointer select-none";

        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.id = id;
        cb.value = ent;
        cb.className = "accent-blue-500";
        cb.checked = selectedLower.includes(ent.toLowerCase());

        cb.addEventListener('change', () => {
          const checked = Array.from(boxContainer.querySelectorAll('input[type="checkbox"]:checked'))
            .map(x => x.value);

          selectedEntidades = checked; // multi-select; vazio => todas
          updateDashboard();
        });

        const span = document.createElement('span');
        span.className = "text-white text-[11px] font-bold";
        span.innerText = ent;

        wrapper.appendChild(cb);
        wrapper.appendChild(span);
        boxContainer.appendChild(wrapper);
      });

      const btnAll = $('entSelectAll');
      const btnClear = $('entClearAll');

      if (btnAll) {
        btnAll.onclick = () => {
          Array.from(boxContainer.querySelectorAll('input[type="checkbox"]')).forEach(cb => cb.checked = true);
          selectedEntidades = entidades.slice();
          updateDashboard();
        };
      }

      if (btnClear) {
        btnClear.onclick = () => {
          Array.from(boxContainer.querySelectorAll('input[type="checkbox"]')).forEach(cb => cb.checked = false);
          selectedEntidades = []; // vazio => todas
          updateDashboard();
        };
      }
    }
  }

  // ===== Anos (botões) =====
  const yearContainer = $('yearCheckboxes');
  yearContainer.innerHTML = '';
  anos.forEach(ano => {
    const btn = document.createElement('button');
    btn.id = `year_${ano}`;
    btn.innerText = ano;
    btn.className = selectedYears.includes(ano)
      ? "px-4 py-1.5 rounded-xl text-[11px] font-black transition-all bg-blue-600 text-white shadow-sm"
      : "px-4 py-1.5 rounded-xl text-[11px] font-black transition-all bg-white text-slate-400 border border-slate-200 hover:bg-slate-50";
    btn.onclick = () => toggleYear(ano);
    yearContainer.appendChild(btn);
  });

  // ===== Meses (botões) =====
  const monthContainer = $('monthCheckboxes');
  monthContainer.innerHTML = '';
  mesesCompletos.forEach(m => {
    const btn = document.createElement('button');
    btn.id = `month_${m}`;
    btn.innerText = MESES_FULL[m - 1];
    btn.className = selectedMonths.includes(m)
      ? "px-4 py-1.5 rounded-xl text-[11px] font-black transition-all bg-purple-600 text-white shadow-sm"
      : "px-4 py-1.5 rounded-xl text-[11px] font-black transition-all bg-white text-slate-400 border border-slate-200 hover:bg-slate-50";
    btn.onclick = () => toggleMonth(m);
    monthContainer.appendChild(btn);
  });
}

function toggleYear(ano) {
  ano = Number(ano);
  const btn = $(`year_${ano}`);

  if (selectedYears.includes(ano)) {
    selectedYears = selectedYears.filter(y => y !== ano);
    btn.className = "px-4 py-1.5 rounded-xl text-[11px] font-black transition-all bg-white text-slate-400 border border-slate-200 hover:bg-slate-50";
  } else {
    selectedYears.push(ano);
    btn.className = "px-4 py-1.5 rounded-xl text-[11px] font-black transition-all bg-blue-600 text-white shadow-sm";
  }
  updateDashboard();
}

function toggleMonth(m) {
  const btn = $(`month_${m}`);

  if (selectedMonths.includes(m)) {
    selectedMonths = selectedMonths.filter(x => x !== m);
    btn.className = "px-4 py-1.5 rounded-xl text-[11px] font-black transition-all bg-white text-slate-400 border border-slate-200 hover:bg-slate-50";
  } else {
    selectedMonths.push(m);
    btn.className = "px-4 py-1.5 rounded-xl text-[11px] font-black transition-all bg-purple-600 text-white shadow-sm";
  }
  updateDashboard();
}

/* ========= MAIN UPDATE ========= */

function filterData() {
  const entFilter = selectedEntidades.map(toLowerTrim);

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

  // KPIs (status "aberto/fechado" — se tiveres outros estados depois afinamos)
  const abertas = filtered.filter(r => getStatus(r) === 'aberto').length;
  const fechadas = filtered.filter(r => getStatus(r) === 'fechado').length;
  const taxa = filtered.length > 0 ? Math.round((fechadas / filtered.length) * 100) : 0;

  $('kpiTotal').innerText = filtered.length;

  const entidadesAtivas = unique(filtered.map(getEntidade).filter(Boolean)).length;
  $('kpiEntidades').innerText = entidadesAtivas;

  $('kpiAberto').innerText = abertas;
  $('kpiTaxa').innerText = `${taxa}%`;

  // Charts
  renderTrendChart(filtered);                // ✅ 1 linha por ano, com cores
  renderPieChart(abertas, fechadas);
  renderYearComparisonChart(filtered);
  renderKeywordCharts(filtered);            // ✅ Top 5 keywords com cores por ano
  renderTopKeywordByYear(filtered);

  // Tempo Previsto
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

// 1) Tendência Mensal — 1 dataset por Ano (cores diferentes)
function renderTrendChart(data) {
  const porAno = {};

  data.forEach(row => {
    const ano = parseYear(row);
    const mes = parseMonth(row);
    if (!ano || !mes) return;

    if (!porAno[ano]) porAno[ano] = Array(12).fill(0);
    porAno[ano][mes - 1] += 1;
  });

  const anosOrdenados = Object.keys(porAno).map(Number).sort((a, b) => a - b);

  const cores = [
    { line: 'rgba(59,130,246,1)', fill: 'rgba(59,130,246,0.2)' },
    { line: 'rgba(16,185,129,1)', fill: 'rgba(16,185,129,0.2)' },
    { line: 'rgba(139,92,246,1)', fill: 'rgba(139,92,246,0.2)' },
    { line: 'rgba(234,88,12,1)', fill: 'rgba(234,88,12,0.2)' },
    { line: 'rgba(220,38,38,1)', fill: 'rgba(220,38,38,0.2)' }
  ];

  const datasets = anosOrdenados.map((ano, idx) => {
    const cor = cores[idx % cores.length];
    return {
      label: String(ano),
      data: porAno[ano],
      borderColor: cor.line,
      backgroundColor: cor.fill,
      tension: 0.35,
      fill: true,
      pointRadius: 3,
      pointHoverRadius: 5
    };
  });

  destroyChart('trend');

  charts.trend = new Chart($('lineTrendChart'), {
    type: 'line',
    data: { labels: MESES_ABREV, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
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

  charts.pie = new Chart($('rncPieChart'), {
    type: 'doughnut',
    data: {
      labels: ['Aberto', 'Fechado'],
      datasets: [{ data: [aberto, fechado], borderWidth: 0 }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
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
  const years = unique(data.map(parseYear).filter(Boolean)).sort((a, b) => a - b);

  const yearCounts = years.reduce((acc, y) => {
    acc[y] = data.filter(r => parseYear(r) === y).length;
    return acc;
  }, {});

  destroyChart('yearBar');

  charts.yearBar = new Chart($('yearComparisonChart'), {
    type: 'bar',
    data: {
      labels: Object.keys(yearCounts),
      datasets: [{
        data: Object.values(yearCounts),
        borderRadius: 12,
        barThickness: 30
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false }, datalabels: { display: false } },
      scales: { y: { beginAtZero: true }, x: { grid: { display: false } } }
    }
  });
}

// 2) Top 5 Keywords — barras agrupadas por Ano (cores por ano)
function renderKeywordCharts(data) {
  const listContainer = $('keywordPercentageList');

  if (!data || data.length === 0) {
    listContainer.innerHTML = '<p class="text-slate-400 text-sm text-center py-8">Sem dados</p>';
    destroyChart('kwTop');
    return;
  }

  const counts = data.reduce((acc, r) => {
    const kw = getKeyword(r);
    if (!kw) return acc;
    acc[kw] = (acc[kw] || 0) + 1;
    return acc;
  }, {});

  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const total = data.length;

  // ---------- Top 5 Keywords (com separação por Ano) ----------
  const top5Keywords = sorted.slice(0, 5).map(x => x[0]);

  const anosPresentes = unique(
    data.map(parseYear).filter(y => y && (selectedYears.length === 0 || selectedYears.includes(y)))
  ).sort((a, b) => a - b);

  const cores = [
    { bg: 'rgba(59,130,246,0.7)', border: 'rgba(59,130,246,1)' },
    { bg: 'rgba(16,185,129,0.7)', border: 'rgba(16,185,129,1)' },
    { bg: 'rgba(139,92,246,0.7)', border: 'rgba(139,92,246,1)' },
    { bg: 'rgba(234,88,12,0.7)', border: 'rgba(234,88,12,1)' },
    { bg: 'rgba(220,38,38,0.7)', border: 'rgba(220,38,38,1)' }
  ];

  const datasets = anosPresentes.map((ano, idx) => {
    const cor = cores[idx % cores.length];
    const yearCounts = top5Keywords.map(kw => {
      return data.filter(r => parseYear(r) === ano && getKeyword(r) === kw).length;
    });

    return {
      label: String(ano),
      data: yearCounts,
      backgroundColor: cor.bg,
      borderColor: cor.border,
      borderWidth: 1,
      borderRadius: 8
    };
  });

  destroyChart('kwTop');

  charts.kwTop = new Chart($('topKeywordsChart'), {
    type: 'bar',
    data: {
      labels: top5Keywords,
      datasets
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: { usePointStyle: true, pointStyle: 'circle', font: { weight: 'bold' } }
        },
        datalabels: { display: false }
      },
      scales: {
        y: { beginAtZero: true, ticks: { stepSize: 1 } },
        x: { grid: { display: false } }
      }
    }
  });

  // ---------- Lista % completa ----------
  listContainer.innerHTML = sorted.map(([kw, count]) => {
    const perc = total > 0 ? ((count / total) * 100).toFixed(1) : '0.0';
    return `
      <div class="animate-fade p-2 hover:bg-slate-50 rounded-xl">
        <div class="flex justify-between items-center mb-1">
          <span class="text-[10px] font-bold text-slate-700 truncate">${kw}</span>
          <span class="text-[9px] font-black text-blue-600">${perc}%</span>
        </div>
        <div class="w-full bg-slate-100 rounded-full h-1">
          <div class="bg-blue-500 h-1 rounded-full" style="width:${perc}%"></div>
        </div>
      </div>
    `;
  }).join('');
}

function renderTopKeywordByYear(data) {
  const container = $('topKeywordByYearContainer');

  const byYear = {};
  data.forEach(r => {
    const y = parseYear(r);
    const kw = getKeyword(r);
    if (!y || !kw) return;

    byYear[y] ||= {};
    byYear[y][kw] = (byYear[y][kw] || 0) + 1;
  });

  const years = Object.keys(byYear).map(Number).sort((a, b) => b - a);
  if (years.length === 0) {
    container.innerHTML = '<p class="text-slate-400 text-sm text-center py-8">Sem dados</p>';
    return;
  }

  const topByYear = years.map(y => {
    const entries = Object.entries(byYear[y]).sort((a, b) => b[1] - a[1]);
    return { ano: y, keyword: entries[0][0], count: entries[0][1] };
  });

  container.innerHTML = topByYear.map(item => `
    <div class="animate-fade p-4 bg-slate-50 rounded-xl border border-slate-200 hover:border-green-300 transition-all">
      <div class="flex justify-between items-start mb-2">
        <div>
          <p class="text-[11px] font-bold text-slate-400 uppercase mb-1">Ano ${item.ano}</p>
          <p class="text-lg font-black text-slate-800">${item.keyword}</p>
        </div>
        <div class="text-right">
          <p class="text-2xl font-black text-green-600">${item.count}</p>
          <p class="text-[9px] text-slate-400 font-bold">registos</p>
        </div>
      </div>
    </div>
  `).join('');
}

function renderTempoResolucaoChart(data) {
  const tempos = data.map(getTempoPrevisto).filter(t => Number.isFinite(t) && t >= 0);

  if (tempos.length === 0) {
    $('tempoMedio').innerText = '-';
    $('tempoMaximo').innerText = '-';
    $('tempoMinimo').innerText = '-';
    $('tempoDesvio').innerText = '-';

    destroyChart('tempoResolucao');
    return;
  }

  const media = tempos.reduce((a, b) => a + b, 0) / tempos.length;
  const maximo = Math.max(...tempos);
  const minimo = Math.min(...tempos);
  const variancia = tempos.reduce((sum, t) => sum + Math.pow(t - media, 2), 0) / tempos.length;
  const desvio = Math.sqrt(variancia);

  $('tempoMedio').innerText = Math.round(media);
  $('tempoMaximo').innerText = maximo;
  $('tempoMinimo').innerText = minimo;
  $('tempoDesvio').innerText = desvio.toFixed(1);

  const binSize = 10;
  const maxBin = Math.ceil(maximo / binSize) * binSize;
  const bins = {};
  for (let i = 0; i <= maxBin; i += binSize) bins[`${i}-${i + binSize}min`] = 0;

  tempos.forEach(t => {
    const b = Math.floor(t / binSize) * binSize;
    const label = `${b}-${b + binSize}min`;
    bins[label] = (bins[label] || 0) + 1;
  });

  destroyChart('tempoResolucao');

  charts.tempoResolucao = new Chart($('tempoResolucaoChart'), {
    type: 'bar',
    data: {
      labels: Object.keys(bins),
      datasets: [{
        label: 'Quantidade de RNCs',
        data: Object.values(bins),
        borderRadius: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: true, position: 'top' },
        datalabels: { display: false }
      },
      scales: {
        y: { beginAtZero: true, ticks: { stepSize: 1 } },
        x: { title: { display: true, text: 'Tempo Previsto de Resolução (minutos)' } }
      }
    }
  });
}

/* ========= PDF EXPORT ========= */

function safeCanvasDataUrl(canvasId) {
  const c = document.getElementById(canvasId);
  if (!c || typeof c.toDataURL !== 'function') return '';
  try {
    return c.toDataURL('image/png', 1.0);
  } catch (e) {
    console.warn(`Falha ao exportar canvas ${canvasId}:`, e);
    return '';
  }
}

function kpiBox(title, value, color) {
  return `
    <div style="border:1px solid #e2e8f0; padding:10px; border-radius:8px; text-align:center;">
      <p style="margin:0; font-size:8px; color:#94a3b8; font-weight:700; text-transform:uppercase;">${title}</p>
      <p style="margin:4px 0 0 0; font-size:22px; font-weight:800; color:${color};">${value}</p>
    </div>
  `;
}

function imgCard(title, imgDataUrl) {
  if (!imgDataUrl) {
    return `
      <div style="border:1px solid #e2e8f0; padding:8px; border-radius:8px;">
        <h3 style="margin:0 0 8px 0; font-size:10px; font-weight:700; border-bottom:1px solid #e2e8f0; padding-bottom:4px;">${title}</h3>
        <p style="margin:0; font-size:10px; color:#94a3b8;">(Gráfico indisponível)</p>
      </div>
    `;
  }

  return `
    <div style="border:1px solid #e2e8f0; padding:8px; border-radius:8px;">
      <h3 style="margin:0 0 8px 0; font-size:10px; font-weight:700; border-bottom:1px solid #e2e8f0; padding-bottom:4px;">${title}</h3>
      <img src="${imgDataUrl}" style="width:100%; height:auto; object-fit:contain;">
    </div>
  `;
}

function exportarRelatorio() {
  // usa os mesmos filtros atuais
  const filtered = filterData();

  // textos de filtros
  const anosTexto = selectedYears.length ? selectedYears.slice().sort((a,b)=>a-b).join(', ') : 'Todos';
  const mesesTexto = selectedMonths.length
    ? selectedMonths.slice().sort((a,b)=>a-b).map(m => MESES_FULL[m - 1]).join(', ')
    : 'Todos';

  const entidadeTexto = (sessionInfo?.filter && sessionInfo.filter !== 'all')
    ? sessionInfo.filter
    : (selectedEntidades.length ? selectedEntidades.join(', ') : 'Todas');

  const periodoTexto = `${mesesTexto} (${anosTexto})`;

  // KPIs
  const abertas = filtered.filter(d => getStatus(d) === 'aberto').length;
  const fechadas = filtered.filter(d => getStatus(d) === 'fechado').length;
  const taxa = filtered.length > 0 ? Math.round((fechadas / filtered.length) * 100) : 0;
  const entidadesUnicas = unique(filtered.map(getEntidade).filter(Boolean)).length;

  // Tempo previsto stats
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

  // Capturar imagens dos charts (já com multi-ano e multi-keyword)
  const trendChartImg = safeCanvasDataUrl('lineTrendChart');
  const yearChartImg = safeCanvasDataUrl('yearComparisonChart');
  const pieChartImg = safeCanvasDataUrl('rncPieChart');
  const topKeywordsImg = safeCanvasDataUrl('topKeywordsChart');
  const tempoResolucaoImg = safeCanvasDataUrl('tempoResolucaoChart');

  // Conteúdo HTML do PDF
  const html = `
    <div style="font-family: Arial, sans-serif; background:#fff; color:#0f172a; padding: 14px;">
      <div style="margin-bottom: 12px; padding-bottom: 10px; border-bottom: 3px solid #0f172a;">
        <div style="display:flex; align-items:center; gap:10px; margin-bottom:6px;">
          <img src="https://static.wixstatic.com/media/a6967f_4036f3eb3c1b4a47988293dd3da29925~mv2.png" style="height: 32px;">
        </div>
        <h1 style="margin:0; font-size: 20px; font-weight: 700;">Dashboard de Qualidade</h1>
        <p style="margin:2px 0 0 0; font-size: 11px; color:#64748b;">Sistema de Análise de Não Conformidades</p>
      </div>

      <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; margin-bottom:10px; font-size:10px;">
        <div style="background:#f1f5f9; padding:8px; border-radius:6px; border-left:3px solid #3b82f6;">
          <p style="margin:0; font-weight:700; font-size:8px; text-transform:uppercase; color:#64748b;">Entidade</p>
          <p style="margin:3px 0 0 0; font-weight:700; font-size:11px; line-height:1.2;">${entidadeTexto}</p>
        </div>
        <div style="background:#f1f5f9; padding:8px; border-radius:6px; border-left:3px solid #8b5cf6;">
          <p style="margin:0; font-weight:700; font-size:8px; text-transform:uppercase; color:#64748b;">Período</p>
          <p style="margin:3px 0 0 0; font-weight:700; font-size:9px; line-height:1.3;">${periodoTexto}</p>
        </div>
      </div>

      <div style="display:grid; grid-template-columns: repeat(4, 1fr); gap:8px; margin-bottom:10px;">
        ${kpiBox('Total Registos', filtered.length, '#0f172a')}
        ${kpiBox('Entidades Ativas', entidadesUnicas, '#2563eb')}
        ${kpiBox('RNCs em Aberto', abertas, '#ef4444')}
        ${kpiBox('Taxa de Resolução', taxa + '%', '#16a34a')}
      </div>

      <div style="display:grid; grid-template-columns: 2fr 1fr; gap:10px; margin-bottom:10px;">
        ${imgCard('Tendência Mensal (por Ano)', trendChartImg)}
        ${imgCard('Status Geral RNCs', pieChartImg)}
      </div>

      <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; margin-bottom:10px;">
        ${imgCard('Total RNCs por Ano', yearChartImg)}
        ${imgCard('Top 5 Keywords (por Ano)', topKeywordsImg)}
      </div>

      <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; margin-bottom:10px;">
        ${imgCard('Tempo Previsto de Resolução', tempoResolucaoImg)}
        <div style="border:1px solid #e2e8f0; padding:8px; border-radius:8px;">
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

      <div style="margin-top:10px; display:flex; justify-content:flex-end;">
        <img src="https://static.wixstatic.com/media/a6967f_0db968f0a9864debae3bd716ad0ebeb6~mv2.png" style="height: 22px; opacity:0.75;">
      </div>
    </div>
  `;

  const opt = {
    margin: 0.35,
    filename: `Relatorio_Qualidade_${new Date().toISOString().slice(0,10)}.pdf`,
    image: { type: 'jpeg', quality: 0.95 },
    html2canvas: { scale: 2, useCORS: true },
    jsPDF: { unit: 'in', format: 'a4', orientation: 'portrait' }
  };

  // pequeno delay para garantir que o Chart.js terminou de desenhar
  setTimeout(() => {
    html2pdf().set(opt).from(html).save();
  }, 250);
}

/* ========= EVENTS ========= */

window.addEventListener('DOMContentLoaded', () => {
  $('loginBtn').addEventListener('click', handleLogin);
  $('refreshDataBtn').addEventListener('click', refreshData);
  $('exportPdfBtn').addEventListener('click', exportarRelatorio);
  $('logoutBtn').addEventListener('click', () => location.reload());

  // enter no login
  $('passInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleLogin();
  });

  // Toggle da secção Entidade (abre só ao clicar)
  const entToggle = $('entidadeToggle');
  const entContent = $('entidadeContent');
  const entChevron = $('entidadeChevron');

  if (entToggle && entContent && entChevron) {
    entToggle.addEventListener('click', () => {
      const aberto = !entContent.classList.contains('hidden');
      entContent.classList.toggle('hidden', aberto);
      entChevron.style.transform = aberto ? 'rotate(0deg)' : 'rotate(180deg)';
    });
  }
});

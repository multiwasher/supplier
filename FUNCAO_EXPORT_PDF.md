# Função de Export PDF - Documentação Técnica

## Descrição Geral
A função `exportarRelatorio()` é responsável por gerar um relatório em PDF com 2 páginas:
- **Página 1**: Dashboard principal com KPIs, gráficos e estatísticas
- **Página 2**: Análise em Detalhe com distribuição de equipamentos e gráficos de tendência

---

## Código Completo da Função

```javascript
async function exportarRelatorio() {
  const btn = $('exportPdfBtn');
  if (btn) { btn.disabled = true; btn.cl1assList.add('opacity-75'); }

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

    pdf.addImage(imgData, 'PNG', PAD_MM, PAD_MM, CONTENT_W_MM, CONTENT_H_MM, undefined, 'FAST');

    // Get selected years for PDF labels
    const pdfYear1 = $('detailYear1Select')?.value || 'Ano 1';
    const pdfYear2 = $('detailYear2Select')?.value || 'Ano 2';
    const pdfYear1Label = `Ano ${pdfYear1}`;
    const pdfYear2Label = `Ano ${pdfYear2}`;
    const pdfTrendTitle = `Comparação de Tendências - ${pdfYear1Label} vs ${pdfYear2Label}`;

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

    // Save PDF with current date
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
}
```

---

## Estrutura e Fluxo

### Fase 1: Inicialização
- Desabilita botão de export para evitar duplos cliques
- Define constantes de tamanho A4 (210x297 mm)
- Converte mm para px para layout estável
- Guarda posição de scroll anterior

### Fase 2: Preparação de Dados
- Valida se html2canvas e jsPDF estão carregados
- Filtra dados conforme seleções (entidades, meses, anos)
- Calcula KPIs: status (aberto/fechado), taxa de resolução, tempos
- Extrai imagens dos charts em DataURL

### Fase 3: Renderização Página 1
- Cria div invisível com posição fixa
- Injeta HTML com template strings
- Renderiza KPIs, gráficos e análise em detalhe
- Auto-ajusta altura das linhas para caber na página

### Fase 4: Captura e PDF
- Usa html2canvas para converter wrapper em imagem PNG
- Cria PDF A4 com jsPDF
- Adiciona imagem da Página 1 no PDF

### Fase 5: Renderização Página 2
- Cria novo wrapper para análise em detalhe
- Renderiza 2 pie charts (ano 1 e ano 2) + gráfico de tendências
- Mostra análise pessoal armazenada em localStorage
- Captura e adiciona ao PDF

### Fase 6: Limpeza
- Restaura scroll original
- Remove elementos temporários (stages)
- Reabilita botão
- Restaura devicePixelRatio dos charts

---

## Dependências

### Externas (via CDN)
- **html2canvas**: Converte DOM em canvas
- **jsPDF**: Cria e manipula PDFs
- **Chart.js v3+**: Renderiza os charts

### Internas
- `filterData()` - Filtra dados conforme filtros
- `safeCanvasDataUrl()` - Extrai DataURL de canvas
- `kpiBox()` - Helper para render KPI boxes
- `imgCard()` - Helper para render cards com imagens
- `waitTwoFrames()` - Aguarda 2 frames (timing)
- `$()` - Alias para document.getElementById
- `getStatus()`, `getEntidade()`, `getTempoPrevisto()` - Getters de dados
- `unique()` - Remove duplicatas de array

### Globais
- `charts` - Objecto com instâncias Chart.js
- `selectedYears`, `selectedMonths`, `selectedEntidades` - Arrays de seleção
- `sessionInfo` - Info de sessão
- `DETAILED_ANALYSIS_STORAGE_KEY` - Chave localStorage para análises
- `MESES_FULL` - Array com nomes dos meses

---

## Funcionalidades Principais

### ✅ Geração de 2 Páginas
1. **Página 1**: Dashboard com KPIs, gráficos de tendência, status, keywords
2. **Página 2**: Análise em Detalhe com distribuição de equipamentos

### ✅ Labels Dinâmicos
- Pie charts mostram os anos reais selecionados (ex: "Ano 2024", "Ano 2025")
- Gráfico de tendências mostra "Comparação de Tendências - Ano 2024 vs Ano 2025"

### ✅ Auto-Fit de Altura
- Algoritmo iterativo que ajusta altura das linhas (row1, row2, row3)
- Garante que conteúdo cabe exactamente na página

### ✅ Alta Definição
- Scale 3x durante export
- Garante qualidade visual no PDF final

### ✅ Tratamento de Erros
- Validação de dependências (html2canvas, jsPDF)
- Try-catch com feedback de erro
- Limpeza garantida via finally

---

## Nomes de Arquivo

O PDF é guardado com o formato:
```
Relatorio_Qualidade_AAAA-MM-DD.pdf
```

Exemplo: `Relatorio_Qualidade_2025-01-22.pdf`

---

## Notas Técnicas

### Sincronização Assíncrona
- `await waitTwoFrames()` evita race conditions de rendering
- `await Promise.all(imgs.map(...))` aguarda carregar todas as imagens
- `await html2canvas()` aguarda captura completa

### Preservação de Estado
- Scroll position guardada e restaurada
- DPR (device pixel ratio) guardado e restaurado
- Overflow CSS guardado e restaurado

### Compensação de Offset
- `scrollX: -oldScrollX` e `scrollY: -oldScrollY` compensam scroll
- Evita "fatia cortada" do lado esquerdo/superior

---

## Debug

Para debugar a função:
1. Abra DevTools (F12)
2. Clique "Exportar PDF"
3. Inspecione `#pdfStage` e `#pdfStage2` no DOM
4. Verifique console.error() para erros


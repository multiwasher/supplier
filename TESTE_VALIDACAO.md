# ✅ Checklist de Validação - Tempo Previsto de Resolução

## 🎯 Antes de Começar

**IMPORTANTE**: O Google Apps Script precisa ser atualizado primeiro!

Veja: `GOOGLE_APPS_SCRIPT_UPDATE.md`

## 📋 Passo a Passo de Teste

### Fase 1: Frontend (Já Pronto ✅)

- [x] Dashboard abre sem erros
- [x] Novos campos HTML adicionados (Row 4)
- [x] Função `renderTempoResolucaoChart()` pronta
- [x] Gráfico integrado com Chart.js
- [x] KPIs formatados
- [x] PDF export inclui novo gráfico

### Fase 2: Google Apps Script (PENDENTE)

**Ação Necessária**:
1. Abrir Google Apps Script do seu projeto
2. Copiar código em `GOOGLE_APPS_SCRIPT_UPDATE.md`
3. Adicionar ao `doPost(e)` ou `getSheetData()`
4. Deploy nova versão
5. Testar

**Comando de Deploy**:
```
Deploy > New Deployment > Type: Web app
```

### Fase 3: Validação do Dashboard

Após atualizar Apps Script:

1. **Abrir o Dashboard**
   ```
   ✓ Login com dsqa / 789987
   ✓ Dashboard carrega sem erros
   ```

2. **Procurar a Nova Secção**
   ```
   ✓ Scroll para baixo (depois de "Top 5 Keywords")
   ✓ Ver novo quadro "Tempo Previsto de Resolução"
   ✓ 2 partes: Gráfico esquerda + Estatísticas direita
   ```

3. **Testar Sem Filtros**
   ```
   ✓ Gráfico mostra histograma com bins (0-9, 10-19, etc.)
   ✓ KPIs mostram números (não "-")
   ✓ Cores corretas: Teal para gráfico
   ```

4. **Testar Com Filtros**
   ```
   ✓ Selecionar uma Entidade específica
   ✓ Selecionar um Ano específico
   ✓ Gráfico atualiza em tempo real
   ✓ Números dos KPIs mudam
   ✓ Se não há dados → mostra "-"
   ```

5. **Testar PDF Export**
   ```
   ✓ Clicar "Exportar Relatório"
   ✓ PDF gerado com sucesso
   ✓ Página 2 tem novo gráfico
   ✓ Indicador visual (ponto teal)
   ✓ Antes de "Distribuição de Keywords"
   ```

## 🔍 O que Procurar

### ✅ Sinais de Sucesso

| Aspecto | Resultado | Status |
|---------|-----------|--------|
| Gráfico aparece | Histograma com cores teal | ✓ |
| Tempo Médio | Número (ex: 25) | ✓ |
| Tempo Máximo | Número > Médio | ✓ |
| Tempo Mínimo | Número < Médio | ✓ |
| Desvio Padrão | Número com 1 decimal | ✓ |
| PDF Página 2 | Gráfico visível | ✓ |

### ⚠️ Sinais de Problema

| Problema | Causa Provável | Solução |
|----------|-----------------|---------|
| "Sem dados..." | Apps Script não retorna campo | Atualizar Apps Script |
| KPIs mostram "-" | Sem dados no período | Selecionar mais filtros |
| Gráfico vazio | Dados insuficientes | Aumentar período |
| PDF em branco | Campo não existe | Verificar nome coluna |
| JavaScript error | Syntax error | Verificar console (F12) |

## 📊 Dados de Teste Esperados

Se você tiver dados no separador "RNC_cativação":

**Exemplo de Resultado**:
```
Análise de 15 RNCs em 2024:

Gráfico (Histograma):
  0-9 dias:    ███     (3 RNCs)
  10-19 dias:  █████   (5 RNCs)
  20-29 dias:  ███     (4 RNCs)
  30-39 dias:  ██      (2 RNCs)
  40-49 dias:  ██      (1 RNC)

Estatísticas:
  Tempo Médio: 21 dias
  Tempo Máximo: 48 dias
  Tempo Mínimo: 3 dias
  Desvio Padrão: 14.2
```

## 🛠️ Troubleshooting

### Problema 1: "Tempo Previsto de Resolução é indefinido"

**Causa**: Campo não existe ou nome diferente

**Solução**:
1. Verificar nome exato da coluna no Google Sheets
2. Atualizar na função `renderTempoResolucaoChart()`:
   ```javascript
   let tempo = d['seu_nome_exato'] || ...
   ```

### Problema 2: Gráfico aparece mas sem dados

**Causa**: Dados ausentes ou formato errado

**Solução**:
1. Verificar se dados estão numéricos (não texto)
2. Testar: `parseInt("25")` deve retornar `25`
3. Se for data, converter para número de dias

### Problema 3: PDF não inclui gráfico

**Causa**: Canvas não renderizado a tempo

**Solução**:
- Aumentar timeout em `exportarRelatorio()`:
  ```javascript
  setTimeout(() => { ... }, 1000);  // Mudar 500 para 1000
  ```

## 📞 Validação com Equipa

Após validação completa:

1. **Com Técnico de TI**:
   - [ ] Google Apps Script deployado
   - [ ] Nenhum erro na console
   - [ ] Dados retornam corretamente

2. **Com Utilizador Final**:
   - [ ] Relatório faz sentido
   - [ ] Números estão corretos
   - [ ] Filtros funcionam
   - [ ] PDF é útil

3. **Documentação**:
   - [ ] Utilizadores sabem que existe
   - [ ] Sabem como interpretar
   - [ ] Sabem usar filtros

## ✨ Conclusão

**Quando tudo estiver verde ✅**:

A análise de "Tempo Previsto de Resolução" está:
- Visível no dashboard
- Responde aos filtros
- Exporta para PDF
- Pronta para produção

**Tempo estimado**: 15-30 minutos de implementação no Apps Script + 5 min testes

---

**Data de Implementação**: 14 Jan 2026
**Status**: 🟡 Aguardando atualização do Apps Script

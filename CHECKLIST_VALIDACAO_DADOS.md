# 🔧 Checklist de Validação - Apps Script & Dados

> Use este documento para validar que o Google Apps Script e os dados estão corretos

---

## 📋 1. Validar Google Apps Script

### 1.1 Verificar função `doPost()`

**Abrir Google Apps Script**:
1. Abra seu Google Sheet
2. Menu **Extensões** → **Apps Script**
3. Procure pela função `doPost(e)`

**O código deve conter**:
```javascript
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const action = data.action;
    
    if (action === 'getSheetData') {
      return ContentService.createTextOutput(JSON.stringify(getSheetData()))
        .setMimeType(ContentService.MimeType.JSON);
    }
    // ... resto do código
  } catch (e) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, message: "Erro: " + e.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
```

**Status**: ✅ ❌ `doPost()` está presente e correto?

---

### 1.2 Verificar função `getSheetData()`

**O código deve conter**:
```javascript
function getSheetData() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let allData = [];
    
    // ... procura de dados nas várias sheets ...
    
    // ⚠️ IMPORTANTE: Deve ter RNC_cativação com merge
    const sheetRncCativacao = ss.getSheetByName('RNC_cativação');
    if (sheetRncCativacao) {
      const dataCativacao = sheetRncCativacao.getDataRange().getValues();
      // ... merge de dados ...
    }
    
    return allData;
  } catch (e) {
    Logger.log("Erro: " + e.toString());
    return [];
  }
}
```

**Status**: ✅ ❌ `getSheetData()` faz merge de `RNC_cativação`?

---

## 📊 2. Validar Sheets e Campos

### 2.1 Verificar Sheets Necessárias

**Abrir Google Sheet** e procurar por:

| Sheet | Status | Notas |
|-------|--------|-------|
| `AppSheet_Backend` ou principal | ✅ ❌ | Deve ter: id, ano, mês, entidade, status, ... |
| `RNC_cativação` | ✅ ❌ | Deve ter: id, tempo previsto de resolução (min), ... |

---

### 2.2 Validar Campo de Tempo

**Na sheet `RNC_cativação`**:
1. Abrir a sheet
2. Procurar pelo header (primeira linha)
3. Deve existir uma coluna com nome exato:

```
"tempo previsto de resolução (min)"
```

ou uma destas variações:
- `tempo previsto de resolução`
- `Tempo Previsto de Resolução (min)`
- `tempo_previsto_de_resolucao`

**⚠️ IMPORTANTE**: O nome deve estar EXATAMENTE como no Google Sheets!

**Status**: ✅ ❌ Campo de tempo existe e tem dados?

---

### 2.3 Validar Dados de Tempo

**Verifique que**:
1. A coluna de tempo tem **números** (não texto)
2. Os números são > 0 (minutos válidos)
3. Pelo menos alguns registos têm valor preenchido

**Exemplo de dados válidos**:
```
ID    | Entidade | Tempo Previsto
------|----------|----------------
123   | RoqLaser | 240
124   | RoqLaser | 180
125   | Somengil | 300
```

**Status**: ✅ ❌ Dados de tempo estão preenchidos?

---

## 🔄 3. Validar Merge de Dados

### 3.1 Testar Fetch de Dados

**Abrir Console do Dashboard**:
1. Fazer login no dashboard
2. Abrir F12 → Console
3. Ver se aparece:
```
✓ Registos após filtros: XX de XX
```

### 3.2 Inspecionar Dados Carregados

**Na Console, escreva**:
```javascript
console.log(allData[0])
```

**Pressione Enter**

**Deve mostrar um objeto com campos como**:
```javascript
{
  id: 123,
  ano: 2024,
  mês: "JANEIRO",
  entidade: "RoqLaser",
  status: "Aberto",
  ...
  "tempo previsto de resolução (min)": 240,  // ← Este deve existir!
  ...
}
```

**Status**: ✅ ❌ Campo `"tempo previsto de resolução (min)"` aparece?

---

### 3.3 Verificar Merge Específico

**Na Console, escreva**:
```javascript
// Procurar registos com tempo preenchido
const comTempo = allData.filter(d => d['tempo previsto de resolução (min)']);
console.log('Registos com tempo:', comTempo.length, 'de', allData.length);
console.log('Primeiros com tempo:', comTempo.slice(0, 3));
```

**Resultado esperado**:
```
Registos com tempo: 50 de 120
Primeiros com tempo: [
  { id: 123, tempo: 240, ... },
  { id: 124, tempo: 180, ... },
  { id: 125, tempo: 300, ... }
]
```

**Status**: ✅ ❌ Existem registos com tempo preenchido?

---

## 🧪 4. Testar Atualização de Filtros

### 4.1 Teste Prático

1. **Dashboard carregado**
2. **Console aberto (F12)**
3. **Execute**:
```javascript
// Mudar filtros para 2024 apenas
selectedYears = [2024];
selectedMonths = [1];
updateDashboard();
```

**Observe no Console**:
```
🔄 updateDashboard chamado...
  selectedYears: [2024]
  selectedMonths: [1]
✓ Registos após filtros: 12
```

**E depois deve aparecer**:
```
✓ Gráfico de Tempo Previsto atualizado com sucesso
```

**Status**: ✅ ❌ Gráfico atualiza sem erros?

---

### 4.2 Teste com Cliques

1. **Clique num ano diferente** (ex: 2024)
2. **Observe o gráfico** (deve atualizar)
3. **Console deve mostrar**:
```
renderTempoResolucaoChart - Registos recebidos: XX
✓ Gráfico de Tempo Previsto atualizado com sucesso
```

**Status**: ✅ ❌ Gráfico atualiza ao clicar em anos?

---

## 🐛 5. Diagnosticar Problemas

### Problema: "Sem dados de Tempo Previsto"

**Execute na Console**:
```javascript
// Ver quais campos existem
console.log('Campos no primeiro registo:', Object.keys(allData[0]));

// Procurar campo de tempo
const campos = Object.keys(allData[0]);
const tempoField = campos.find(f => f.toLowerCase().includes('tempo'));
console.log('Campo com "tempo":', tempoField);
```

**Se não encontrar**, significa:
- ❌ O merge de `RNC_cativação` não está a funcionar
- ❌ O campo não existe em `RNC_cativação`
- ❌ O Apps Script não foi atualizado

**Ação**: Verificar **Secção 1.2** acima

---

### Problema: "Tempos extraídos: 0"

**Execute na Console**:
```javascript
// Ver primeiro registo com tempo
const comTempo = allData.find(d => d['tempo previsto de resolução (min)']);
console.log('Exemplo com tempo:', comTempo);

// Ver tipo de dado
console.log('Tipo:', typeof comTempo['tempo previsto de resolução (min)']);
console.log('Valor:', comTempo['tempo previsto de resolução (min)']);
console.log('Parse:', parseInt(comTempo['tempo previsto de resolução (min)']));
```

**Se der NaN ou erro**:
- ❌ O campo tem texto em vez de números
- ❌ O campo tem valores inválidos

**Ação**: Verificar dados na sheet `RNC_cativação`

---

## 🚀 6. Checklist Final

Antes de marcar como "Resolvido", confirme:

- [ ] `doPost()` no Apps Script existe e tem `getSheetData()`
- [ ] `getSheetData()` faz merge de `RNC_cativação`
- [ ] Sheet `RNC_cativação` existe
- [ ] Campo `"tempo previsto de resolução (min)"` existe em `RNC_cativação`
- [ ] Campo tem dados (números > 0)
- [ ] `allData[0]` contém o campo de tempo
- [ ] Dashboard mostra "Tempo Previsto de Resolução" sem erros
- [ ] Gráfico atualiza ao mudar filtros de anos
- [ ] Console não mostra erros vermelhos

---

## 📞 Resultado

Se **TODOS** os pontos estiverem ✅:
- **Problema está resolvido** ✨

Se algum estiver ❌:
- **Consulte a secção "Diagnosticar Problemas"**
- **Ou contacte desenvolvimento com o checklist preenchido**


# 🔍 SOLUÇÃO ENCONTRADA: Chaves Diferentes!

A chave é **diferente em cada sheet**:
- **AppSheet_Backend**: coluna `H`
- **RNC_cativação**: coluna `#RNC`

👉 **Leia a solução rápida:** [CORRECAO_CHAVES_DIFERENTES.md](CORRECAO_CHAVES_DIFERENTES.md)

---

## ❌ Código Anterior (Errado)

Você tem o código correto, mas o merge **não estava funcionando** porque procurava pelo campo errado.

---

## 🎯 Problema

O seu Apps Script tem:
```javascript
allData = allData.map(record => {
  const rnc = record['rnc'] || record['#rnc'] || record['#'];
  const match = dataC.find(c => {
    const crnc = c['#rnc'] || c['rnc'] || c['#'];
    return crnc == rnc;
  });
  // ...
});
```

Mas os registos **não estão sendo mergeados** com o campo de tempo.

---

## ✅ SOLUÇÃO: Adicionar Debug Logs

### Passo 1: Abrir Google Apps Script

1. Seu Google Sheet → Menu **Extensões** → **Apps Script**
2. Localizar a função `getSheetData()`
3. Procurar pela secção `RNC_cativação`

### Passo 2: Substituir Código

**Procure por este bloco:**

```javascript
/**
 * ---------------------------
 * Folha: RNC_cativação (enriquecimento)
 * ---------------------------
 */
const sheetCativacao = ss.getSheetByName("RNC_cativação");
if (sheetCativacao && allData.length > 0) {
  // ... resto do código
}
```

**Substitua TODO esse bloco por isto:**

```javascript
/**
 * ---------------------------
 * Folha: RNC_cativação (enriquecimento)
 * ---------------------------
 */
const sheetCativacao = ss.getSheetByName("RNC_cativação");
if (sheetCativacao && allData.length > 0) {
  const valuesC = sheetCativacao.getDataRange().getValues();

  if (valuesC.length > 1) {
    const headersC = valuesC[0].map(h => h.toString().toLowerCase().trim());
    
    // 🔍 DEBUG: Ver headers da RNC_cativação
    Logger.log("=== RNC_cativação Headers ===");
    Logger.log("Headers: " + JSON.stringify(headersC));
    
    const dataC = valuesC.slice(1)
      .filter(row => row[0])
      .map(row => {
        const obj = {};
        headersC.forEach((h, i) => obj[h] = row[i]);
        return obj;
      });

    Logger.log("Total registos RNC_cativação: " + dataC.length);
    if (dataC.length > 0) {
      Logger.log("Primeiro registo RNC_cativação: " + JSON.stringify(dataC[0]));
    }

    let mergedCount = 0;
    
    allData = allData.map(record => {
      // Procurar a chave correta (pode ser 'rnc', '#rnc', '#', ou 'id')
      const rnc = record['rnc'] || record['#rnc'] || record['#'] || record['id'];
      
      const match = dataC.find(c => {
        const crnc = c['#rnc'] || c['rnc'] || c['#'] || c['id'];
        return crnc == rnc;
      });

      if (match) {
        mergedCount++;
        // Merge preservando o ano original
        const merged = Object.assign({}, record, match, { ano: record['ano'] });
        
        // 🔍 DEBUG: Primeira vez que faz merge, mostrar
        if (mergedCount === 1) {
          Logger.log("=== Primeiro Merge ===");
          Logger.log("Record original keys: " + Object.keys(record).join(", "));
          Logger.log("Match keys: " + Object.keys(match).join(", "));
          Logger.log("Merged keys: " + Object.keys(merged).join(", "));
          Logger.log("Tem 'tempo previsto de resolução (min)'? " + 
                     (merged['tempo previsto de resolução (min)'] ? "SIM ✓" : "NÃO ✗"));
        }
        
        return merged;
      }
      return record;
    });
    
    Logger.log("=== Merge Summary ===");
    Logger.log("Total merges realizados: " + mergedCount + " de " + allData.length);
  }
}
```

### Passo 3: Deploy

1. Clique em **Deploy**
2. Escolha atualizar o deployment existente
3. Confirme

### Passo 4: Testar

1. Volta ao Dashboard
2. Faz **Login de novo**
3. Vai para **Google Apps Script** 
4. Clica em **Execution log** (ou **Execução**)
5. Procura por linhas começadas com `===`

---

## 📊 Interpretar os Logs

### Cenário 1: Merge Funciona ✅

```
=== RNC_cativação Headers ===
Headers: ["#rnc","entidade","tempo previsto de resolução (min)",...]

Total registos RNC_cativação: 280

Primeiro registo RNC_cativação: {"#rnc":"123",...,"tempo previsto de resolução (min)":240}

=== Primeiro Merge ===
Record original keys: id, #, status, entidade,...
Match keys: #rnc, entidade, tempo previsto de resolução (min),...
Merged keys: id, #, status, entidade,..., tempo previsto de resolução (min)
Tem 'tempo previsto de resolução (min)'? SIM ✓

=== Merge Summary ===
Total merges realizados: 280 de 280
```

**Se ver isto:** O problema está resolvido! Recarregue o Dashboard com F5.

---

### Cenário 2: Merge NÃO Funciona ❌

```
=== RNC_cativação Headers ===
Headers: ["#rnc","entidade","tempo previsto de resolução (min)",...]

Total registos RNC_cativação: 280

=== Merge Summary ===
Total merges realizados: 0 de 280
```

**Se ver isto:** Os IDs não correspondem! Veja abaixo.

---

## 🐛 Se o Merge = 0

**Significa:** Os valores de `#rnc` na `RNC_cativação` não correspondem aos valores na sheet principal.

### Ação:

**Adicione este debug ANTES do find:**

```javascript
if (rnc) {
  Logger.log("Procurando RNC: " + rnc);
  const attempts = dataC.slice(0, 3).map(c => c['#rnc'] || c['rnc'] || c['#'] || c['id']);
  Logger.log("Primeiros 3 valores em RNC_cativação: " + JSON.stringify(attempts));
}
```

Isto vai mostrar:
- Qual RNC está procurando
- Quais valores existem em `RNC_cativação`

Se não corresponderem, pode ser:
1. **Diferentes formatos** (ex: "123" vs 123)
2. **Diferentes campos** (ex: procura `#` mas deveria procurar `id`)
3. **Dados corrompidos**

---

## 📞 Próximo Passo

1. **Faça as alterações acima**
2. **Deploy**
3. **Login de novo**
4. **Abra Execution log**
5. **Copie os logs e envie-me aqui**

Com os logs, vou conseguir resolver isto em segundos! 🚀


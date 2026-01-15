# ✅ CORREÇÃO: Merge com Chaves Diferentes

## 🎯 O Problema

- AppSheet_Backend usa coluna `H` como chave
- RNC_cativação usa coluna `#RNC` como chave
- O código está procurando pelos campos errados

---

## ✅ A SOLUÇÃO

Substitua a secção `RNC_cativação` no seu `getSheetData()` por **ISTO EXATAMENTE**:

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
    const dataC = valuesC.slice(1)
      .filter(row => row[0])
      .map(row => {
        const obj = {};
        headersC.forEach((h, i) => obj[h] = row[i]);
        return obj;
      });

    Logger.log("=== RNC_cativação Enriquecimento ===");
    Logger.log("Total registos RNC_cativação: " + dataC.length);
    Logger.log("Headers: " + JSON.stringify(headersC));
    
    let mergedCount = 0;
    let tempoCount = 0;
    
    allData = allData.map(record => {
      // AppSheet_Backend: chave é coluna H (campo: 'h')
      const h = record['h'];
      
      // Procurar em RNC_cativação pelo campo '#rnc'
      const match = dataC.find(c => {
        const crnc = c['#rnc'];
        return crnc == h; // Comparar H com #RNC
      });

      if (match) {
        mergedCount++;
        
        // Verificar se tem campo de tempo
        if (match['tempo previsto de resolução (min)']) {
          tempoCount++;
        }
        
        // Merge preservando dados originais
        const merged = Object.assign({}, record, match, { ano: record['ano'] });
        
        // Debug na primeira iteração
        if (mergedCount === 1) {
          Logger.log("=== Primeiro Match ===");
          Logger.log("Valor H procurado: " + h);
          Logger.log("Match encontrado com #RNC: " + match['#rnc']);
          Logger.log("Tempo previsto encontrado: " + (match['tempo previsto de resolução (min)'] || 'NÃO'));
          Logger.log("Novo campo 'tempo previsto de resolução (min)': " + 
                     (merged['tempo previsto de resolução (min)'] || 'NÃO'));
        }
        
        return merged;
      }
      
      return record;
    });
    
    Logger.log("=== Resumo Merge ===");
    Logger.log("Registos mergeados: " + mergedCount + " de " + allData.length);
    Logger.log("Registos com Tempo Previsto: " + tempoCount);
    
    if (allData.length > 0) {
      Logger.log("Primeiro registo final - campos: " + Object.keys(allData[0]).join(", "));
      Logger.log("Tem 'tempo previsto de resolução (min)' no final? " + 
                 (allData.filter(d => d['tempo previsto de resolução (min)'] && d['tempo previsto de resolução (min)'] !== '').length) + 
                 " registos");
    }
  }
}
```

---

## 📋 Passos para Aplicar

### 1️⃣ Abrir Google Apps Script

1. Seu Google Sheet → **Extensões** → **Apps Script**

### 2️⃣ Localizar a Secção RNC_cativação

Procure por:
```javascript
/**
 * ---------------------------
 * Folha: RNC_cativação (enriquecimento)
 * ---------------------------
 */
```

### 3️⃣ Substituir TODO esse bloco

Apague tudo desde `const sheetCativacao = ss.getSheetByName...` até ao final do `if`

Cole o código acima

### 4️⃣ Deploy

1. Clique **Deploy**
2. Escolha atualizar o deployment
3. Confirme

### 5️⃣ Testar

1. Dashboard → **Login de novo**
2. Google Apps Script → **Execution log**
3. Procure por `=== Resumo Merge ===`

---

## ✅ Resultado Esperado

Se funcionar, verá:

```
=== RNC_cativação Enriquecimento ===
Total registos RNC_cativação: 280
Headers: [...,"#rnc",...,"tempo previsto de resolução (min)",...]

=== Primeiro Match ===
Valor H procurado: 217
Match encontrado com #RNC: 217
Tempo previsto encontrado: 240
Novo campo 'tempo previsto de resolução (min)': 240

=== Resumo Merge ===
Registos mergeados: 280 de 280
Registos com Tempo Previsto: 250
```

---

## 🎉 Depois

Se vir isto:

1. Recarregar Dashboard (Ctrl+F5)
2. Abrir Console (F12)
3. Procurar por: `✓ Campo de tempo encontrado`
4. Ver gráfico "Tempo Previsto de Resolução" ✨

---

**Pronto! Isto deve resolver!** 🚀


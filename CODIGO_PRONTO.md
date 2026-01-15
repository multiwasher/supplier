# 📋 Código Pronto para Copiar e Colar

## ✂️ Copie isto e cole no Google Apps Script

```javascript
// === RNC_cativação | Enriquecimento de dados ===
const sheetRncCativacao = ss.getSheetByName('RNC_cativação');

if (sheetRncCativacao) {
  const dataCativacao = sheetRncCativacao.getDataRange().getValues();

  if (dataCativacao.length > 1) {
    const headersCativacao = dataCativacao[0]
      .map(h => h.toString().toLowerCase().trim());

    const dataCativacaoList = [];

    for (let i = 1; i < dataCativacao.length; i++) {
      const row = dataCativacao[i];

      // Ignorar linhas sem ID
      if (row[0] === '' || row[0] === null) continue;

      const obj = {};
      headersCativacao.forEach((header, index) => {
        obj[header] = row[index];
      });

      dataCativacaoList.push(obj);
    }

    // Merge pelo campo ID
    allData = allData.map(record => {
      const idRecord = record['id'];

      const match = dataCativacaoList.find(c =>
        c['id'] == idRecord
      );

      if (match) {
        return Object.assign({}, record, match);
      }

      return record;
    });
  }
}
// === FIM RNC_cativação ===
```

---

## 📍 Onde Colar?

No seu `doPost(e)`, **antes do `return allData;`**

### Exemplo Completo:

```javascript
function doPost(e) {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    
    // ... seu código existente para recolher allData ...
    // (getSheetData(), validações, etc)
    
    // COLE O CÓDIGO ACIMA AQUI! ⬇️
    // === RNC_cativação | Enriquecimento de dados ===
    const sheetRncCativacao = ss.getSheetByName('RNC_cativação');
    // ... resto do código ...
    // === FIM RNC_cativação ===
    
    // No final da função:
    return allData;  // ← Isto retorna os dados enriquecidos
}
```

---

## ✅ Checklist

- [ ] Abrir Google Apps Script
- [ ] Localizar a função `doPost(e)`
- [ ] Encontrar a linha `return allData;`
- [ ] **Colar o código ANTES dessa linha**
- [ ] Clicar "Deploy"
- [ ] Escolher "New Deployment" > "Web app"
- [ ] Clicar "Deploy"

---

## 🚀 Depois de Colar

1. Abrir dashboard
2. Fazer login
3. Scroll para baixo
4. Ver novo quadro "Tempo Previsto de Resolução" ✨

---

## ⚠️ Se Algo Correr Mal

**Erro: "RNC_cativação não encontrada"**
→ Verificar se o separador tem esse nome exato

**Erro: "allData não definido"**
→ Certificar-se que a variável `allData` já existe antes deste código

**Gráfico mostra "Sem dados"**
→ Normal, significa que não há valores "Tempo Previsto de Resolução" ainda

---

**Pronto?** 🎯 Copy-paste e deploy! 🚀

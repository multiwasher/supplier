# 🔍 Apps Script Atualizado com Debug

Substitua **TODO** o conteúdo do seu Google Apps Script por isto:

```javascript
/**
 * Função para receber requisições POST do dashboard
 * Funciona quando o dashboard é acedido via URL publicado
 */
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const action = data.action;
    
    if (action === 'getSheetData') {
      return ContentService.createTextOutput(JSON.stringify(getSheetData()))
        .setMimeType(ContentService.MimeType.JSON);
    } else if (action === 'checkLogin') {
      const result = checkLogin(data.user, data.pass);
      return ContentService.createTextOutput(JSON.stringify(result))
        .setMimeType(ContentService.MimeType.JSON);
    }
  } catch (e) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, message: "Erro: " + e.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Função para ler os dados da folha de cálculo activa.
 * Procura pelos separadores "AppSheet_Backend", "Respostas do Formulário 1" e "RNC_cativação"
 * Combina todos os dados e enriquece com informações de tempo de resolução.
 */
function getSheetData() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let allData = [];

    // Folha 1: AppSheet_Backend
    const sheet1 = ss.getSheetByName("AppSheet_Backend");
    let count1 = 0;
    if (sheet1) {
      const values1 = sheet1.getDataRange().getValues();
      Logger.log("=== AppSheet_Backend ===");
      Logger.log("Total linhas (incluindo header): " + values1.length);
      
      if (values1.length > 1) {
        const headers1 = values1[0];
        const data1 = values1.slice(1).filter(row => row[0] && row[0] !== '');
        count1 = data1.length;
        Logger.log("Registos válidos: " + count1);
        
        const data1Obj = data1.map(row => {
          let obj = {};
          headers1.forEach((header, i) => {
            obj[header.toString().toLowerCase().trim()] = row[i];
          });
          return obj;
        });
        allData.push(...data1Obj);
      }
    } else {
      Logger.log("AppSheet_Backend - Sheet NÃO ENCONTRADA");
    }

    // Folha 2: Respostas do Formulário 1
    const sheet2 = ss.getSheetByName("Respostas do Formulário 1");
    let count2 = 0;
    if (sheet2) {
      const values2 = sheet2.getDataRange().getValues();
      Logger.log("=== Respostas do Formulário 1 ===");
      Logger.log("Total linhas (incluindo header): " + values2.length);
      
      if (values2.length > 1) {
        const headers2 = values2[0];
        const data2 = values2.slice(1).filter(row => row[0] && row[0] !== '');
        count2 = data2.length;
        Logger.log("Registos válidos: " + count2);
        
        const data2Obj = data2.map(row => {
          let obj = {};
          headers2.forEach((header, i) => {
            obj[header.toString().toLowerCase().trim()] = row[i];
          });
          return obj;
        });
        allData.push(...data2Obj);
      }
    } else {
      Logger.log("Respostas do Formulário 1 - Sheet NÃO ENCONTRADA");
    }

    Logger.log("=== Merge RNC_cativação ===");
    Logger.log("Total ANTES merge: " + allData.length);

    // === RNC_cativação | Enriquecimento de dados ===
    const sheetRncCativacao = ss.getSheetByName('RNC_cativação');
    let matchCount = 0;

    if (sheetRncCativacao) {
      const dataCativacao = sheetRncCativacao.getDataRange().getValues();
      Logger.log("RNC_cativação - Total linhas: " + dataCativacao.length);

      if (dataCativacao.length > 1) {
        const headersCativacao = dataCativacao[0].map(h => h.toString().toLowerCase().trim());
        const dataCativacaoList = [];

        for (let i = 1; i < dataCativacao.length; i++) {
          const row = dataCativacao[i];
          if (row[0] === '' || row[0] === null) continue;

          const obj = {};
          headersCativacao.forEach((header, index) => {
            obj[header] = row[index];
          });
          dataCativacaoList.push(obj);
        }

        Logger.log("RNC_cativação - Registos para merge: " + dataCativacaoList.length);

        // Merge pelo ID
        allData = allData.map(record => {
          const idRecord = record['id'];
          const match = dataCativacaoList.find(c => c['id'] == idRecord);

          if (match) {
            matchCount++;
            return Object.assign({}, record, match);
          }
          return record;
        });
        
        Logger.log("RNC_cativação - Matches feitos: " + matchCount);
      }
    } else {
      Logger.log("RNC_cativação - Sheet NÃO ENCONTRADA");
    }

    // Análise final
    Logger.log("=== RESUMO FINAL ===");
    Logger.log("AppSheet_Backend: " + count1 + " registos");
    Logger.log("Respostas do Formulário 1: " + count2 + " registos");
    Logger.log("Total combinado: " + allData.length);
    
    const anosFinais = [...new Set(allData.map(d => d['ano']).filter(Boolean))].sort();
    Logger.log("Anos no resultado final: " + (anosFinais.length > 0 ? anosFinais.join(", ") : "NENHUM"));

    return allData;
  } catch (e) {
    Logger.log("ERRO: " + e.toString());
    Logger.log("Stack: " + e.stack);
    return [];
  }
}

/**
 * Função de autenticação
 * Pode personalizar conforme as suas necessidades
 */
function checkLogin(username, password) {
  // Lógica de autenticação (placeholder)
  const isReverse = password === username.split('').reverse().join('');
  const isAdmin = (username.toLowerCase() === "dsqa" && password === "789987");
  
  if (isAdmin || isReverse) {
    return {
      success: true,
      filter: isAdmin ? "all" : username,
      username: isAdmin ? "Administrador" : username
    };
  } else {
    return {
      success: false,
      message: "Password inválida. Deve ser o nome da entidade invertido ou dsqa/789987."
    };
  }
}
```

---

## 📋 Alterações Principais

✅ **Removido** o `doGet()` que procurava ficheiro HTML inexistente
✅ **Mantido** o `doPost()` que retorna dados JSON
✅ **Mantida** a função `getSheetData()` com debug completo
✅ **Mantida** a função `checkLogin()` para autenticação

---

## 🚀 Próximos Passos

1. Cole **TODO** o código acima no seu Google Apps Script (substituindo tudo)
2. Deploy > New Deployment > Web app > Deploy
3. Abra os logs: Execução > Ver logs
4. Procure pela secção `=== RESUMO FINAL ===`
5. **Partilhe os logs!** 📊


```javascript
/**
 * Função para ler os dados da folha de cálculo activa.
 * Procura pelos separadores "AppSheet_Backend", "Respostas do Formulário 1" e "RNC_cativação"
 * Combina todos os dados e enriquece com informações de tempo de resolução.
 */
function getSheetData() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let allData = [];

    // Folha 1: AppSheet_Backend
    const sheet1 = ss.getSheetByName("AppSheet_Backend");
    let count1 = 0;
    if (sheet1) {
      const values1 = sheet1.getDataRange().getValues();
      Logger.log("=== AppSheet_Backend ===");
      Logger.log("Total linhas (incluindo header): " + values1.length);
      
      if (values1.length > 1) {
        const headers1 = values1[0];
        const data1 = values1.slice(1).filter(row => row[0] && row[0] !== '');
        count1 = data1.length;
        Logger.log("Registos válidos: " + count1);
        
        const data1Obj = data1.map(row => {
          let obj = {};
          headers1.forEach((header, i) => {
            obj[header.toString().toLowerCase().trim()] = row[i];
          });
          return obj;
        });
        allData.push(...data1Obj);
      }
    } else {
      Logger.log("AppSheet_Backend - Sheet NÃO ENCONTRADA");
    }

    // Folha 2: Respostas do Formulário 1
    const sheet2 = ss.getSheetByName("Respostas do Formulário 1");
    let count2 = 0;
    if (sheet2) {
      const values2 = sheet2.getDataRange().getValues();
      Logger.log("=== Respostas do Formulário 1 ===");
      Logger.log("Total linhas (incluindo header): " + values2.length);
      
      if (values2.length > 1) {
        const headers2 = values2[0];
        const data2 = values2.slice(1).filter(row => row[0] && row[0] !== '');
        count2 = data2.length;
        Logger.log("Registos válidos: " + count2);
        
        const data2Obj = data2.map(row => {
          let obj = {};
          headers2.forEach((header, i) => {
            obj[header.toString().toLowerCase().trim()] = row[i];
          });
          return obj;
        });
        allData.push(...data2Obj);
      }
    } else {
      Logger.log("Respostas do Formulário 1 - Sheet NÃO ENCONTRADA");
    }

    Logger.log("=== Merge RNC_cativação ===");
    Logger.log("Total ANTES merge: " + allData.length);

    // === RNC_cativação | Enriquecimento de dados ===
    const sheetRncCativacao = ss.getSheetByName('RNC_cativação');
    let matchCount = 0;

    if (sheetRncCativacao) {
      const dataCativacao = sheetRncCativacao.getDataRange().getValues();
      Logger.log("RNC_cativação - Total linhas: " + dataCativacao.length);

      if (dataCativacao.length > 1) {
        const headersCativacao = dataCativacao[0].map(h => h.toString().toLowerCase().trim());
        const dataCativacaoList = [];

        for (let i = 1; i < dataCativacao.length; i++) {
          const row = dataCativacao[i];
          if (row[0] === '' || row[0] === null) continue;

          const obj = {};
          headersCativacao.forEach((header, index) => {
            obj[header] = row[index];
          });
          dataCativacaoList.push(obj);
        }

        Logger.log("RNC_cativação - Registos para merge: " + dataCativacaoList.length);

        // Merge pelo ID
        allData = allData.map(record => {
          const idRecord = record['id'];
          const match = dataCativacaoList.find(c => c['id'] == idRecord);

          if (match) {
            matchCount++;
            return Object.assign({}, record, match);
          }
          return record;
        });
        
        Logger.log("RNC_cativação - Matches feitos: " + matchCount);
      }
    } else {
      Logger.log("RNC_cativação - Sheet NÃO ENCONTRADA");
    }

    // Análise final
    Logger.log("=== RESUMO FINAL ===");
    Logger.log("AppSheet_Backend: " + count1 + " registos");
    Logger.log("Respostas do Formulário 1: " + count2 + " registos");
    Logger.log("Total combinado: " + allData.length);
    
    const anosFinais = [...new Set(allData.map(d => d['ano']).filter(Boolean))].sort();
    Logger.log("Anos no resultado final: " + (anosFinais.length > 0 ? anosFinais.join(", ") : "NENHUM"));

    return allData;
  } catch (e) {
    Logger.log("ERRO: " + e.toString());
    Logger.log("Stack: " + e.stack);
    return [];
  }
}
```
```

---

## 📋 Como Usar

1. Copie o código acima
2. Substitua a função `getSheetData()` no seu Google Apps Script
3. Clique em **"Deploy"** > **"New Deployment"** > **"Web app"** > **"Deploy"**
4. Abra o dashboard
5. Abra a consola do Google Apps Script (**Execução** > **Ver logs**)
6. Procure pelas mensagens de debug

---

## 🔍 O que Procurar nos Logs

```
AppSheet_Backend - Registos válidos: XXX
Respostas do Formulário 1 - Registos válidos: YYY
Respostas do Formulário 1 - Anos únicos: [lista de anos]
=== TOTAL FINAL: 355 ===
Anos finais no allData: [lista completa de anos]
```

---

## 🐛 Possíveis Problemas

### ❌ Se ver isto:
```
Respostas do Formulário 1 - Registos válidos: 0
Respostas do Formulário 1 - Anos únicos: 
```

→ A sheet "Respostas do Formulário 1" está vazia ou não tem coluna "ID"

### ❌ Se ver isto:
```
Respostas do Formulário 1 - Anos únicos: 2025
```

→ Os dados em "Respostas do Formulário 1" só têm ano 2025

### ✅ Se ver isto:
```
Anos finais no allData: 2022, 2023, 2024, 2025
```

→ Tudo está correto! O problema é no dashboard

---

Depois de correr, **partilhe o conteúdo dos logs** para sabermos exatamente o que está a acontecer! 📊

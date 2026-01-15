# 🔍 Apps Script Debug V2 - Verificar Anos por Sheet

Substitua **TODO** o código do seu Google Apps Script por isto:

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
 */
function getSheetData() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let allData = [];

    // Folha 1: AppSheet_Backend
    const sheet1 = ss.getSheetByName("AppSheet_Backend");
    let count1 = 0;
    let anos1 = [];
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
        
        // Debug: anos em Sheet1
        anos1 = [...new Set(data1Obj.map(d => d['ano']).filter(Boolean))].sort();
        Logger.log("Anos em AppSheet_Backend: " + (anos1.length > 0 ? anos1.join(", ") : "NENHUM"));
        
        allData.push(...data1Obj);
      }
    } else {
      Logger.log("AppSheet_Backend - Sheet NÃO ENCONTRADA");
    }

    // Folha 2: Respostas do Formulário 1
    const sheet2 = ss.getSheetByName("Respostas do Formulário 1");
    let count2 = 0;
    let anos2 = [];
    if (sheet2) {
      const values2 = sheet2.getDataRange().getValues();
      Logger.log("=== Respostas do Formulário 1 ===");
      Logger.log("Total linhas (incluindo header): " + values2.length);
      
      if (values2.length > 1) {
        const headers2 = values2[0];
        const headerList = headers2.map(h => h.toString().toLowerCase().trim());
        Logger.log("Headers: " + headerList.join(", "));
        Logger.log("Tem coluna 'ano'? " + headerList.includes('ano'));
        
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
        
        // Debug: anos em Sheet2
        anos2 = [...new Set(data2Obj.map(d => d['ano']).filter(Boolean))].sort();
        Logger.log("Anos em Respostas do Formulário 1: " + (anos2.length > 0 ? anos2.join(", ") : "NENHUM"));
        Logger.log("Primeiros 5 registos de Sheet2:");
        data2Obj.slice(0, 5).forEach((obj, idx) => {
          Logger.log("  Reg " + (idx+1) + ": id=" + obj['id'] + ", ano=" + obj['ano']);
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
    Logger.log("AppSheet_Backend: " + count1 + " registos (anos: " + (anos1.length > 0 ? anos1.join(", ") : "NENHUM") + ")");
    Logger.log("Respostas do Formulário 1: " + count2 + " registos (anos: " + (anos2.length > 0 ? anos2.join(", ") : "NENHUM") + ")");
    Logger.log("Total combinado: " + allData.length);
    
    const anosFinais = [...new Set(allData.map(d => d['ano']).filter(Boolean))].sort();
    Logger.log("Anos no resultado FINAL: " + (anosFinais.length > 0 ? anosFinais.join(", ") : "NENHUM"));

    return allData;
  } catch (e) {
    Logger.log("ERRO: " + e.toString());
    Logger.log("Stack: " + e.stack);
    return [];
  }
}

/**
 * Função de autenticação
 */
function checkLogin(username, password) {
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

## 🚀 Próximos Passos

1. Cole o código acima no seu Google Apps Script
2. Deploy > New Deployment > Web app > Deploy
3. No Editor, selecione `getSheetData` e clique **▶ Executar**
4. Vá a **Execução** > **Ver logs**
5. **Partilhe-me o log completo**, especialmente a secção `=== RESUMO FINAL ===`

---

## 🔍 O que vou poder ver agora:

- ✅ Anos em **AppSheet_Backend**
- ✅ Anos em **Respostas do Formulário 1** 
- ✅ Primeiros 5 registos da Sheet2 (para confirmar os valores)
- ✅ Anos **FINAIS** depois do merge

Isto vai dizer-me se o problema é:
1. A coluna 'ano' tem outro nome
2. Os dados históricos estão noutra sheet
3. O merge está a remover os anos

# 🔍 Apps Script - Correção Final (Merge com RNC)

Substitua **TODO** o código do seu Google Apps Script por isto:

```javascript
/**
 * =========================================================
 * Web App – API para Dashboard
 * =========================================================
 * NOTAS IMPORTANTES:
 * - HtmlService NÃO suporta headers HTTP
 * - ContentService é obrigatório para APIs / JSON
 * - CORS é gerido pela publicação do Web App
 * =========================================================
 */

/**
 * Recebe requisições POST do dashboard
 */
function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return jsonResponse({
        success: false,
        message: "Pedido inválido."
      });
    }

    const data = JSON.parse(e.postData.contents);
    const action = data.action;

    let result;

    switch (action) {
      case 'getSheetData':
        result = getSheetData();
        break;

      case 'checkLogin':
        result = checkLogin(data.user, data.pass);
        break;

      default:
        result = {
          success: false,
          message: "Ação desconhecida."
        };
    }

    return jsonResponse(result);

  } catch (err) {
    Logger.log("ERRO doPost: " + err.toString());

    return jsonResponse({
      success: false,
      message: "Erro interno no servidor.",
      detail: err.toString()
    });
  }
}

/**
 * Helper para respostas JSON
 */
function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * =========================================================
 * Leitura e merge de dados das folhas
 * =========================================================
 */
function getSheetData() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let allData = [];

    /**
     * ---------------------------
     * Folha: AppSheet_Backend
     * ---------------------------
     */
    const sheet1 = ss.getSheetByName("AppSheet_Backend");
    if (sheet1) {
      const values1 = sheet1.getDataRange().getValues();

      if (values1.length > 1) {
        const headers1 = values1[0].map(h => h.toString().toLowerCase().trim());
        const data1 = values1.slice(1).filter(row => row[0]);

        const mapped1 = data1.map(row => {
          const obj = {};
          headers1.forEach((h, i) => obj[h] = row[i]);
          return obj;
        });

        allData.push(...mapped1);
      }
    }

    /**
     * ---------------------------
     * Folha: Respostas do Formulário 1
     * ---------------------------
     */
    const sheet2 = ss.getSheetByName("Respostas do Formulário 1");
    if (sheet2) {
      const values2 = sheet2.getDataRange().getValues();

      if (values2.length > 1) {
        const headers2 = values2[0].map(h => h.toString().toLowerCase().trim());
        const data2 = values2.slice(1).filter(row => row[0]);

        const mapped2 = data2.map(row => {
          const obj = {};
          headers2.forEach((h, i) => obj[h] = row[i]);
          return obj;
        });

        allData.push(...mapped2);
      }
    }

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

        allData = allData.map(record => {
          // Procurar a chave correta (pode ser 'rnc', '#rnc', '#', ou '#rnc')
          const rnc = record['rnc'] || record['#rnc'] || record['#'];
          const match = dataC.find(c => {
            const crnc = c['#rnc'] || c['rnc'] || c['#'];
            return crnc == rnc;
          });

          if (match) {
            // Merge preservando o ano original
            return Object.assign({}, record, match, { ano: record['ano'] });
          }
          return record;
        });
      }
    }

    /**
     * ---------------------------
     * Logs finais
     * ---------------------------
     */
    const anos = [...new Set(allData.map(d => d['ano']).filter(Boolean))].sort();
    const temposEncontrados = allData.filter(d => {
      return d['tempo previsto de resolução (min)'] || 
             d['tempo_previsto_de_resolucao'] || 
             d['tempo previsto de resolução'] ||
             d['tempo_previsto_resolucao_min'];
    }).length;
    
    Logger.log("Total registos: " + allData.length);
    Logger.log("Anos encontrados: " + (anos.length ? anos.join(", ") : "nenhum"));
    Logger.log("Registos com Tempo Previsto: " + temposEncontrados);
    
    // Debug: mostrar primeiro registo e seus campos
    if (allData.length > 0) {
      Logger.log("Primeiro registo - campos disponíveis: " + Object.keys(allData[0]).join(", "));
    }

    return {
      success: true,
      total: allData.length,
      anos: anos,
      data: allData
    };

  } catch (err) {
    Logger.log("ERRO getSheetData: " + err.toString());

    return {
      success: false,
      message: "Erro ao ler dados.",
      detail: err.toString(),
      data: []
    };
  }
}

/**
 * =========================================================
 * Autenticação simples
 * =========================================================
 */
function checkLogin(username, password) {
  if (!username || !password) {
    return {
      success: false,
      message: "Credenciais em falta."
    };
  }

  const isReverse = password === username.split('').reverse().join('');
  const isAdmin = (
    username.toLowerCase() === "dsqa" &&
    password === "789987"
  );

  if (isAdmin || isReverse) {
    return {
      success: true,
      filter: isAdmin ? "all" : username,
      username: isAdmin ? "Administrador" : username
    };
  }

  return {
    success: false,
    message: "Password inválida."
  };
}
```

---

## 🚀 Próximos Passos

1. Cole o código acima no seu Google Apps Script (substitua tudo)
2. **Deploy** > **New Deployment** > **Web app** > **Deploy**
3. No Editor, selecione `getSheetData` e clique **▶ Executar**
4. Vá a **Execução** > **Ver logs**
5. Procure pela secção com `Total registos` e `Anos encontrados`

**Devia ver algo como:**
```
Total registos: 258 (ou mais)
Anos encontrados: 2022, 2023, 2024, 2025
```

Depois abra o dashboard e verifique se aparecem os dados! 📊

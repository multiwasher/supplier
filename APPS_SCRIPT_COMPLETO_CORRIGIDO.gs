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
     * CORREÇÃO: Coluna B AppSheet_Backend (campo h) = Coluna A RNC_cativação (índice 0)
     * Tempo está em Coluna E RNC_cativação (índice 4)
     * ---------------------------
     */
    const sheetCativacao = ss.getSheetByName("RNC_cativação");
    if (sheetCativacao && allData.length > 0) {
      const valuesC = sheetCativacao.getDataRange().getValues();

      if (valuesC.length > 1) {
        // Usar as linhas directamente pelo índice
        const dataC = valuesC.slice(1).filter(row => row[0]);

        Logger.log("=== RNC_cativação Enriquecimento ===");
        Logger.log("Total registos RNC_cativação: " + dataC.length);
        Logger.log("Primeiros 3 valores Coluna A: " + JSON.stringify(dataC.slice(0, 3).map(r => r[0])));
        Logger.log("Primeiros 3 valores Coluna E (Tempo): " + JSON.stringify(dataC.slice(0, 3).map(r => r[4])));
        
        let mergedCount = 0;
        let tempoCount = 0;
        
        allData = allData.map((record, index) => {
          // AppSheet_Backend: chave é coluna B (campo: 'h')
          const h = record['h'];
          
          // Procurar em RNC_cativação pela coluna A (índice 0)
          const match = dataC.find(row => {
            const colA = row[0]; // Coluna A - a chave
            return colA == h; // Comparar Coluna B com Coluna A
          });

          if (match) {
            mergedCount++;
            
            // Extrair tempo da Coluna E (índice 4)
            const tempoValor = match[4];
            
            if (tempoValor && tempoValor !== '') {
              tempoCount++;
            }
            
            // Merge preservando dados originais e adicionando o tempo
            const merged = Object.assign({}, record, { 
              'tempo previsto de resolução (min)': tempoValor,
              ano: record['ano'] 
            });
            
            // Debug na primeira iteração
            if (mergedCount === 1) {
              Logger.log("=== Primeiro Match ===");
              Logger.log("Valor H procurado (Coluna B): " + h);
              Logger.log("Match encontrado em Coluna A: " + match[0]);
              Logger.log("Tempo (Coluna E): " + tempoValor);
            }
            
            return merged;
          }
          
          return record;
        });
        
        Logger.log("=== Resumo Merge ===");
        Logger.log("Registos mergeados: " + mergedCount + " de " + allData.length);
        Logger.log("Registos com Tempo Previsto: " + tempoCount);
        
        if (allData.length > 0) {
          Logger.log("Primeiro registo final - tem 'tempo previsto de resolução (min)'? " + 
                     (allData[0]['tempo previsto de resolução (min)'] ? "SIM ✓" : "NÃO ✗"));
        }
      }
    }
        
        if (allData.length > 0) {
          Logger.log("Primeiro registo final - campos: " + Object.keys(allData[0]).join(", "));
          Logger.log("Tem 'tempo previsto de resolução (min)' no final? " + 
                     (allData.filter(d => d['tempo previsto de resolução (min)'] && d['tempo previsto de resolução (min)'] !== '').length) + 
                     " registos");
        }
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

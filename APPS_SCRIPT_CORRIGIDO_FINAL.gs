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
     * CORREÇÃO: Coluna B AppSheet_Backend (campo #rnc) = Coluna A RNC_cativação (índice 0)
     * Entidade está em Coluna C RNC_cativação (índice 2)
     * Tempo está em Coluna E RNC_cativação (índice 4)
     * Ano está em Coluna H RNC_cativação (índice 7)
     * ---------------------------
     */
    let rnc_cativacao_data = [];
    const sheetCativacao = ss.getSheetByName("RNC_cativação");
    if (sheetCativacao) {
      const valuesC = sheetCativacao.getDataRange().getValues();

      if (valuesC.length > 1) {
        // Usar as linhas directamente pelo índice
        const dataC = valuesC.slice(1).filter(row => row[0]);

        Logger.log("=== RNC_cativação Enriquecimento ===");
        Logger.log("Total registos RNC_cativação: " + dataC.length);
        Logger.log("Primeiros 3 valores Coluna A (#RNC): " + JSON.stringify(dataC.slice(0, 3).map(r => r[0])));
        Logger.log("Primeiros 3 valores Coluna C (Entidade): " + JSON.stringify(dataC.slice(0, 3).map(r => r[2])));
        Logger.log("Primeiros 3 valores Coluna H (Ano): " + JSON.stringify(dataC.slice(0, 3).map(r => r[7])));
        Logger.log("Primeiros 3 valores Coluna E (Tempo): " + JSON.stringify(dataC.slice(0, 3).map(r => r[4])));
        
        // Mapear dados de RNC_cativação para objeto com campos nomeados
        rnc_cativacao_data = dataC.map(row => ({
          rnc: row[0],                           // Coluna A
          pedido_por: row[1],                    // Coluna B
          entidade: row[2],                      // Coluna C
          descricao: row[3],                     // Coluna D
          tempo_resolucao_min: Number(row[4]) || null,  // Coluna E - Tempo Previsto
          encerrado: row[5],                     // Coluna F
          observacoes: row[6],                   // Coluna G
          ano: row[7]                            // Coluna H
        }));
        
        Logger.log("RNC_cativação mapeado: " + rnc_cativacao_data.length + " registos");
      }
    }
    
    // Merge de dados se RNC_cativação foi carregado
    if (rnc_cativacao_data.length > 0 && allData.length > 0) {
      let mergedCount = 0;
      let tempoCount = 0;
      
      allData = allData.map((record, index) => {
        // AppSheet_Backend: chave é coluna B (campo: '#rnc')
        const h = record['#rnc'];
        
        // Procurar em RNC_cativação pela coluna A
        const match = rnc_cativacao_data.find(row => 
          String(row.rnc).trim() === String(h).trim()
        );

        if (match) {
          mergedCount++;
          
          // Extrair tempo
          const tempoValor = match.tempo_resolucao_min;
          
          if (tempoValor && tempoValor !== '') {
            tempoCount++;
          }
          
          // Merge preservando dados originais e adicionando o tempo
          const merged = Object.assign({}, record, {
            tempo_resolucao_min: tempoValor !== '' && tempoValor !== null
              ? Number(tempoValor)
              : null,
            ano: record['ano']
          });
          
          // Debug na primeira iteração
          if (mergedCount === 1) {
            Logger.log("=== Primeiro Match ===");
            Logger.log("Valor #RNC procurado (Coluna B): " + h);
            Logger.log("Match encontrado em Coluna A: " + match.rnc);
            Logger.log("Tempo (Coluna E): " + tempoValor);
          }
          
          return merged;
        }
        
        return record;
      });
      
      Logger.log("=== Resumo Merge ===");
      Logger.log("Registos mergeados: " + mergedCount + " de " + allData.length);
      Logger.log("Registos com Tempo Previsto: " + tempoCount);
    }

    /**
     * ---------------------------
     * Logs finais
     * ---------------------------
     */
    const anos = [...new Set(allData.map(d => d['ano']).filter(Boolean))].sort();
    const temposEncontrados = allData.filter(d => {
      return d['tempo_resolucao_min'] !== null && d['tempo_resolucao_min'] !== undefined;
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
      data: allData,
      rnc_cativacao: rnc_cativacao_data
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

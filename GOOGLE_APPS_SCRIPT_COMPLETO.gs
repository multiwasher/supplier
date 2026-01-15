/**
 * =========================================================
 * Google Apps Script - CÓDIGO COMPLETO
 * =========================================================
 * Copie TUDO isto e cole no seu Google Apps Script
 * Menu: Extensões → Apps Script
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
 * Leitura de dados das folhas
 * =========================================================
 * NOVA ABORDAGEM:
 * - Tempo Previsto de Resolução (min) é lido diretamente do AppSheet_Backend
 * - Sem merge com RNC_cativação
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
        const headers1 = values1[0].map(h => h.toString().trim()); // NÃO fazer toLowerCase - preservar nomes originais
        const data1 = values1.slice(1).filter(row => row[0]);

        const mapped1 = data1.map(row => {
          const obj = {};
          headers1.forEach((h, i) => obj[h] = row[i]); // Usar cabeçalho original como chave
          return obj;
        });

        allData.push(...mapped1);
        Logger.log("AppSheet_Backend: " + mapped1.length + " registos carregados");
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
        const headers2 = values2[0].map(h => h.toString().trim());
        const data2 = values2.slice(1).filter(row => row[0]);

        const mapped2 = data2.map(row => {
          const obj = {};
          headers2.forEach((h, i) => obj[h] = row[i]);
          return obj;
        });

        allData.push(...mapped2);
        Logger.log("Respostas do Formulário 1: " + mapped2.length + " registos carregados");
      }
    }

    /**
     * ---------------------------
     * Logs finais
     * ---------------------------
     */
    const anos = [...new Set(allData.map(d => d['Ano'] || d['ano']).filter(Boolean))].sort();
    const temposEncontrados = allData.filter(d => {
      const tempoVal = d['Tempo Previsto de Resolução (min)'];
      return tempoVal !== null && tempoVal !== undefined && tempoVal !== '';
    }).length;
    
    Logger.log("=== Resumo de Dados ===");
    Logger.log("Total registos: " + allData.length);
    Logger.log("Anos encontrados: " + (anos.length ? anos.join(", ") : "nenhum"));
    Logger.log("Registos com Tempo Previsto: " + temposEncontrados);
    
    // Debug: mostrar primeiro registo e seus campos
    if (allData.length > 0) {
      Logger.log("Primeiro registo - campos disponíveis: " + Object.keys(allData[0]).join(", "));
      Logger.log("Primeiro 'Tempo Previsto de Resolução (min)': " + allData[0]['Tempo Previsto de Resolução (min)']);
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

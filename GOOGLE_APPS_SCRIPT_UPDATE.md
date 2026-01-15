# Atualização Google Apps Script - RNC_cativação

## 📋 Resumo

Adicionamos uma nova análise ao dashboard: **Análise de Tempo Previsto de Resolução** baseada no separador "RNC_cativação" do Google Sheets. Esta análise:

- Mostra a distribuição de tempos de resolução em um histograma
- Calcula estatísticas: Média, Máximo, Mínimo e Desvio Padrão
- Responde aos filtros de **Entidade** e **Ano**
- Inclui visualização no PDF export

## 🔧 Código Completo para o Google Apps Script

Substitua o seu `getSheetData()` por esta versão completa com integração do "RNC_cativação":

```javascript
/**
 * Função principal que serve o ficheiro HTML.
 * Necessária para que o script funcione como uma Aplicação Web.
 */
function doGet() {
  return HtmlService.createTemplateFromFile('dashboard')
    .evaluate()
    .setTitle('Dashboard AppSheet')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

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
    if (sheet1) {
      const values1 = sheet1.getDataRange().getValues();
      if (values1.length > 1) {
        const headers1 = values1[0];
        const data1 = values1.slice(1).map(row => {
          let obj = {};
          headers1.forEach((header, i) => {
            const key = header.toString().toLowerCase().trim();
            obj[key] = row[i];
          });
          return obj;
        });
        allData.push(...data1);
      }
    }

    // Folha 2: Respostas do Formulário 1
    const sheet2 = ss.getSheetByName("Respostas do Formulário 1");
    if (sheet2) {
      const values2 = sheet2.getDataRange().getValues();
      if (values2.length > 1) {
        const headers2 = values2[0];
        const data2 = values2.slice(1).map(row => {
          let obj = {};
          headers2.forEach((header, i) => {
            const key = header.toString().toLowerCase().trim();
            obj[key] = row[i];
          });
          return obj;
        });
        allData.push(...data2);
      }
    }

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

    console.log("Total de registos combinados: " + allData.length);
    return allData;
  } catch (e) {
    console.error("Erro ao ler dados: " + e.toString());
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

/**
 * Nota: As funções dos teus outros ficheiros (Kpi_mensal.gs e macros.gs) 
 * continuam disponíveis no projeto e não interferem com esta lógica.
 */
```

### Passo 2: Verificar a estrutura do separador "RNC_cativação"

Certifique-se que o separador tem pelo menos estas colunas:

| Campo | Tipo | Descrição |
|-------|------|-----------|
| **ID** | Número | Identificador único da RNC (chave de ligação) |
| **Tempo Previsto de Resolução** | Número | Dias previstos para resolução |
| Outras colunas | Variado | Qualquer outra informação relevante |

### Passo 3: Fazer Deploy

1. Salve o ficheiro no Google Apps Script
2. Clique em **"Deploy"** > **"New Deployment"** > **"Web app"**
3. Clique **"Deploy"**

### Passo 4: Testar a integração

1. Abrir o dashboard
2. Fazer login com `dsqa` / `789987`
3. Scroll para baixo até ver "Tempo Previsto de Resolução"
4. Aplicar filtros para validar dados

## 📊 Novo Quadro no Dashboard

### Localização: Página Principal (Row 4)

#### Gráfico: Tempo Previsto de Resolução
- **Tipo**: Histograma com bins de 10 dias
- **Exemplo**: 0-9 dias, 10-19 dias, etc.
- **Dados**: Responde a todos os filtros (Entidade, Ano, Mês)

#### Estatísticas de Resolução (4 KPIs)
1. **Tempo Médio (dias)**: Média aritmética dos tempos
2. **Tempo Máximo (dias)**: Maior tempo registado
3. **Tempo Mínimo (dias)**: Menor tempo registado
4. **Desvio Padrão**: Variabilidade dos tempos

## 📄 PDF Export

Quando exportar o relatório, o novo gráfico será incluído na **Página 2** com:
- Gráfico de distribuição do tempo de resolução
- Dimensões otimizadas para A4
- Indicador visual colorido (ponto teal)

## ⚙️ Possíveis Nomes de Coluna

O código tenta encontrar a coluna "Tempo Previsto de Resolução" com as seguintes variações:
- `tempo previsto de resolução` (lowercase com espaços)
- `tempo_previsto_de_resolucao` (com underscores)
- `Tempo Previsto de Resolução` (original)

Se tiver um nome diferente, adicione mais uma verificação na função `renderTempoResolucaoChart()`:

```javascript
let tempo = d['seu_nome_aqui'] || d['tempo previsto de resolução'] || ...
```

## ✅ Status de Implementação

- [x] Interface do dashboard criada
- [x] Gráfico de distribuição implementado
- [x] Estatísticas calculadas
- [x] Integração com filtros
- [x] PDF export configurado
- [ ] **PENDENTE**: Atualizar Google Apps Script

## 🔗 Referência de Dados

**Arquivo**: `/workspaces/supplier/index.html` (linha 211)

**URL do Google Apps Script**: 
```
https://script.google.com/macros/s/AKfycbzwkizEEqpQgQrCtcNsdena1Kpij9ISPorPdLFG8G7isi5z2c8-q7FEPbNePBdfK8Hr/exec
```

- **Função de renderização**: `renderTempoResolucaoChart(data)` (linhas ~630)
- **Chamada de atualização**: `updateDashboard()` (linha ~478)
- **Função de export**: `exportarRelatorio()` (linha ~716)

## 📧 Suporte

Se encontrar erros:

1. **"Sem dados de Tempo Previsto de Resolução"**
   - Verificar se coluna existe no separador "RNC_cativação"
   - Confirmar que há dados vinculados com IDs correspondentes

2. **Valores aparecem como "-"**
   - Aumentar número de filtros selecionados
   - Verificar se há registos nos dados filtrados

3. **Gráfico vazio no PDF**
   - Gráfico aparece apenas se houver dados para o período selecionado
   - É normal estar vazio se nenhum filtro estiver selecionado

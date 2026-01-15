# 🚨 SOLUÇÃO URGENTE: Tempo Previsto de Resolução Não Encontrado

## ❌ Problema Identificado

**ERRO NO CONSOLE:**
```
✗ Nenhum campo com "tempo" encontrado!
Tempos extraídos: 0 de 280 registos
```

**CAUSA RAIZ:**
O campo `"Tempo Previsto de Resolução (min)"` existe na sheet `RNC_cativação` **MAS NÃO ESTÁ SENDO MERGEADO** com os dados principais.

---

## ✅ SOLUÇÃO: Atualizar Google Apps Script

### 1️⃣ Abrir Google Apps Script

```
1. Abrir seu Google Sheet
2. Menu → "Extensões" → "Apps Script"
3. Apareça a editor do código
```

### 2️⃣ Localizar a Função `doPost(e)` ou `getSheetData()`

Procure por uma função que tem:
```javascript
function doPost(e) {
    // ... código ...
    return ContentService.createTextOutput(JSON.stringify(allData))
}
```

ou 

```javascript
function getSheetData() {
    // ... código ...
    return allData;
}
```

### 3️⃣ COPIAR E COLAR O CÓDIGO

**ANTES DE `return allData`**, insira isto:

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

**⚠️ IMPORTANTE:**
- Copie **TUDO** (incluindo comentários)
- Cole **ANTES** da linha `return allData`
- Não apague o `return allData`

### 4️⃣ PUBLICAR/DEPLOY

```
1. Clique em "Deploy" (ou "Implantar")
2. Escolha "New Deployment" ou atualize o existente
3. Clique "Deploy"
4. Confirme as permissões se pedido
```

### 5️⃣ TESTAR

```
1. Volta ao Dashboard
2. Faz Login de novo (para forçar recarregar dados)
3. Scroll até "Tempo Previsto de Resolução"
4. Abre Console (F12)
5. Procura por: ✓ Campo de tempo encontrado
```

---

## 🔍 Como Confirmar que Funcionou

### ✅ Sucesso - Deve Ver no Console:
```
renderTempoResolucaoChart - Registos recebidos: 280
Primeiro registo - campos disponíveis: (35) [..., 'tempo previsto de resolução (min)', ...]
✓ Campo de tempo encontrado: tempo previsto de resolução (min)
✓ Gráfico de Tempo Previsto atualizado com sucesso
```

### ❌ Falha - Pode Ver:
```
✗ Nenhum campo com "tempo" encontrado!
Tempos extraídos: 0 de 280 registos
```

Se isso acontecer:
1. Verificar se o código foi colado **antes** do `return allData`
2. Verificar se fez **Deploy** corretamente
3. Fazer **Ctrl+F5** para limpar cache do navegador
4. Fazer **Login de novo**

---

## 🎯 Resumo Visual

```
ANTES (Agora):
┌─────────────────────────┐
│ AppSheet_Backend Sheet  │  ←─ Dados principais
│ (sem campo de tempo)    │
└─────────────────────────┘

DEPOIS (Quando Funcionar):
┌─────────────────────────┐
│ AppSheet_Backend Sheet  │  
│ (MERGEADO COM:)         │  ↓
├─────────────────────────┤
│ RNC_cativação Sheet     │  ←─ Adicionado!
│ (com tempo previsto)    │
└─────────────────────────┘
```

---

## ❓ Dúvidas Técnicas?

### "Onde está meu `return allData`?"

Procure por:
```javascript
function doPost(e) {
    // ... monte o código ...
    
    // COLE O CÓDIGO AQUI ↑
    
    return ContentService.createTextOutput(JSON.stringify(allData))
}
```

### "Qual é a sheet `RNC_cativação`?"

É o separador com o nome **exato** `RNC_cativação` no seu Google Sheet.
Se tiver nome diferente, mude a linha:
```javascript
const sheetRncCativacao = ss.getSheetByName('SEU_NOME_EXATO');
```

### "O código está colado mas não funciona?"

1. Abrir **Google Apps Script** → **Aba Execution Log** (ou Logs)
2. Procurar por erros vermelhos
3. Copiar o erro
4. Contactar desenvolvimento com o erro

---

## ⏱️ Tempo Estimado

- **Colar código**: 2 minutos
- **Deploy**: 1 minuto
- **Testar**: 1 minuto
- **Total**: ~5 minutos ⚡

---

## 🚀 Depois de Fazer Isto

1. ✅ Volta aqui e diz "Pronto!"
2. ✅ Abre o Dashboard
3. ✅ Verifica no Console se aparece `✓ Campo de tempo encontrado`
4. ✅ Pronto! Problema resolvido! 🎉

**Não desista, é rápido!** 💪


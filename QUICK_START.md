# 🚀 QUICK START - Análise de Tempo de Resolução

## ⏱️ 5 Minutos para Ativar

### Step 1: Google Apps Script (2 min)

```javascript
// Abrir: https://script.google.com
// Projeto: O seu projeto da sheet

// Cole isto no doPost(e) após obter dados:
const sheetRncCativacao = ss.getSheetByName('RNC_cativação');
const dataCativacao = sheetRncCativacao.getDataRange().getValues();
const headersCativacao = dataCativacao[0];

const headersLower = headersCativacao.map(h => h.toString().toLowerCase().trim());

const dataCativacaoList = [];
for (let i = 1; i < dataCativacao.length; i++) {
    if (dataCativacao[i][0] !== '') {
        const obj = {};
        headersLower.forEach((header, index) => {
            obj[header] = dataCativacao[i][index];
        });
        dataCativacaoList.push(obj);
    }
}

// ANTES DO RETURN, FAZ:
const combinedData = allData.map(record => {
    const cativacao = dataCativacaoList.find(c => c['id'] === record['id']);
    if (cativacao) {
        return { ...record, ...cativacao };
    }
    return record;
});

return combinedData;  // <-- Retorna isto em vez de allData
```

### Step 2: Deploy (1 min)

```
Deploy > New Deployment > Web app > Deploy
```

### Step 3: Testar (2 min)

1. Abrir dashboard
2. Login com `dsqa` / `789987`
3. Scroll para baixo
4. Ver novo quadro "Tempo Previsto de Resolução"

## ✅ Done!

---

## 📚 Documentação Completa

| Ficheiro | Para Quem |
|----------|-----------|
| **RESUMO_EXECUTIVO.md** | Gestores/PMs |
| **GOOGLE_APPS_SCRIPT_UPDATE.md** | Técnicos (setup) |
| **FEATURE_TEMPO_RESOLUCAO.md** | Developers |
| **GUIA_VISUAL.md** | Designers/UX |
| **TESTE_VALIDACAO.md** | QA/Testers |

---

## 🎯 O que esperar

### No Dashboard
```
┌─────────────────────────────────────┐
│ 🔵 Tempo Previsto de Resolução     │
│                                    │
│ [Gráfico Histograma]  [KPIs 2x2]  │
│ 0-9: ███                Médio: 25  │
│ 10-19: █████            Máx: 48    │
│ 20-29: ███              Mín: 5     │
│ 30-39: ██               Desvio: 8  │
└─────────────────────────────────────┘
```

### No PDF (Página 2)
✅ Novo gráfico incluído
✅ Dimensões A4 otimizadas
✅ Indicador visual (ponto teal)

---

## ⚠️ Se algo der errado

### "Sem dados..."
→ Apps Script precisa atualizar

### KPIs mostram "-"
→ Selecionar filtros

### JavaScript error na console
→ Verificar se Apps Script fez deploy

---

## 📞 Checklist Final

- [ ] Google Apps Script atualizado
- [ ] Deploy feito
- [ ] Dashboard abre sem erros
- [ ] Novo quadro visível
- [ ] Filtros funcionam
- [ ] PDF inclui gráfico

✅ Pronto para produção!

---

## 📊 Ficheiros Alterados

```
/workspaces/supplier/
├── index.html (✏️ atualizado +100 linhas)
├── RESUMO_EXECUTIVO.md (📄 novo)
├── GOOGLE_APPS_SCRIPT_UPDATE.md (📄 novo)
├── FEATURE_TEMPO_RESOLUCAO.md (📄 novo)
├── GUIA_VISUAL.md (📄 novo)
├── TESTE_VALIDACAO.md (📄 novo)
└── QUICK_START.md (📄 este ficheiro)
```

---

## 🎓 Explicar aos Utilizadores

**O que é isto?**
> Uma nova análise que mostra como está distribuído o tempo de resolução das RNCs. Ajuda a identificar padrões e melhorar processos.

**Como usar?**
> Está embaixo dos gráficos de Keywords. Aplique filtros para ver dados específicos.

**O que significam os números?**
- **Tempo Médio**: Dias médios de resolução
- **Máximo/Mínimo**: Limites observados
- **Desvio Padrão**: Consistência (baixo = previsível)

---

**Pronto? Vamos!** 🚀

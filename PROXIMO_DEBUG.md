# 🔍 DIAGNÓSTICO: Porquê 0 Merges?

## ❌ Problema Encontrado

```
Registos mergeados: 0 de 280
```

Os valores de coluna `H` (AppSheet_Backend) **não correspondem** aos valores de `#RNC` (RNC_cativação).

---

## ✅ SOLUÇÃO

Atualizei o código com **mais debug**. Agora vai mostrar exactamente qual é o problema.

### Passos:

1. **Copie o código actualizado** de `APPS_SCRIPT_COMPLETO_CORRIGIDO.gs`
2. **Substituia no seu code.gs**
3. **Deploy de novo**
4. **Abra Execution log**
5. **Procure por**: `=== DEBUG: Comparação H vs #RNC ===`
6. **Copie a mensagem completa** e **envie aqui**

---

## O que Vou Ver

A nova mensagem dirá:

```
=== DEBUG: Comparação H vs #RNC ===
Primeiros H: [217, 218, 219]
Primeiros #RNC: [1, 2, 3]
Tipos: H=number, #RNC=number
```

Isto mostra:
- ✅ Se os valores são números ou strings
- ✅ Se correspondem ou não

---

## O Que Fazer Depois

**Se os valores forem completamente diferentes** (ex: H=[217, 218] vs #RNC=[1, 2]):

Significa que a coluna correcta não é `#RNC`. Pode ser:
- A coluna ID é diferente
- Os dados não estão alinhados
- Ou talvez deva procurar por outro campo

**Envie-me a mensagem e vou ajudar a encontrar a coluna correcta!** 🚀


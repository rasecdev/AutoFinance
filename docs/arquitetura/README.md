# Grafo de dependências

Mapa de quem importa quem em `src/`, gerado pelo `dependency-cruiser` (ADR 0003). Os arquivos `.json` e `.mmd` desta pasta **não são editados à mão**.

| Arquivo | Para quem | Conteúdo |
| --- | --- | --- |
| `dependencias.json` | agentes e scripts | cada módulo de `src/` e os módulos de `src/` que ele importa |
| `visao-geral.mmd` | pessoas | uma caixa por pasta de conceito e as setas entre elas |
| `<pasta>.mmd` | pessoas | recorte de uma pasta: o que ela importa e quem a importa |

Os `.mmd` são diagramas [Mermaid](https://mermaid.js.org/) (o GitHub renderiza ao abrir o arquivo).

## Como regerar

```bash
npm run arquitetura:gerar      # regrava os arquivos desta pasta
npm run arquitetura:verificar  # falha se estiverem desatualizados (roda no CI)
```

Mudou um `import` ou moveu um arquivo em `src/`? Rode `arquitetura:gerar` e comite o resultado junto. Sem isso o CI falha.

As regras de Fronteira e a ausência de ciclos ficam em `.dependency-cruiser.cjs` e rodam por `npm run arquitetura`.

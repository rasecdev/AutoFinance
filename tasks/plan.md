# Plano de Implementação: Fase 6 (parte 2) — Benchmark interno (tool calling)

## Overview

Mecanismo pra rodar modelos candidatos contra caso real do projeto e comparar acurácia, no dado real do fluxo — decidido como próxima rodada da Fase 6 logo após terminar os relatórios automáticos (parte 1, concluída). Design completo já existe no PLANO.md, seção "Relatórios" > "Benchmark interno, pros fluxos sem benchmark de terceiro aplicável" (linhas ~260-291) e tabela "Cobertura de benchmark por fluxo" (linhas ~135-151) — esta rodada implementa esse desenho, não redesenha.

**Escopo recortado pra só o fluxo de tool calling (`conversa_texto`)** — o PLANO.md cobre 3 fluxos (categorização, extração de fatura, tool calling), mas hoje só tool calling tem gabarito real disponível: categorização assistida (`cache_categorizacao`) e leitura de fatura por e-mail (Fase 7) ainda não foram implementadas em nenhuma fase, então não têm dado real pra alimentar um caso de teste ainda. `avaliacao_usuario = 'correto'` em `interacoes_ia` (Fase 3) já é gabarito real pronto pra tool calling — os outros dois fluxos entram quando as features das quais dependem existirem.

## Architecture Decisions

- **Execução do benchmark NUNCA executa a ferramenta de verdade.** `gerarResposta` (produção) chama `tool.handler` de fato — reusar isso pro benchmark rodaria `criar_transacao`/`pagar_fatura`/etc. de verdade contra o banco a cada rodada de teste, poluindo dado real com efeito colateral. O motor de benchmark faz uma chamada de completion **não-executora**: envia o mesmo prompt de sistema + mesma lista de ferramentas + mensagem do caso, e só **inspeciona** `tool_calls` da resposta (nome + argumentos), nunca chama `handler`. Sem isso, o benchmark seria destrutivo por desenho.
- **Lista de ferramentas compartilhada entre produção e benchmark.** Hoje o array de tools é montado inline dentro de `createHandlerTexto` (`texto.ts`), não é reaproveitável. Extrai pra `montarToolsConversa(db): ToolDefinition[]` (novo, `src/ai/tools/conversaTools.ts`), usado por `texto.ts` e pelo motor de benchmark — garante que o benchmark testa contra exatamente o mesmo schema/conjunto de ferramentas que a produção usa, não uma cópia que pode divergir com o tempo.
- **Comparação é sempre feita pelo código, nunca pela IA julgando a si mesma** (já decidido no PLANO.md) — implementado como comparação estrutural de `tool_calls`: mesmo conjunto de `{nome, argumentos}` que `saida_esperada`, argumentos comparados por igualdade profunda (chaves normalizadas antes de comparar, pra não dar falso negativo por ordem de chave no JSON).
- **Caso de teste = entrada avulsa, sem histórico de conversa.** `casos_teste_benchmark.entrada` é só a mensagem do usuário (texto), enviada isolada (sem `montarHistorico`) pro modelo candidato — simplificação consciente e coerente com o já aceito "amostra pequena e direcional, nunca medição estatística robusta" do PLANO.md. Casos que dependiam de contexto de turnos anteriores (ex: "edita essa transação" sem id) não são bons candidatos a caso de teste isolado — a curadoria (Tarefa 32) deve preferir promover interações que já eram autocontidas.
- **Curadoria via chat, não script/VM.** Curar um caso é ação pontual, de baixa frequência, iniciada por você reconhecendo "essa resposta foi um bom exemplo, quero guardar" — cabe no mesmo padrão de "editar essa transação" (resolve pra última coisa relevante na conversa, sem pedir id): nova tool `criar_caso_teste_benchmark` resolve pra última interação avaliada como `correto` no chat atual, sem precisar de trace_id explícito (que nunca é mostrado a você hoje).
- **Achado real ao planejar a Tarefa 32 original: nada no código hoje jamais grava `avaliacao_usuario = 'correto'`.** `atualizarAvaliacaoInteracao` (Fase 3/4) e o comando `/errado` (`handlerFeedback`) só cobrem o caminho negativo — não existe contraparte positiva. O PLANO.md pressupõe "interações já marcadas `avaliacao_usuario = correto`" como gabarito pronto, mas essa marcação nunca é feita por nenhum fluxo hoje. **Nova Tarefa 32 inserida antes da curadoria**: comando `/certo`, espelhando `/errado` (`createHandlerFeedback` generalizado pra aceitar a avaliação como parâmetro, reaproveitando o mesmo rastro de `trace_id` por `message_id` já existente) — sem isso a Tarefa 33 (curadoria) não teria nenhum dado real pra resolver. Tarefas seguintes renumeradas (33-35).
- **Rodar o benchmark é ação que gasta dinheiro real (N casos × M modelos candidatos, uma chamada cada) — exige confirmação síncrona**, mesmo não gravando nenhum dado financeiro (é uma ação de "alto impacto" por custo, não por mutação de dado — mesmo espírito da regra de confirmação já usada em ações financeiras). `avisoConfirmacao` mostra quantas chamadas reais a rodada vai fazer antes de você confirmar.
- **Custo do teste é uso real de IA, mas nunca conta como uso operacional do bot** — `registrarUsoTokens` já tem o enum `origem: 'uso_real' | 'benchmark_interno'` desde a Fase 1/5, nunca usado até agora. O motor grava com `origem: 'benchmark_interno'`, que a Tarefa 27 (Fase 6 parte 1) já filtra explicitamente pra fora do relatório de uso de IA — o custo do benchmark não some (fica rastreável em `uso_tokens`), só não polui a métrica de "uso real" do relatório periódico.
- **Resultado grava em `benchmarks_modelos` com `fonte_url = "interno"`** — mesma tabela que algum dia vai receber benchmark externo pesquisado manualmente (BFCL etc., sem mecanismo de código, é curadoria direta na tabela), mas essa curadoria externa fica fora do escopo desta rodada (Métricas 2/3 do relatório, que leriam essa tabela, também ficam pra rodada futura — só a fundação de dado entra agora).
- **Ordem de implementação**: tabelas primeiro (nada funciona sem elas), depois curadoria de caso (sem caso, não tem o que rodar), depois o motor de execução (compara sem gravar ainda), por último a tool que expõe o motor no chat com confirmação e grava o resultado.

```
Tabelas casos_teste_benchmark + benchmarks_modelos (Tarefa 31)
    │
    ├── Comando /certo — contraparte de /errado (Tarefa 32)
    │       │
    │       └── Tool criar_caso_teste_benchmark — curadoria (Tarefa 33)
    │
    └── montarToolsConversa compartilhado + motor de execução (Tarefa 34)
            │
            └── Tool rodar_benchmark_interno — expõe no chat, grava resultado (Tarefa 35)
```

## Task List

### Fase M: Fundação de dados

- [x] Tarefa 31: Tabelas `casos_teste_benchmark` e `benchmarks_modelos` + repositórios

### Checkpoint: Fundação testada
- [x] `npm run build`/`lint`/`test` sem erro (460/460 em `development`)

### Fase N: Curadoria e execução

- [x] Tarefa 32: Comando `/certo` — marca a última resposta do bot como correta (contraparte de `/errado`)
- [ ] Tarefa 33: Tool `criar_caso_teste_benchmark` — promove a última interação avaliada como correta na conversa em caso de teste
- [ ] Tarefa 34: `montarToolsConversa` compartilhado + motor de execução do benchmark (não-executor, compara tool_calls, calcula acurácia e custo)
- [ ] Tarefa 35: Tool `rodar_benchmark_interno(fluxo, modelos_candidatos)` — expõe o motor no chat, exige confirmação, grava resultado em `benchmarks_modelos`

### Checkpoint: Benchmark interno funcional
- [ ] `npm run build`/`lint`/`test` sem erro
- [ ] Teste manual em Homologação: marcar uma resposta como correta (`/certo`), curar pelo menos 1 caso real de tool calling (`criar_caso_teste_benchmark`), rodar `rodar_benchmark_interno` comparando pelo menos 2 modelos, confirmar resultado em `benchmarks_modelos` com valor plausível e custo do teste visível em `uso_tokens` (`origem = benchmark_interno`)
- [ ] PROGRESSO.md atualizado com o marco "Fase 6 (parte 2) concluída"
- [ ] Revisão com o usuário antes de prosseguir (próxima fatia da Fase 6, ou outra fase)

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Reaproveitar `gerarResposta` pro benchmark executaria ferramenta de verdade (efeito colateral real no banco a cada rodada de teste) | Alto (dado de teste poluindo dado real) | Motor de benchmark nunca chama `tool.handler` — só inspeciona `tool_calls` da resposta do modelo candidato, chamada de completion isolada sem loop de execução |
| Comparação de argumentos por igualdade ingênua (`JSON.stringify` direto) dá falso negativo por ordem de chave diferente no JSON | Médio (acurácia medida errado) | Normalizar (ordenar chaves) antes de comparar — testado explicitamente com um caso de mesma resposta em ordens de chave diferentes |
| Rodar contra muitos modelos/casos sem querer gera custo real inesperado | Baixo (PLANO.md já estima centavos a poucos dólares por rodada, mas ainda é dinheiro real) | Confirmação síncrona obrigatória antes de rodar, com contagem de chamadas reais que vão ser feitas |
| Caso de teste curado a partir de uma interação que dependia de contexto de turnos anteriores (ex: "edita essa" sem id) fica sem sentido isolado, dando falso negativo pra todo modelo testado | Médio (benchmark mede errado, não o modelo) | Documentado como limitação conhecida na curadoria — não impede curar, mas registrado que casos autocontidos são preferíveis |

## Open Questions

- Nome exato da métrica gravada em `benchmarks_modelos.metrica` pro resultado do benchmark interno de tool calling (ex: `acuracia_tool_calling`) — decidido na Tarefa 33, sem impacto de desenho, só nomenclatura.
- Métricas 2/3 do relatório (ler `benchmarks_modelos` no relatório semanal/mensal) ficam pra quando houver dado real acumulado o suficiente pra fazer sentido mostrar — não é tarefa desta rodada.

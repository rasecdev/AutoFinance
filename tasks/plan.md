# Implementation Plan: Engenharia de IA (Fases 13, 14 e 15)

## Overview

Spec fechada via sessão de `grilling` e publicada em `PLANO.md` ("Fase 13" a "Fase 15"); decisões formais nas ADRs [0003](../docs/adr/0003-organizacao-por-conceito-e-fronteiras-verificadas.md) a [0006](../docs/adr/0006-limites-de-autonomia-de-agentes-e-conteudo-externo.md); vocabulário (Interação, Passo, Nó, Grafo de execução, Grafo de dependências, Fronteira, Guardrail, Prompt versionado, Código, Metadado de observabilidade) no `CONTEXT.md`. Três fases em sequência, cada uma com checkpoint e pausa para revisão do usuário: **13** reorganiza `src/` por conceito e liga um gate de Fronteiras no CI; **14** deixa o que o bot faz inspecionável por pessoas e agentes sem expor conteúdo; **15** traz guardrails, o Grafo de execução em LangGraph.js e a instrumentação do Langfuse. A reorganização vem antes das funcionalidades para que o código novo já nasça na pasta certa.

## Architecture Decisions

- **Movimentação pura, um PR por pasta.** Cada tarefa da Fase 13 que move arquivo só move e ajusta imports (e os testes que espelham `src/`); nenhuma mudança de comportamento. Fácil de revisar e de reverter. A suíte inteira (1092 testes) precisa passar igual antes e depois.
- **Gate único de Fronteiras: `dependency-cruiser`** (ADR 0003), baseline zero. As duas violações existentes (um ciclo em `ai/benchmark`, um `import` de `ai/tools/transacoes.ts` para `bot/contextoRecente.ts`) são corrigidas **antes** de ligar o gate. A matriz de regras vive em um único arquivo. Compatível com TypeScript até a versão 6 (o projeto usa 6.0.3).
- **Só metadado sai do banco local** (ADR 0005). `interacoes_ia.mensagem_usuario` e `resposta_modelo` continuam no banco para o histórico, mas nada que as contenha é exportado. Mensagens de erro em modelo fixo, sem valores; nomes e tipos dos argumentos, nunca os valores.
- **Catálogo de Códigos no código**, não em tabela: constante TypeScript versionada, com documento gerado em `docs/` e checado no CI. As ocorrências ficam no banco (`erros_execucao`, `passos_ia`).
- **Prompts em arquivos `.md`** com versão inteira manual no frontmatter e um teste com hash do conteúdo que falha se o texto mudar sem a versão subir. O `tsc` não copia `.md`: o Dockerfile ganha um `cp` (mesmo padrão das `migrations`). A diretiva de idioma continua concatenada fora do arquivo versionado, e a versão registrada cobre os dois.
- **Camada única de instrumentação** para todos os fluxos de IA (texto, mídia, voz, e-mail, relatórios, benchmark), registrando Passos; o Grafo de execução (LangGraph.js) cobre só o turno de texto na primeira versão (ADR 0004), com Nós de nome estável.
- **Langfuse desligado por padrão** (sem chaves vira no-op). Rodar na VM atual só depois da prova de conceito P1 e se passar nos limites: até 5 GB de memória (limite no contêiner), até 40% de CPU média, imagem ARM64 em todos os componentes.
- **Pesquisas viram issues soltas**, sem milestone, e bloqueiam as tarefas que dependem delas: P1 (LangGraph.js com Langfuse), P2 (checkpointer e interrupt), P4 (ids de mensagem na WAHA), P5 (`bills` do Pluggy); P3 (Grafana com o banco) fica na Fase 12.
- **Numeração de tarefas continua em 147** (146 foi a última tarefa numerada).

## Dependency Graph

```
Fase 13:  147 ──┐
          148 ──┴─► 149 ──► 150, 151, 152 (em qualquer ordem) ──► 153 ──► 154 ──► 155 ──► 156 (checkpoint)

Fase 14:  156 ──► 157 ──► 158..162 (um PR por prompt, em qualquer ordem)
                  163 (mascaramento, independente)
                  164 ──► 165 ──► 166 ──► 167
                  168 ──► 169          (169 também usa os Códigos de 164 e os Passos de 166)
                  170 (independente)
          todas ──► checkpoint 14

Fase 15:  checkpoint 14 + P1 + P2 ──► 171 ──► 172, 173, 174 ──► 175 ──► 176 ──► 177, 178
          179 (precisa de P2 e dos guardrails 171-175) ──► 180 (precisa de P1) ──► 181
          182 (precisa de P4 e de 168)
          todas ──► checkpoint 15
```

## Task List

### Fase 13 — Reorganização por conceito e arquitetura verificável

#### Fase A: Corrigir as violações (antes de ligar o gate)
- [x] Tarefa 147: quebrar o ciclo `ai/benchmark` ↔ `tools/conversaTools` ↔ `tools/benchmark`
- [x] Tarefa 148: mover `bot/contextoRecente` para `ai/`

#### Fase B: Gate
- [x] Tarefa 149: gate `dependency-cruiser` no CI (`npm run arquitetura`), baseline zero

### Checkpoint: Gate ligado
- [x] `npm run build`/`lint`/`test` sem erro; `npm run arquitetura` sem violação; CI verde com o novo job

#### Fase C: Movimentação por conceito (um PR de movimentação pura por tarefa)
- [x] Tarefa 150: extrair `ai/confirmacao/`
- [x] Tarefa 151: extrair `ai/roteamento/`
- [x] Tarefa 152: extrair `ai/agente/` (laço de tool calling fora de `openrouter.ts`)
- [x] Tarefa 153: agrupar `ai/tools/` por domínio
- [x] Tarefa 154: mover avaliação para `ai/avaliacao/`

#### Fase D: Artefatos e documentação
- [ ] Tarefa 155: gerar o Grafo de dependências em `docs/arquitetura/` com checagem no CI
- [ ] Tarefa 156: atualizar `CLAUDE.md` (estrutura), PLANO e PROGRESSO; registrar a matriz de Fronteiras das pastas novas

### Checkpoint: Fase 13 fechada
- [ ] `npm run build`/`lint`/`test`/`arquitetura` sem erro, 1092 testes ou mais
- [ ] Nenhuma mudança de comportamento (teste manual em Homologação: conversa com tool, `/modelo`, `/errado`)
- [ ] PROGRESSO.md atualizado; milestone e issues da fase fechados
- [ ] **Pausa para revisão do usuário antes da Fase 14**

### Fase 14 — Fundação observável legível por máquina

#### Fase E: Prompts versionados
- [ ] Tarefa 157: infraestrutura de prompts versionados + `SYSTEM_PROMPT`
- [ ] Tarefa 158: prompt de extração de comprovante
- [ ] Tarefa 159: prompt de interpretação de planilha
- [ ] Tarefa 160: prompt de resumo de contexto
- [ ] Tarefa 161: prompt do relatório mensal
- [ ] Tarefa 162: prompt de análise de qualidade

#### Fase F: Dados, Códigos e Passos
- [ ] Tarefa 163: mascaramento de dado sensível
- [ ] Tarefa 164: catálogo de Códigos + colunas novas em `erros_execucao`
- [ ] Tarefa 165: colunas de Interação em `interacoes_ia`
- [ ] Tarefa 166: `passos_ia` + camada única de instrumentação
- [ ] Tarefa 167: instrumentar os demais fluxos de IA

#### Fase G: Feedback e leitura segura
- [ ] Tarefa 168: vínculo durável mensagem para Interação, multi-canal
- [ ] Tarefa 169: `/errado` com motivo automático
- [ ] Tarefa 170: leitura de e-mail desligada por padrão, com remetentes e autenticação

### Checkpoint: Fase 14 fechada
- [ ] `npm run build`/`lint`/`test`/`arquitetura` sem erro
- [ ] Teste manual em Homologação: conversa gera Interação com `prompt_versao`, Passos e custo; `/errado` após um restart do bot ainda localiza a resposta; um dado de cartão digitado no chat não aparece em claro em `interacoes_ia`
- [ ] PROGRESSO.md atualizado; milestone e issues fechados
- [ ] **Pausa para revisão do usuário antes da Fase 15**

### Fase 15 — Guardrails, grafo de execução e Langfuse

#### Fase H: Guardrails
- [ ] Tarefa 171: guardrail de saída, núcleo + formatação
- [ ] Tarefa 172: guardrail de saída, valor inventado, simulação narrada e campo omitido
- [ ] Tarefa 173: guardrail de saída, vazamentos (prompt, dado sensível, identificador interno, URL externa)
- [ ] Tarefa 174: guardrail de saída, ação e confirmação alucinadas
- [ ] Tarefa 175: guardrail de entrada para conteúdo externo
- [ ] Tarefa 176: checagem de plausibilidade antes de executar a tool
- [ ] Tarefa 177: fidelidade numérica nas narrações
- [ ] Tarefa 178: proteção dos resumos de conversa

#### Fase I: Grafo de execução e Langfuse
- [ ] Tarefa 179: Grafo de execução em LangGraph.js, só no turno de texto
- [ ] Tarefa 180: instrumentação do Langfuse (desligada por padrão)

#### Fase J: Medição e canais
- [ ] Tarefa 181: relatório de guardrails no `analisar_qualidade`
- [ ] Tarefa 182: `/errado` e `/certo` no WhatsApp

### Checkpoint: Fase 15 fechada
- [ ] `npm run build`/`lint`/`test`/`arquitetura` sem erro
- [ ] Teste manual em Homologação: um caso de cada guardrail (ação alucinada, simulação narrada como fato, e-mail com instrução forjada) dispara o Código esperado
- [ ] PROGRESSO.md atualizado; milestone e issues fechados
- [ ] Atualizar os fluxogramas do Notion (**alertar o usuário para autorizar o MCP do Notion antes**)

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Mover arquivos quebra imports e testes em muitos lugares | Médio | Movimentação pura, um PR por pasta, suíte completa antes e depois; `git mv` para preservar histórico |
| Tarefa 152 mexe no laço de `gerarResposta`, o coração do bot | Alto | Antes de mover, cobrir com testes a retentativa por `finish_reason: error`, a pendência de confirmação no meio do laço e o teto de iterações; nenhuma mudança de lógica |
| `dependency-cruiser` não acompanha o TypeScript 7 | Baixo (hoje) | Projeto está no TypeScript 6; documentado na ADR 0003; fallback é o parser `swc` |
| Mascaramento esconde dado que uma tool precisava ler do texto | Médio | O bot nunca armazena número de cartão; mascarar só o texto livre do chat e dos resumos; teste com os fluxos de cadastro de cartão e conta |
| Colunas e tabelas novas aumentam o banco | Baixo | `passos_ia` entra no expurgo de 90 dias; só metadado |
| LangGraph.js não tem checkpointer para SQLite criptografado | Médio | P2 antes da Tarefa 179; fallback é manter a pendência de confirmação na tabela atual |
| Guardrail de saída reprova uma boa resposta | Médio | Fallback com o texto literal da tool; cada reprovação vira evento e entra no relatório da Tarefa 181 |
| Langfuse não cabe na VM atual | Médio | Critério de aceite da P1 (5 GB, 40% de CPU, ARM64); se não passar, instrumentação fica pronta e desligada até o servidor escalado |
| Agente externo (Hermes) lê dado sensível | Alto | Só metadado exportado, ADR 0005 e ADR 0006; nenhuma tarefa expõe `mensagem_usuario` ou `resposta_modelo` |
| Deploys concorrentes no meio de uma sequência de PRs | Baixo | Já existe fila única no `deploy.yml`; esperar o deploy anterior terminar antes de mergear o próximo PR de código |

## Open Questions

- Resultado de P1, P2, P4 e P5 (pesquisas). As tarefas 179, 180, 182 e a decisão sobre a leitura de e-mail dependem delas.
- Hospedagem do Langfuse (VM atual ou servidor escalado): decidida só depois da P1, pelo critério acima.
- Hermes: como vai ler (API do Langfuse, API do Grafana, endpoint próprio, MCP) fica para quando ele existir.
- Categoria (RAG ou lista fechada com a taxonomia do Pluggy): primeiro medir a taxa de correção manual; fora desta iniciativa.

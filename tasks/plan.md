# Implementation Plan: Fase 6 (parte 14) — Benchmark interno: cobertura de mídia

## Overview

O "Benchmark interno" (`src/ai/benchmark.ts` + tool `rodar_benchmark_interno`) hoje só mede acurácia de **tool calling** do fluxo `conversa_texto` (13 casos curados). Levantamento a pedido do usuário confirmou que os outros 3 fluxos que fazem uma chamada de IA estruturada (não geração de texto livre) nunca tiveram cobertura:

- `leitura_comprovante` (foto/PDF de comprovante) — extração nunca testada; a decisão de tool depois da extração é testada só indiretamente (quando funde no `conversa_texto`).
- `interpretar_planilha` (Excel) — zero cobertura, nem indireta (não passa pelo `conversa_texto`).
- `transcricao_voz` — transcrição nunca testada; decisão pós-transcrição testada só indiretamente.

`resumir_contexto`, `relatorio_mensal` e a parte narrativa de `analisar_qualidade` ficam **fora de escopo** (confirmado com o usuário): são geração de texto livre, o conceito de "acurácia contra gabarito" não se aplica.

Esta rodada estende o motor de benchmark pra suportar comparação por fluxo (não só tool-calling) e adiciona curadoria própria pra 2 dos 3 fluxos sem cobertura. `transcricao_voz` fica com o mecanismo pronto, mas sem caso curado (ver "Open Questions").

## Architecture Decisions

- **Schema:** `casos_teste_benchmark` (migration 0006) ganha 2 colunas novas, nullable: `entrada_arquivo_base64` e `entrada_mime_type`. Quando as duas são `NULL`, o caso é de texto (comportamento atual, sem mudança). Quando preenchidas, `entrada` vira só um rótulo legível (ex: "comprovante mercado R$45"), e o arquivo de teste vem dessas colunas. Preferido a uma tabela nova porque o formato de gabarito já é JSON genérico em `saida_esperada`; só faltava o lado da entrada.
- **`saida_esperada` deixa de ser só `ToolCallEsperada[]`:** o repositório (`casosTesteBenchmark.ts`) tipa como `unknown` na leitura/escrita (já é só JSON serializado, sem validação de schema nessa camada); cada estratégia de comparação em `benchmark.ts` sabe o formato que espera pro seu fluxo.
- **Dispatch por fluxo em `executarBenchmarkFluxo`:** a função guarda a mesma orquestração (loop de casos × modelos, registro de custo/uso), mas troca "gerar resposta do candidato" + "comparar com gabarito" por uma estratégia por fluxo:
  - `conversa_texto`: inalterado (`chamarModeloCandidato`/`baterComEsperado` já existentes).
  - `leitura_comprovante`: chama `extrairComprovante` (já existe, `src/ai/extracaoComprovante.ts`) com o buffer/mimeType do caso; compara os campos do gabarito presentes (`valor`, `tipoDocumento`, `identificador` exatos; `categoriaSugerida` normalizada case-insensitive) contra o resultado — só compara campo que o gabarito define, pra não exigir dado impossível de prever (ex: `descricao` livre).
  - `interpretar_planilha`: chama `interpretarPlanilha` (já existe) com o buffer do caso; compara a lista de transações com a mesma técnica de normalização/ordenação já usada pra tool_calls (`normalizarToolCalls`, generalizada pra aceitar qualquer array de objeto).
  - `transcricao_voz`: chama `transcreverAudio` (já existe); compara o texto normalizado (lowercase, trim, sem pontuação) contra o gabarito string. Mecanismo pronto mesmo sem caso curado ainda.
- **Fixture sintética gerada em código, sem arquivo versionado:** em vez de guardar um PDF/xlsx de exemplo no repo (ou pedir pro usuário mandar um arquivo real), os dois seeds novos geram o buffer na hora:
  - `leitura_comprovante`: PDF mínimo escrito à mão (sintaxe PDF básica: catálogo + página + stream de texto `BT/Tj/ET`) com texto conhecido embutido — sem lib nova, sem depender de OCR de imagem rasterizada (mais determinístico que gerar uma imagem). Motivo de não usar imagem via `canvas`: `canvas` não é dependência direta hoje (só transitiva via `chartjs-node-canvas`), instalar só pra isso seria peso desnecessário pra um PDF de texto simples resolver igual ou melhor.
  - `interpretar_planilha`: reaproveita a técnica já usada em `tests/bot/handlers/midia.test.ts` (`write-excel-file`, hoje devDependency) — vira dependência de produção de verdade nesta rodada (movida de `devDependencies` pra `dependencies` no `package.json`), já que agora um script que roda em produção/Homologação (`seed`) precisa dela em runtime, não só em teste.
- **`rodar_benchmark_interno` ganha parâmetro `fluxo` (zod enum fixo com as 4 opções válidas), default `conversa_texto`** — preserva 100% o comportamento/uso atual pra quem já usa a tool sem passar esse parâmetro. Enum fixo (não string livre) evita reintroduzir o achado real já documentado no código (`src/ai/tools/benchmark.ts`, comentário da linha ~51): com "fluxo" livre, o modelo às vezes inventava descrição em vez do identificador real.
- **`criar_caso_teste_benchmark` continua só pra `conversa_texto`** (deriva de `/certo`, só funciona pra texto) — sem mecanismo de curadoria orgânica via chat pra mídia nesta rodada; documentado como decisão, não esquecimento.

## Task List

1. Tarefa 106: migration 0015 (`entrada_arquivo_base64`/`entrada_mime_type`) + `casosTesteBenchmark.ts` generalizado (`saidaEsperada: unknown`, `entradaArquivo?`)
2. Tarefa 107: `src/ai/benchmark.ts` — dispatch de execução/comparação por fluxo (4 estratégias)
3. Tarefa 108: tool `rodar_benchmark_interno` — parâmetro `fluxo` (zod enum), default `conversa_texto`
4. Tarefa 109: fixture sintética (PDF) + seed curado de `leitura_comprovante`
5. Tarefa 110: fixture sintética (xlsx) + seed curado de `interpretar_planilha` (+ mover `write-excel-file` pra `dependencies`)

### Checkpoint: Benchmark interno cobre 3 dos 4 fluxos de extração/tool-calling
- [ ] `npm run build`/`lint`/`test` sem erro
- [ ] `npm audit` sem vulnerabilidade alta/crítica sem correção (`write-excel-file` virou dependency de produção)
- [ ] Teste manual: `rodar_benchmark_interno` com `fluxo: "leitura_comprovante"` e `fluxo: "interpretar_planilha"` contra pelo menos 1 modelo candidato, resultado condizente com o gabarito curado
- [ ] PROGRESSO.md atualizado com o marco, incluindo a decisão documentada de deixar `transcricao_voz` sem caso curado nesta rodada
- [ ] Revisão com o usuário antes de prosseguir

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Modelo de visão lê a data do PDF sintético num formato ligeiramente diferente do gabarito (ex: "10/09/2026" em vez de "2026-09-10"), mesmo com o dado sendo 100% legível | Médio (falso negativo no benchmark) | Comparar `data` de forma tolerante (normalizar formato antes de comparar) se o primeiro teste real mostrar esse problema — documentar como achado real se acontecer, não assumir de antemão |
| PDF gerado à mão (sem lib) ter sintaxe inválida que algum leitor de PDF rejeite | Médio (fixture inútil) | Validar abrindo o PDF gerado com uma ferramenta local antes de commitar o gerador; manter o gerador minimalista (1 página, texto simples, sem fonte customizada) |
| `write-excel-file` como dependency de produção aumentar a superfície de `npm audit` | Baixo | Já é dependência instalada hoje (só como dev); rodar `npm audit` depois de mover, mesmo critério de troca de lib já usado nas Fases 6/7 se aparecer vulnerabilidade sem correção |
| Comparação de `interpretar_planilha` (array de transações) ser frágil a pequenas variações de categoria/descrição inferida pela IA | Médio | Gabarito só especifica os campos realmente determináveis a partir da planilha sintética (valor/tipo/data óbvios); categoria/descrição comparadas de forma tolerante ou fora do critério de acerto, decidir durante a Tarefa 110 com dado real do primeiro teste |

## Open Questions

- `transcricao_voz` sem fixture real: precisa que o usuário grave 2-3 áudios curtos com frase conhecida (mesma classe de dependência da cobertura PJ da Pluggy, Fase 8) — fica como follow-up, não tarefa desta rodada. Quando disponível, o mecanismo (Tarefas 107/108) já aceita sem mudança de código.
- Vale a pena, numa rodada futura, um jeito de curar caso de mídia organicamente pelo chat (ex: usuário manda foto real + confirma via `/certo`, parecido com `criar_caso_teste_benchmark`)? Não resolvido aqui, mencionar como ideia se o usuário perguntar.

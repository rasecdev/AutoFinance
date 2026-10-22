<p align="center">
  <img src="docs/assets/logo-lockup.svg" alt="AutoFinance" width="380" height="81" />
</p>

<p align="center">
  <img src="https://flagcdn.com/20x15/br.png" alt="BR" width="20" height="15" /> Português | <img src="https://flagcdn.com/20x15/us.png" alt="US" width="20" height="15" /> <a href="README.en.md">English</a> | <img src="https://flagcdn.com/20x15/es.png" alt="ES" width="20" height="15" /> <a href="README.es.md">Español</a>
</p>

<p align="center">
  <a href="https://github.com/rasecdev/AutoFinance/actions/workflows/ci.yml"><img src="https://github.com/rasecdev/AutoFinance/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License: MIT" /></a>
  <img src="https://img.shields.io/badge/node-%3E%3D22-339933?logo=node.js&logoColor=white" alt="Node" />
  <img src="https://img.shields.io/badge/tests-vitest-6E9F18?logo=vitest&logoColor=white" alt="Vitest" />
</p>

Bot financeiro pessoal, no Telegram e no WhatsApp. Você descreve o que aconteceu em linguagem natural — texto, voz, foto, PDF, planilha, e-mail — e a IA interpreta e decide qual ação tomar; todo cálculo financeiro é sempre código determinístico, nunca a IA "achando" um número. O backend é a fonte de verdade: histórico e dado financeiro moram no seu próprio banco, nunca no provedor de IA.

<p align="center">
  <img src="docs/assets/demo-hero.svg" alt="Demo: usuário registra um gasto em linguagem natural e o bot responde confirmando conta, cartão e categoria" width="480" />
</p>

## Por que existe

Além de resolver um problema real (controle financeiro sem o atrito de abrir app e preencher formulário), este projeto é documentado publicamente como estudo de caso de uso de IA aplicada — decisões de arquitetura, benchmark próprio e o porquê de cada escolha (inclusive quando a pesquisa aponta pra *não* fazer algo) ficam registrados vivos em [PROGRESSO.md](PROGRESSO.md). Design completo em [PLANO.md](PLANO.md), resumo de produto em [PRD.md](PRD.md).

## Como funciona

A IA nunca calcula dinheiro nem tem acesso direto ao banco — ela escolhe qual função (*tool*) chamar a partir de um schema JSON fixo, e o backend executa o cálculo real. Function calling clássico, cinco etapas:

<p align="center">
  <img src="docs/assets/demo-function-calling.svg" alt="Diagrama animado: mensagem do usuário, schema JSON das funções disponíveis, extração de argumentos e montagem da tool call, execução determinística no backend com retorno, e resposta final formatada pela IA" width="480" />
</p>

1. **Mensagem** — usuário escreve em linguagem natural.
2. **Schemas** — a IA recebe o JSON schema de todas as funções registradas (tools).
3. **Tool call** — o modelo extrai os argumentos da mensagem e monta a chamada da função escolhida.
4. **Execução** — o backend roda a função (código determinístico) e devolve o resultado.
5. **Resposta** — a IA formata o retorno numa resposta legível pro usuário.

Ações de alto impacto (amortizar dívida, excluir transação, renegociar) sempre passam por confirmação explícita antes de executar — a IA nunca age sobre incerteza real.

## Cache

Duas camadas independentes, cada uma resolvendo um problema diferente:

- **Prompt caching nativo do provedor** — chaveado por conteúdo + modelo pelo próprio OpenRouter/Anthropic, sem lógica extra no bot; reduz custo de tokens em conversas longas sem risco de contaminação entre modelos.
- **Cache de categorização** (`cache_categorizacao`) — descrição normalizada (trim + lowercase + remoção de acento) → categoria. Quando a descrição já foi vista antes, o backend resolve a categoria de forma determinística e **autoritativa** — mesmo que a IA sugira outra na mesma chamada, a categoria cacheada prevalece. Corrigir a categoria numa edição sobrescreve o cache com `origem: usuario`; a partir daí a IA nunca mais "re-adivinha" aquela descrição.

## Funcionalidades

**Registro do dia a dia**
- Registrar gasto/receita por texto, voz, foto ou PDF, sem formulário.
- Importar extrato em planilha (`.xlsx`), com confirmação antes de gravar.
- Transferência entre contas, com taxa quando o banco cobrar.
- Editar ou excluir lançamento errado (exclusão sempre lógica).

**Dívidas e cartão**
- Empréstimo/financiamento/consignado com parcelas geradas automaticamente.
- Simulação e amortização real (cálculo Price/SAC determinístico).
- Renegociação sem perder o histórico da dívida original.

**Integrações**
- Leitura de e-mail (fatura de cartão e boleto de parcela) com confirmação antes de gravar, e vencimentos criados no Google Calendar sem duplicar.
- Agregação bancária via Open Finance (Pluggy): extrato e saldo sincronizados sem lançar em duplicidade o que já foi registrado por conversa.

**Canais e idiomas**
- Telegram e WhatsApp ativos ao mesmo tempo: mensagens proativas (relatórios, alertas), chat com IA e comandos nos dois canais. Mídia (foto/PDF/áudio/planilha) por enquanto só no Telegram.
- Português, inglês e espanhol, trocável com `/idioma`.

**Consulta e visão geral**
- Consulta dinâmica e gráfico pra qualquer pergunta fora das tools fixas.
- Patrimônio líquido consolidado e projeção de fluxo de caixa.
- Relatório diário sob demanda + semanal/mensal automático.

**Confiança no uso de IA**
- Roteamento de modelo por tipo de tarefa, implementado e em uso (ver "Status do projeto").
- Observabilidade: toda interação de IA fica registrada e rastreável.
- Relatório de custo de tokens, com comparação contra modelos de referência.

## Stack técnico

| Camada | Tecnologia |
|---|---|
| Runtime | [Node.js](https://nodejs.org/) 22+ / [TypeScript](https://www.typescriptlang.org/) |
| Bot | [grammY](https://grammy.dev/) (Telegram) e [WAHA](https://waha.devlike.pro/) (WhatsApp, self-hosted) |
| IA | [OpenRouter](https://openrouter.ai/), roteado por fluxo (SDK [`openai`](https://www.npmjs.com/package/openai)) |
| Banco | SQLite cifrado ([`better-sqlite3-multiple-ciphers`](https://www.npmjs.com/package/better-sqlite3-multiple-ciphers)), migrações em SQL puro |
| Validação | [Zod](https://zod.dev/) |
| Logs | [Pino](https://getpino.io/) |
| Testes | [Vitest](https://vitest.dev/) |
| Deploy | [Docker Compose](https://docs.docker.com/compose/), ambientes isolados (Homologação / Produção) |

## Status do projeto

| Fase | Entrega | Status |
|---|---|---|
| 1 | Esqueleto: bot, banco, Docker, ambientes, allowlist, observabilidade | ✅ Concluída |
| 2 | Estudo de caso público (documentação/divulgação do projeto) | ⏸ Adiada |
| 3 | Tool calling: registrar/consultar/editar, dívidas, confirmação de alto impacto | ✅ Concluída |
| 4 | Contexto e memória de conversa | ✅ Concluída |
| 5 | Roteamento de IA por fluxo + monitoramento de preço | ✅ Concluída |
| 6 | Relatórios automáticos, benchmark interno, categorização assistida, entrada por voz/foto/planilha | ✅ Concluída |
| 7 | Integração com e-mail (fatura/boleto) e Google Calendar | ✅ Concluída |
| 8 | Agregação bancária via Open Finance (Pluggy) | ✅ Concluída |
| 9 | Multi-canal: WhatsApp (via WAHA) em paralelo ao Telegram — mensagens proativas, chat bidirecional e comandos | ✅ Concluída |
| 10 | Regionalização (português/inglês/espanhol) | ✅ Concluída |
| 11 | Pré-produção: publicar o app OAuth do Google (fim da expiração de 7 dias do token) | 📝 Planejada |
| 12 | Observabilidade de plataforma (Grafana + Loki) | 💡 Ideia futura |

> **Estado atual:** as Fases 1 a 10 estão concluídas e testadas em **Homologação** (branch `development`). **Nada foi promovido para Produção ainda** — a promoção é sempre decisão explícita, depois de teste manual real.

> **Nota sobre a Fase 5:** o mecanismo de roteamento por fluxo (tabela `roteamento_tarefas`) está implementado e em uso — fluxos mais simples (resumo de contexto, relatório mensal) e de mídia (leitura de comprovante) usam modelos próprios; o resto cai no modelo padrão (`openai/gpt-6-luna`). Mudar o modelo de um fluxo não exige código, só gravar na tabela.

Log completo, com o porquê de cada decisão, em [PROGRESSO.md](PROGRESSO.md).

## Infraestrutura

<p align="center">
  <picture>
    <source media="(max-width: 600px)" srcset="docs/assets/infra-diagram.svg">
    <img src="docs/assets/infra-diagram-wide.svg" alt="Diagrama de infraestrutura: usuário no Telegram trocando mensagens com a VM, que roda os ambientes de Homologação e Produção via Docker Compose, com chamadas roteadas pro OpenRouter" width="760" />
  </picture>
</p>

A VM é a única ponte entre os canais de mensagem (Telegram e WhatsApp) e o modelo — nenhum canal conversa diretamente com o OpenRouter, tudo passa pelo bot rodando nela. O diagrama mostra o fluxo pelo Telegram; o WhatsApp entra pelo mesmo bot, via um container WAHA no mesmo `docker-compose.yml`.

Uma única VM roda os dois ambientes lado a lado, cada um como um serviço separado do mesmo `docker-compose.yml`. A branch mapeia o ambiente: `development` sobe o serviço de Homologação, `master` sobe o de Produção — e a promoção de um pro outro nunca é automática, só acontece por decisão explícita depois de teste manual real.

## Rodando localmente

<details>
<summary>Docker Compose (Homologação)</summary>

```bash
cp .env.example .env.homologacao   # preencher TELEGRAM_BOT_TOKEN, TELEGRAM_ALLOWED_CHAT_IDS, etc.
docker compose up -d homologacao
```

Ambientes são isolados por branch e por serviço do `docker-compose.yml` — `development` mapeia Homologação, `master` mapeia Produção (nunca promovido automaticamente, sempre por decisão explícita após teste manual real).

</details>

## Segurança e privacidade

- Allowlist de usuários (Telegram e WhatsApp) — só chat IDs e números autorizados interagem com o bot.
- Webhook do WhatsApp com validação de assinatura (HMAC) e idempotência por evento.
- Banco cifrado em repouso (SQLCipher via `better-sqlite3-multiple-ciphers`).
- Segredos nunca commitados — hook de pre-commit com Gitleaks, também rodado no CI.
- Uso pessoal, single-user por desenho — não há fluxo multiusuário.
- Exclusão sempre lógica: nenhum dado desaparece de fato do histórico.

## Licença

[MIT](LICENSE)

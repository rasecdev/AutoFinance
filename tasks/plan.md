# Implementation Plan: Persistência do refresh_token do Google no banco

## Overview

O `refresh_token` do OAuth do Google (Gmail+Calendar) hoje vive em `GOOGLE_REFRESH_TOKEN`
no `.env.*` da VM. Como o app OAuth está em status "Testing" no Google Cloud Console, o
Google expira esse token sozinho a cada ~7 dias (`invalid_grant`, achado registrado em
PROGRESSO.md 2026-10-01/02) — decisão já tomada de **não** publicar o app pra Production
(scope `gmail.readonly` é "Restricted", exigiria avaliação de segurança CASA recorrente,
desproporcional pra uso solo). Essa rodada não resolve a expiração em si — só remove o
atrito manual de cada reautorização: hoje, depois de colar o código no `/registrar_email`,
alguém precisa SSH na VM, editar `.env.*` e reiniciar os serviços. Com o token guardado no
banco, `/registrar_email confirmar` passa a persistir sozinho e os jobs leem o valor atual
na próxima execução, sem intervenção manual.

Pausa temporária da rodada "Multi-canal — WhatsApp" (nenhuma tarefa iniciada ainda) a
pedido do usuário — arquivos movidos pra `tasks/plan-multicanal-whatsapp.md` /
`tasks/todo-multicanal-whatsapp.md`, retomam de onde pararam quando voltar o foco.

## Architecture Decisions

- **`GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`/`GOOGLE_CALENDAR_ID` continuam em `.env.*`** —
  são estáticos (identidade do app OAuth registrado no Google Cloud, não rotacionam). Só o
  `refresh_token` (o único valor que expira e precisa trocar) migra pro banco.
  `env.googleOAuthClient` passa a incluir `calendarId` (default `'primary'`) e deixa de
  depender da presença de refresh_token — fica disponível sempre que o par cliente existir,
  independente de já ter vínculo feito.
- **Nova tabela singleton `credenciais_google`** (`id INTEGER PRIMARY KEY CHECK(id=1)`, mesmo
  princípio de `bot_pausado`/`emails_processados`: presença de linha = estado), via
  `src/db/repositories/credenciaisGoogle.ts` (`obterRefreshToken`/`salvarRefreshToken`, upsert
  por `id=1` — nunca mais de uma linha, mesmo trocando de conta Google).
- **Restrição de segurança obrigatória, não negociável:** `credenciais_google` NUNCA pode
  aparecer no whitelist de domínio de `consultar_dados_dinamico`/`consultar_e_graficar`
  (`src/ai/tools/consultaDinamica.ts` → `DominioConsulta`/`TODAS_DIMENSOES`, resolvido em
  `src/relatorios/consultaDinamica.ts`) nem em nenhuma tool que eco dado cru pro chat — essas
  tools deixam o modelo de IA escolher dimensão/filtro por linguagem natural, e vazar o
  `refresh_token` ali daria acesso de leitura ao Gmail/Calendar pra quem conseguisse formular
  a pergunta certa (ou injetar instrução via e-mail/comprovante processado pelo bot — mesma
  classe de risco já endereçada no estudo OWASP Agentic ASI06/ASI10). Guarda via comentário
  bem visível na migration e no topo de `consultaDinamica.ts`/`relatorios/consultaDinamica.ts`
  — essas duas tools só aceitam `dominio` de um enum fechado (`financeiro`/`uso_ia`), então
  não incluir `credenciais_google` nesse enum já basta; o comentário é reforço, não controle
  de acesso real.
- **`criarClientesGoogle` (`src/integracoes/google/auth.ts`) não muda de assinatura** —
  continua recebendo `{clientId, clientSecret, refreshToken, calendarId}` já montado; quem
  muda é como esse objeto é montado nos chamadores (combinando `env.googleOAuthClient` +
  `obterRefreshToken(db)` em vez de vir pronto de `env.google`).
- **`env.google` deixa de existir** (campo composto removido de `Env`) — todo lugar que
  checava `env.google === null`/usava `env.google.calendarId` passa a checar
  `env.googleOAuthClient === null` (app não configurado) e, separadamente,
  `obterRefreshToken(db) === null` (app configurado mas ainda sem vínculo feito) — mesma
  distinção de estados que já existia, só com a fonte do token trocada.
- **Token nunca mais aparece em texto no chat.** Hoje `/registrar_email` devolve o
  `refresh_token` em claro na conversa (apagado em 5 min via `mensagens_pendentes_apagar`,
  migration 0013) pra alguém colar manualmente no `.env`. Com persistência direta no banco,
  essa exibição deixa de ser necessária — o fluxo some, e o mecanismo de
  auto-apagar/`mensagens_pendentes_apagar` fica sem nenhum outro uso no código (confirmado via
  grep, só esse handler consome). **Decisão: remover esse mecanismo morto** (repositório,
  sweep de boot em `index.ts`, tabela via migration nova de `DROP TABLE` — migration antiga
  0013 nunca é editada/apagada, só superada) em vez de deixar código sem uso no projeto.
- **`scripts/configurarGoogleOAuth.ts` (CLI manual, caminho alternativo ao `/registrar_email`
  desde a Fase 7) ganha o mesmo tratamento** — passa a persistir no banco via
  `salvarRefreshToken`, não imprime mais instrução de colar no `.env`, pra não deixar um
  segundo caminho desatualizado/inconsistente com o novo fluxo.
- **Leitura do token pelos jobs:** `lerEmailFaturas.ts`/`sincronizarCalendario.ts` já seguem o
  padrão "processo roda um ciclo e sai, `docker-compose` reinicia" (não são processos
  long-lived) — ler o token do banco uma vez no início de cada execução já resolve "hot
  reload" sem nenhum mecanismo extra de cache/invalidação.

## Task List

### Fase 1: Armazenamento

- [ ] Tarefa 128: migration `0018_credenciais_google.sql` (tabela singleton) + repositório
      `src/db/repositories/credenciaisGoogle.ts` (`obterRefreshToken`/`salvarRefreshToken`)
- [ ] Tarefa 129: `env.ts` — remove `GOOGLE_REFRESH_TOKEN` do schema e o campo `google`;
      `googleOAuthClient` ganha `calendarId` (default `'primary''`, independente de token)

### Checkpoint: Armazenamento pronto
- [ ] `npm run build`/`lint`/`test` sem erro
- [ ] Teste: `salvarRefreshToken` seguido de `salvarRefreshToken` com outro valor nunca cria
      segunda linha (upsert de verdade)
- [ ] Revisão rápida: `credenciais_google` não aparece em nenhum enum/mapa de
      `consultaDinamica.ts`/`relatorios/consultaDinamica.ts`

### Fase 2: Wiring nos consumidores

- [ ] Tarefa 130: `lerEmailFaturas.ts`/`sincronizarCalendario.ts` — trocam checagem
      `env.google === null` por `env.googleOAuthClient === null` + leitura de
      `obterRefreshToken(db)`, montam o objeto pra `criarClientesGoogle` combinando os dois
- [ ] Tarefa 131: `scripts/configurarGoogleOAuth.ts` — persiste via `salvarRefreshToken` em
      vez de imprimir instrução de `.env`
- [ ] Tarefa 132: `bot/handlers/registrarEmail.ts` — `createHandlerRegistrarEmail` passa a
      receber `db`; checagem "já vinculado" usa `obterRefreshToken(db)`; mensagem de vínculo
      existente usa `env.googleOAuthClient.calendarId`; `createHandlerCodigoOAuthGoogle`
      chama `salvarRefreshToken(db, tokens.refresh_token)` em vez de devolver o token em texto
      — remove a chamada a `agendarAutoApagar`/`agendarApagarPersistido` deste handler
- [ ] Tarefa 133: remove o mecanismo `mensagens_pendentes_apagar` (ficou sem uso depois da
      Tarefa 132): migration `0019_remove_mensagens_pendentes_apagar.sql` (`DROP TABLE`),
      apaga `src/db/repositories/mensagensPendentesApagar.ts` e o sweep de boot em `index.ts`
      (`apagarMensagensPendentesAtrasadas`, import de `listarVencidas`/`removerAgendamento`)

### Checkpoint: Rodada fechada
- [ ] `npm run build`/`lint`/`test` sem erro, suite completa
- [ ] Teste manual em Homologação: `/registrar_email confirmar`, autorizar, colar código —
      bot confirma vínculo sem pedir nada manual na VM; `docker compose restart
      ler-email-faturas-homologacao sincronizar-calendario-homologacao` (ou esperar o próximo
      ciclo natural) e confirmar que os dois jobs funcionam lendo o token do banco
  - [ ] PROGRESSO.md atualizado com o marco e fechamento do achado de 2026-10-01/02
      (atrito manual resolvido; expiração a cada ~7 dias continua existindo, sem mudança)
      - [ ] Milestone "Persistência do refresh_token Google" fechado no GitHub (6/6 issues)
  - [ ] Revisão com o usuário antes de retomar a rodada WhatsApp pausada

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| `credenciais_google` acabar incluída, hoje ou no futuro, em alguma tool de consulta dinâmica (vazamento do refresh_token via chat) | Alto — acesso de leitura ao Gmail/Calendar pra quem formular a pergunta certa | Comentário de alerta na migration e no topo dos dois arquivos de `consultaDinamica`; enum fechado de domínio já exclui por padrão (não é passthrough de nome de tabela) |
| Job em execução no momento exato de uma reautorização lê o token antigo (ainda não trocou) | Baixo — o antigo só fica inválido depois do `invalid_grant`, não há janela de corrida real | Nenhuma — processo de vida curta, próximo ciclo já lê o valor novo |
| Remover `mensagens_pendentes_apagar` quebrar algo que dependia dela sem eu ter visto | Baixo | Grep confirmou uso restrito a este handler antes de decidir remover; build/lint/testes cobrem import quebrado |

## Open Questions

Nenhuma — decisões de arquitetura fechadas na conversa antes de planejar.

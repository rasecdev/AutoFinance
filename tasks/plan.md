# Implementation Plan: Lembrete automático de reautorização do Google

## Overview

Depois da rodada "Persistência do refresh_token Google" (2026-10-03), o atrito operacional
de reautorizar (SSH+editar `.env`+restart) já foi eliminado — mas o usuário ainda precisa
*lembrar* de rodar `/registrar_email confirmar` a cada ~7 dias (o app OAuth continua em
status "Testing" no Google Cloud Console, decisão de não publicar mantida). Esta rodada
fecha esse último atrito: um lembrete automático a cada 5 dias (margem de 2 dias antes do
token expirar) que já gera o link de autorização e manda pro chat, sem o usuário precisar
digitar o comando — só clicar, autorizar e colar o código de volta, como já faz hoje.

## Architecture Decisions

- **Roda dentro do processo principal do bot (`index.ts`), não como serviço/script separado
  no `docker-compose.yml`** — diferente do padrão usual de job em background deste projeto.
  Motivo: o "vínculo pendente" (`src/bot/googleOAuthPendencia.ts`) é um `Map` em memória
  **do processo que também roteia as mensagens recebidas** (`router.ts` decide se um texto é
  o código OAuth checando esse mesmo `Map`). Um script separado (processo/container
  diferente) que gerasse o link e marcasse a pendência não seria visto pelo processo
  principal quando o usuário colasse o código de volta — a pendência precisa viver no mesmo
  processo que vai consumi-la. Rodar dentro do `index.ts` evita esse problema de estado
  cross-process sem precisar persistir o `Map` inteiro (fora de escopo, não pedido).
- **Agendamento via `setTimeout` encadeado** (mesmo padrão simples já usado em
  `dormirAte.ts`, mas aqui dentro de um processo que nunca sai por padrão) — 5 dias em ms
  (432.000.000) fica bem dentro do limite de 32 bits do `setTimeout` (~24,8 dias), então não
  precisa da lógica de encadeamento de `dormirAte.ts` (criada pra atrasos >24,8 dias, não é o
  caso aqui).
- **Nova tabela singleton `lembrete_reautorizacao_google`** (`enviado_em`, mesmo princípio de
  `credenciais_google`/`bot_pausado`) guarda só "quando foi o último lembrete enviado" —
  **desacoplada do estado real do token** (`credenciais_google.atualizado_em`) de propósito:
  um lembrete dispara a cada 5 dias corridos, sempre, independente de o usuário já ter
  revinculado fora desse ciclo (ex: por já ter batido um `invalid_grant` antes do lembrete).
  Mais simples de raciocinar do que tentar sincronizar os dois relógios, e o pior caso (um
  lembrete "redundante" se o usuário já revinculou por conta própria) é inofensivo — só
  gera um link novo que pode ser ignorado.
- **Reaproveita a lógica de `bot/handlers/registrarEmail.ts`** — extrai a parte de "montar
  client OAuth, gerar URL, marcar pendência" pra uma função exportada
  (`montarLinkVinculoGoogle`), chamada tanto pelo handler de `/registrar_email` quanto pelo
  novo agendador. Mensagem de texto do lembrete é própria (deixa claro que é automático,
  mesmo texto de passo a passo 1-4 reaproveitado).
- **Primeiro lembrete só 5 dias depois do deploy desta feature**, não imediatamente — sem
  registro em `lembrete_reautorizacao_google` ainda, a base do cálculo é "agora" (não "nunca
  enviado, manda já"), pra não gerar um link redundante assim que o usuário acabou de
  vincular manualmente hoje.
- **Manda pra todos os `env.telegramAllowedChatIds`** (mesmo padrão de
  `tratarErroCriticoJob.ts`) — falha ao enviar pra um chat não impede os outros.
- **Só ativa com `env.googleOAuthClient` configurado** — sem isso, não agenda nada (mesmo
  critério de "integração desligada" já usado nos outros consumidores do Google).

## Task List

- [ ] Tarefa 134: migration `0020_lembrete_reautorizacao_google.sql` (tabela singleton) +
      repositório `src/db/repositories/lembreteReautorizacaoGoogle.ts`
      (`obterUltimoEnvio`/`registrarEnvio`)
- [ ] Tarefa 135: extrai `montarLinkVinculoGoogle` em `registrarEmail.ts`; novo
      `src/bot/lembreteReautorizacaoGoogle.ts` (agendador); liga em `index.ts`

### Checkpoint: Rodada fechada
- [ ] `npm run build`/`lint`/`test` sem erro
- [ ] Teste manual: reduzir `INTERVALO_MS` temporariamente (ou usar fake timers só no teste
      automatizado) pra confirmar que o lembrete chega no Telegram e que colar o código
      funciona igual ao `/registrar_email` manual
- [ ] PROGRESSO.md atualizado
- [ ] Milestone "Lembrete automático de reautorização do Google" fechado no GitHub

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Processo principal reinicia com frequência maior que 5 dias (deploy), timer nunca encadeia o suficiente pra disparar | Baixo — na prática deploys não são tão frequentes quanto durante uma sessão de implementação ativa | Base do cálculo vem do banco (`enviado_em`), não de um contador em memória — sobrevive a restart, só recalcula o delay restante |
| Lembrete chega mas usuário ignora, token expira entre um lembrete e o próximo | Baixo — mitigação parcial por natureza (lembrete, não garantia) | Margem de 2 dias (5 de 7) já cobre a maioria dos casos; fora de escopo tentar garantir 100% |

## Open Questions

Nenhuma.

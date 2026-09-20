# Implementation Plan: Fase 8 — Agregação bancária via Open Finance ("Meu Pluggy")

## Overview

Conectar contas bancárias reais do usuário via Open Finance (Pluggy) pra sincronizar transação/saldo automaticamente, complementar (não substituto) à leitura de e-mail da Fase 7 e ao lançamento manual. Ver PLANO.md, seção "Fase 8" (linhas 586+) e "Estudo: comparação com apps comerciais" (linha ~826+) pro racional completo e os achados de pesquisa que já mudaram o desenho original (ver abaixo).

## Architecture Decisions

- **Conexão sem servidor HTTP público, mesmo o Pluggy Connect Widget exigindo SDK+backend por padrão.** Achado real de pesquisa (2026-09-19, docs.pluggy.ai): diferente do OAuth do Google (Fase 7, que permite fluxo 100% sem servidor via URL de consentimento), o Pluggy Connect não tem URL hospedada — exige uma página com o SDK embutido e um backend que gere o `connect_token` (usa `CLIENT_SECRET`, nunca pode ir pro frontend). Decisão: página HTML estática local (`scripts/pluggyConnectWidget.html`, SDK via CDN, nunca implantada publicamente) aberta manualmente pelo usuário no próprio navegador; `connect_token` gerado por script de linha de comando (`gerarConnectTokenPluggy.ts`, mesmo padrão do `configurarGoogleOAuth.ts`) e colado manualmente na página. Login/MFA bancário acontece 100% no navegador do usuário, direto contra a Pluggy — nunca passa pelo AutoFinance. O widget devolve um `item_id` na tela; usuário cola via `/registrar_open_finance <item_id>` no bot (mesmo padrão do `/registrar_email`) pra vincular.
- **Polling em vez de webhook**, apesar da Pluggy recomendar webhook. Mesmo princípio de segurança já decidido na Fase 7 (nenhum servidor HTTP público novo — ver achado de superfície de ataque de 2026-09-19 na seção "Ambientes" do PLANO.md sobre o acesso da VM). Job periódico chama a API da Pluggy diretamente, mesmo esqueleto de `sincronizarCalendario.ts`/`lerEmailFaturas.ts` (`loadEnv`/`dormirAte`/`tratarErroCriticoJob`/guard `--agora`).
- **Mapeamento explícito de conta Pluggy → conta/cartão AutoFinance, nunca automático por nome.** Um item da Pluggy pode trazer várias contas (corrente, cartão, poupança); `/registrar_open_finance` lista o que veio e pede pro usuário confirmar/escolher a qual `conta_id`/`cartao_id` já cadastrado cada uma corresponde — evita o sistema inventar essa relação.
- **`env.pluggy` segue exatamente o mesmo padrão de `env.google` (Fase 7, Tarefa 90):** grupo opcional (`PLUGGY_CLIENT_ID`/`PLUGGY_CLIENT_SECRET`) — ausente = `env.pluggy === null` (integração desligada, caminho válido, sobretudo em Produção antes do usuário conectar a primeira conta), incompleto = erro explícito, completo = `env.pluggy` populado.
- **Duas checagens de correspondência, execução em duas fases distintas** (diferente da Fase 7, que resolve tudo numa função): (1) contra `transacoes` já lançadas manualmente (conta+valor+data aproximada) — evita duplicar o que o usuário já registrou por conversa; (2) contra `faturas`/`parcelas` já pagas (por `conta_id` do cartão/dívida, valor+data) — pagamento de fatura/parcela sincronizado NUNCA vira `transacao` de despesa nova (já contado quando a compra/dívida foi registrada). Sem correspondência em nenhuma das duas → heurística de saque (ver abaixo) → senão, `transacao` nova.
- **Saque em espécie não é despesa.** Heurística inicial: campo de categoria que a própria Pluggy já atribui à transação (a documentação não deixa claro o valor exato usado pra saque — a implementação real (Tarefa da correspondência) precisa inspecionar dado real do sandbox antes de fixar a string de match, documentando o valor encontrado como achado real na hora).
- **`transacoes` ganha `origem`/`trace_id`** (colunas que hoje só existem em `parcelas`, Fase 1) — necessário pra identificar/filtrar transação vinda de Open Finance depois (relatórios, correção de erro de correspondência), mesmo padrão já usado em `parcelas.origem IN ('calculada', 'email')`.
- **Novas tabelas de idempotência/mapeamento, mesmo princípio de `emails_processados` (Fase 7):** `contas_open_finance` (mapeamento `pluggy_account_id` → `conta_id`/`cartao_id` + `item_id`) e `transacoes_open_finance_processadas` (`pluggy_transaction_id UNIQUE`, evita reprocessar a mesma transação a cada ciclo de polling).
- **`renovar_sandbox_pluggy`, só em Homologação**, a cada 20 dias (margem antes do limite de 30 dias de expiração do sandbox, ver seção "Ambientes" do PLANO.md) — `PATCH /items/{id}` pra cada item conectado em Homologação.
- **PJ não bloqueia a fase.** Cobertura de conta PJ pelo "Meu Pluggy" segue não confirmada (ação que só o usuário pode fazer, contatando o suporte da Pluggy) — a integração é desenhada pra "zero contas conectadas" ser um estado normal; PJ continua 100% no fluxo manual/e-mail já existente enquanto isso não for resolvido.

## Task List

Ver `tasks/todo.md`. Ordem de dependência:

1. Tarefa 97: `env.ts` — grupo opcional Pluggy
2. Tarefa 98: migrations — `contas_open_finance`, `transacoes_open_finance_processadas`, `transacoes.origem`/`trace_id`
3. Tarefa 99: client HTTP fino da API Pluggy (`src/integracoes/pluggy/cliente.ts`)
4. Tarefa 100: script `gerarConnectTokenPluggy.ts` + página estática `pluggyConnectWidget.html`
5. Tarefa 101: comando `/registrar_open_finance <item_id>` no bot
6. Tarefa 102: lógica de correspondência (duas checagens + heurística de saque)
7. Tarefa 103: job `sincronizarOpenFinance.ts` (polling)
8. Tarefa 104: job `renovar_sandbox_pluggy.ts` (só Homologação)
9. Tarefa 105: wiring (`docker-compose.yml`, dependências, `npm audit`)

### Checkpoint: Conexão + sincronização de Open Finance funcionais
- [ ] `npm run build`/`lint`/`test` sem erro
- [ ] Teste manual em Homologação: conta sandbox da Pluggy criada, widget local conectado, `item_id` registrado via bot, job de sincronização traz transação de teste, as duas checagens de correspondência não duplicam nem contam pagamento de fatura/parcela como despesa nova
- [ ] PROGRESSO.md atualizado com o marco
- [ ] Revisão com o usuário antes de prosseguir (Fase 9, se aplicável)

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Widget local (HTML estático) pode não funcionar de primeira por CORS/CSP da Pluggy exigir origem específica | Alto (bloqueia a conexão inteira) | Testar cedo (Tarefa 100), antes de construir o resto por cima; se `file://` não funcionar, alternativa é servir a página via `python -m http.server` local temporário (ainda sem expor nada publicamente) |
| Heurística de saque errada classifica saque como despesa (ou vice-versa) | Médio (relatório incorreto) | Documentar a string/categoria real encontrada no sandbox como achado real; cobrir com teste específico assim que confirmado |
| Cobertura PJ do "Meu Pluggy" seguir incerta indefinidamente | Baixo (fallback já existe) | Fase não bloqueia nisso; documentado como decisão em aberto, não impede o resto |
| Polling perder transação entre ciclos se o job cair | Baixo | Idempotência via `transacoes_open_finance_processadas` já cobre reprocessamento seguro; ciclo seguinte sempre pega o que ficou pra trás |

## Open Questions

- Confirmar com o suporte da Pluggy se "Meu Pluggy" cobre conta PJ (ação do usuário, fora do alcance de execução autônoma).
- Intervalo exato do polling de `sincronizarOpenFinance` (proposta: 6h, mesmo de `sincronizarCalendario` — ajustar durante a Tarefa 103 se o sandbox mostrar necessidade de ciclo mais curto/longo).
- Valor real da categoria/campo que a Pluggy usa pra identificar saque — só descobrível com dado real do sandbox (Tarefa 102).

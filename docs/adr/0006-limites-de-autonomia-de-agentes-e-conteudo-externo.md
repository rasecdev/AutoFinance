---
status: accepted
---
# Limites de autonomia dos agentes e leitura segura de conteúdo externo

Agentes autônomos (o Hermes Agent, no futuro) vão ler Langfuse e Grafana para analisar, catalogar e abrir issues, e talvez propor correções. Esta iniciativa entrega apenas o contrato de dados e o acesso de leitura sem conteúdo bruto. O agente lê só Metadado de observabilidade, abre issues e PRs contra `development` com o CI obrigatório e revisão humana, e nunca faz merge nem promove para `master`. Do lado do bot, todo conteúdo que ele lê sozinho (e-mail, PDF, foto) é tratado como não confiável: extração sempre sem tools, validação rígida e plausibilidade, campos livres limitados, texto de confirmação montado por código, lista de remetentes confiáveis com autenticação do remetente e leitura de e-mail desligada por padrão.

## Considered Options

- Remover a leitura de e-mail de vez: descartado por ora. Falta confirmar se as `bills` do Pluggy cobrem as faturas de cartão no plano contratado e como ficam os boletos de parcela.

## Consequences

- Uma lista de remetentes vazia significa não ler nenhum e-mail.
- O guardrail reduz risco, não o elimina: confirmação, privilégio mínimo, mascaramento e revisão humana continuam necessários. Os pontos cegos conhecidos (injection de segunda ordem, imagem com texto, erro plausível) estão registrados no PLANO.

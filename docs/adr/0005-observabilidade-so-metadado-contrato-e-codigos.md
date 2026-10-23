---
status: accepted
---
# Observabilidade legível por máquina: só metadado, contrato de dados e catálogo de códigos

Tudo que sai do banco local (Langfuse, Grafana, agentes) é Metadado de observabilidade: Códigos, `trace_id`, nomes de tool e de Nó, nomes e tipos dos argumentos, durações, tokens e custos. O conteúdo das conversas fica só no banco local e nunca é exportado. Todo traço, passo e erro carrega `ambiente`, `versao_app`, `prompt_versao`, `trace_id`, `canal` e `no`; erros carregam também `codigo`, `severidade` e `fingerprint`. O catálogo de Códigos é uma constante TypeScript versionada, com documento gerado no repositório.

## Considered Options

- Conteúdo mascarado ou completo em algum ambiente: descartado. A prioridade é saber o que deu errado, sem expor dado financeiro a um segundo modelo.
- Langfuse na mesma VM da aplicação: a documentação do Langfuse recomenda 4 núcleos e 16 GiB, e a VM tem 2 OCPU e 12 GB compartilhados com Produção e Homologação. Aceito apenas se a prova de conceito mostrar, em Homologação, até 5 GB de memória (limitada no contêiner) e até 40% de CPU média, e se houver imagem ARM64 de todos os componentes. Caso contrário, o Langfuse espera o servidor escalado. Fica registrado o contraponto: o PLANO pede observabilidade fora da máquina que ela observa.

## Consequences

- Para depurar um caso com conteúdo, é preciso reproduzi-lo localmente pelo `trace_id`.
- Riscos aceitos e documentados, sem implementação: pedidos fora de escopo (aconselhamento) e abuso de custo, porque o uso é de uma pessoa só e há relatório de uso.
- Grafana fica para a Fase 12. Se o servidor escalado usar Postgres, o problema do banco SQLite criptografado sai de cena.

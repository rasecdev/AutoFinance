#!/usr/bin/env bash
set -euo pipefail

# Fonte de verdade deste script: este arquivo, versionado no repositório.
# A cópia que roda de verdade fica em /opt/autofinance-deploy/deploy.sh na
# VM (dono root, authorized_keys da chave de deploy restrito via `command=`
# só a rodar esse caminho — ver PLANO.md "Deploy automático") — a automação
# de CI/deploy não tem permissão de alterar esse arquivo. Qualquer mudança
# aqui precisa ser copiada manualmente pra lá (sudo, usuário com acesso à
# VM), nunca aplicada pelo pipeline.
#
# Achado real (Tarefa 122, PROGRESSO.md 2026-10-06): a versão anterior deste
# script listava os serviços de cada ambiente à mão (SERVICOS="homologacao
# backup-homologacao ..."), e ficava desatualizada a cada serviço novo no
# docker-compose.yml — forçava um `docker compose up -d` manual na VM na
# primeira vez (foi o caso de whatsapp-homologacao/whatsapp-producao,
# sincronizar-open-finance-*, renovar-sandbox-pluggy-homologacao e
# expurgar-dados-antigos-*, nenhum deles chegou a subir no deploy automático
# quando foram criados). Corrigido descobrindo os serviços do ambiente na
# hora, via `docker compose config --services`, em vez de lista fixa.

REPO_DIR=/home/ubuntu/AutoFinance
AMBIENTE="${SSH_ORIGINAL_COMMAND:-}"

case "$AMBIENTE" in
  homologacao)
    BRANCH=development
    ;;
  producao)
    BRANCH=master
    ;;
  *)
    echo "Ambiente inválido ou não informado: '$AMBIENTE'. Use 'homologacao' ou 'producao'." >&2
    exit 1
    ;;
esac

cd "$REPO_DIR"
git fetch origin "$BRANCH"
git checkout "$BRANCH"
git reset --hard "origin/$BRANCH"

# O serviço principal de cada ambiente é nomeado exatamente como o ambiente
# ("homologacao"/"producao", sem sufixo); todo outro serviço do ambiente
# termina em "-$AMBIENTE" (ex: backup-homologacao, whatsapp-producao) —
# mesma convenção de nomes usada em todo o docker-compose.yml. Serviço sem
# par no outro ambiente (ex: renovar-sandbox-pluggy-homologacao, só existe
# em Homologação) não é um caso especial aqui — o grep simplesmente não acha
# nada pra "producao" e segue sem ele.
mapfile -t SERVICOS < <(docker compose config --services | grep -E "^${AMBIENTE}\$|-${AMBIENTE}\$")

if [ "${#SERVICOS[@]}" -eq 0 ]; then
  echo "Nenhum serviço encontrado pro ambiente '$AMBIENTE' no docker-compose.yml." >&2
  exit 1
fi

docker compose up -d --build "${SERVICOS[@]}"

# Limpeza no fim do deploy, depois do `up` (que já deixou os containers novos em
# execução, então o `-a` só apaga imagem que nenhum container usa, nem parado).
# Achado real (2026-10-22): disco da VM encheu durante builds e travou o deploy;
# o `image prune -f` sozinho só tira imagem órfã, não imagem antiga sem uso nem o
# cache de build (chegou a 4,67 GB). Nunca `--volumes`/`volume prune`: é onde
# ficam os bancos. Cache recente (72h) fica, pra não perder o ganho de cache de
# camadas do próximo build. Falha de limpeza não derruba um deploy que já subiu.
docker image prune -a -f || echo "aviso: image prune falhou (deploy já aplicado)" >&2
docker builder prune -f --filter "until=72h" || echo "aviso: builder prune falhou (deploy já aplicado)" >&2

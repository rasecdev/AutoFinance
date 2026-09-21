// Client fino sobre fetch nativo (sem SDK de terceiro) — poucos endpoints,
// REST simples (mesmo critério já usado em monitorarPrecos.ts pro catálogo
// do OpenRouter). Sem fluxo de consentimento embutido: o connect_token é só
// pra alimentar a página estática do widget (Tarefa 100); a conexão em si
// (login bancário) acontece inteiramente no navegador do usuário, direto
// contra a Pluggy.
const PLUGGY_API_URL = 'https://api.pluggy.ai';

async function requisitar<T>(
  path: string,
  init: { method?: string; apiKey?: string; body?: unknown } = {},
): Promise<T> {
  const resposta = await fetch(`${PLUGGY_API_URL}${path}`, {
    method: init.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(init.apiKey ? { 'X-API-KEY': init.apiKey } : {}),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });

  if (!resposta.ok) {
    throw new Error(`Pluggy ${init.method ?? 'GET'} ${path} respondeu ${resposta.status}`);
  }

  return (await resposta.json()) as T;
}

// Válida por 2h (ver docs.pluggy.ai/reference/authentication) — quem chama
// decide se cacheia ou autentica de novo a cada execução do job; scripts
// desta fase (jobs de polling, curta duração) autenticam a cada execução,
// mais simples do que gerenciar expiração entre execuções.
export async function autenticar(clientId: string, clientSecret: string): Promise<string> {
  const { apiKey } = await requisitar<{ apiKey: string }>('/auth', {
    method: 'POST',
    body: { clientId, clientSecret },
  });

  return apiKey;
}

// Escopo limitado, válido por 30min (mesma doc) — usado só pra alimentar a
// página estática do widget (pluggyConnectWidget.html, Tarefa 100), nunca
// pra chamar a API diretamente por trás.
export async function gerarConnectToken(apiKey: string): Promise<string> {
  const { accessToken } = await requisitar<{ accessToken: string }>('/connect_token', {
    method: 'POST',
    apiKey,
  });

  return accessToken;
}

export type ItemPluggy = {
  id: string;
  status: string;
};

export async function obterItem(apiKey: string, itemId: string): Promise<ItemPluggy> {
  return requisitar<ItemPluggy>(`/items/${itemId}`, { apiKey });
}

// PATCH /items/{id} sem body dispara uma atualização (renova o sandbox de
// Homologação, achado real pesquisado — Tarefa 104; ou re-sincroniza um
// item real em Produção).
export async function atualizarItem(apiKey: string, itemId: string): Promise<ItemPluggy> {
  return requisitar<ItemPluggy>(`/items/${itemId}`, { method: 'PATCH', apiKey });
}

export type ContaPluggy = {
  id: string;
  itemId: string;
  type: string;
  name: string;
  number?: string;
};

type RespostaListaPluggy<T> = {
  results: T[];
  page: number;
  totalPages: number;
};

export async function listarContasDoItem(apiKey: string, itemId: string): Promise<ContaPluggy[]> {
  const resposta = await requisitar<RespostaListaPluggy<ContaPluggy>>(
    `/accounts?itemId=${encodeURIComponent(itemId)}`,
    { apiKey },
  );

  return resposta.results;
}

export type TransacaoPluggy = {
  id: string;
  accountId: string;
  description: string;
  amount: number;
  date: string;
  category?: string;
  // Achado real (Tarefa 102): "category" precisa de plano Pro da Pluggy e
  // não documenta valores fixos; "operationType" (ex: "SAQUE") só existe em
  // conectores Open Finance, mas é o sinal mais confiável de saque em
  // espécie quando presente — ver pareceSaque em correspondenciaOpenFinance.ts.
  operationType?: string;
};

type RespostaTransacoesPluggy = {
  results: TransacaoPluggy[];
  next: string | null;
};

// Achado real (teste manual em Homologação, 2026-09-21): GET /transactions
// responde 410 ENDPOINT_DEPRECATED — a Pluggy migrou pra /v2/transactions,
// com paginação por cursor (campo "next") em vez de page/totalPages. O
// formato de "next" como cursor de query param (não URL completa) segue a
// convenção que a própria mensagem de erro da Pluggy chama de "cursor
// pagination", mas não foi possível confirmar com uma conta real de mais de
// uma página (sandbox só devolveu next: null) — validar se aparecer erro de
// paginação com conta de produção de verdade.
export async function listarTransacoes(apiKey: string, accountId: string, desde?: string): Promise<TransacaoPluggy[]> {
  const transacoes: TransacaoPluggy[] = [];
  let cursor: string | undefined;

  for (;;) {
    const query = new URLSearchParams({ accountId });
    if (desde) {
      query.set('from', desde);
    }
    if (cursor) {
      query.set('cursor', cursor);
    }

    const resposta = await requisitar<RespostaTransacoesPluggy>(`/v2/transactions?${query.toString()}`, {
      apiKey,
    });

    transacoes.push(...resposta.results);
    if (!resposta.next) {
      break;
    }
    cursor = resposta.next;
  }

  return transacoes;
}

import type { Idioma } from '../db/repositories/idiomaBot.js';

// Catálogo de strings fixas do bot por idioma (Fase 10, ver PLANO.md e
// tasks/plan.md). Chaves novas entram aqui conforme cada handler/relatório é
// traduzido (tasks 140-146) -- este arquivo nasce só com o necessário pro
// comando /idioma (Tarefa 138).
export const CATALOGO: Record<string, Record<Idioma, string>> = {
  idioma_confirmacao: {
    pt: 'Idioma alterado para português.',
    en: 'Language changed to English.',
    es: 'Idioma cambiado a español.',
  },
  idioma_invalido: {
    pt: 'Idioma inválido: "{valor}". Use /idioma pt, /idioma en ou /idioma es.',
    en: 'Invalid language: "{valor}". Use /idioma pt, /idioma en or /idioma es.',
    es: 'Idioma no válido: "{valor}". Usa /idioma pt, /idioma en o /idioma es.',
  },
  idioma_atual: {
    pt: 'Idioma ativo: português. Use /idioma en ou /idioma es pra trocar.',
    en: 'Active language: English. Use /idioma pt or /idioma es to switch.',
    es: 'Idioma activo: español. Usa /idioma pt o /idioma en para cambiar.',
  },
  comando_errado: {
    pt: 'Marca a última resposta do bot como incorreta',
    en: "Marks the bot's last reply as incorrect",
    es: 'Marca la última respuesta del bot como incorrecta',
  },
  comando_certo: {
    pt: 'Marca a última resposta do bot como correta',
    en: "Marks the bot's last reply as correct",
    es: 'Marca la última respuesta del bot como correcta',
  },
  comando_modelos: {
    pt: 'Lista os modelos de IA disponíveis por fluxo',
    en: 'Lists the AI models available per flow',
    es: 'Lista los modelos de IA disponibles por flujo',
  },
  comando_modelo: {
    pt: 'Mostra ou troca o modelo de IA em uso num fluxo',
    en: 'Shows or switches the AI model used in a flow',
    es: 'Muestra o cambia el modelo de IA usado en un flujo',
  },
  comando_registrar_email: {
    pt: 'Vincula sua conta Google (Gmail + Calendar)',
    en: 'Links your Google account (Gmail + Calendar)',
    es: 'Vincula tu cuenta de Google (Gmail + Calendar)',
  },
  comando_ajuda: {
    pt: 'Lista os comandos e o que dá pra pedir conversando',
    en: 'Lists the commands and what you can just ask by chatting',
    es: 'Lista los comandos y lo que puedes pedir simplemente conversando',
  },
  comando_registrar_open_finance: {
    pt: 'Vincula uma conta bancária conectada via Pluggy',
    en: 'Links a bank account connected via Pluggy',
    es: 'Vincula una cuenta bancaria conectada vía Pluggy',
  },
  comando_pausar: {
    pt: 'Pausa o bot — nenhuma mensagem é processada até /retomar',
    en: 'Pauses the bot — no message is processed until /retomar',
    es: 'Pausa el bot — ningún mensaje se procesa hasta /retomar',
  },
  comando_retomar: {
    pt: 'Retoma o bot depois de um /pausar',
    en: 'Resumes the bot after a /pausar',
    es: 'Reanuda el bot después de un /pausar',
  },
  comando_idioma: {
    pt: 'Mostra ou troca o idioma do bot (pt, en ou es)',
    en: 'Shows or switches the bot language (pt, en or es)',
    es: 'Muestra o cambia el idioma del bot (pt, en o es)',
  },
  bot_pausado_ja_estava: {
    pt: 'Já estava pausado — nenhuma mensagem é processada até /retomar.',
    en: 'Already paused — no message is processed until /retomar.',
    es: 'Ya estaba pausado — ningún mensaje se procesa hasta /retomar.',
  },
  bot_pausado_confirmacao: {
    pt: 'Bot pausado. Nenhuma mensagem é processada até você mandar /retomar.',
    en: 'Bot paused. No message is processed until you send /retomar.',
    es: 'Bot pausado. Ningún mensaje se procesa hasta que envíes /retomar.',
  },
  bot_retomado: {
    pt: 'Bot retomado — voltando a processar mensagens normalmente.',
    en: 'Bot resumed — back to processing messages normally.',
    es: 'Bot reanudado — volviendo a procesar mensajes normalmente.',
  },
  bot_sem_pausa_ativa: {
    pt: 'Não havia pausa ativa neste chat.',
    en: 'There was no active pause in this chat.',
    es: 'No había una pausa activa en este chat.',
  },
  modelo_ativo_chat: {
    pt: 'Modelo ativo neste chat: {modelo}',
    en: 'Active model in this chat: {modelo}',
    es: 'Modelo activo en este chat: {modelo}',
  },
  modelo_trocado: {
    pt: 'Modelo trocado para "{nome}" neste chat. Use o slug do OpenRouter (ex: "openai/gpt-4o-mini", "qwen/qwen3-32b"), não o nome de exibição — se a próxima mensagem falhar, o nome pode estar errado.',
    en: 'Model switched to "{nome}" in this chat. Use the OpenRouter slug (e.g. "openai/gpt-4o-mini", "qwen/qwen3-32b"), not the display name — if the next message fails, the name might be wrong.',
    es: 'Modelo cambiado a "{nome}" en este chat. Usa el slug de OpenRouter (ej: "openai/gpt-4o-mini", "qwen/qwen3-32b"), no el nombre de visualización — si el próximo mensaje falla, el nombre puede estar mal.',
  },
  modelos_por_fluxo_cabecalho: {
    pt: 'Modelos por fluxo:',
    en: 'Models per flow:',
    es: 'Modelos por flujo:',
  },
  modelos_override_aviso: {
    pt: '\n\nEste chat tem um override manual ativo (/modelo): "{override}" — substitui só o modelo de {fluxo} listado acima, só aqui.',
    en: '\n\nThis chat has a manual override active (/modelo): "{override}" — replaces only the {fluxo} model listed above, only here.',
    es: '\n\nEste chat tiene un override manual activo (/modelo): "{override}" — reemplaza solo el modelo de {fluxo} listado arriba, solo aquí.',
  },
  nao_suportado: {
    pt: 'Esse tipo de mensagem ainda não é suportado.',
    en: 'This type of message is not supported yet.',
    es: 'Este tipo de mensaje aún no es compatible.',
  },
  avaliacao_correto: {
    pt: 'correto',
    en: 'correct',
    es: 'correcto',
  },
  avaliacao_incorreto: {
    pt: 'incorreto',
    en: 'incorrect',
    es: 'incorrecto',
  },
  feedback_sem_reply: {
    pt: 'Pra marcar uma resposta como {avaliacao}, responda (reply) diretamente à mensagem do bot que você quer marcar, com {comando}.',
    en: 'To mark a reply as {avaliacao}, reply directly to the bot message you want to mark, with {comando}.',
    es: 'Para marcar una respuesta como {avaliacao}, responde (reply) directamente al mensaje del bot que quieres marcar, con {comando}.',
  },
  feedback_nao_encontrada: {
    pt: 'Não encontrei o registro dessa resposta (pode ter sido antes do bot reiniciar). Não dá pra marcar.',
    en: "I couldn't find the record of that reply (it may have been before the bot restarted). Can't mark it.",
    es: 'No encontré el registro de esa respuesta (puede haber sido antes de que el bot se reiniciara). No se puede marcar.',
  },
  feedback_marcada: {
    pt: 'Marcado como {avaliacao}. Obrigado pelo feedback.',
    en: 'Marked as {avaliacao}. Thanks for the feedback.',
    es: 'Marcado como {avaliacao}. Gracias por el feedback.',
  },
  callback_expirado: {
    pt: 'Isso já foi respondido ou expirou.',
    en: 'This has already been answered or has expired.',
    es: 'Esto ya fue respondido o expiró.',
  },
  acao_cancelada: {
    pt: 'Ação cancelada.',
    en: 'Action cancelled.',
    es: 'Acción cancelada.',
  },
  nao_consegui_concluir_acao: {
    pt: 'Não consegui concluir a ação confirmada, tente novamente.',
    en: "I couldn't complete the confirmed action, please try again.",
    es: 'No pude completar la acción confirmada, intenta de nuevo.',
  },
};

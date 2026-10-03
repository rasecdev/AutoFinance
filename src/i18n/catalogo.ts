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
  nao_entendi_reformular: {
    pt: 'Não entendi, pode reformular?',
    en: "I didn't understand, could you rephrase?",
    es: 'No entendí, ¿puedes reformular?',
  },
  erro_modelo_invalido: {
    pt: 'Não consegui usar o modelo configurado nesse chat — o OpenRouter recusou, provavelmente porque o nome não é um slug válido. Confira com /modelo, ou troque de novo usando o slug do OpenRouter (ex: "openai/gpt-4o-mini", "qwen/qwen3-32b"), não o nome de exibição.',
    en: 'I couldn\'t use the model configured for this chat — OpenRouter rejected it, probably because the name isn\'t a valid slug. Check with /modelo, or switch again using the OpenRouter slug (e.g. "openai/gpt-4o-mini", "qwen/qwen3-32b"), not the display name.',
    es: 'No pude usar el modelo configurado en este chat — OpenRouter lo rechazó, probablemente porque el nombre no es un slug válido. Revisa con /modelo, o cambia de nuevo usando el slug de OpenRouter (ej: "openai/gpt-4o-mini", "qwen/qwen3-32b"), no el nombre de visualización.',
  },
  erro_processar_mensagem: {
    pt: 'Não consegui processar sua mensagem agora, tente de novo em instantes.',
    en: "I couldn't process your message right now, try again in a moment.",
    es: 'No pude procesar tu mensaje ahora, intenta de nuevo en un momento.',
  },
  midia_nao_comprovante: {
    pt: 'Não consegui reconhecer essa imagem como um comprovante financeiro. Manda uma foto nítida do comprovante, ou registra por texto/voz mesmo.',
    en: "I couldn't recognize this image as a financial receipt. Send a clear photo of the receipt, or just register it by text/voice.",
    es: 'No pude reconocer esta imagen como un comprobante financiero. Envía una foto nítida del comprobante, o regístralo por texto/voz directamente.',
  },
  midia_fatura_boleto: {
    pt: 'Isso parece ser uma fatura de cartão ou boleto de dívida, não um comprovante de compra do dia a dia — ainda não trato esse tipo de documento automaticamente. Se for uma compra, manda o comprovante da compra em si.',
    en: "This looks like a card bill or a debt slip, not an everyday purchase receipt — I don't handle this type of document automatically yet. If it's a purchase, send the receipt of the purchase itself.",
    es: 'Esto parece ser una factura de tarjeta o un boleto de deuda, no un comprobante de compra del día a día — todavía no trato este tipo de documento automáticamente. Si es una compra, envía el comprobante de la compra en sí.',
  },
  midia_tipo_nao_suportado: {
    pt: 'Esse tipo de arquivo ainda não é suportado — manda uma foto do comprovante.',
    en: "This file type isn't supported yet — send a photo of the receipt.",
    es: 'Este tipo de archivo aún no es compatible — envía una foto del comprobante.',
  },
  midia_pdf_nao_suportado: {
    pt: 'Ainda não consigo ler PDF, manda como foto.',
    en: "I still can't read PDFs, send it as a photo.",
    es: 'Todavía no puedo leer PDF, envíalo como foto.',
  },
  midia_erro_extracao: {
    pt: 'Não consegui processar essa imagem agora, tente de novo em instantes.',
    en: "I couldn't process this image right now, try again in a moment.",
    es: 'No pude procesar esta imagen ahora, intenta de nuevo en un momento.',
  },
  midia_legenda_necessaria: {
    pt: 'Pra ler uma planilha preciso saber a conta ou cartão — reenvia o arquivo com a legenda dizendo qual (ex: "conta corrente").',
    en: 'To read a spreadsheet I need to know the account or card — resend the file with a caption saying which one (e.g. "checking account").',
    es: 'Para leer una planilla necesito saber la cuenta o tarjeta — reenvía el archivo con el pie de foto diciendo cuál (ej: "cuenta corriente").',
  },
  midia_planilha_sem_transacoes: {
    pt: 'Não encontrei nenhuma transação reconhecível nessa planilha. Confira se as colunas fazem sentido (data, descrição, valor) e tenta de novo.',
    en: "I couldn't find any recognizable transaction in this spreadsheet. Check if the columns make sense (date, description, amount) and try again.",
    es: 'No encontré ninguna transacción reconocible en esta planilla. Revisa si las columnas tienen sentido (fecha, descripción, monto) e intenta de nuevo.',
  },
  midia_planilha_confirmacao: {
    pt: 'Encontrei {resumo}. Confirma? Toque em um botão abaixo, ou responda "sim" para registrar (qualquer outra coisa cancela).',
    en: 'Found {resumo}. Confirm? Tap a button below, or reply "yes" to register (anything else cancels).',
    es: 'Encontré {resumo}. ¿Confirmas? Toca un botón abajo, o responde "sí" para registrar (cualquier otra cosa cancela).',
  },
  voz_erro_transcricao: {
    pt: 'Não consegui entender o áudio, tenta de novo ou manda por texto.',
    en: "I couldn't understand the audio, try again or send it as text.",
    es: 'No pude entender el audio, intenta de nuevo o envíalo por texto.',
  },
};

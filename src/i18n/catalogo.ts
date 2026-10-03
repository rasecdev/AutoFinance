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
  email_sem_env: {
    pt: 'Ainda não dá pra vincular — faltam GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET configurados no servidor (criados uma vez no Google Cloud Console: projeto → ativar Gmail API e Calendar API → credencial OAuth 2.0 do tipo "Aplicativo para computador"). Isso é feito por quem administra o servidor, não por aqui — depois de configurado, "/registrar_email" passa a funcionar.',
    en: 'Can\'t link yet — GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET aren\'t configured on the server (created once in Google Cloud Console: project → enable Gmail API and Calendar API → OAuth 2.0 credential of type "Desktop app"). This is done by whoever administers the server, not here — once configured, "/registrar_email" will work.',
    es: 'Todavía no se puede vincular — faltan GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET configurados en el servidor (creados una vez en Google Cloud Console: proyecto → activar Gmail API y Calendar API → credencial OAuth 2.0 del tipo "Aplicación de escritorio"). Esto lo hace quien administra el servidor, no aquí — una vez configurado, "/registrar_email" empieza a funcionar.',
  },
  email_ja_vinculado: {
    pt: 'Este ambiente já tem uma conta Google vinculada (agenda: "{calendarId}") — cobre leitura de fatura/boleto por e-mail e criação de eventos de vencimento no Calendar, os dois já ativos.\n\nSe quiser vincular outra conta mesmo assim (o vínculo antigo continua funcionando até você concluir o novo), digite "/registrar_email confirmar".',
    en: 'This environment already has a Google account linked (calendar: "{calendarId}") — covers reading bills/invoices by email and creating due-date events in Calendar, both already active.\n\nIf you want to link another account anyway (the old link keeps working until you finish the new one), type "/registrar_email confirmar".',
    es: 'Este entorno ya tiene una cuenta de Google vinculada (agenda: "{calendarId}") — cubre la lectura de facturas/boletas por correo y la creación de eventos de vencimiento en Calendar, los dos ya activos.\n\nSi quieres vincular otra cuenta de todos modos (el vínculo anterior sigue funcionando hasta que completes el nuevo), escribe "/registrar_email confirmar".',
  },
  email_vinculo_mensagem: {
    pt:
      'Vamos vincular sua conta Google. Uma única autorização resolve as DUAS integrações de uma vez: leitura ' +
      'automática de fatura/boleto de e-mail (Gmail, só leitura) e criação de eventos de vencimento (Google ' +
      'Calendar) — mesma conta, mesmo passo, nada a repetir depois.\n\n' +
      '1. Abra este link e faça login com a conta Google que você quer usar:\n{url}\n\n' +
      '2. O Google vai mostrar os dois pedidos de permissão (ler Gmail, gerenciar eventos do Calendar) — são ' +
      'exatamente os dois escopos que o bot usa, nada além disso. Autorize.\n\n' +
      '3. O navegador vai tentar abrir "http://localhost/?code=..." e vai dar erro de página não encontrada — ' +
      'isso é esperado, não se preocupe. Copie o valor que vem depois de "code=" na barra de endereço (até o ' +
      '"&" seguinte, se houver mais parâmetros).\n\n' +
      '4. Cole esse código aqui nesta conversa, como uma mensagem normal.\n\n' +
      'O vínculo fica pendente só nesta conversa até você colar o código (ou até o bot reiniciar — nesse caso é ' +
      'só rodar "/registrar_email" de novo).',
    en:
      "Let's link your Google account. A single authorization covers BOTH integrations at once: automatic " +
      'reading of bills/invoices from email (Gmail, read-only) and creating due-date events (Google Calendar) — ' +
      'same account, same step, nothing to repeat later.\n\n' +
      '1. Open this link and sign in with the Google account you want to use:\n{url}\n\n' +
      '2. Google will show the two permission requests (read Gmail, manage Calendar events) — these are ' +
      'exactly the two scopes the bot uses, nothing more. Authorize them.\n\n' +
      '3. The browser will try to open "http://localhost/?code=..." and will show a page-not-found error — ' +
      'that\'s expected, don\'t worry. Copy the value that comes after "code=" in the address bar (up to the ' +
      'next "&", if there are more parameters).\n\n' +
      '4. Paste that code here in this conversation, as a normal message.\n\n' +
      'The link stays pending only in this conversation until you paste the code (or until the bot restarts — ' +
      'in that case just run "/registrar_email" again).',
    es:
      'Vamos a vincular tu cuenta de Google. Una sola autorización resuelve las DOS integraciones a la vez: ' +
      'lectura automática de facturas/boletas por correo (Gmail, solo lectura) y creación de eventos de ' +
      'vencimiento (Google Calendar) — misma cuenta, mismo paso, nada que repetir después.\n\n' +
      '1. Abre este enlace e inicia sesión con la cuenta de Google que quieres usar:\n{url}\n\n' +
      '2. Google va a mostrar las dos solicitudes de permiso (leer Gmail, gestionar eventos de Calendar) — son ' +
      'exactamente los dos alcances que usa el bot, nada más. Autorízalos.\n\n' +
      '3. El navegador va a intentar abrir "http://localhost/?code=..." y va a dar un error de página no ' +
      'encontrada — eso es esperado, no te preocupes. Copia el valor que viene después de "code=" en la barra ' +
      'de direcciones (hasta el siguiente "&", si hay más parámetros).\n\n' +
      '4. Pega ese código aquí en esta conversación, como un mensaje normal.\n\n' +
      'El vínculo queda pendiente solo en esta conversación hasta que pegues el código (o hasta que el bot se ' +
      'reinicie — en ese caso solo ejecuta "/registrar_email" de nuevo).',
  },
  email_codigo_invalido: {
    pt: 'Não consegui trocar esse código por um token — ele pode ter expirado (a validade é curta) ou ter sido colado incompleto. Rode "/registrar_email" de novo pra gerar um link novo.',
    en: 'I couldn\'t exchange that code for a token — it may have expired (it\'s short-lived) or been pasted incomplete. Run "/registrar_email" again to generate a new link.',
    es: 'No pude cambiar ese código por un token — puede haber expirado (la validez es corta) o haber sido pegado incompleto. Ejecuta "/registrar_email" de nuevo para generar un enlace nuevo.',
  },
  email_sem_refresh_token: {
    pt: 'A autorização deu certo, mas o Google não devolveu um refresh_token dessa vez — normalmente acontece quando essa conta já autorizou este mesmo app antes sem revogar o acesso. Revogue o acesso em https://myaccount.google.com/permissions (procure o nome do app) e rode "/registrar_email confirmar" de novo.',
    en: 'The authorization worked, but Google didn\'t return a refresh_token this time — this usually happens when this account already authorized this same app before without revoking access. Revoke access at https://myaccount.google.com/permissions (look for the app name) and run "/registrar_email confirmar" again.',
    es: 'La autorización funcionó, pero Google no devolvió un refresh_token esta vez — normalmente pasa cuando esta cuenta ya autorizó esta misma app antes sin revocar el acceso. Revoca el acceso en https://myaccount.google.com/permissions (busca el nombre de la app) y ejecuta "/registrar_email confirmar" de nuevo.',
  },
  email_vinculo_concluido: {
    pt: 'Autorização concluída dos dois lados (Gmail + Calendar) e vínculo salvo — sem nenhum passo manual a mais. Os jobs de leitura de e-mail e sincronização de calendário passam a usar esse vínculo a partir do próximo ciclo deles, sem precisar reiniciar nada na mão.',
    en: "Authorization completed on both sides (Gmail + Calendar) and the link saved — no extra manual step needed. The email-reading and calendar-sync jobs start using this link from their next cycle, no need to restart anything by hand.",
    es: 'Autorización completada en los dos lados (Gmail + Calendar) y vínculo guardado — sin ningún paso manual adicional. Los jobs de lectura de correo y sincronización de calendario empiezan a usar este vínculo desde su próximo ciclo, sin necesidad de reiniciar nada manualmente.',
  },
  of_sem_env: {
    pt: 'Ainda não dá pra conectar contas — faltam PLUGGY_CLIENT_ID e PLUGGY_CLIENT_SECRET configurados no servidor (criados uma vez no dashboard da Pluggy, dashboard.pluggy.ai). Isso é feito por quem administra o servidor, não por aqui — depois de configurado, "/registrar_open_finance" passa a funcionar.',
    en: 'Can\'t connect accounts yet — PLUGGY_CLIENT_ID and PLUGGY_CLIENT_SECRET aren\'t configured on the server (created once in the Pluggy dashboard, dashboard.pluggy.ai). This is done by whoever administers the server, not here — once configured, "/registrar_open_finance" will work.',
    es: 'Todavía no se puede conectar cuentas — faltan PLUGGY_CLIENT_ID y PLUGGY_CLIENT_SECRET configurados en el servidor (creados una vez en el dashboard de Pluggy, dashboard.pluggy.ai). Esto lo hace quien administra el servidor, no aquí — una vez configurado, "/registrar_open_finance" empieza a funcionar.',
  },
  of_falta_item_id: {
    pt: 'Faltou o item_id. Primeiro conecte sua conta abrindo scripts/pluggyConnectWidget.html no navegador (gere o connect_token com "node dist/scripts/gerarConnectTokenPluggy.js") — ao terminar, a página mostra um item_id. Depois rode "/registrar_open_finance <item_id>" com esse valor.',
    en: 'Missing the item_id. First connect your account by opening scripts/pluggyConnectWidget.html in your browser (generate the connect_token with "node dist/scripts/gerarConnectTokenPluggy.js") — once done, the page shows an item_id. Then run "/registrar_open_finance <item_id>" with that value.',
    es: 'Falta el item_id. Primero conecta tu cuenta abriendo scripts/pluggyConnectWidget.html en el navegador (genera el connect_token con "node dist/scripts/gerarConnectTokenPluggy.js") — al terminar, la página muestra un item_id. Después ejecuta "/registrar_open_finance <item_id>" con ese valor.',
  },
  of_falha_autenticar: {
    pt: 'Não consegui autenticar com a Pluggy — tente de novo em alguns minutos.',
    en: "I couldn't authenticate with Pluggy — try again in a few minutes.",
    es: 'No pude autenticar con Pluggy — intenta de nuevo en unos minutos.',
  },
  of_item_nao_encontrado: {
    pt: 'Não encontrei esse item_id na Pluggy — confira se copiou certo da página de conexão.',
    en: "I couldn't find that item_id on Pluggy — check if you copied it correctly from the connection page.",
    es: 'No encontré ese item_id en Pluggy — revisa si lo copiaste bien desde la página de conexión.',
  },
  of_sem_contas: {
    pt: 'Esse item não trouxe nenhuma conta — pode ter falhado a conexão, tente de novo.',
    en: "That item didn't bring any account — the connection may have failed, try again.",
    es: 'Ese item no trajo ninguna cuenta — puede haber fallado la conexión, intenta de nuevo.',
  },
  of_contas_encontradas: {
    pt: 'Encontrei {quantidade} conta(s) nesse item:\n\n{lista}\n\nResponda com uma linha por conta, no formato "número = nome da conta ou cartão já cadastrado no AutoFinance". Exemplo:\n1 = Principal\n2 = Nubank',
    en: 'Found {quantidade} account(s) in that item:\n\n{lista}\n\nReply with one line per account, in the format "number = name of the account or card already registered in AutoFinance". Example:\n1 = Principal\n2 = Nubank',
    es: 'Encontré {quantidade} cuenta(s) en ese item:\n\n{lista}\n\nResponde con una línea por cuenta, en el formato "número = nombre de la cuenta o tarjeta ya registrada en AutoFinance". Ejemplo:\n1 = Principal\n2 = Nubank',
  },
  of_linhas_insuficientes: {
    pt: 'Preciso de uma linha por conta ({quantidade} no total), no formato "número = nome". Tente de novo.',
    en: 'I need one line per account ({quantidade} total), in the format "number = name". Try again.',
    es: 'Necesito una línea por cuenta ({quantidade} en total), en el formato "número = nombre". Intenta de nuevo.',
  },
  of_numero_invalido: {
    pt: 'Número inválido: {numero} (só existem {total} contas).',
    en: 'Invalid number: {numero} (there are only {total} accounts).',
    es: 'Número inválido: {numero} (solo existen {total} cuentas).',
  },
  of_nao_encontrado: {
    pt: 'Não encontrei conta nem cartão chamado "{nome}" — confira o nome e tente de novo.',
    en: 'I couldn\'t find an account or card called "{nome}" — check the name and try again.',
    es: 'No encontré cuenta ni tarjeta llamada "{nome}" — revisa el nombre e intenta de nuevo.',
  },
  of_falha_salvar_mapeamento: {
    pt: 'Não consegui salvar o mapeamento, tente de novo.',
    en: "I couldn't save the mapping, try again.",
    es: 'No pude guardar el mapeo, intenta de nuevo.',
  },
  lembrete_reautorizacao_prefixo: {
    pt: '🔔 Lembrete automático: pra evitar que o vínculo com o Google (Gmail + Calendar) expire sem aviso, revincule agora — leva só um minuto.\n\n',
    en: "🔔 Automatic reminder: to prevent the Google link (Gmail + Calendar) from expiring without warning, relink now — it only takes a minute.\n\n",
    es: '🔔 Recordatorio automático: para evitar que el vínculo con Google (Gmail + Calendar) expire sin avisar, revincula ahora — solo toma un minuto.\n\n',
  },
  of_mapeamento_concluido: {
    pt: 'Pronto — {quantidade} conta(s) vinculada(s). A sincronização de transações passa a rodar sozinha a partir de agora.',
    en: 'Done — {quantidade} account(s) linked. Transaction sync will now run on its own from here on.',
    es: 'Listo — {quantidade} cuenta(s) vinculada(s). La sincronización de transacciones empezará a correr sola desde ahora.',
  },
  preco_variavel: {
    pt: 'preço variável (não fixo)',
    en: 'variable price (not fixed)',
    es: 'precio variable (no fijo)',
  },
  alerta_preco_mudou: {
    pt: '💰 Preço mudou — fluxo "{fluxo}" ({modelo}): {precoAntigo} → {precoNovo}',
    en: '💰 Price changed — flow "{fluxo}" ({modelo}): {precoAntigo} → {precoNovo}',
    es: '💰 El precio cambió — flujo "{fluxo}" ({modelo}): {precoAntigo} → {precoNovo}',
  },
  alerta_modelo_mais_barato: {
    pt: '🔎 Modelo mais barato disponível — fluxo "{fluxo}": "{modeloCandidato}" ({precoCandidato}) atende os requisitos e é mais barato que o atual "{modeloAtual}" ({precoAtual})',
    en: '🔎 Cheaper model available — flow "{fluxo}": "{modeloCandidato}" ({precoCandidato}) meets the requirements and is cheaper than the current "{modeloAtual}" ({precoAtual})',
    es: '🔎 Modelo más barato disponible — flujo "{fluxo}": "{modeloCandidato}" ({precoCandidato}) cumple los requisitos y es más barato que el actual "{modeloAtual}" ({precoAtual})',
  },
  alerta_preco_envelope: {
    pt: 'Alerta de preço de modelos (OpenRouter):\n\n{linhas}\n\nNenhuma troca foi feita automaticamente — ajuste roteamento_tarefas manualmente se quiser.',
    en: 'Model price alert (OpenRouter):\n\n{linhas}\n\nNo switch was made automatically — adjust roteamento_tarefas manually if you want.',
    es: 'Alerta de precio de modelos (OpenRouter):\n\n{linhas}\n\nNo se hizo ningún cambio automáticamente — ajusta roteamento_tarefas manualmente si quieres.',
  },
  despesas_fixas_alerta_titulo: {
    pt: '⚠️ <b>Despesas fixas que não apareceram em {inicio}–{fim}</b>',
    en: "⚠️ <b>Fixed expenses that didn't show up in {inicio}–{fim}</b>",
    es: '⚠️ <b>Gastos fijos que no aparecieron en {inicio}–{fim}</b>',
  },
  despesas_fixas_linha: {
    pt: '- {descricao} (esperado: R$ {valor}, todo dia {dia})',
    en: '- {descricao} (expected: R$ {valor}, every day {dia})',
    es: '- {descricao} (esperado: R$ {valor}, cada día {dia})',
  },
};

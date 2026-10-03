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
};

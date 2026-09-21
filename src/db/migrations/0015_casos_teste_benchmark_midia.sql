-- Fase 6 (parte 14): casos de teste de fluxo de mídia (leitura_comprovante,
-- interpretar_planilha, transcricao_voz) precisam guardar o arquivo de
-- entrada, não só texto. Colunas nullable: NULL/NULL continua significando
-- "caso de texto" (comportamento atual, nenhuma linha existente muda). Quando
-- preenchidas, `entrada` (coluna original) vira só um rótulo legível do caso
-- — o arquivo de verdade vem daqui, em base64 (fixtures pequenas, geradas em
-- código no seed, nunca um arquivo grande de verdade).
ALTER TABLE casos_teste_benchmark ADD COLUMN entrada_arquivo_base64 TEXT;
ALTER TABLE casos_teste_benchmark ADD COLUMN entrada_mime_type TEXT;

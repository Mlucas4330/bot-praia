// Função de fundo (até 15 min): gera a curiosidade e envia a mensagem no grupo.
// Só aceita chamadas com o segredo certo, para ninguém disparar mensagens pela URL pública.

import { executarEnvioDiario, enviarEmail, log } from '../../lib/robo.js'

export default async (req) => {
  const segredo = process.env.SEGREDO_ENVIO
  if (!segredo) {
    log('ERRO: variável SEGREDO_ENVIO não configurada no Netlify.')
    await enviarEmail('Configuração incompleta', 'Configure a variável SEGREDO_ENVIO no painel do Netlify e faça um novo deploy.')
    return
  }
  if (req.headers.get('x-segredo') !== segredo) {
    log('Chamada recusada: segredo inválido.')
    return
  }
  await executarEnvioDiario()
}

export const config = {
  background: true,
}

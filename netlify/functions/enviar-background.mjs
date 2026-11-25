// Função de fundo (até 15 min): gera a curiosidade e envia a mensagem no grupo.
// Só aceita chamadas com o segredo certo, para ninguém disparar mensagens pela URL pública.
// Corpo opcional {"testeNumero": "51999999999"}: envia a mensagem para esse contato em vez do grupo (teste).

import { executarEnvioDiario, executarEnvioTeste, enviarEmail, log } from '../../lib/robo.js'

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

  const corpo = await req.json().catch(() => ({}))
  if (corpo.testeNumero) await executarEnvioTeste(corpo.testeNumero)
  else await executarEnvioDiario()
}

export const config = {
  background: true,
}

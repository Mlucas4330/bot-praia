// Função agendada: todo dia às 10:00 de Brasília (13:00 UTC; o cron do Netlify é sempre UTC).
// Funções agendadas só podem rodar 30s, então ela apenas dispara a função de fundo (até 15 min).
// Também dá para rodar manualmente: painel do Netlify > Functions > disparar-envio > "Run now".

export default async (req, context) => {
  const base = process.env.URL || context.site?.url
  const resp = await fetch(`${base}/.netlify/functions/enviar-background`, {
    method: 'POST',
    headers: { 'x-segredo': process.env.SEGREDO_ENVIO || '' },
  })
  console.log(`Envio disparado (status ${resp.status}).`)
  return new Response('ok')
}

export const config = {
  schedule: '0 13 * * *',
}

// Comandos para rodar no seu PC (usam o mesmo armazenamento do Netlify):
//   npm run conectar      -> mostra o QR code e salva a sessão do WhatsApp no Netlify
//   npm run grupos        -> lista seus grupos com nome e ID
//   npm run teste         -> mostra uma prévia da mensagem (não envia, não salva)
//   npm run enviar        -> envia a mensagem de hoje agora (se ainda não foi enviada)
//   npm run testar-aviso  -> manda um e-mail de teste

import { conectar, listarGrupos, gerarPrevia, executarEnvioDiario, enviarEmail } from './lib/robo.js'

const comandos = {
  async conectar() {
    const { encerrar } = await conectar({ permitirQR: true })
    console.log('\nWhatsApp conectado. A sessão foi salva no Netlify Blobs.')
    await new Promise((r) => setTimeout(r, 5000))
    await encerrar()
  },
  async grupos() {
    console.log('\nSeus grupos (nome  ->  ID):')
    for (const g of await listarGrupos()) console.log(`  ${g.nome}  ->  ${g.id}`)
  },
  async teste() {
    console.log('\n----- PRÉVIA (não enviada) -----\n' + (await gerarPrevia()) + '\n--------------------------------')
  },
  async enviar() {
    const r = await executarEnvioDiario({ forcar: process.argv.includes('--forcar') })
    if (!r.ok) process.exitCode = 1
  },
  async 'testar-aviso'() {
    await enviarEmail('Teste de aviso', 'Se você recebeu isto, os avisos de falha estão funcionando.')
  },
}

const nome = process.argv[2]
if (!comandos[nome]) {
  console.log('Comandos: ' + Object.keys(comandos).join(', '))
  process.exit(1)
}
if (!process.env.NETLIFY_SITE_ID || !process.env.NETLIFY_AUTH_TOKEN) {
  console.log('Configure NETLIFY_SITE_ID e NETLIFY_AUTH_TOKEN no .env (veja o LEIAME.md).')
  process.exit(1)
}

// Encerra sem process.exit imediato (que quebra o Node 25 no Windows); força a saída após 3s se preciso.
comandos[nome]()
  .catch((e) => {
    console.error('ERRO: ' + e.message)
    process.exitCode = 1
  })
  .finally(() => setTimeout(() => process.exit(), 3000).unref())

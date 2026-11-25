// Comandos para rodar no seu PC (usam o mesmo armazenamento do Netlify):
//   npm run conectar                   -> abre o QR code no navegador e salva a sessão do WhatsApp no Netlify
//   npm run conectar -- 5511999999999  -> conecta por código de 8 letras (sem QR), com o seu número
//   npm run grupos                     -> lista seus grupos com nome e ID
//   npm run teste                      -> mostra uma prévia da mensagem (não envia, não salva)
//   npm run enviar                     -> envia a mensagem de hoje agora (se ainda não foi enviada)
//   npm run testar-aviso               -> manda um e-mail de teste

import fs from 'node:fs'
import path from 'node:path'
import { exec } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import QRCode from 'qrcode'
import { conectar, listarGrupos, gerarPrevia, executarEnvioDiario, enviarEmail } from './lib/robo.js'

// Página local com o QR, que se atualiza sozinha (o WhatsApp troca o QR a cada ~20s).
const PAGINA_QR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'qr.html')
let paginaAberta = false

async function mostrarQR(qr) {
  const imagem = await QRCode.toDataURL(qr, { width: 360, margin: 2 })
  fs.writeFileSync(
    PAGINA_QR,
    `<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="3"><title>QR WhatsApp</title>
<body style="font-family:sans-serif;text-align:center;background:#fff;color:#111;padding-top:30px">
<h2>Escaneie com o WhatsApp</h2><p>Celular: WhatsApp &gt; Aparelhos conectados &gt; Conectar aparelho</p>
<img src="${imagem}" alt="QR code"><p style="color:#666">Esta página se atualiza sozinha.</p></body>`,
  )
  if (!paginaAberta) {
    paginaAberta = true
    exec(`start "" "${PAGINA_QR}"`)
    console.log('\nQR code aberto no navegador (' + PAGINA_QR + ').')
    console.log('Se não abrir, abra esse arquivo manualmente. Aguardando você escanear...\n')
  }
}

function fecharPaginaQR() {
  if (paginaAberta) {
    fs.writeFileSync(PAGINA_QR, '<!doctype html><meta charset="utf-8"><body style="font-family:sans-serif;text-align:center;padding-top:60px"><h2>✅ WhatsApp conectado! Pode fechar esta página.</h2></body>')
  }
}

const numero = process.argv.slice(3).find((a) => /^\+?\d{10,15}$/.test(a))
const opcoesConexao = { aoReceberQR: mostrarQR, numero }

const comandos = {
  async conectar() {
    const { encerrar } = await conectar({ permitirQR: true, ...opcoesConexao })
    fecharPaginaQR()
    console.log('\nWhatsApp conectado. Salvando a sessão no Netlify Blobs...')
    await new Promise((r) => setTimeout(r, 8000)) // deixa o WhatsApp terminar a sincronização inicial
    await encerrar()
    console.log('Sessão salva. Pronto!')
  },
  async grupos() {
    const grupos = await listarGrupos(opcoesConexao)
    fecharPaginaQR()
    console.log('\nSeus grupos (nome  ->  ID):')
    for (const g of grupos) console.log(`  ${g.nome}  ->  ${g.id}`)
  },
  async teste() {
    console.log('\n----- PRÉVIA (não enviada) -----\n' + (await gerarPrevia()) + '\n--------------------------------')
  },
  async enviar() {
    const r = await executarEnvioDiario({ forcar: process.argv.includes('--forcar') })
    if (!r.ok) process.exitCode = 1
  },
  // Dispara a função do Netlify em modo teste: manda a mensagem para um contato, não para o grupo.
  async 'testar-producao'() {
    const alvo = process.argv.slice(3).find((a) => /\d{10,}/.test(a))
    if (!alvo || !process.env.URL_SITE) throw new Error('Uso: npm run testar-producao -- 51999999999 (e URL_SITE no .env)')
    const { lerTexto } = await import('./lib/armazenamento.js')
    const antes = await lerTexto('teste-resultado.json')
    const r = await fetch(`${process.env.URL_SITE}/.netlify/functions/enviar-background`, {
      method: 'POST',
      headers: { 'x-segredo': process.env.SEGREDO_ENVIO, 'content-type': 'application/json' },
      body: JSON.stringify({ testeNumero: alvo }),
    })
    console.log(`Função disparada (status ${r.status}). Aguardando o resultado...`)
    for (let i = 0; i < 60; i++) {
      await new Promise((res) => setTimeout(res, 5000))
      const agora = await lerTexto('teste-resultado.json')
      if (agora && agora !== antes) {
        const res = JSON.parse(agora)
        console.log(res.ok ? `\n✅ Enviado para ${res.numero}:\n\n${res.mensagem}` : `\n❌ Falhou: ${res.erro}`)
        if (!res.ok) process.exitCode = 1
        return
      }
    }
    throw new Error('Sem resultado após 5 minutos. Veja os logs da função enviar-background no Netlify.')
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

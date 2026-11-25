// Lógica do envio diário: gera a curiosidade, monta a mensagem e envia no grupo.
// Usado tanto pela função do Netlify quanto pelo cli.js no seu PC.

import {
  makeWASocket,
  fetchLatestBaileysVersion,
  DisconnectReason,
  Browsers,
} from '@whiskeysockets/baileys'
import { GoogleGenAI } from '@google/genai'
import nodemailer from 'nodemailer'
import pino from 'pino'
import qrcode from 'qrcode-terminal'
import config from '../config.js'
import { lerTexto, salvarTexto } from './armazenamento.js'
import { useBlobAuthState, sessaoExiste, apagarSessao } from './sessao-blobs.js'

// Erro que não adianta tentar de novo (sessão expirada, grupo inexistente...).
export class ErroFatal extends Error {}

export const log = (msg) => console.log(`[${new Date().toISOString()}] ${msg}`)
const esperar = (ms) => new Promise((r) => setTimeout(r, ms))

function comTempoLimite(promessa, ms, descricao) {
  let timer
  const limite = new Promise((_, rej) => {
    timer = setTimeout(() => rej(new Error(`Tempo esgotado: ${descricao} (${ms / 1000}s)`)), ms)
  })
  return Promise.race([promessa, limite]).finally(() => clearTimeout(timer))
}

// Data no fuso de Brasília (o Netlify roda em UTC).
function hojeBrasil() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date()) // AAAA-MM-DD
}

// ---------- Aviso por e-mail ----------

export async function enviarEmail(assunto, corpo) {
  const { EMAIL_USUARIO, EMAIL_SENHA_APP, EMAIL_DESTINO } = process.env
  if (!EMAIL_USUARIO || !EMAIL_SENHA_APP) {
    log('Aviso por e-mail não enviado: EMAIL_USUARIO / EMAIL_SENHA_APP não configurados.')
    return
  }
  try {
    const transporte = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: EMAIL_USUARIO, pass: EMAIL_SENHA_APP.replace(/\s+/g, '') },
    })
    await transporte.sendMail({
      from: `"WhatsApp diário" <${EMAIL_USUARIO}>`,
      to: EMAIL_DESTINO || EMAIL_USUARIO,
      subject: `[WhatsApp diário] ${assunto}`,
      text: corpo,
    })
    log(`E-mail de aviso enviado: ${assunto}`)
  } catch (e) {
    log('Falha ao enviar e-mail de aviso: ' + e.message)
  }
}

// ---------- Histórico (historico.txt no Netlify Blobs) ----------
// Formato (um bloco por dia):
//   === 2026-11-19 ===
//   curiosidade gerada pela LLM

async function lerHistorico() {
  const conteudo = (await lerTexto('historico.txt')) || ''
  const partes = conteudo.split(/^=== (\d{4}-\d{2}-\d{2}) ===\r?$/m)
  const entradas = []
  for (let i = 1; i < partes.length; i += 2) {
    const texto = partes[i + 1].trim()
    if (texto) entradas.push({ data: partes[i], texto })
  }
  return entradas
}

async function salvarNoHistorico(texto) {
  const atual = (await lerTexto('historico.txt')) || ''
  await salvarTexto('historico.txt', atual + `=== ${hojeBrasil()} ===\n${texto.trim()}\n\n`)
}

const normalizar = (s) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim()

// ---------- LLM ----------

async function gerarCuriosidade(historico) {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
  const anteriores = historico.slice(-config.historicoNoPrompt).map((e) => `- ${e.texto.replace(/\s+/g, ' ')}`)
  const jaUsados = new Set(historico.map((e) => normalizar(e.texto)))

  let prompt = config.prompt
  if (anteriores.length) {
    prompt +=
      '\n\nIMPORTANTE: não repita nem parafraseie nenhuma destas curiosidades já usadas anteriormente:\n' +
      anteriores.join('\n')
  }

  let ultimoErro
  for (let tentativa = 1; tentativa <= config.tentativas; tentativa++) {
    try {
      const resposta = await comTempoLimite(
        ai.models.generateContent({ model: config.modelo, contents: prompt, config: { temperature: 1.0 } }),
        90_000,
        'resposta do Gemini',
      )
      const texto = (resposta.text || '').trim()
      if (!texto) log(`Gemini, tentativa ${tentativa}: resposta vazia.`)
      else if (jaUsados.has(normalizar(texto))) log(`Gemini, tentativa ${tentativa}: texto repetido.`)
      else return texto
    } catch (e) {
      ultimoErro = e
      log(`Gemini, tentativa ${tentativa}: erro - ${e.message}`)
      if (tentativa < config.tentativas) await esperar(15_000 * tentativa)
    }
  }
  throw new Error(
    `Não consegui gerar uma curiosidade inédita com o Gemini em ${config.tentativas} tentativas.` +
      (ultimoErro ? ` Último erro: ${ultimoErro.message}` : ''),
  )
}

// ---------- Montagem da mensagem ----------

function contagemRegressiva() {
  const [a, m, d] = config.dataViagem.split('-').map(Number)
  const [ha, hm, hd] = hojeBrasil().split('-').map(Number)
  const dias = Math.round((Date.UTC(a, m - 1, d) - Date.UTC(ha, hm - 1, hd)) / 86_400_000)
  if (dias > 1) return `Faltam apenas ${dias} dias para a nossa tão sonhada viagem!`
  if (dias === 1) return 'Falta apenas 1 dia para a nossa tão sonhada viagem!'
  if (dias === 0) return 'É HOJE o dia da nossa tão sonhada viagem! 🎉'
  return `Já se passaram ${-dias} dias desde a nossa viagem. 🥲`
}

// {{sorteado}} só é preenchido na hora do envio, quando já temos os integrantes do grupo.
function montarMensagem(curiosidade) {
  const [a, m, d] = hojeBrasil().split('-')
  return config.mensagem
    .replaceAll('{{llm}}', curiosidade)
    .replaceAll('{{contagem}}', contagemRegressiva())
    .replaceAll('{{data}}', `${d}/${m}/${a}`)
}

// ---------- Sorteio do integrante (último sorteado em estado.json) ----------

const usuarioDoJid = (jid) => (jid || '').split('@')[0].split(':')[0]

async function sortearIntegrante(sock, participantes) {
  const meus = [sock.user?.id, sock.user?.lid].map(usuarioDoJid).filter(Boolean)
  let candidatos = participantes.filter((p) => !meus.includes(usuarioDoJid(p.id)))

  let ultimo
  try {
    ultimo = JSON.parse((await lerTexto('estado.json')) || '{}').ultimoSorteado
  } catch {}
  if (candidatos.length > 1) candidatos = candidatos.filter((p) => p.id !== ultimo)
  if (!candidatos.length) throw new ErroFatal('Não há outros integrantes no grupo para sortear.')

  return candidatos[Math.floor(Math.random() * candidatos.length)].id
}

// ---------- WhatsApp ----------

export const MSG_SESSAO =
  'A sessão do WhatsApp expirou ou não existe. No seu PC, rode:\n' +
  '  npm run conectar\n' +
  'e escaneie o QR code em WhatsApp > Aparelhos conectados. Depois, rode "npm run enviar" para mandar a mensagem de hoje.'

// permitirQR = false (Netlify): se o WhatsApp pedir QR, falha na hora em vez de ficar esperando.
// aoReceberQR(qr): mostra o QR (no PC). numero: se informado, conecta por código de pareamento em vez de QR.
// Retorna { sock, encerrar }.
export async function conectar({ permitirQR, aoReceberQR, numero }) {
  if (!permitirQR && !(await sessaoExiste())) throw new ErroFatal(MSG_SESSAO)

  const auth = await useBlobAuthState()
  const { version } = await fetchLatestBaileysVersion()
  let sockAtual

  const conexao = new Promise((resolve, reject) => {
    let reconexoes = 0
    let codigoPedido = false
    const iniciar = () => {
      const sock = makeWASocket({
        version,
        auth: auth.state,
        logger: pino({ level: 'silent' }),
        browser: Browsers.macOS('Desktop'),
        markOnlineOnConnect: false,
        syncFullHistory: false,
      })
      sockAtual = sock
      sock.ev.on('creds.update', auth.saveCreds)
      sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
        if (qr) {
          if (!permitirQR) {
            sock.end()
            return reject(new ErroFatal(MSG_SESSAO))
          }
          if (numero) {
            if (!codigoPedido) {
              codigoPedido = true
              try {
                const codigo = await sock.requestPairingCode(numero.replace(/\D/g, ''))
                console.log(`\nCÓDIGO DE PAREAMENTO:  ${codigo.slice(0, 4)}-${codigo.slice(4)}\n`)
                console.log('No celular: WhatsApp > Aparelhos conectados > Conectar aparelho >')
                console.log('"Conectar com número de telefone" e digite o código acima.\n')
              } catch (e) {
                reject(new Error('Não consegui pedir o código de pareamento: ' + e.message))
              }
            }
          } else if (aoReceberQR) {
            aoReceberQR(qr)
          } else {
            console.log('\nEscaneie o QR code no celular: WhatsApp > Aparelhos conectados > Conectar aparelho\n')
            qrcode.generate(qr, { small: true })
          }
        }
        if (connection === 'open') resolve(sock)
        if (connection === 'close') {
          const codigo = lastDisconnect?.error?.output?.statusCode
          if (codigo === DisconnectReason.loggedOut) {
            await apagarSessao() // sessão inválida; força novo QR
            reject(new ErroFatal('O WhatsApp desconectou este aparelho.\n' + MSG_SESSAO))
          } else if (++reconexoes > 5) {
            reject(new Error(`Conexão com o WhatsApp caiu repetidamente (código ${codigo}).`))
          } else {
            iniciar() // ex.: reinício obrigatório logo após escanear o QR
          }
        }
      })
    }
    iniciar()
  })

  const encerrar = async () => {
    try {
      sockAtual?.end()
    } catch {}
    await auth.finalizar()
  }

  try {
    // Automático: 90s para conectar. Com QR/código: 5 minutos para você concluir no celular.
    const sock = await comTempoLimite(conexao, permitirQR ? 300_000 : 90_000, 'conexão com o WhatsApp')
    return { sock, encerrar }
  } catch (e) {
    await encerrar()
    throw e
  }
}

// Retorna os metadados do grupo (id, nome, participantes).
async function encontrarGrupo(sock, grupo) {
  if (grupo.endsWith('@g.us')) {
    try {
      return await sock.groupMetadata(grupo)
    } catch {
      throw new ErroFatal(`Grupo com ID "${grupo}" não encontrado ou você não participa dele.`)
    }
  }
  const grupos = Object.values(await sock.groupFetchAllParticipating())
  const achados = grupos.filter((g) => g.subject.trim().toLowerCase() === grupo.trim().toLowerCase())
  if (achados.length === 0) {
    throw new ErroFatal(`Grupo "${grupo}" não encontrado (foi renomeado?). Rode "npm run grupos" para ver nomes e IDs.`)
  }
  if (achados.length > 1) {
    throw new ErroFatal(`Existem ${achados.length} grupos chamados "${grupo}". Use o ID no config.js (veja com "npm run grupos").`)
  }
  return achados[0]
}

async function tentarEnviar(mensagem) {
  const { sock, encerrar } = await conectar({ permitirQR: false })
  try {
    const grupo = await encontrarGrupo(sock, config.grupo)

    const mentions = []
    let sorteado
    if (mensagem.includes('{{sorteado}}')) {
      sorteado = await sortearIntegrante(sock, grupo.participants)
      mensagem = mensagem.replaceAll('{{sorteado}}', '@' + usuarioDoJid(sorteado))
      mentions.push(sorteado) // vira menção clicável com o nome da pessoa
    }

    await comTempoLimite(sock.sendMessage(grupo.id, { text: mensagem, mentions }), 60_000, 'envio da mensagem')
    if (sorteado) await salvarTexto('estado.json', JSON.stringify({ ultimoSorteado: sorteado }))
    await esperar(5000) // dá tempo de a mensagem sair antes de desconectar
    return mensagem
  } finally {
    await encerrar()
  }
}

// Envio de teste para um contato (em vez do grupo). Não grava histórico nem sorteio,
// então não conta como a mensagem do dia. O resultado fica em teste-resultado.json no Blobs.
export async function executarEnvioTeste(numero) {
  let resultado
  try {
    let digitos = String(numero).replace(/\D/g, '')
    if (digitos.length <= 11) digitos = '55' + digitos // DDD + número brasileiro

    const curiosidade = await gerarCuriosidade(await lerHistorico())
    let mensagem = montarMensagem(curiosidade)

    const { sock, encerrar } = await conectar({ permitirQR: false })
    try {
      // O WhatsApp pode registrar números brasileiros com ou sem o 9; ele mesmo diz qual é o certo.
      const [contato] = await sock.onWhatsApp(digitos)
      if (!contato?.exists) throw new ErroFatal(`O número ${digitos} não tem WhatsApp.`)
      mensagem = mensagem.replaceAll('{{sorteado}}', '@' + usuarioDoJid(contato.jid))
      await comTempoLimite(
        sock.sendMessage(contato.jid, { text: '🧪 *TESTE*\n\n' + mensagem, mentions: [contato.jid] }),
        60_000,
        'envio da mensagem',
      )
      await esperar(5000)
    } finally {
      await encerrar()
    }
    log(`Mensagem de teste enviada para ${digitos}.`)
    resultado = { ok: true, numero: digitos, mensagem }
  } catch (e) {
    log('ERRO no teste: ' + e.message)
    resultado = { ok: false, erro: e.message }
  }
  await salvarTexto('teste-resultado.json', JSON.stringify({ ...resultado, quando: new Date().toISOString() }))
  return resultado
}

export async function listarGrupos(opcoes = {}) {
  const { sock, encerrar } = await conectar({ permitirQR: true, ...opcoes })
  try {
    const grupos = Object.values(await sock.groupFetchAllParticipating())
    return grupos.sort((a, b) => a.subject.localeCompare(b.subject)).map((g) => ({ nome: g.subject, id: g.id }))
  } finally {
    await esperar(3000)
    await encerrar()
  }
}

// ---------- Fluxo principal ----------

export async function gerarPrevia() {
  const curiosidade = await gerarCuriosidade(await lerHistorico())
  return montarMensagem(curiosidade).replaceAll('{{sorteado}}', '@(sorteado)')
}

// Nunca lança erro: em qualquer falha, avisa por e-mail e retorna { ok: false }.
// (Assim o Netlify não re-executa a função e você não recebe avisos duplicados.)
export async function executarEnvioDiario({ forcar = false, prazoMs = 13 * 60_000 } = {}) {
  const prazo = Date.now() + prazoMs
  try {
    if (!process.env.GEMINI_API_KEY) throw new ErroFatal('GEMINI_API_KEY não configurada.')
    if (!(await sessaoExiste())) throw new ErroFatal(MSG_SESSAO) // antes de gastar o Gemini

    const historico = await lerHistorico()
    if (!forcar && historico.at(-1)?.data === hojeBrasil()) {
      log('Mensagem de hoje já foi enviada. Nada a fazer.')
      return { ok: true, jaEnviada: true }
    }

    const curiosidade = await gerarCuriosidade(historico)
    const mensagem = montarMensagem(curiosidade)

    // A mesma curiosidade é reaproveitada em todas as tentativas.
    for (let tentativa = 1; ; tentativa++) {
      try {
        const enviada = await tentarEnviar(mensagem)
        await salvarNoHistorico(curiosidade)
        log(`Mensagem enviada para "${config.grupo}" (tentativa ${tentativa}).`)
        if (config.avisarSucesso) await enviarEmail('Mensagem enviada', enviada)
        return { ok: true, mensagem: enviada }
      } catch (e) {
        const espera = config.intervaloMinutos * 60_000
        const semTempo = Date.now() + espera + 3 * 60_000 > prazo
        if (e instanceof ErroFatal || tentativa >= config.tentativasEnvio || semTempo) throw e
        log(`Envio, tentativa ${tentativa} falhou: ${e.message}. Nova tentativa em ${config.intervaloMinutos} min.`)
        await esperar(espera)
      }
    }
  } catch (err) {
    log('ERRO: ' + err.message)
    await enviarEmail(
      'Falha ao enviar a mensagem de hoje',
      `${err.message}\n\nGrupo: ${config.grupo}\nData: ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}\n\n` +
        'A mensagem de hoje NÃO foi enviada. Depois de resolver, rode "npm run enviar" no seu PC ' +
        'ou clique em "Run now" na função "disparar-envio" no painel do Netlify.',
    )
    return { ok: false, erro: err.message }
  }
}

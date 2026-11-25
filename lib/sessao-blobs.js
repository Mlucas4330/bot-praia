// Sessão do Baileys guardada num único blob (sessao.json) em vez de uma pasta local.
// Mesma lógica do useMultiFileAuthState do Baileys, mas tudo em memória e gravado de uma vez.

import { BufferJSON, initAuthCreds, proto } from '@whiskeysockets/baileys'
import { lerTexto, salvarTexto, apagar } from './armazenamento.js'

const CHAVE = 'sessao.json'

export async function sessaoExiste() {
  return (await lerTexto(CHAVE)) !== null
}

export async function apagarSessao() {
  await apagar(CHAVE)
}

export async function useBlobAuthState() {
  const salvo = await lerTexto(CHAVE)
  const dados = salvo ? JSON.parse(salvo, BufferJSON.reviver) : { creds: initAuthCreds(), keys: {} }

  // Grava no blob agrupando várias alterações seguidas (o Baileys altera chaves muitas vezes ao conectar).
  let pendente = null
  let timer = null
  const gravar = () => {
    clearTimeout(timer)
    timer = null
    pendente = salvarTexto(CHAVE, JSON.stringify(dados, BufferJSON.replacer))
    return pendente
  }
  const agendarGravacao = () => {
    if (!timer) timer = setTimeout(gravar, 1000)
  }

  return {
    state: {
      creds: dados.creds,
      keys: {
        get: async (tipo, ids) => {
          const resultado = {}
          for (const id of ids) {
            let valor = dados.keys[tipo]?.[id]
            if (tipo === 'app-state-sync-key' && valor) valor = proto.Message.AppStateSyncKeyData.fromObject(valor)
            resultado[id] = valor
          }
          return resultado
        },
        set: async (novos) => {
          for (const tipo in novos) {
            dados.keys[tipo] ??= {}
            for (const id in novos[tipo]) {
              if (novos[tipo][id]) dados.keys[tipo][id] = novos[tipo][id]
              else delete dados.keys[tipo][id]
            }
          }
          agendarGravacao()
        },
      },
    },
    saveCreds: async () => agendarGravacao(),
    // Chamar antes de encerrar, para garantir que tudo foi gravado.
    finalizar: async () => {
      if (timer) await gravar()
      else if (pendente) await pendente
    },
  }
}

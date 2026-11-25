// Armazenamento persistente no Netlify Blobs (o Netlify não tem disco persistente).
//
// Chaves guardadas no store "whatsapp-diario":
//   historico.txt -> curiosidades já enviadas (para não repetir)
//   estado.json   -> último integrante sorteado
//   sessao.json   -> sessão do WhatsApp (credenciais do aparelho conectado)
//
// Dentro do Netlify o acesso é automático. Rodando no seu PC (cli.js), precisa de
// NETLIFY_SITE_ID e NETLIFY_AUTH_TOKEN no .env.

import { getStore } from '@netlify/blobs'

let store

export function armazenamento() {
  if (!store) {
    const { NETLIFY_SITE_ID: siteID, NETLIFY_AUTH_TOKEN: token } = process.env
    const opcoes = { name: 'whatsapp-diario', consistency: 'strong' }
    store = siteID && token ? getStore({ ...opcoes, siteID, token }) : getStore(opcoes)
  }
  return store
}

export async function lerTexto(chave) {
  return (await armazenamento().get(chave, { type: 'text' })) ?? null
}

export async function salvarTexto(chave, texto) {
  await armazenamento().set(chave, texto)
}

export async function apagar(chave) {
  await armazenamento().delete(chave)
}

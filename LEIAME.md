# WhatsApp diário

Todo dia às 10:00 (Brasília) uma função agendada do Netlify envia no grupo:
saudação + contagem para a viagem + curiosidade política gerada pelo Gemini + um integrante sorteado.

- `config.js`: grupo, data da viagem, texto da mensagem, prompt e retentativas.
- O histórico de curiosidades (`historico.txt`), o último sorteado (`estado.json`) e a sessão
  do WhatsApp (`sessao.json`) ficam no **Netlify Blobs**: Painel > Blobs > store `whatsapp-diario`.
- Em qualquer falha você recebe um e-mail.

## 1. Deploy no Netlify

Suba esta pasta para um repositório no GitHub e importe no Netlify (Add new project > Import an existing project).
Não precisa de comando de build. O `.env` não vai para o repositório.

## 2. Variáveis de ambiente no Netlify

Em Project configuration > Environment variables, crie (com os mesmos valores do seu `.env`):

| Variável | O que é |
|---|---|
| `GEMINI_API_KEY` | chave do Google AI Studio |
| `EMAIL_USUARIO` | Gmail que envia os avisos |
| `EMAIL_SENHA_APP` | senha de app do Gmail (myaccount.google.com/apppasswords) |
| `EMAIL_DESTINO` | quem recebe os avisos |
| `SEGREDO_ENVIO` | o valor gerado no seu `.env` |

Depois, faça um novo deploy (Deploys > Trigger deploy) para as variáveis valerem.

## 3. Conectar o WhatsApp (uma vez, no seu PC)

No `.env` local, preencha:
- `NETLIFY_SITE_ID`: Project configuration > General > Project ID
- `NETLIFY_AUTH_TOKEN`: User settings > Applications > Personal access tokens > New access token

Então:

```
npm install
npm run conectar       # escaneie o QR code; a sessão é salva direto no Netlify
npm run grupos         # confira o nome (ou copie o ID) do grupo para o config.js
npm run teste          # prévia da mensagem, não envia nada
npm run testar-aviso   # confere se o e-mail de aviso chega
```

## 4. Testar em produção

Painel > Logs > Functions > `disparar-envio` > **Run now**. **Isso envia a mensagem de verdade** no grupo.
Os logs aparecem em `enviar-background`.

## Quando chegar e-mail de falha

- **Sessão expirada:** `npm run conectar` e depois `npm run enviar`.
- **Grupo não encontrado:** ajuste `grupo` no `config.js` e faça um novo deploy.
- **Outros erros:** veja os logs da função `enviar-background` e rode `npm run enviar` (ou "Run now").

Não rode comandos locais perto das 10:00: duas conexões simultâneas com a mesma sessão podem derrubá-la.

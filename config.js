// Configuração da mensagem diária. Depois de alterar, faça um novo deploy no Netlify.
export default {
  // Nome exato do grupo OU o ID dele (ex.: "120363...@g.us"; veja com: npm run grupos)
  grupo: 'Praia 2027',
  dataViagem: '2027-01-02',

  // {{contagem}} = frase dos dias que faltam | {{llm}} = curiosidade do Gemini
  // {{sorteado}} = @menção de um integrante aleatório | {{data}} = data de hoje
  // A mensagem final é toda convertida para minúsculas.
  mensagem: 'bom diaaa, galera ☀️\n\n{{contagem}}\n\n📚 curiosidade do dia:\n{{llm}}\n\n{{sorteado}}, vai tomar no cu 🖕',

  prompt:
    'Conte uma curiosidade específica e pouco conhecida sobre a política brasileira, algo que a maioria das pessoas ' +
    'nunca ouviu falar, com um detalhe concreto (nome, ano, lugar ou número). ' +
    'Evite as curiosidades batidas e famosas, como o rinoceronte Cacareco, o Macaco Tião ou o Tiririca. ' +
    'Pode ser de qualquer época: Império, República Velha, Era Vargas, ditadura, redemocratização, Congresso, ' +
    'eleições, leis bizarras, bastidores de Brasília, políticos excêntricos. ' +
    'Escreva como se estivesse mandando no grupo de WhatsApp dos amigos: tudo em letras minúsculas, tom despojado ' +
    'e bem-humorado, pode usar "pra", "tá", "né" e gírias leves. ' +
    'No máximo 3 frases curtas, sem tomar partido e só com fatos dos quais você tem certeza. ' +
    'Responda apenas com a curiosidade, sem título, sem aspas e sem emojis.',

  // Modelos tentados em ordem: se um falhar ou demorar, passa para o próximo (todos têm camada gratuita).
  modelos: ['gemini-3.5-flash', 'gemini-3.5-flash-lite', 'gemini-2.5-flash', 'gemini-2.5-flash-lite'],
  tempoLimiteSegundos: 40, // espera máxima por resposta de cada modelo
  historicoNoPrompt: 100, // quantas curiosidades anteriores vão no prompt para evitar repetição
  tentativas: 2, // tentativas por modelo quando o texto vem vazio ou repetido

  tentativasEnvio: 3, // tentativas de enviar no WhatsApp
  intervaloMinutos: 3, // espera entre tentativas de envio
  avisarSucesso: false, // true = também manda e-mail quando der certo
}

// Configuração da mensagem diária. Depois de alterar, faça um novo deploy no Netlify.
export default {
  // Nome exato do grupo OU o ID dele (ex.: "120363...@g.us"; veja com: npm run grupos)
  grupo: 'Praia 2027',
  dataViagem: '2027-01-02',

  // {{contagem}} = frase dos dias que faltam | {{llm}} = curiosidade do Gemini
  // {{sorteado}} = @menção de um integrante aleatório | {{data}} = data de hoje
  mensagem:
    'Bom dia, pessoal! ☀️\n{{contagem}}\n\n📚 *Curiosidade do dia:*\n{{llm}}\n\n{{sorteado}}, vai tomar no cu! 🖕',

  prompt:
    'Conte uma curiosidade real e verificável sobre o Brasil envolvendo a política brasileira ' +
    '(história política, presidentes, Congresso, eleições, Constituição, leis curiosas etc.). ' +
    'Use 2 ou 3 frases, em português, com tom leve e divertido, sem tomar partido. ' +
    'Só inclua fatos dos quais você tem certeza. Responda apenas com a curiosidade, sem título e sem comentários.',

  modelo: 'gemini-3.5-flash',
  historicoNoPrompt: 100, // quantas curiosidades anteriores vão no prompt para evitar repetição
  tentativas: 3, // tentativas de gerar com o Gemini

  tentativasEnvio: 3, // tentativas de enviar no WhatsApp
  intervaloMinutos: 3, // espera entre tentativas de envio
  avisarSucesso: false, // true = também manda e-mail quando der certo
}

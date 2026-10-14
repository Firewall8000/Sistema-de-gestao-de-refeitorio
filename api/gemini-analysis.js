export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Chave GEMINI_API_KEY não configurada no servidor.' });
  }

  try {
    const { summaryData, customQuestion } = req.body;

    if (customQuestion !== undefined && customQuestion !== null && typeof customQuestion !== 'string') {
      return res.status(400).json({ error: 'A pergunta deve ser um texto.' });
    }
    if (typeof customQuestion === 'string' && customQuestion.length > 300) {
      return res.status(400).json({ error: 'A pergunta deve ter no máximo 300 caracteres.' });
    }

    const systemPrompt = `Você é o consultor executivo de inteligência e gestão escolar do Centro de Excelência Santos Dumont (CESD), escola pública estadual de tempo integral em Sergipe.
Analise os dados operacionais consolidados a seguir:
- Período avaliado: ${summaryData.period || 'Hoje'}
- Total de estudantes matriculados: ${summaryData.totalStudents || 437}
- Entradas registradas na portaria: ${summaryData.presentCount || 0} (${summaryData.presenceRate || 0}%)
- Almoços consumidos no refeitório: ${summaryData.servedCount || 0} (${summaryData.adhesionRate || 0}% dos presentes)
- Comida externa / marmitas: ${summaryData.externalFoodCount || 0}
- Alunos ausentes: ${summaryData.absentCount || 0}
- Horário de pico da portaria: ${summaryData.peakPortaria || '--:--'}
- Horário de pico do almoço: ${summaryData.peakRefeitorio || '--:--'}

${customQuestion ? `Pergunta específica da Diretoria: "${customQuestion}"\nResponda diretamente a essa pergunta com base nos dados acima.` : `Elabore um parecer executivo conciso, direto e profissional contendo:
1. 📊 Diagnóstico de Frequência e Pontualidade
2. 🍲 Análise de Adesão ao Almoço Escolar e Evasão Alimentar
3. 💡 Recomendações Estratégicas para a Gestão e Cozinha`}

Responda em formato limpo em texto/markdown, sem enrolação e focado na realidade escolar pública.`;

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: systemPrompt }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 800 }
      })
    });

    const data = await response.json();
    if (data.error) {
      return res.status(500).json({ error: data.error.message });
    }

    const aiText = data.candidates?.[0]?.content?.parts?.[0]?.text || 'Não foi possível gerar a resposta.';
    return res.status(200).json({ success: true, analysis: aiText });
  } catch (err) {
    return res.status(500).json({ error: 'Falha interna ao consultar o Gemini: ' + err.message });
  }
}

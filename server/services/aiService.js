
import OpenAI from "openai";
import dotenv from 'dotenv';
dotenv.config();

const getOpenAIClient = () => {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey || apiKey === 'sua_chave_aqui') {
        throw new Error("OPENAI_API_KEY not found or not configured in environment variables");
    }
    return new OpenAI({
        apiKey: apiKey,
    });
};

// Retry utility
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function runWithRetry(operation, retries = 3, delayMs = 2000) {
    try {
        return await operation();
    } catch (error) {
        // OpenAI status 429 is Rate Limit
        const isRetryable = error.status === 429 || error.status === 500 || error.status === 503;

        if (isRetryable && retries > 0) {
            console.warn(`OpenAI error (${error.status}). Retrying in ${delayMs}ms. Attempts left: ${retries}`);
            await delay(delayMs);
            return runWithRetry(operation, retries - 1, delayMs * 2);
        }
        throw error;
    }
}

const SYSTEM_INSTRUCTION_ENEM = `Você é um Especialista em Elaboração de Questões do ENEM. 
Sua tarefa é criar questões inéditas que sigam rigorosamente a Matriz de Referência do ENEM (Competências e Habilidades).

Estrutura da Questão:
1. Texto de Apoio: Um fragmento de texto, imagem (descrita), gráfico ou interdisciplinaridade que forneça o contexto.
2. Comando: Uma pergunta ou instrução clara baseada no texto de apoio.
3. Alternativas: 5 opções (A-E), onde apenas uma é correta e as outras são distratores plausíveis (não absurdos).

Diretrizes Adicionais:
- Use linguagem formal e acadêmica adequada ao nível do ensino médio brasileiro.
- Varie os assuntos dentro da área solicitada.
- Evite repetições de temas já abordados.
- Responda apenas com o JSON solicitado.`;

const SYSTEM_INSTRUCTION_MAP = `Você é um Designer Instrucional e Professor Especialista em ENEM.
Sua tarefa é gerar um MAPA MENTAL ESTRATÉGICO, PEDAGÓGICO e VISUAL.
Use uma linguagem clara, direta e focada em revisão rápida (estilo flashcards).
Retorne APENAS o JSON, sem textos explicativos antes ou depois.`;

// Generate N questions in a single LLM call (avoids parallel requests that cause 429)
export const generateQuestionBatch = async (area, count = 1, specificTopic, excludeTopics = [], isReviewErrors = false) => {
    return runWithRetry(async () => {
        const openai = getOpenAIClient();

        const recentExcludes = excludeTopics.slice(-10);
        const exclusionPrompt = recentExcludes.length > 0
            ? ` Evite estes tópicos: ${recentExcludes.join(', ')}.`
            : "";

        const areaLabel = area === 'Todas as Áreas' ? "diversas matérias do ENEM" : area;

        let contentPrompt = "";
        if (isReviewErrors) {
            contentPrompt = `Gere ${count} questões ENEM sobre pegadinhas e erros comuns em ${areaLabel}. Varie os tópicos entre as questões.${exclusionPrompt}`;
        } else if (specificTopic && specificTopic.trim() !== "") {
            contentPrompt = `Gere ${count} questões ENEM sobre "${specificTopic}". Varie os aspectos abordados.${exclusionPrompt}`;
        } else {
            contentPrompt = `Gere ${count} questões ENEM de ${areaLabel}. Varie os tópicos e dificuldades.${exclusionPrompt}`;
        }

        const prompt = `${contentPrompt}
Retorne SOMENTE um JSON com a chave "questions" contendo um array de ${count} objetos, cada um com:
{ "stem": "", "context": "", "options": ["A","B","C","D","E"], "correctIndex": 0, "subject": "", "area": "", "difficulty": "", "explanation": "" }`;

        const messages = [
            { role: "system", content: SYSTEM_INSTRUCTION_ENEM },
            { role: "user", content: prompt }
        ];

        console.log(`[AI:LLM] >>> Enviando para OpenAI (model: gpt-4o-mini, count: ${count})`);
        const llmStart = Date.now();

        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages,
            response_format: { type: "json_object" },
            temperature: 0.7,
            max_tokens: 600 * count,
        });

        const usage = response.usage;
        console.log(`[AI:LLM] <<< Resposta em ${Date.now() - llmStart}ms | tokens: prompt=${usage?.prompt_tokens} completion=${usage?.completion_tokens} total=${usage?.total_tokens}`);

        const content = JSON.parse(response.choices[0].message.content);
        const questions = content.questions || (Array.isArray(content) ? content : [content]);
        return questions.filter(q => q && q.stem);
    });
};

export const analyzeSisuChances = async (score, desiredCourse, preferredUniversity) => {
    return runWithRetry(async () => {
        const openai = getOpenAIClient();

        const prompt = `Aja como um especialista em SiSU. 
        O aluno tem nota média TRI de ${score}.
        Deseja o curso "${desiredCourse}" ${preferredUniversity ? `na universidade "${preferredUniversity}"` : ""}.
        Forneça de 3 a 5 cenários realistas baseados em notas de corte históricas recentes (2023-2024).
        Retorne um JSON array de objetos:
        [{ "university": "", "course": "", "cutOffScore": 0, "chance": "", "modality": "" }]`;

        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                { role: "system", content: "Você é um especialista em SiSU e educação brasileira." },
                { role: "user", content: prompt }
            ],
            response_format: { type: "json_object" }
        });

        const content = JSON.parse(response.choices[0].message.content);
        return Array.isArray(content) ? content : (content.scenarios || content.results || [content]);
    });
};

export const generateStudyPlan = async (results) => {
    return runWithRetry(async () => {
        const openai = getOpenAIClient();

        const incorrects = results.filter(r => !r.correct).map(r => r.subject);
        const correctSubjects = results.filter(r => r.correct).map(r => r.subject);

        const prompt = `Analise o desempenho deste aluno em um simulado ENEM.
        Erros: ${incorrects.join(', ')}.
        Acertos: ${correctSubjects.join(', ')}.
        Forneça 4 recomendações de estudo prioritárias para aumentar sua nota TRI.
        Retorne um JSON array de objetos:
        [{ "topic": "", "area": "", "priority": "", "reason": "" }]`;

        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                { role: "system", content: "Você é um orientador pedagógico focado no ENEM." },
                { role: "user", content: prompt }
            ],
            response_format: { type: "json_object" }
        });

        const content = JSON.parse(response.choices[0].message.content);
        return Array.isArray(content) ? content : (content.recommendations || [content]);
    });
};

export const generateEssayTheme = async () => {
    return runWithRetry(async () => {
        const openai = getOpenAIClient();

        const prompt = `Gere um tema de redação realista para o ENEM, incluindo 2-3 textos motivadores curtos. 
        O tema deve ser um problema social, político ou cultural relevante no Brasil.
        Retorne um JSON objeto:
        { "title": "", "motivatingTexts": ["", ""] }`;

        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                { role: "system", content: "Você é um especialista em redação estilo ENEM." },
                { role: "user", content: prompt }
            ],
            response_format: { type: "json_object" }
        });

        return JSON.parse(response.choices[0].message.content);
    });
};

export const evaluateEssay = async (theme, essayText) => {
    return runWithRetry(async () => {
        const openai = getOpenAIClient();

        const prompt = `Aja como um corretor oficial do ENEM.
        Tema: "${theme}"
        Redação do Aluno: "${essayText}"

        Avalie com base nas EXATAMENTE 5 Competências do ENEM (200 pontos cada, total máximo 1000):
        1 - Domínio da norma culta da língua escrita
        2 - Compreensão da proposta de redação
        3 - Seleção e organização das informações
        4 - Conhecimento dos mecanismos linguísticos para argumentação
        5 - Proposta de intervenção para o problema

        Retorne um JSON objeto com EXATAMENTE 5 competências no array:
        {
          "totalScore": 0,
          "competencies": [
            { "id": 1, "name": "Domínio da norma culta da língua escrita", "score": 0, "feedback": "" },
            { "id": 2, "name": "Compreensão da proposta de redação", "score": 0, "feedback": "" },
            { "id": 3, "name": "Seleção e organização das informações", "score": 0, "feedback": "" },
            { "id": 4, "name": "Conhecimento dos mecanismos linguísticos para argumentação", "score": 0, "feedback": "" },
            { "id": 5, "name": "Proposta de intervenção para o problema", "score": 0, "feedback": "" }
          ],
          "generalFeedback": "",
          "strengths": ["", ""],
          "weaknesses": ["", ""]
        }`;

        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                { role: "system", content: "Você é um corretor oficial do ENEM." },
                { role: "user", content: prompt }
            ],
            response_format: { type: "json_object" }
        });

        const content = JSON.parse(response.choices[0].message.content);
        
        // Ensure total score is the sum of all competencies for consistency
        if (content.competencies && Array.isArray(content.competencies)) {
          const sum = content.competencies.reduce((acc, curr) => acc + (curr.score || 0), 0);
          content.totalScore = sum;
        }

        return content;
    });
};

export const getGrade1000Example = async (theme) => {
    return runWithRetry(async () => {
        const openai = getOpenAIClient();

        const prompt = `Gere um exemplo de Redação Nota 1000 do ENEM sobre o tema: "${theme}".

        IMPORTANTE: A redação do ENEM é avaliada em EXATAMENTE 5 competências. Você DEVE gerar comentários para todas as 5:
        1 - Domínio da norma culta da língua escrita
        2 - Compreensão da proposta de redação
        3 - Seleção e organização das informações
        4 - Conhecimento dos mecanismos linguísticos para argumentação
        5 - Proposta de intervenção para o problema

        Retorne um JSON objeto:
        {
          "theme": "",
          "motivatingTextsSummary": "",
          "essayText": "",
          "comments": [
            { "competencyId": 1, "competencyName": "Domínio da norma culta da língua escrita", "justification": "" },
            { "competencyId": 2, "competencyName": "Compreensão da proposta de redação", "justification": "" },
            { "competencyId": 3, "competencyName": "Seleção e organização das informações", "justification": "" },
            { "competencyId": 4, "competencyName": "Conhecimento dos mecanismos linguísticos para argumentação", "justification": "" },
            { "competencyId": 5, "competencyName": "Proposta de intervenção para o problema", "justification": "" }
          ]
        }`;

        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                { role: "system", content: "Você é um professor especialista em redação nota 1000 do ENEM." },
                { role: "user", content: prompt }
            ],
            response_format: { type: "json_object" }
        });

        return JSON.parse(response.choices[0].message.content);
    });
};

export const generateStudyMap = async (subject, topic) => {
    return runWithRetry(async () => {
        const openai = getOpenAIClient();

        const topicFocus = topic
            ? `Assunto: "${subject}". Foco: "${topic}".`
            : `Assunto: "${subject}". Geral.`;

        const prompt = `${topicFocus}
        Crie um JSON estruturado para um mapa mental:
        - highIncidenceInfo: Como o tema cai no ENEM (1-2 frases).
        - centralNode: { "title": "", "description": "", "branches": [] }
        - branches: Array de 3-4 subtemas (com title, description, e branches de nível 2).
        Retorne apenas o JSON.`;

        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                { role: "system", content: SYSTEM_INSTRUCTION_MAP },
                { role: "user", content: prompt }
            ],
            response_format: { type: "json_object" }
        });

        return JSON.parse(response.choices[0].message.content);
    });
};

export const getChatResponse = async (history, newMessage) => {
    return runWithRetry(async () => {
        const openai = getOpenAIClient();

        const messages = [
            {
                role: "system",
                content: `Você é um Tutor Especialista em ENEM (Exame Nacional do Ensino Médio). 
                Sua missão é ajudar estudantes em TODAS as matérias (Linguagens, Humanas, Natureza, Matemática e Redação).
        
                Diretrizes Rígidas:
                1. RIGOR ABSOLUTO: Nunca invente dados. Se não souber, diga. Baseie-se na ciência e na história factual.
                2. MATRIZ DE REFERÊNCIA: Sempre que possível, cite a ÁREA (ex: Ciências da Natureza) e a HABILIDADE ou COMPETÊNCIA do ENEM que está sendo trabalhada.
                3. DIDÁTICA: Explique passo a passo. Se for matemática/física, mostre o cálculo.
                4. TIPO DE RESPOSTA: Seja conciso mas completo. Use bullet points para facilitar a leitura.
                5. EXEMPLOS: Gere exemplos práticos similares aos que caem na prova.
                6. TOM: Encorajador, formal mas acessível.`
            },
            ...history.map(msg => ({
                role: msg.role === 'user' ? 'user' : 'assistant',
                content: msg.text
            })),
            { role: "user", content: newMessage }
        ];

        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: messages
        });

        return response.choices[0].message.content;
    });
};

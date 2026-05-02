import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';

// Inicializa as variáveis de ambiente do .env
dotenv.config();

// Utilitário de atraso (Delay) e Parsing seguro
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const parseSafeJSON = (text) => {
    try {
        return JSON.parse(text);
    } catch (e) {
        // Limpeza avançada caso a IA suje a resposta com Markdown ou links isolados
        const match = text.match(/http:\/\/googleusercontent.com\/immersive_entry_chip\/0\/(.*)/);
        if (match) {
           return JSON.parse(match[1]);
        }
        
        // Se a regex falhar, tenta apenas limpar os crases comuns
        const cleaned = text.replace(/```json/g, "").replace(/```/g, "").trim();
        return JSON.parse(cleaned);
    }
};

// ==========================================
// 🧠 ORQUESTRADOR HÍBRIDO (Gemini & Groq)
// ==========================================
let primaryProvider = 'gemini'; 
let geminiCooldownUntil = 0;
let groqCooldownUntil = 0;
const COOLDOWN_TIME = 60 * 1000; 

// --- PROVEDOR 1: GEMINI ---
const callGemini = async (messages, isJson) => {
    if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY não configurada no arquivo .env.");
    
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const systemMessage = messages.find(m => m.role === 'system')?.content;

    const model = genAI.getGenerativeModel({ 
        model: "gemini-2.5-flash",
        systemInstruction: systemMessage ? { role: "system", parts: [{ text: systemMessage }] } : undefined,
        generationConfig: {
            responseMimeType: isJson ? "application/json" : "text/plain",
            temperature: 0.7
        }
    });

    const history = [];
    const userMessages = messages.filter(m => m.role !== 'system');
    
    for (let i = 0; i < userMessages.length - 1; i++) {
        const msg = userMessages[i];
        history.push({
            role: msg.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: msg.content }]
        });
    }

    const chat = model.startChat({ history });
    const lastMessage = userMessages[userMessages.length - 1]?.content || "Olá";
    
    const result = await chat.sendMessage(lastMessage);
    return result.response.text();
};

// --- PROVEDOR 2: GROQ ---
const callGroq = async (messages, isJson) => {
    if (!process.env.GROQ_API_KEY) throw new Error("GROQ_API_KEY não configurada no arquivo .env.");

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            model: "llama3-8b-8192", 
            messages: messages,
            temperature: 0.7,
            response_format: isJson ? { type: "json_object" } : undefined
        })
    });

    if (!response.ok) {
        const err = new Error(`Groq HTTP error ${response.status}`);
        err.status = response.status;
        throw err;
    }

    const data = await response.json();
    return data.choices[0].message.content;
};

// --- ROTERIZADOR DE TRÁFEGO ---
const executeHybridAI = async (messages, isJson = true, retries = 2) => {
    const now = Date.now();
    let selectedProvider = primaryProvider;

    if (selectedProvider === 'gemini' && now < geminiCooldownUntil) selectedProvider = 'groq';
    if (selectedProvider === 'groq' && now < groqCooldownUntil) selectedProvider = 'gemini';
    if (now < geminiCooldownUntil && now < groqCooldownUntil) selectedProvider = 'groq';

    try {
        const startTime = Date.now();
        let responseText = "";
        
        if (selectedProvider === 'gemini') {
            responseText = await callGemini(messages, isJson);
        } else {
            responseText = await callGroq(messages, isJson);
        }

        console.log(`[AI:Hybrid] ✓ Sucesso via ${selectedProvider.toUpperCase()} (${Date.now() - startTime}ms)`);
        return responseText;

    } catch (error) {
        const status = error.status || error.response?.status;
        const errorMsg = error.message.toLowerCase();
        const isRateLimit = status === 429 || errorMsg.includes('429') || errorMsg.includes('quota') || errorMsg.includes('too many');

        if (isRateLimit) {
            console.warn(`[AI:Hybrid] ⚠️ Rate Limit atingido no ${selectedProvider.toUpperCase()}. Alternando...`);
            if (selectedProvider === 'gemini') geminiCooldownUntil = Date.now() + COOLDOWN_TIME;
            if (selectedProvider === 'groq') groqCooldownUntil = Date.now() + COOLDOWN_TIME;
            primaryProvider = selectedProvider === 'gemini' ? 'groq' : 'gemini';

            if (retries > 0) return executeHybridAI(messages, isJson, retries - 1);
        } else {
            console.error(`[AI:Hybrid] ✗ Erro no ${selectedProvider.toUpperCase()}:`, error.message);
            if (retries > 0) {
                await delay(1500);
                return executeHybridAI(messages, isJson, retries - 1);
            }
        }
        throw error;
    }
}

// ==========================================
// 📝 INSTRUÇÕES DE SISTEMA
// ==========================================

const SYSTEM_INSTRUCTION_ENEM = `Você é um Especialista Sênior em Elaboração de Questões do ENEM.

ATENÇÃO (DIRETRIZ RÍGIDA E INEGOCIÁVEL):
- O array "options" DEVE conter 5 frases DESCRITIVAS COMPLETAS E LONGAS.
- É TERMINANTEMENTE PROIBIDO retornar letras isoladas ("A", "B", "C") ou usar prefixos como "A) ".
- Escreva a frase de resposta DIRETAMENTE. Se a resposta for sobre feudalismo, escreva "O feudalismo causou impacto XYZ" em vez de "A) O feudalismo...".
- Para Exatas/Natureza: Inclua OBRIGATORIAMENTE a unidade de medida (ex: "45 m/s", "10 Joules") na frase inteira.

Seu retorno será lido por uma máquina. Qualquer letra solta ou formatação "A)" fará a questão ser corrompida.`;

const SYSTEM_INSTRUCTION_MAP = `Você é um Designer Instrucional e Professor Especialista em ENEM.
Gere um MAPA MENTAL ESTRATÉGICO e VISUAL. Retorne APENAS o JSON.`;

// ==========================================
// 🚀 ENDPOINTS DA API (OTIMIZADOS COM EXECUÇÃO PARALELA)
// ==========================================

/**
 * GERAÇÃO EM PARALELO (PROMISE.ALL) PARA VELOCIDADE MÁXIMA
 * Divide o pedido total em lotes e gera todos ao mesmo tempo.
 */
export const generateQuestionBatch = async (area, totalCount = 1, specificTopic, excludeTopics = [], isReviewErrors = false) => {
    const BATCH_SIZE = 15; // Lote maior otimizado para o Gemini 2.5 Flash
    const batchPromises = [];
    const areaLabel = area === 'Todas as Áreas' ? "diversas matérias do ENEM" : area;

    console.log(`[AI:Batch] Iniciando geração PARALELA de ${totalCount} questões para ${area}...`);

    // Prepara todas as promessas de requisição simultaneamente
    for (let i = 0; i < totalCount; i += BATCH_SIZE) {
        const count = Math.min(BATCH_SIZE, totalCount - i);
        
        // Criamos uma Promise para cada lote
        const batchPromise = (async () => {
            // Um pequeno delay escalonado (staggering) para não bater no limite de conexões simultâneas da API de uma vez só
            await delay((i / BATCH_SIZE) * 400); 

            let contentPrompt = "";
            if (isReviewErrors) {
                contentPrompt = `Gere ${count} questões ENEM sobre pegadinhas comuns em ${areaLabel}.`;
            } else if (specificTopic && specificTopic.trim() !== "") {
                contentPrompt = `Gere ${count} questões ENEM sobre "${specificTopic}".`;
            } else {
                contentPrompt = `Gere ${count} questões ENEM inéditas de ${areaLabel}. Variedade alta.`;
            }

            // O prompt força a injeção do texto no lugar da letra
            const prompt = `${contentPrompt}
            Retorne SOMENTE um JSON com a chave "questions" contendo um array de exatos ${count} objetos. Estrutura exigida:
            { 
              "stem": "Comando da questão", 
              "context": "Texto de apoio completo", 
              "options": [
                "(ESCREVA A FRASE COMPLETA AQUI SEM A LETRA A)", 
                "(ESCREVA A FRASE COMPLETA AQUI SEM A LETRA B)", 
                "(ESCREVA A FRASE COMPLETA AQUI SEM A LETRA C)", 
                "(ESCREVA A FRASE COMPLETA AQUI SEM A LETRA D)", 
                "(ESCREVA A FRASE COMPLETA AQUI SEM A LETRA E)"
              ], 
              "correctIndex": 0, 
              "subject": "Matéria", 
              "area": "Área", 
              "difficulty": "EASY|MEDIUM|HARD", 
              "explanation": "Justificativa detalhada" 
            }`;

            const messages = [
                { role: "system", content: SYSTEM_INSTRUCTION_ENEM },
                { role: "user", content: prompt }
            ];

            let attempts = 0;
            const maxAttempts = 3;

            while (attempts < maxAttempts) {
                try {
                    const rawResponse = await executeHybridAI(messages, true);
                    const content = parseSafeJSON(rawResponse);
                    let parsedQuestions = content.questions || (Array.isArray(content) ? content : [content]);
                    
                    parsedQuestions = parsedQuestions.filter(q => q && q.stem);

                    // FILTRO AGRESSIVO DE INTEGRIDADE
                    const invalidQuestions = parsedQuestions.filter(q => {
                        if (!q.options || q.options.length !== 5) return true;
                        return q.options.some(opt => {
                            if (typeof opt !== 'string') return true;
                            // Se tirando os caracteres básicos sobrar menos de 10 letras, é lixo.
                            const cleanText = opt.replace(/^[A-E][)\-\.\s=:]+/gi, '').trim();
                            return cleanText.length < 10;
                        });
                    });

                    if (invalidQuestions.length > 0) {
                         console.warn(`[AI:Validation] Lote detectou alternativas vazias/preguiçosas. Recalculando...`);
                         attempts++;
                         if (attempts >= maxAttempts) throw new Error("A IA falhou na formatação.");
                         continue;
                    }

                    // Força a limpeza das letras por Regex (caso a IA ainda tenha teimado)
                    return parsedQuestions.map(q => ({
                        ...q,
                        options: q.options.map(opt => opt.replace(/^[A-E][)\-\.\s=:]+/gi, '').trim())
                    }));

                } catch (error) {
                    console.error(`[AI:Batch Error] Tentativa ${attempts + 1} falhou:`, error.message);
                    attempts++;
                    if (attempts >= maxAttempts) return []; // Se o lote falhar 3x, retorna vazio para não quebrar o resto
                }
            }
        })();
        
        batchPromises.push(batchPromise);
    }

    // Executa TODOS OS LOTES em Paralelo (Aqui é onde a velocidade acontece)
    const resultsArrays = await Promise.all(batchPromises);
    
    // Achata o array de arrays em um único array de 180 questões
    const allQuestions = resultsArrays.flat().filter(q => q !== undefined);
    
    console.log(`[AI:Batch] Concluído! Geradas ${allQuestions.length} questões totais em paralelo.`);
    return allQuestions;
};

export const analyzeSisuChances = async (score, desiredCourse, preferredUniversity) => {
    const prompt = `Aja como um especialista em SiSU. 
    Nota TRI: ${score}. Curso: "${desiredCourse}". Univ: "${preferredUniversity || 'Qualquer'}".
    Forneça 3 a 5 cenários. Retorne JSON array: [{ "university": "", "course": "", "cutOffScore": 0, "chance": "", "modality": "" }]`;
    const messages = [{ role: "system", content: "Especialista em SiSU." }, { role: "user", content: prompt }];
    const content = parseSafeJSON(await executeHybridAI(messages, true));
    return Array.isArray(content) ? content : (content.scenarios || content.results || [content]);
};

export const generateStudyPlan = async (results) => {
    const incorrects = results.filter(r => !r.correct).map(r => r.subject);
    const correctSubjects = results.filter(r => r.correct).map(r => r.subject);
    const prompt = `Erros: ${incorrects.join(', ')}. Acertos: ${correctSubjects.join(', ')}. 
    Forneça 4 recomendações de estudo. JSON array: [{ "topic": "", "area": "", "priority": "", "reason": "" }]`;
    const messages = [{ role: "system", content: "Orientador Pedagógico ENEM." }, { role: "user", content: prompt }];
    const content = parseSafeJSON(await executeHybridAI(messages, true));
    return Array.isArray(content) ? content : (content.recommendations || [content]);
};

export const generateEssayTheme = async () => {
    const prompt = `Gere tema de redação realista ENEM com 2 textos motivadores. JSON: { "title": "", "motivatingTexts": ["", ""] }`;
    const messages = [{ role: "system", content: "Especialista em redação ENEM." }, { role: "user", content: prompt }];
    return parseSafeJSON(await executeHybridAI(messages, true));
};

export const evaluateEssay = async (theme, essayText) => {
    const prompt = `Corrija a redação sobre "${theme}": "${essayText}". Avalie 5 competências. JSON: { "totalScore": 0, "competencies": [{ "id": 1, "name": "...", "score": 0, "feedback": "" }...], "generalFeedback": "", "strengths": [], "weaknesses": [] }`;
    const messages = [{ role: "system", content: "Corretor oficial do ENEM." }, { role: "user", content: prompt }];
    const content = parseSafeJSON(await executeHybridAI(messages, true));
    if (content.competencies && Array.isArray(content.competencies)) {
      content.totalScore = content.competencies.reduce((acc, curr) => acc + (curr.score || 0), 0);
    }
    return content;
};

export const getGrade1000Example = async (theme) => {
    const prompt = `Gere Redação Nota 1000 sobre "${theme}" e comente as 5 competências. JSON: { "theme": "", "essayText": "", "comments": [] }`;
    const messages = [{ role: "system", content: "Professor de Redação." }, { role: "user", content: prompt }];
    return parseSafeJSON(await executeHybridAI(messages, true));
};

export const generateStudyMap = async (subject, topic) => {
    const prompt = `Mapa mental para ${subject} - ${topic || 'Geral'}. JSON: { "highIncidenceInfo": "", "centralNode": {}, "branches": [] }`;
    const messages = [{ role: "system", content: SYSTEM_INSTRUCTION_MAP }, { role: "user", content: prompt }];
    return parseSafeJSON(await executeHybridAI(messages, true));
};

export const getChatResponse = async (history, newMessage) => {
    const messages = [
        { role: "system", content: "Tutor Especialista ENEM. Didático, direto, use markdown para matemática/física." },
        ...history.map(msg => ({ role: msg.role === 'user' ? 'user' : 'assistant', content: msg.text })),
        { role: "user", content: newMessage }
    ];
    return await executeHybridAI(messages, false);
};
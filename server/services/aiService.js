import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';

// Inicializa as variáveis de ambiente do .env
dotenv.config();

// Utilitário de atraso (Delay)
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

// Utilitário de Timeout Forçado
const withTimeout = (promise, ms) => {
    let timeoutId;
    const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
            const err = new Error('APITimeoutError');
            err.name = 'APITimeoutError';
            err.status = 408;
            reject(err);
        }, ms);
    });
    return Promise.race([
        promise.finally(() => clearTimeout(timeoutId)),
        timeoutPromise
    ]);
};

// ─── ALGORITMO DE EMBARALHAMENTO (FISHER-YATES) ───
// Resolve o problema da alternativa certa ser sempre a letra C (índice 2)
function shuffleOptionsAndIndex(question) {
    let safeIndex = question.correctIndex;
    if (typeof safeIndex !== 'number' || safeIndex < 0 || safeIndex >= question.options.length) {
        safeIndex = 0; // Fallback de segurança
    }

    const options = [...question.options];
    const correctOptionText = options[safeIndex]; // Salva o texto da resposta correta
    
    // Embaralha o array de opções
    for (let i = options.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [options[i], options[j]] = [options[j], options[i]];
    }
    
    // Procura o novo índice da resposta correta após o embaralhamento
    const newCorrectIndex = options.indexOf(correctOptionText);
    
    return {
        ...question,
        options,
        correctIndex: newCorrectIndex !== -1 ? newCorrectIndex : 0
    };
}

// ==========================================
// 🧠 ORQUESTRADOR HÍBRIDO (Gemini & Groq)
// ==========================================
let primaryProvider = 'gemini'; 
let geminiCooldownUntil = 0;
let groqCooldownUntil = 0;
const COOLDOWN_TIME = 5 * 60 * 1000; 

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
            model: "llama-3.1-8b-instant", 
            messages: messages,
            temperature: 0.7,
            response_format: isJson ? { type: "json_object" } : undefined
        })
    });

    if (!response.ok) {
        const errText = await response.text();
        const err = new Error(`Groq HTTP error ${response.status}: ${errText}`);
        err.status = response.status;
        throw err;
    }

    const data = await response.json();
    return data.choices[0].message.content;
};

// --- ROTERIZADOR DE TRÁFEGO COM SUPORTE A FATURAMENTO (BILLING) ---
const executeHybridAI = async (messages, isJson = true, retries = 1, timeoutMs = 28000) => {
    const now = Date.now();
    let selectedProvider = primaryProvider;

    // Lógica de alternância rápida
    if (selectedProvider === 'gemini' && now < geminiCooldownUntil) selectedProvider = 'groq';
    if (selectedProvider === 'groq' && now < groqCooldownUntil) selectedProvider = 'gemini';

    try {
        const startTime = Date.now();
        let responseText = "";
        
        if (selectedProvider === 'gemini') {
            responseText = await withTimeout(callGemini(messages, isJson), timeoutMs);
        } else {
            responseText = await withTimeout(callGroq(messages, isJson), timeoutMs);
        }

        console.log(`[AI:Hybrid] ✓ Sucesso via ${selectedProvider.toUpperCase()} (${Date.now() - startTime}ms)`);
        return responseText;

    } catch (error) {
        const status = error.status || error.response?.status;
        const errorMsg = error.message ? error.message.toLowerCase() : '';
        const isRateLimit = status === 429 || errorMsg.includes('429') || errorMsg.includes('quota');

        if (isRateLimit) {
            // INCREMENTO: Em vez de apenas travar, o sistema avisa que vai tentar via Tier Pago/Cobrança
            console.warn(`[AI:Billing] Limite gratuito excedido no ${selectedProvider.toUpperCase()}. Tentando via faturamento...`);
            
            // Reduzimos o cooldown para quase zero, forçando o retry imediato que a API paga aceitará
            if (selectedProvider === 'gemini') geminiCooldownUntil = Date.now() + 2000;
            if (selectedProvider === 'groq') groqCooldownUntil = Date.now() + 2000;

            if (retries > 0) {
                await delay(500); // Pequena pausa apenas para sincronia
                return executeHybridAI(messages, isJson, retries - 1, timeoutMs);
            }
        } 
        
        if (error.name === 'APITimeoutError') {
            console.warn(`[AI:Hybrid] ⚠️ Timeout no ${selectedProvider.toUpperCase()}. Alternando...`);
            if (retries > 0) return executeHybridAI(messages, isJson, retries - 1, timeoutMs);
        }

        console.error(`[AI:Hybrid] ✗ Erro crítico no ${selectedProvider.toUpperCase()}:`, error.message);
        throw error;
    }
}

// ==========================================
// 📝 INSTRUÇÕES DE SISTEMA
// ==========================================

const SYSTEM_INSTRUCTION_ENEM = `Você é um Especialista Sênior em Elaboração de Questões do ENEM. OBRIGATÓRIO: Retorne APENAS um objeto JSON válido.

ATENÇÃO (DIRETRIZ RÍGIDA E INEGOCIÁVEL):
- O array "options" DEVE conter 5 frases DESCRITIVAS COMPLETAS E LONGAS.
- É TERMINANTEMENTE PROIBIDO retornar letras isoladas ("A", "B", "C") ou usar prefixos como "A) ".
- Escreva a frase de resposta DIRETAMENTE. Se a resposta for sobre feudalismo, escreva "O feudalismo causou impacto XYZ" em vez de "A) O feudalismo...".
- Para Exatas/Natureza: Inclua OBRIGATORIAMENTE a unidade de medida (ex: "45 m/s", "10 Joules") na frase inteira.

Seu retorno será lido por um sistema automatizado. Qualquer letra solta ou formatação "A)" fará a questão ser corrompida.`;

const SYSTEM_INSTRUCTION_ROADMAP = `Você é um Mentor Especialista em Preparação para o ENEM.
Sua missão é gerar um ROADMAP (Trilha de Estudos) sequencial e lógico para o aluno.
A trilha deve organizar O QUE estudar e em QUAL ORDEM estudar, do básico ao avançado.
Retorne APENAS JSON estruturado, sem texto ou formatação fora do JSON.`;

// ==========================================
// 🚀 ENDPOINTS DA API
// ==========================================

export const generateQuestionBatch = async (area, requestedCount = 1, specificTopic, excludeTopics = [], isReviewErrors = false) => {
    const count = Math.min(requestedCount, 5); 

    console.log(`[AI:Batch] Gerando pacote veloz de ${count} questões para ${area}...`);

    const recentExcludes = excludeTopics.slice(-20);
    const exclusionPrompt = recentExcludes.length > 0 ? ` Temas já gerados (NÃO REPITA): ${recentExcludes.join(', ')}.` : "";
    const areaLabel = area === 'Todas as Áreas' ? "diversas matérias do ENEM" : area;

    let contentPrompt = "";
    if (isReviewErrors) {
        contentPrompt = `Gere ${count} questões ENEM sobre pegadinhas comuns em ${areaLabel}.${exclusionPrompt}`;
    } else if (specificTopic && specificTopic.trim() !== "") {
        contentPrompt = `Gere ${count} questões ENEM sobre "${specificTopic}".${exclusionPrompt}`;
    } else {
        contentPrompt = `Gere ${count} questões ENEM inéditas de ${areaLabel}. Variedade alta.${exclusionPrompt}`;
    }

    const prompt = `${contentPrompt}
Retorne SOMENTE um JSON com a chave "questions" contendo um array de exatos ${count} objetos. Estrutura exigida:
{ 
  "stem": "Comando direto da questão", 
  "context": "Texto de apoio completo, contendo os dados necessários", 
  "options": [
    "Descreva o primeiro cenário incorreto de forma completa e profunda", 
    "Descreva o segundo cenário incorreto de forma completa e profunda", 
    "Descreva o cenário correto e preciso de forma completa e profunda", 
    "Descreva o terceiro cenário incorreto de forma completa e profunda", 
    "Descreva o quarto cenário incorreto de forma completa e profunda"
  ], 
  "correctIndex": 2, 
  "subject": "Matéria Específica", 
  "area": "Área do conhecimento", 
  "difficulty": "EASY|MEDIUM|HARD", 
  "explanation": "Justificativa minuciosa do gabarito" 
}`;

    const messages = [
        { role: "system", content: SYSTEM_INSTRUCTION_ENEM },
        { role: "user", content: prompt }
    ];

    let attempts = 0;
    const maxAttempts = 2; 

    while (attempts < maxAttempts) {
        try {
            const rawResponse = await executeHybridAI(messages, true, 1, 30000);
            const content = parseSafeJSON(rawResponse);
            let parsedQuestions = content.questions || (Array.isArray(content) ? content : [content]);
            
            parsedQuestions = parsedQuestions.filter(q => q && q.stem);

            // FILTRO AGRESSIVO: Rejeita se as alternativas forem preguiçosas ou repetidas
            const invalidQuestions = parsedQuestions.filter(q => {
                if (!q.options || q.options.length !== 5) return true;
                
                const cleanedOptions = q.options.map(opt => typeof opt === 'string' ? opt.replace(/^[A-E][)\-\.\s=:]+/gi, '').trim() : '');
                
                if (cleanedOptions.some(opt => opt.length < 10)) return true; 
                
                // INCREMENTO: Verificação de Alternativas Repetidas com Set
                const uniqueOptions = new Set(cleanedOptions.map(o => o.toLowerCase()));
                if (uniqueOptions.size !== 5) return true;

                return false;
            });

            if (invalidQuestions.length > 0) {
                 console.warn(`[AI:Validation] Lote gerou alternativas inválidas ou repetidas. Refazendo...`);
                 attempts++;
                 continue;
            }

            // LIMPEZA FORÇADA DAS LETRAS INICIAIS E EMBARALHAMENTO DAS RESPOSTAS
            const processedQuestions = parsedQuestions.map(q => {
                const cleanedOptions = q.options.map(opt => opt.replace(/^[A-E][)\-\.\s=:]+/gi, '').trim());
                const qCleaned = { ...q, options: cleanedOptions };
                
                // INCREMENTO: Embaralha as respostas para tirar o vício da letra C
                return shuffleOptionsAndIndex(qCleaned);
            });

            console.log(`[AI:Batch] Sucesso absoluto! ${processedQuestions.length} questões prontas, limpas e embaralhadas.`);
            return processedQuestions;

        } catch (error) {
            console.warn(`[AI:Batch] Tentativa ${attempts + 1} falhou: ${error.message}`);
            attempts++;
        }
    }

    throw new Error("Falha na geração de questões por excesso de carga nas IAs. Tente novamente em alguns segundos.");
};

export const analyzeSisuChances = async (score, desiredCourse, queryContext) => {
    const prompt = `
      Você é um especialista em admissões universitárias (${queryContext}).
      O aluno tirou nota ${score} (escala 0-1000) e quer o curso "${desiredCourse}".
      
      TAREFA:
      1. Pesquise notas de corte REAIS dos últimos anos para este curso.
      2. O campo "cutOffScore" deve ser o número real da nota de corte (ex: "782.40"). NÃO RETORNE 0.
      3. O campo "chance" deve ser "Alta", "Média" ou "Baixa".
      
      Retorne APENAS um array JSON:
      [
        { "university": "NOME REAL DA FACULDADE", "course": "${desiredCourse}", "cutOffScore": "750.00", "chance": "Alta" }
      ]
    `;

    const messages = [
        { role: "system", content: "Analista de dados reais. Proibido retornar notas de corte zeradas ou nulas." },
        { role: "user", content: prompt }
    ];

    try {
        const resultJSON = await executeHybridAI(messages, true, 1, 30000);
        const parsed = parseSafeJSON(resultJSON);
        return Array.isArray(parsed) ? parsed : (parsed.results || parsed.chances || [parsed]);
    } catch (error) {
        console.error("Erro SiSU:", error);
        return [{ university: "Erro na base de dados", course: desiredCourse, cutOffScore: "---", chance: "Tente novamente" }];
    }
};

export const generateStudyPlan = async (results) => {
    const incorrects = results.filter(r => !r.correct).map(r => r.subject);
    const correctSubjects = results.filter(r => r.correct).map(r => r.subject);
    const prompt = `Erros: ${incorrects.join(', ')}. Acertos: ${correctSubjects.join(', ')}. 
    Forneça 4 recomendações de estudo. JSON array: [{ "topic": "", "area": "", "priority": "", "reason": "" }]`;
    const messages = [{ role: "system", content: "Orientador Pedagógico ENEM. Retorne APENAS um array JSON." }, { role: "user", content: prompt }];
    const content = parseSafeJSON(await executeHybridAI(messages, true, 1, 10000));
    return Array.isArray(content) ? content : (content.recommendations || [content]);
};

export const generateEssayTheme = async () => {
    // 🚨 INCREMENTO: Prompt de Elite para Temas Realistas do ENEM
    const prompt = `
        Você é a banca elaboradora da redação do ENEM.
        A sua missão é gerar um TEMA INÉDITO, FORTE e ALTAMENTE PROVÁVEL de cair no próximo exame.
        O tema DEVE abordar um problema social, tecnológico, ambiental ou cultural relevante no Brasil contemporâneo.
        
        Exemplos de temas com o padrão correto (NÃO COPIE ESTES, crie um novo):
        - "Os desafios da regulamentação da inteligência artificial no Brasil"
        - "Caminhos para combater a desigualdade no acesso à telemedicina no Brasil"
        - "A importância da preservação dos biomas brasileiros para a segurança climática global"
        
        Além do tema, você deve fornecer de 2 a 3 textos motivadores. 
        Estes textos devem ser pequenos fragmentos (de 3 a 5 linhas cada) que apresentem dados, recortes de notícias fictícias verossímeis, trechos de leis ou reflexões sociológicas que ajudem o aluno a entender a gravidade do problema.
        
        OBRIGATÓRIO: O retorno deve ser ESTRITAMENTE um JSON válido no seguinte formato:
        {
          "title": "AQUI VAI O TÍTULO COMPLETO DO TEMA",
          "motivatingTexts": [
             "Texto motivador 1 contendo dados ou contexto histórico...",
             "Texto motivador 2 contendo uma reflexão social ou lei...",
             "Texto motivador 3 (opcional) trazendo uma notícia recente ou impacto prático..."
          ]
        }
    `;

    const messages = [
        { role: "system", content: "Banca oficial de redação do ENEM. Você responde APENAS com um objeto JSON válido, sem markdown ou formatação adicional." },
        { role: "user", content: prompt }
    ];

    try {
        // Aumentado o timeout para 25000ms para permitir que a IA gere textos mais densos
        const response = await executeHybridAI(messages, true, 2, 25000);
        return parseSafeJSON(response);
    } catch (error) {
        console.error("[AI:generateEssayTheme] Falha ao gerar tema de redação:", error);
        throw error;
    }
};

export const evaluateEssay = async (theme, essayText, performanceData = null) => {
    const performanceContext = performanceData ? `
      METADADOS DE PERFORMANCE SOB PRESSÃO (MODO JORNADA - PRÉDIO ${performanceData.towerLevel}):
      - Tempo Limite do Andar: ${performanceData.maxTime}s
      - Tempo Gasto Pelo Aluno: ${performanceData.timeSpentSeconds}s (Restaram: ${performanceData.maxTime - performanceData.timeSpentSeconds}s)
      - Hesitações (Pausas > 5s): ${performanceData.telemetry.pausesOver5s} vezes.
      - Total de Caracteres/Toques: ${performanceData.telemetry.keystrokes}
      
      INSTRUÇÃO ADICIONAL PARA O AVALIADOR:
      No campo "generalFeedback", você DEVE agir como um Treinador de Alta Performance do ENEM. Analise como o aluno geriu o tempo e a fadiga. Se o tempo estourou ou as pausas foram altas, seja implacável alertando sobre resistência mental e fadiga. Se terminou no tempo com coesão, elogie o preparo tático sob pressão extrema da Torre.
    ` : "";

    // PROMPT BLINDADO E RIGOROSO DO ENEM
    const prompt = `
      Você é um Corretor Oficial do ENEM, rigoroso e técnico. Corrija a redação abaixo sobre o tema: "${theme}".
      ${performanceContext}
      
      REGRAS ABSOLUTAS (OBRIGATÓRIO):
      1. A nota de cada competência SÓ PODE SER: 0, 40, 80, 120, 160 ou 200. É PROIBIDO DAR NOTAS QUEBRADAS COMO 85, 90, 72.
      2. O "totalScore" DEVE SER a soma exata das 5 competências.
      3. VOCÊ NÃO PODE INVENTAR NOMES DE COMPETÊNCIAS. USE EXATAMENTE ESTAS 5:
         ID 1: "Domínio da Norma Padrão"
         ID 2: "Compreensão e Repertório"
         ID 3: "Organização e Argumentação"
         ID 4: "Coesão e Conectivos"
         ID 5: "Proposta de Intervenção"

      REDAÇÃO DO ALUNO:
      """
      ${essayText}
      """

      Retorne APENAS um objeto JSON válido (sem marcadores markdown). Formato:
      {
        "totalScore": 800,
        "generalFeedback": "Parágrafo resumindo a performance geral do aluno e nível do texto.",
        "strengths": ["Ponto forte 1", "Ponto forte 2"],
        "weaknesses": ["Ponto de melhoria 1", "Ponto de melhoria 2"],
        "competencies": [
          { "id": 1, "name": "Domínio da Norma Padrão", "score": 160, "feedback": "Análise gramatical detalhada..." },
          { "id": 2, "name": "Compreensão e Repertório", "score": 160, "feedback": "Análise do repertório..." },
          { "id": 3, "name": "Organização e Argumentação", "score": 160, "feedback": "Análise do projeto de texto..." },
          { "id": 4, "name": "Coesão e Conectivos", "score": 160, "feedback": "Análise dos elementos coesivos..." },
          { "id": 5, "name": "Proposta de Intervenção", "score": 160, "feedback": "Análise dos 5 elementos da PI..." }
        ]
      }
    `;

    const messages = [
        { role: "system", content: "Corretor oficial do ENEM. Siga estritamente as regras de pontuação e matriz de referência do INEP. Retorne APENAS JSON." },
        { role: "user", content: prompt }
    ];

    const content = parseSafeJSON(await executeHybridAI(messages, true, 1, 30000));
    
    // Trava final de segurança para garantir a soma correta
    if (content.competencies && Array.isArray(content.competencies)) {
      content.totalScore = content.competencies.reduce((acc, curr) => acc + (curr.score || 0), 0);
    }
    
    return content;
};

export const getGrade1000Example = async (theme) => {
    const prompt = `Gere Redação Nota 1000 sobre "${theme}" e comente as 5 competências. JSON: { "theme": "", "essayText": "", "comments": [] }`;
    const messages = [{ role: "system", content: "Professor de Redação. Retorne APENAS um objeto JSON." }, { role: "user", content: prompt }];
    return parseSafeJSON(await executeHybridAI(messages, true, 1, 30000));
};

export const generateStudyMap = async (subject, topic) => {
    const topicFocus = topic 
        ? `Matéria: "${subject}". Foco específico: "${topic}".` 
        : `Matéria: "${subject}". Visão Geral completa da disciplina para o ENEM.`;
        
    const prompt = `${topicFocus}
    Crie um JSON estruturado de ROADMAP (Trilha de Aprendizagem) para o ENEM.
    Formato OBRIGATÓRIO (Gere de 5 a 8 passos na ordem exata de estudo):
    {
      "title": "Trilha de Domínio: Nome da Matéria/Tópico",
      "overview": "Resumo de 2 linhas sobre como dominar esse assunto para a prova.",
      "roadmap": [
        {
          "step": 1,
          "title": "Nome do Módulo (ex: Matemática Básica)",
          "description": "Breve explicação do porquê começar por aqui",
          "importance": "ALTA",
          "subtopics": ["Subtópico 1", "Subtópico 2", "Subtópico 3"]
        }
      ]
    }`;

    const messages = [
        { role: "system", content: SYSTEM_INSTRUCTION_ROADMAP }, 
        { role: "user", content: prompt }
    ];
    
    return parseSafeJSON(await executeHybridAI(messages, true, 1, 20000));
};

export const getChatResponse = async (history, newMessage) => {
    const messages = [
        { role: "system", content: "Tutor Especialista ENEM. Didático, direto, use markdown para matemática/física." },
        ...history.map(msg => ({ role: msg.role === 'user' ? 'user' : 'assistant', content: msg.text })),
        { role: "user", content: newMessage }
    ];
    return await executeHybridAI(messages, false, 1, 15000);
};
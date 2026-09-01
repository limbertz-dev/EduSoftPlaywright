const { loadEnv } = require('../env.js');

loadEnv();

const TEST_SYSTEM_PROMPT = `
Eres un asistente experto en resolver ejercicios academicos de ingles con maxima precision.

REGLAS OBLIGATORIAS:

1. Lee completamente la instruccion, el contexto, la pregunta y todas las opciones.
2. Determina primero el tipo de ejercicio:
   - multiple_choice
   - cloze
   - matching
   - sequence
   - classification
   - open_ended
   - fill_in_the_blank
3. Analiza la respuesta internamente antes de responder.
4. En preguntas de opcion multiple:
   - Evalua todas las alternativas.
   - Descarta las opciones incorrectas.
   - Comprueba que la seleccionada responda exactamente a la pregunta.
5. En ejercicios de completar:
   - Revisa gramatica, tiempo verbal, sujeto, numero y contexto.
   - No cambies palabras que no pertenecen al espacio vacio.
6. En ejercicios de matching:
   - Usa cada opcion solamente una vez, salvo que la instruccion permita repetir.
   - Comprueba todas las parejas antes de responder.
7. En ejercicios de secuencia:
   - Ordena los elementos segun coherencia temporal, logica y gramatical.
8. No selecciones una respuesta solo porque contiene palabras parecidas a la pregunta.
9. No inventes informacion que no aparece en el contenido proporcionado.
10. Cuando existan varias respuestas aparentemente posibles, elige la que mejor corresponda a la intencion academica del ejercicio.
11. Verifica la respuesta una segunda vez antes de devolverla.
12. Devuelve exclusivamente JSON valido, sin Markdown, explicaciones externas ni texto adicional.

La propiedad confidence debe estar entre 0 y 1.

Si realmente no existe informacion suficiente, responde con answer null, confidence 0 y reason "Informacion insuficiente", respetando el esquema JSON solicitado para la llamada.
`;

function buildSystemPrompt(schemaHint) {
    return [
        TEST_SYSTEM_PROMPT.trim(),
        '',
        'FORMATO JSON EXACTO PARA ESTA LLAMADA:',
        schemaHint || '{"answer":"respuesta final","confidence":0.95,"reason":"justificacion breve basada en el contenido"}',
        '',
        'El formato exacto anterior tiene prioridad sobre cualquier formato general. No agregues claves fuera de ese esquema salvo que sean necesarias para expresar informacion insuficiente.'
    ].join('\n');
}

function extractJson(text) {
    const trimmed = (text || '').trim();
    if (!trimmed) return null;

    try {
        return JSON.parse(trimmed);
    } catch {
        // Continue with fenced or embedded JSON extraction.
    }

    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced) {
        try {
            return JSON.parse(fenced[1].trim());
        } catch {
            // Continue with object extraction.
        }
    }

    const first = trimmed.indexOf('{');
    const last = trimmed.lastIndexOf('}');
    if (first !== -1 && last > first) {
        try {
            return JSON.parse(trimmed.slice(first, last + 1));
        } catch {
            return null;
        }
    }

    return null;
}

function buildPrompt(exercise) {
    const optionLines = exercise.options
        .map(option => `${option.label}. ${option.text}`)
        .join('\n');
    const manualContext = String(exercise.manualContext || '').trim();

    return [
        'You are helping QA-test an English learning application.',
        'Choose the best answer from the visible options.',
        'Return only valid JSON with this shape:',
        '{"answers":["A"],"confidence":0.0,"explanation":"short reason"}',
        exercise.multiSelect
            ? 'This question may allow more than one answer.'
            : 'This question expects one answer unless the text clearly says otherwise.',
        manualContext
            ? 'Use the additional context provided by the user as the source for information that is not visible in the question.'
            : '',
        '',
        manualContext ? `Additional context provided by user:\n${manualContext}` : '',
        manualContext ? '' : '',
        `Question: ${exercise.questionText}`,
        '',
        `Options:\n${optionLines}`
    ].filter(line => line !== '').join('\n');
}

function isGroqKey(apiKey) {
    return /^gsk_/i.test(apiKey || '');
}

function isOpenAIBaseUrl(baseUrl) {
    return /api\.openai\.com/i.test(baseUrl || '');
}

function isGroqBaseUrl(baseUrl) {
    return /api\.groq\.com/i.test(baseUrl || '');
}

function maskApiError(raw) {
    return String(raw || '')
        .replace(/gsk_[A-Za-z0-9_\-]+/g, 'gsk_***')
        .replace(/sk-[A-Za-z0-9_\-]+/g, 'sk-***')
        .slice(0, 500);
}
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function getRateLimitDelayMs(response, raw) {
    const retryAfter = Number(response.headers?.get?.('retry-after'));
    if (Number.isFinite(retryAfter) && retryAfter > 0) return Math.ceil(retryAfter * 1000) + 500;

    const match = String(raw || '').match(/try again in\s+([\d.]+)s/i);
    if (match) return Math.ceil(Number(match[1]) * 1000) + 700;

    return Number(process.env.AI_RATE_LIMIT_DELAY_MS || 5000);
}

async function fetchChatCompletion(baseUrl, apiKey, payload) {
    const maxRetries = Number(process.env.AI_RATE_LIMIT_RETRIES || 3);

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        const response = await fetch(baseUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });
        const raw = await response.text();

        if (response.status !== 429 || attempt >= maxRetries) {
            return { response, raw };
        }

        const delayMs = getRateLimitDelayMs(response, raw);
        console.log(`IA rate limit; esperando ${Math.round(delayMs / 1000)}s antes de reintentar (${attempt + 1}/${maxRetries})`);
        await sleep(delayMs);
    }
}
function inferDefaultBaseUrl(apiKey) {
    return /^gsk_/i.test(apiKey || '')
        ? 'https://api.groq.com/openai/v1/chat/completions'
        : 'https://api.openai.com/v1/chat/completions';
}

function inferDefaultModel(apiKey) {
    return /^gsk_/i.test(apiKey || '') ? 'llama-3.3-70b-versatile' : 'gpt-4o-mini';
}

function getAIConfigs() {
    const configs = [];
    const seen = new Set();
    const addConfig = (name, apiKey, baseUrl, model) => {
        if (!apiKey) return;
        let resolvedBaseUrl = baseUrl || inferDefaultBaseUrl(apiKey);
        let resolvedModel = model || inferDefaultModel(apiKey);

        if (isGroqKey(apiKey) && isOpenAIBaseUrl(resolvedBaseUrl)) {
            console.log(`${name} parece ser una key de Groq, pero AI_BASE_URL apunta a OpenAI; usando endpoint de Groq.`);
            resolvedBaseUrl = 'https://api.groq.com/openai/v1/chat/completions';
            if (!process.env.GROQ_MODEL && (!model || /^gpt-/i.test(model))) resolvedModel = 'llama-3.3-70b-versatile';
        }
        if (!isGroqKey(apiKey) && isGroqBaseUrl(resolvedBaseUrl)) {
            console.log(`${name} no parece ser una key de Groq, pero el endpoint apunta a Groq; usando endpoint de OpenAI.`);
            resolvedBaseUrl = 'https://api.openai.com/v1/chat/completions';
            if (!process.env.OPENAI_MODEL && (!model || /llama|groq|oss/i.test(model))) resolvedModel = 'gpt-4o-mini';
        }

        const config = {
            name,
            apiKey,
            baseUrl: resolvedBaseUrl,
            model: resolvedModel
        };
        const key = `${config.apiKey}|${config.baseUrl}|${config.model}`;
        if (seen.has(key)) return;
        seen.add(key);
        configs.push(config);
    };

    addConfig('AI_API_KEY', process.env.AI_API_KEY, process.env.AI_BASE_URL, process.env.AI_MODEL);
    addConfig(
        'GROQ_API_KEY',
        process.env.GROQ_API_KEY,
        process.env.GROQ_BASE_URL || 'https://api.groq.com/openai/v1/chat/completions',
        process.env.GROQ_MODEL || (process.env.GROQ_API_KEY ? 'llama-3.3-70b-versatile' : '')
    );
    if (process.env.OPENAI_API_KEY && isGroqKey(process.env.OPENAI_API_KEY)) {
        console.log('OPENAI_API_KEY contiene una key de Groq; ignorala o muevela a GROQ_API_KEY. No se usara como OpenAI.');
    } else {
        addConfig(
            'OPENAI_API_KEY',
            process.env.OPENAI_API_KEY,
            process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1/chat/completions',
            process.env.OPENAI_MODEL || 'gpt-4o-mini'
        );
    }

    return configs;
}

async function fetchAIWithFallback(payloadForConfig) {
    const configs = getAIConfigs();
    if (!configs.length) return { ok: false, reason: 'missing-api-key' };

    let lastFailure = null;
    for (let i = 0; i < configs.length; i++) {
        const config = configs[i];
        const { response, raw } = await fetchChatCompletion(config.baseUrl, config.apiKey, payloadForConfig(config));
        if (response.ok) return { ok: true, response, raw, config };

        lastFailure = { ok: false, response, raw, config };
        if ([401, 403].includes(response.status) && i < configs.length - 1) {
            console.log(`IA auth fallo con ${config.name}; probando siguiente proveedor configurado`);
            continue;
        }
        if (response.status === 429 && i < configs.length - 1) {
            console.log(`IA rate limit agotado con ${config.name}; probando siguiente proveedor configurado`);
            continue;
        }
        return lastFailure;
    }

    return lastFailure || { ok: false, reason: 'missing-api-key' };
}

async function askAIForMCQ(exercise) {
    if (!getAIConfigs().length) {
        return { ok: false, reason: 'missing-api-key' };
    }

    if (typeof fetch !== 'function') {
        return { ok: false, reason: 'node-fetch-unavailable' };
    }

    const prompt = buildPrompt(exercise);

    const result = await fetchAIWithFallback((config) => ({
        model: config.model,
        temperature: 0,
        messages: [
            {
                role: 'system',
                content: buildSystemPrompt('{"answers":["A"],"confidence":0.95,"explanation":"short reason"}')
            },
            {
                role: 'user',
                content: prompt
            }
        ]
    }));

    if (!result.ok) {
        return {
            ok: false,
            reason: result.response ? `api-${result.response.status}` : result.reason,
            detail: result.raw ? maskApiError(result.raw) : ''
        };
    }

    let payload;
    try {
        payload = JSON.parse(result.raw);
    } catch {
        return { ok: false, reason: 'bad-api-json', detail: maskApiError(result.raw) };
    }

    const content = payload.choices?.[0]?.message?.content || '';
    const parsed = extractJson(content);
    if (!parsed || !Array.isArray(parsed.answers)) {
        return { ok: false, reason: 'bad-ai-answer', detail: content.slice(0, 500) };
    }

    return {
        ok: true,
        answers: parsed.answers.map(answer => String(answer).trim().toUpperCase()).filter(Boolean),
        confidence: Number(parsed.confidence || 0),
        explanation: String(parsed.explanation || parsed.reason || '').trim()
    };
}
async function askAIForJSON(prompt, schemaHint) {
    if (!getAIConfigs().length) return { ok: false, reason: 'missing-api-key' };
    if (typeof fetch !== 'function') return { ok: false, reason: 'node-fetch-unavailable' };

    const result = await fetchAIWithFallback((config) => ({
        model: config.model,
        temperature: 0,
        messages: [
            {
                role: 'system',
                content: buildSystemPrompt(schemaHint)
            },
            { role: 'user', content: prompt }
        ]
    }));

    if (!result.ok) {
        return {
            ok: false,
            reason: result.response ? `api-${result.response.status}` : result.reason,
            detail: result.raw ? maskApiError(result.raw) : ''
        };
    }

    let payload;
    try {
        payload = JSON.parse(result.raw);
    } catch {
        return { ok: false, reason: 'bad-api-json', detail: maskApiError(result.raw) };
    }

    const content = payload.choices?.[0]?.message?.content || '';
    const parsed = extractJson(content);
    if (!parsed) {
        return { ok: false, reason: 'bad-ai-answer', detail: content.slice(0, 500) };
    }

    return { ok: true, data: parsed };
}
module.exports = { askAIForMCQ, askAIForJSON, TEST_SYSTEM_PROMPT, getAIConfigs };

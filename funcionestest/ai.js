const { loadEnv } = require('../env.js');

loadEnv();

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

    return [
        'You are helping QA-test an English learning application.',
        'Choose the best answer from the visible options.',
        'Return only valid JSON with this shape:',
        '{"answers":["A"],"confidence":0.0,"explanation":"short reason"}',
        exercise.multiSelect
            ? 'This question may allow more than one answer.'
            : 'This question expects one answer unless the text clearly says otherwise.',
        '',
        `Question: ${exercise.questionText}`,
        '',
        `Options:\n${optionLines}`
    ].join('\n');
}

function getAIConfig() {
    const apiKey = process.env.AI_API_KEY || process.env.GROQ_API_KEY || process.env.OPENAI_API_KEY;
    const isGroqKey = /^gsk_/i.test(apiKey || '');
    const baseUrl = process.env.AI_BASE_URL ||
        (isGroqKey
            ? 'https://api.groq.com/openai/v1/chat/completions'
            : 'https://api.openai.com/v1/chat/completions');
    const model = process.env.AI_MODEL ||
        (isGroqKey ? 'llama-3.3-70b-versatile' : 'gpt-4o-mini');

    return { apiKey, baseUrl, model };
}

async function askAIForMCQ(exercise) {
    const { apiKey, baseUrl, model } = getAIConfig();
    if (!apiKey) {
        return { ok: false, reason: 'missing-api-key' };
    }

    if (typeof fetch !== 'function') {
        return { ok: false, reason: 'node-fetch-unavailable' };
    }

    const prompt = buildPrompt(exercise);

    const response = await fetch(baseUrl, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            model,
            temperature: 0,
            messages: [
                {
                    role: 'system',
                    content: 'Answer multiple-choice English questions for QA automation. Output JSON only.'
                },
                {
                    role: 'user',
                    content: prompt
                }
            ]
        })
    });

    const raw = await response.text();
    if (!response.ok) {
        return {
            ok: false,
            reason: `api-${response.status}`,
            detail: raw.slice(0, 500)
        };
    }

    let payload;
    try {
        payload = JSON.parse(raw);
    } catch {
        return { ok: false, reason: 'bad-api-json', detail: raw.slice(0, 500) };
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
        explanation: String(parsed.explanation || '').trim()
    };
}

async function askAIForJSON(prompt, schemaHint) {
    const { apiKey, baseUrl, model } = getAIConfig();
    if (!apiKey) return { ok: false, reason: 'missing-api-key' };
    if (typeof fetch !== 'function') return { ok: false, reason: 'node-fetch-unavailable' };

    const response = await fetch(baseUrl, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            model,
            temperature: 0,
            messages: [
                {
                    role: 'system',
                    content: [
                        'You are helping QA-test an English learning application.',
                        'Return only valid JSON.',
                        schemaHint || ''
                    ].join('\n')
                },
                { role: 'user', content: prompt }
            ]
        })
    });

    const raw = await response.text();
    if (!response.ok) {
        return { ok: false, reason: `api-${response.status}`, detail: raw.slice(0, 500) };
    }

    let payload;
    try {
        payload = JSON.parse(raw);
    } catch {
        return { ok: false, reason: 'bad-api-json', detail: raw.slice(0, 500) };
    }

    const content = payload.choices?.[0]?.message?.content || '';
    const parsed = extractJson(content);
    if (!parsed) {
        return { ok: false, reason: 'bad-ai-answer', detail: content.slice(0, 500) };
    }

    return { ok: true, data: parsed };
}

module.exports = { askAIForMCQ, askAIForJSON };

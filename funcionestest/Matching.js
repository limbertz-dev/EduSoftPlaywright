const { askAIForJSON } = require('./ai.js');
const { extractVisibleExerciseText, labelForIndex, mapAnswerToOption } = require('./common.js');
const { waitForTestCheck, verifyTestResult, dragItemToTarget, FAST } = require('./utils.js');

async function extractMatching(page) {
    return await page.evaluate(() => {
        const isVisible = (el) => {
            if (!el) return false;
            const style = window.getComputedStyle(el);
            const rect = el.getBoundingClientRect();
            return style.visibility !== 'hidden' &&
                style.display !== 'none' &&
                rect.width > 0 &&
                rect.height > 0;
        };
        const clean = (text) => (text || '').replace(/\s+/g, ' ').trim();

        const rows = Array.from(document.querySelectorAll('.prMT_T2T__answersRow'))
            .filter(isVisible)
            .map((row, idx) => ({ index: idx, text: clean(row.innerText || row.textContent) }));

        const items = Array.from(document.querySelectorAll('#bankContainer .dnditem[ans_id], .bankContainer .dnditem[ans_id]'))
            .filter(isVisible)
            .map((el, idx) => ({
                label: String.fromCharCode(65 + idx),
                id: el.getAttribute('ans_id') || '',
                text: clean(el.innerText || el.textContent)
            }))
            .filter(item => item.id && item.text);

        return { rows, items };
    });
}

async function solveTestMatching(page) {
    try {
        console.log('Resolviendo Test Matching con IA');
        const exerciseText = await extractVisibleExerciseText(page);
        const data = await extractMatching(page);
        if (!data.rows.length || !data.items.length) {
            console.log('No se encontraron filas/items Matching');
            return false;
        }

        const prompt = [
            'Match each option to the correct row.',
            'Return JSON: {"answers":[{"row":0,"option":"A"}],"confidence":0.0,"explanation":"short reason"}',
            '',
            `Exercise: ${exerciseText}`,
            '',
            'Rows:',
            ...data.rows.map(row => `${row.index}. ${row.text}`),
            '',
            'Options:',
            ...data.items.map(item => `${item.label}. ${item.text}`)
        ].join('\n');

        const ai = await askAIForJSON(prompt, '{"answers":[{"row":0,"option":"A"}],"confidence":0.0,"explanation":"short reason"}');
        if (!ai.ok || !Array.isArray(ai.data?.answers)) {
            console.log(`IA no resolvio Matching (${ai.reason || 'no-answer'})`);
            return false;
        }

        for (const answer of ai.data.answers) {
            const row = data.rows.find(r => r.index === Number(answer.row));
            const item = mapAnswerToOption(data.items, answer.option || answer.answer);
            if (!row || !item) continue;
            const src = page.locator(`#bankContainer .dnditem[ans_id="${item.id}"], .bankContainer .dnditem[ans_id="${item.id}"]`).first();
            const tgt = page.locator('.prMT_T2T__answersRow .dndZone').nth(row.index);
            const ok = await dragItemToTarget(page, src, tgt);
            console.log(`  Fila ${row.index}: ${item.text} (${ok ? 'ok' : 'fallo'})`);
            await page.waitForTimeout(FAST.short);
        }

        await waitForTestCheck(page);
        return await verifyTestResult(page);
    } catch (e) {
        console.log('Error en Test Matching:', e.message);
        return false;
    }
}

module.exports = { solveTestMatching };

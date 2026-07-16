const { askAIForJSON } = require('./ai.js');
const { extractVisibleExerciseText, mapAnswerToOption } = require('./common.js');
const { waitForTestCheck, verifyTestResult, dragItemToTarget, FAST } = require('./utils.js');

async function extractSequence(page) {
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

        return Array.from(document.querySelectorAll('.prSeq__containerW .dnditem[ans_id], .prSeq__containerW[ans_id], .dnditem[ans_id]'))
            .filter(isVisible)
            .map((el, idx) => ({
                label: String.fromCharCode(65 + idx),
                id: el.getAttribute('ans_id') || el.querySelector?.('.dnditem[ans_id]')?.getAttribute('ans_id') || '',
                text: clean(el.innerText || el.textContent)
            }))
            .filter(item => item.id && item.text);
    });
}

async function findCurrentSequenceIndex(page, id) {
    return await page.evaluate((id) => {
        const containers = document.querySelectorAll('.prSeq__containerW');
        for (let i = 0; i < containers.length; i++) {
            if (containers[i].querySelector(`.dnditem[ans_id="${CSS.escape(id)}"]`)) return i;
        }
        return -1;
    }, id);
}

async function solveTestSequence(page) {
    try {
        console.log('Resolviendo Test Sequence con IA');
        const exerciseText = await extractVisibleExerciseText(page);
        const items = await extractSequence(page);
        if (items.length < 2) {
            console.log('No se encontraron suficientes items Sequence');
            return false;
        }

        const prompt = [
            'Put the options in the correct order.',
            'Return JSON: {"order":["A","B","C"],"confidence":0.0,"explanation":"short reason"}',
            '',
            `Exercise: ${exerciseText}`,
            '',
            'Options:',
            ...items.map(item => `${item.label}. ${item.text}`)
        ].join('\n');

        const ai = await askAIForJSON(prompt, '{"order":["A","B","C"],"confidence":0.0,"explanation":"short reason"}');
        if (!ai.ok || !Array.isArray(ai.data?.order)) {
            console.log(`IA no resolvio Sequence (${ai.reason || 'no-answer'})`);
            return false;
        }

        const ordered = ai.data.order
            .map(answer => mapAnswerToOption(items, answer))
            .filter(Boolean);

        if (ordered.length < 2) {
            console.log('IA no produjo orden mapeable');
            return false;
        }

        for (let targetIdx = 0; targetIdx < ordered.length; targetIdx++) {
            const item = ordered[targetIdx];
            const currentIdx = await findCurrentSequenceIndex(page, item.id);
            if (currentIdx === -1 || currentIdx === targetIdx) continue;
            const src = page.locator('.prSeq__containerW').nth(currentIdx);
            const tgt = page.locator('.prSeq__containerW').nth(targetIdx);
            const ok = await dragItemToTarget(page, src, tgt);
            console.log(`  Posicion ${targetIdx + 1}: ${item.text} (${ok ? 'ok' : 'fallo'})`);
            await page.waitForTimeout(FAST.short);
        }

        await waitForTestCheck(page);
        return await verifyTestResult(page);
    } catch (e) {
        console.log('Error en Test Sequence:', e.message);
        return false;
    }
}

module.exports = { solveTestSequence };

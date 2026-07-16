const { askAIForJSON } = require('./ai.js');
const { extractVisibleExerciseText, mapAnswerToOption } = require('./common.js');
const { waitForTestCheck, verifyTestResult, dragItemToTarget, FAST } = require('./utils.js');

async function extractClassification(page) {
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

        const categories = Array.from(document.querySelectorAll('.prCl__container--normal'))
            .filter(isVisible)
            .map((el, idx) => ({
                index: idx,
                text: clean(el.querySelector('.containerHeader')?.innerText || el.querySelector('.containerHeader')?.textContent || el.innerText || el.textContent)
            }));

        const items = Array.from(document.querySelectorAll('.bankContainer .dnditem[ans_id], #bankContainer .dnditem[ans_id]'))
            .filter(isVisible)
            .map((el, idx) => ({
                label: String.fromCharCode(65 + idx),
                id: el.getAttribute('ans_id') || '',
                text: clean(el.innerText || el.textContent)
            }))
            .filter(item => item.id && item.text);

        return { categories, items };
    });
}

async function solveTestClassification(page) {
    try {
        console.log('Resolviendo Test Classification con IA');
        const exerciseText = await extractVisibleExerciseText(page);
        const data = await extractClassification(page);
        if (!data.categories.length || !data.items.length) {
            console.log('No se encontraron categorias/items Classification');
            return false;
        }

        const prompt = [
            'Classify each option into the correct category.',
            'Return JSON: {"answers":[{"category":0,"option":"A"}],"confidence":0.0,"explanation":"short reason"}',
            '',
            `Exercise: ${exerciseText}`,
            '',
            'Categories:',
            ...data.categories.map(cat => `${cat.index}. ${cat.text}`),
            '',
            'Options:',
            ...data.items.map(item => `${item.label}. ${item.text}`)
        ].join('\n');

        const ai = await askAIForJSON(prompt, '{"answers":[{"category":0,"option":"A"}],"confidence":0.0,"explanation":"short reason"}');
        if (!ai.ok || !Array.isArray(ai.data?.answers)) {
            console.log(`IA no resolvio Classification (${ai.reason || 'no-answer'})`);
            return false;
        }

        for (const answer of ai.data.answers) {
            const category = data.categories.find(c => c.index === Number(answer.category));
            const item = mapAnswerToOption(data.items, answer.option || answer.answer);
            if (!category || !item) continue;
            const src = page.locator(`.bankContainer .dnditem[ans_id="${item.id}"], #bankContainer .dnditem[ans_id="${item.id}"]`).first();
            const tgt = page.locator('.prCl__container--normal .dndZone').nth(category.index);
            const ok = await dragItemToTarget(page, src, tgt);
            console.log(`  Categoria ${category.index}: ${item.text} (${ok ? 'ok' : 'fallo'})`);
            await page.waitForTimeout(FAST.short);
        }

        await waitForTestCheck(page);
        return await verifyTestResult(page);
    } catch (e) {
        console.log('Error en Test Classification:', e.message);
        return false;
    }
}

module.exports = { solveTestClassification };

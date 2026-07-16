const { askAIForJSON } = require('./ai.js');
const { extractVisibleExerciseText, labelForIndex, mapAnswerToOption } = require('./common.js');
const { waitForTestCheck, verifyTestResult, dragItemToTarget, FAST } = require('./utils.js');

async function extractCloze(page) {
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

        const wordBankItems = Array.from(document.querySelectorAll('.wordsBankTable .draggable[data-id], #bankContainer .dnditem[ans_id]'))
            .filter(isVisible)
            .map((el, idx) => ({
                label: String.fromCharCode(65 + idx),
                id: el.getAttribute('data-id') || el.getAttribute('ans_id') || '',
                text: clean(el.innerText || el.textContent),
                selectorType: el.matches('.dnditem') ? 'dnd' : 'wordbank'
            }))
            .filter(item => item.id && item.text);

        const wordTargets = Array.from(document.querySelectorAll('.TTpanswerDiv.droptarget'))
            .filter(isVisible)
            .map((el, idx) => ({ index: idx, selectorType: 'wordbank', text: clean(el.closest('.TextDiv')?.innerText || el.parentElement?.innerText || '') }));

        const dndTargets = Array.from(document.querySelectorAll('.prCLZ__regContainer .dndZone'))
            .filter(isVisible)
            .map((el, idx) => ({ index: idx, selectorType: 'dnd', text: clean(el.closest('.prCLZ__regContainer')?.innerText || el.parentElement?.innerText || '') }));

        return {
            items: wordBankItems,
            targets: wordTargets.length ? wordTargets : dndTargets
        };
    });
}

async function solveTestCloze(page) {
    try {
        console.log('Resolviendo Test Cloze con IA');

        const exerciseText = await extractVisibleExerciseText(page);
        const cloze = await extractCloze(page);
        if (!cloze.items.length || !cloze.targets.length) {
            console.log('No se encontraron items o espacios Cloze');
            return false;
        }

        const prompt = [
            'Place each word/item in the correct blank.',
            'Return JSON: {"answers":[{"blank":0,"option":"A"}],"confidence":0.0,"explanation":"short reason"}',
            '',
            `Exercise: ${exerciseText}`,
            '',
            'Options:',
            ...cloze.items.map(item => `${item.label}. ${item.text}`),
            '',
            'Blanks:',
            ...cloze.targets.map(target => `${target.index}. ${target.text || '(blank)'}`)
        ].join('\n');

        const ai = await askAIForJSON(prompt, '{"answers":[{"blank":0,"option":"A"}],"confidence":0.0,"explanation":"short reason"}');
        if (!ai.ok || !Array.isArray(ai.data?.answers)) {
            console.log(`IA no resolvio Cloze (${ai.reason || 'no-answer'})`);
            return false;
        }

        for (const answer of ai.data.answers) {
            const target = cloze.targets.find(t => t.index === Number(answer.blank));
            const item = mapAnswerToOption(cloze.items, answer.option || answer.answer);
            if (!target || !item) continue;

            const src = target.selectorType === 'dnd'
                ? page.locator(`#bankContainer .dnditem[ans_id="${item.id}"]`).first()
                : page.locator(`.wordsBankTable .draggable[data-id="${item.id}"]`).first();
            const tgt = target.selectorType === 'dnd'
                ? page.locator('.prCLZ__regContainer .dndZone').nth(target.index)
                : page.locator('.TTpanswerDiv.droptarget').nth(target.index);

            const ok = await dragItemToTarget(page, src, tgt);
            console.log(`  Blank ${target.index}: ${item.text} (${ok ? 'ok' : 'fallo'})`);
            await page.waitForTimeout(FAST.short);
        }

        await waitForTestCheck(page);
        return await verifyTestResult(page);
    } catch (e) {
        console.log('Error en Test Cloze:', e.message);
        return false;
    }
}

module.exports = { solveTestCloze };

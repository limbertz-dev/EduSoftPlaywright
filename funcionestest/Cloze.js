const { askAIForJSON } = require('./ai.js');
const { extractVisibleExerciseText, mapAnswerToOption } = require('./common.js');
const { waitForTestCheck, verifyTestResult, dragItemToTarget, FAST } = require('./utils.js');

async function isDndItemInZone(page, itemId, targetIndex) {
    return await page.evaluate(({ itemId, targetIndex }) => {
        const zone = document.querySelectorAll('.prCLZ__regContainer .dndZone')[targetIndex];
        return !!zone?.querySelector(`.dnditem[ans_id="${CSS.escape(itemId)}"]`);
    }, { itemId, targetIndex });
}

async function isWordBankItemInTarget(page, itemId, targetIndex) {
    return await page.evaluate(({ itemId, targetIndex }) => {
        const target = document.querySelectorAll('.TTpanswerDiv.droptarget')[targetIndex];
        return !!target?.querySelector(`.wordBankTilePlaced[data-id="${CSS.escape(itemId)}"], .wordBankTile[data-id="${CSS.escape(itemId)}"], .draggable[data-id="${CSS.escape(itemId)}"], [data-id="${CSS.escape(itemId)}"]`);
    }, { itemId, targetIndex });
}

async function firstExistingLocator(...locators) {
    for (const locator of locators) {
        if (await locator.count()) return locator;
    }
    return null;
}

async function dragDndClozeItem(page, itemId, targetIndex, maxRetries = 2) {
    const innerSelector = `.dnditem[ans_id="${itemId}"]`;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        const source = await firstExistingLocator(
            page.locator('#bankContainer ed-la-dnditem').filter({ has: page.locator(innerSelector) }).first(),
            page.locator(`#bankContainer ${innerSelector}`).first(),
            page.locator('.bankContainer ed-la-dnditem').filter({ has: page.locator(innerSelector) }).first(),
            page.locator(`.bankContainer ${innerSelector}`).first(),
            page.locator(`.prCLZ__regContainer .dndZone ${innerSelector}`).first()
        );
        if (!source) {
            console.log(`  Item ${itemId} no esta disponible (intento ${attempt})`);
            return false;
        }

        const targetZone = page.locator('.prCLZ__regContainer .dndZone').nth(targetIndex);
        const ok = await dragItemToTarget(page, source, targetZone);
        if (ok && await isDndItemInZone(page, itemId, targetIndex)) return true;

        if (attempt === 1) {
            const targetFrame = page.locator('.prCLZ__regContainer').nth(targetIndex);
            const fallbackOk = await dragItemToTarget(page, source, targetFrame);
            if (fallbackOk && await isDndItemInZone(page, itemId, targetIndex)) return true;
        }

        console.log(`  Item ${itemId} no llego al espacio ${targetIndex} (intento ${attempt})`);
        await page.waitForTimeout(FAST.short);
    }

    return false;
}

async function dragWordBankClozeItem(page, itemId, targetIndex, maxRetries = 2) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        const source = await firstExistingLocator(
            page.locator(`.wordsBankTable .draggable[data-id="${itemId}"]`).first(),
            page.locator(`.wordsBankTable .wordBankTile[data-id="${itemId}"]`).first(),
            page.locator(`.draggable.wordBankTile[data-id="${itemId}"]`).first(),
            page.locator(`[data-id="${itemId}"]`).first()
        );
        if (!source) {
            console.log(`  Item ${itemId} no esta en el banco (intento ${attempt})`);
            return false;
        }

        const target = page.locator('.TTpanswerDiv.droptarget').nth(targetIndex);
        const ok = await dragItemToTarget(page, source, target);
        if (ok && await isWordBankItemInTarget(page, itemId, targetIndex)) return true;

        console.log(`  Item ${itemId} no llego al espacio ${targetIndex} (intento ${attempt})`);
        await page.waitForTimeout(FAST.short);
    }

    return false;
}

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
        const contextFor = (text, token) => {
            const normalized = clean(text);
            const idx = normalized.indexOf(token);
            if (idx === -1) return normalized;
            return clean(normalized.slice(Math.max(0, idx - 90), idx + token.length + 90));
        };
        const buildDndQuestionText = () => {
            const root = Array.from(document.querySelectorAll('.prCLZ__question')).find(isVisible);
            if (!root) return '';

            let blankIndex = 0;
            const walk = (node) => {
                if (node.nodeType === Node.TEXT_NODE) return node.textContent || '';
                if (node.nodeType !== Node.ELEMENT_NODE) return '';

                const el = node;
                if (el.matches('.prCLZ__regContainer')) {
                    const token = ` __BLANK_${blankIndex}__ `;
                    blankIndex++;
                    return token;
                }
                if (['SCRIPT', 'STYLE', 'SVG'].includes(el.tagName)) return '';
                if (el.tagName === 'BR') return '\n';

                return Array.from(el.childNodes).map(walk).join('');
            };

            return clean(walk(root));
        };

        const wordBankItems = Array.from(document.querySelectorAll('.wordsBankTable .draggable[data-id], .wordsBankTable .wordBankTile[data-id], #bankContainer .dnditem[ans_id]'))
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
            .map((el, idx) => ({
                index: idx,
                selectorType: 'wordbank',
                text: clean(el.closest('.TextDiv')?.innerText || el.parentElement?.innerText || ''),
                isFilled: !!el.querySelector('.wordBankTilePlaced, .wordBankTile, .draggable, [data-id]')
            }));

        const dndQuestionText = buildDndQuestionText();
        const dndTargets = Array.from(document.querySelectorAll('.prCLZ__regContainer .dndZone'))
            .filter(isVisible)
            .map((el, idx) => ({
                index: idx,
                selectorType: 'dnd',
                text: dndQuestionText
                    ? contextFor(dndQuestionText, `__BLANK_${idx}__`)
                    : clean(el.closest('.prCLZ__regContainer')?.innerText || el.parentElement?.innerText || ''),
                filledText: clean(el.querySelector('.dnditem')?.innerText || el.textContent || ''),
                isFilled: !!el.querySelector('.dnditem')
            }));

        return {
            items: wordBankItems,
            targets: wordTargets.length ? wordTargets : dndTargets,
            clozeText: dndQuestionText
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

        const emptyTargets = cloze.targets.filter(target => !target.isFilled);
        if (!emptyTargets.length) {
            console.log('Cloze ya tiene todos los espacios llenos');
            await waitForTestCheck(page);
            return await verifyTestResult(page);
        }

        const prompt = [
            'Complete every empty blank in this English cloze exercise.',
            'Use only the visible options. Use each option at most once unless the exercise clearly requires repetition.',
            'Return JSON: {"answers":[{"blank":0,"option":"A"}],"confidence":0.0,"explanation":"short reason"}',
            'The "blank" value must match the numeric blank index. Return one answer for every empty blank.',
            '',
            `Exercise text: ${cloze.clozeText || exerciseText}`,
            '',
            'Options:',
            ...cloze.items.map(item => `${item.label}. ${item.text}`),
            '',
            'Empty blanks:',
            ...emptyTargets.map(target => `${target.index}. ${target.text || '(blank)'}`)
        ].join('\n');

        const ai = await askAIForJSON(prompt, '{"answers":[{"blank":0,"option":"A"}],"confidence":0.0,"explanation":"short reason"}');
        if (!ai.ok || !Array.isArray(ai.data?.answers)) {
            console.log(`IA no resolvio Cloze (${ai.reason || 'no-answer'})`);
            return false;
        }

        const answersForEmptyTargets = ai.data.answers
            .map(answer => ({
                target: emptyTargets.find(t => t.index === Number(answer.blank)),
                item: mapAnswerToOption(cloze.items, answer.option || answer.answer)
            }))
            .filter(answer => answer.target && answer.item);

        const answeredTargetCount = new Set(answersForEmptyTargets.map(answer => answer.target.index)).size;
        if (answeredTargetCount < emptyTargets.length) {
            console.log(`IA devolvio ${answeredTargetCount}/${emptyTargets.length} espacios Cloze; no se enviara incompleto`);
            return false;
        }

        for (const answer of answersForEmptyTargets) {
            const { target, item } = answer;
            const ok = target.selectorType === 'dnd'
                ? await dragDndClozeItem(page, item.id, target.index, 2)
                : await dragWordBankClozeItem(page, item.id, target.index, 2);

            console.log(`  Blank ${target.index}: ${item.text} (${ok ? 'ok' : 'fallo'})`);
            if (!ok) return false;
        }

        const remaining = await page.evaluate(() => {
            const isVisible = (el) => {
                if (!el) return false;
                const style = window.getComputedStyle(el);
                const rect = el.getBoundingClientRect();
                return style.visibility !== 'hidden' &&
                    style.display !== 'none' &&
                    rect.width > 0 &&
                    rect.height > 0;
            };

            const dndRemaining = Array.from(document.querySelectorAll('.prCLZ__regContainer .dndZone'))
                .filter(isVisible)
                .filter(zone => !Array.from(zone.querySelectorAll('.dnditem[ans_id], .dnditem')).some(isVisible))
                .length;
            const wordBankRemaining = Array.from(document.querySelectorAll('.TTpanswerDiv.droptarget'))
                .filter(isVisible)
                .filter(target => !Array.from(target.querySelectorAll('.wordBankTilePlaced, .wordBankTile, .draggable, [data-id]')).some(isVisible))
                .length;

            return dndRemaining + wordBankRemaining;
        });

        if (remaining > 0) {
            console.log(`Cloze incompleto: quedan ${remaining} espacio(s) vacio(s); no se enviara`);
            return false;
        }

        await waitForTestCheck(page);
        return await verifyTestResult(page);
    } catch (e) {
        console.log('Error en Test Cloze:', e.message);
        return false;
    }
}

module.exports = { solveTestCloze };

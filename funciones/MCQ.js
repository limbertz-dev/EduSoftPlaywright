const { verifyCorrect, waitForCheckAnswer, waitAfterSeeAnswer, clickSeeAnswer, FAST } = require('./utils.js');

async function selectMcqOption(page, id) {
    return await page.evaluate((id) => {
        const dispatch = (el, type) => el.dispatchEvent(new Event(type, { bubbles: true }));
        const el = document.getElementById(id);
        if (!el) return { ok: false, reason: 'missing' };

        const input = el.matches?.('input[type="radio"], input[type="checkbox"]')
            ? el
            : el.querySelector?.('input[type="radio"], input[type="checkbox"]');

        const label = input?.id ? document.querySelector(`label[for="${CSS.escape(input.id)}"]`) : null;
        const wrapper = input?.closest?.(
            '.lessonMultipleAnswer, .multiRadio, .multiRadioWrapper, .multiCheck, ' +
            '.prMCQ__item, .prMCQ__multiCheck--container, li, tr, div'
        );
        const clickable = label || wrapper || el;

        clickable.scrollIntoView({ block: 'center', inline: 'center' });
        clickable.click();

        if (input && !input.checked) {
            input.checked = true;
            dispatch(input, 'input');
            dispatch(input, 'change');
            dispatch(input, 'click');
        }

        ['input', 'change', 'keyup', 'blur'].forEach(type => dispatch(clickable, type));
        return { ok: true };
    }, id);
}

async function getUnselectedMcqIds(page, ids) {
    return await page.evaluate((ids) => {
        const selectedClasses = ['selected', 'active', 'checked', 'is-selected', 'is-checked', 'c'];

        const isOptionSelected = (id) => {
            const el = document.getElementById(id);
            if (!el) return false;

            const input = el.matches?.('input[type="radio"], input[type="checkbox"]')
                ? el
                : el.querySelector?.('input[type="radio"], input[type="checkbox"]');
            if (input?.checked || input?.getAttribute('aria-checked') === 'true') return true;

            const option = input?.closest?.(
                '.lessonMultipleAnswer, .multiRadio, .multiRadioWrapper, .multiCheck, ' +
                '.prMCQ__item, .prMCQ__multiCheck--container, li, tr, div'
            ) || el;

            if (option.getAttribute?.('aria-checked') === 'true') return true;
            if (selectedClasses.some(cls => option.classList?.contains(cls) || el.classList?.contains(cls))) return true;

            const label = input?.id ? document.querySelector(`label[for="${CSS.escape(input.id)}"]`) : null;
            return !!label && selectedClasses.some(cls => label.classList?.contains(cls));
        };

        return ids.filter(id => !isOptionSelected(id));
    }, ids);
}

async function solveMCQ(page) {
    try {
        console.log('Resolviendo MCQ (Seleccion Unica/Multiple)');

        await clickSeeAnswer(page);
        await waitAfterSeeAnswer(page);

        let correctIds = [];

        const patterns = [
            '.multiRadio.correct input[type="radio"]',
            '.multiRadioWrapper.correct input[type="radio"]',
            '.prMCQ__answers .correct input[type="radio"]',
            '.lessonMultipleAnswer.c',
            '.prMCQ__item.correct',
            '.multiRadio.correct',
            '.prMCQ__multiCheck--container.correct',
            'input[type="radio"]:checked, input[type="checkbox"]:checked',
            '.multiCheck.correct',
            '.correct .answerText, .correct .multiRadio--text',
            '.c .multiTextInline, .c .multiRadio--text, .c .answerText'
        ];

        for (const sel of patterns) {
            const ids = await page.evaluate((sel) => {
                return Array.from(document.querySelectorAll(sel)).map(el => {
                    if (el.matches?.('input[type="radio"], input[type="checkbox"]')) {
                        return el.id || '';
                    }

                    const input = el.querySelector?.('input[type="radio"], input[type="checkbox"]') ||
                        el.closest?.('.lessonMultipleAnswer, .multiRadio, .multiRadioWrapper, .multiCheck, .prMCQ__item, .prMCQ__multiCheck--container')?.querySelector?.('input[type="radio"], input[type="checkbox"]');
                    if (input?.id) return input.id;

                    const option = el.closest?.('[id]');
                    return option?.id || el.id || '';
                }).filter(Boolean);
            }, sel);

            if (ids.length > 0) {
                correctIds = [...new Set(ids)];
                console.log(`Detectados ${correctIds.length} correctos por selector: ${sel}`);
                break;
            }
        }

        if (correctIds.length === 0) {
            const idsWithText = await page.evaluate(() => {
                const corrects = document.querySelectorAll('.multiRadioWrapper.correct, .multiRadio.correct, .lessonMultipleAnswer.c, .c');
                const result = [];
                corrects.forEach(el => {
                    const input = el.querySelector('input[id]');
                    const option = el.closest('[id]');
                    if (input?.id) result.push(input.id);
                    else if (option?.id) result.push(option.id);
                });
                return [...new Set(result)];
            });
            if (idsWithText.length > 0) {
                correctIds = idsWithText;
                console.log(`Detectados ${correctIds.length} correctos por clase correct/c`);
            }
        }

        if (correctIds.length === 0) {
            console.log('No se pudo detectar la respuesta correcta');
            await clickSeeAnswer(page);
            return false;
        }

        console.log(`IDs correctos: [${correctIds.join(', ')}]`);
        await clickSeeAnswer(page);
        await page.waitForTimeout(FAST.medium);

        for (const id of correctIds) {
            try {
                console.log(`Seleccionando id="${id}"`);
                const result = await selectMcqOption(page, id);
                if (!result.ok) {
                    console.log(`Elemento #${id} no encontrado (${result.reason})`);
                }
                await page.waitForTimeout(FAST.short);
            } catch (e) {
                console.log(`Error seleccionando id="${id}": ${e.message}`);
            }
        }

        const notSelected = await getUnselectedMcqIds(page, correctIds);
        if (notSelected.length > 0) {
            console.log(`MCQ no confirmo seleccion visual/input para [${notSelected.join(', ')}]; se validara con CheckAnswer`);
        }

        await waitForCheckAnswer(page);
        return await verifyCorrect(page);
    } catch (e) {
        console.log('Error en MCQ:', e.message);
        return false;
    }
}

module.exports = { solveMCQ };

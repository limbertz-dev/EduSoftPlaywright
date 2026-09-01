const { verifyCorrect, waitForCheckAnswer, waitAfterSeeAnswer, clickSeeAnswer, FAST } = require('./utils.js');

const EDIT_TEXT_INPUT_SELECTOR = '.writingEditPracticeWrapper input[type="text"], .writingEditFrame input[type="text"]';

const COMMON_CORRECTIONS = new Map([
    ['you', 'have you'],
    ['have', 'wanted'],
    ['vacations', 'vacation'],
    ['micronesia', 'Micronesia'],
    ['turtles.', 'turtles?'],
    ['snorkel', 'snorkeling']
]);

async function solveEditText(page) {
    try {
        console.log('Resolviendo EditText (Corregir texto)');

        const original = await getEditTextValues(page);
        if (original.length === 0) {
            console.log('No se encontraron inputs de EditText');
            return false;
        }

        await clickSeeAnswer(page);
        await waitAfterSeeAnswer(page);
        await page.waitForTimeout(FAST.medium);

        let answers = await getRevealedEditTextAnswers(page, original);
        if (answers.length === 0) {
            answers = buildFallbackCorrections(original);
        }

        if (answers.length === 0) {
            console.log('No se detectaron correcciones para EditText');
            await clickSeeAnswer(page).catch(() => {});
            return false;
        }

        console.log(`Detectadas ${answers.length} correccion(es)`);

        await clickSeeAnswer(page);
        await page.waitForTimeout(FAST.medium);

        const inputs = page.locator(EDIT_TEXT_INPUT_SELECTOR);
        const inputCount = await inputs.count();
        const expectedCount = Math.min(inputCount, answers.length);
        let written = 0;

        for (let i = 0; i < expectedCount; i++) {
            const answer = answers[i];
            const input = inputs.nth(answer.index);

            try {
                const ok = await typeEditTextAnswer(page, input, answer.value, i);
                if (!ok) {
                    console.log(`  No se confirmo correccion ${i + 1}: "${answer.value}"`);
                    continue;
                }

                written++;
                console.log(`  Corregido ${i + 1}: "${answer.value}"`);
                await page.waitForTimeout(FAST.short);
            } catch (e) {
                console.log(`  Error corrigiendo input ${i + 1}: ${e.message}`);
            }
        }

        if (written !== expectedCount) {
            console.log(`EditText incompleto: escritos ${written}/${expectedCount}`);
            return false;
        }

        const mismatches = await getEditTextMismatches(page, answers);
        if (mismatches.length > 0) {
            console.log(`EditText tiene ${mismatches.length} input(s) sin la correccion esperada`);
            return false;
        }

        await page.keyboard.press('Tab').catch(() => {});
        await page.waitForTimeout(FAST.medium);

        await waitForCheckAnswer(page);
        return await verifyCorrect(page);
    } catch (e) {
        console.log('Error en EditText:', e.message);
        return false;
    }
}

async function getEditTextValues(page) {
    return await page.evaluate((selector) => {
        return Array.from(document.querySelectorAll(selector)).map((input, index) => ({
            index,
            value: (input.value || input.getAttribute('value') || '').trim()
        }));
    }, EDIT_TEXT_INPUT_SELECTOR);
}

async function getRevealedEditTextAnswers(page, original) {
    return await page.evaluate(({ selector, original }) => {
        const clean = (text) => (text || '').replace(/\s+/g, ' ').trim();
        const originalByIndex = new Map(original.map(item => [item.index, clean(item.value)]));

        const inputAnswers = Array.from(document.querySelectorAll(selector))
            .map((input, index) => ({
                index,
                value: clean(input.value || input.getAttribute('value') || '')
            }))
            .filter(answer => answer.value && answer.value !== originalByIndex.get(answer.index));

        if (inputAnswers.length > 0) return inputAnswers;

        const resourceAnswers = Array.from(document.querySelectorAll('.writingEditResourceSide .et, .writingEditFrame .writingEditResourceSide .et'))
            .map((span, index) => ({
                index,
                value: clean(span.textContent)
            }))
            .filter(answer => answer.value && answer.value !== originalByIndex.get(answer.index));

        return resourceAnswers;
    }, { selector: EDIT_TEXT_INPUT_SELECTOR, original });
}

function buildFallbackCorrections(original) {
    return original
        .map(item => ({
            index: item.index,
            value: COMMON_CORRECTIONS.get(String(item.value || '').trim()) || ''
        }))
        .filter(answer => answer.value);
}

async function typeEditTextAnswer(page, locator, value, index) {
    await locator.evaluate(el => {
        el.removeAttribute('disabled');
        el.removeAttribute('readonly');
    });

    await locator.scrollIntoViewIfNeeded().catch(() => {});
    await locator.click({ timeout: FAST.actionTimeout });
    await page.keyboard.press('Control+A');
    await page.keyboard.press('Delete');
    await page.keyboard.type(value, { delay: 8 });
    await commitEditTextInput(locator);

    let current = await locator.evaluate(el => (el.value || '').trim());
    if (current === value.trim()) return true;

    console.log(`  Typeado no persistio en input ${index + 1}; usando fill`);
    await locator.fill(value, { timeout: FAST.actionTimeout });
    await commitEditTextInput(locator);

    current = await locator.evaluate(el => (el.value || '').trim());
    if (current === value.trim()) return true;

    console.log(`  Fill no persistio en input ${index + 1}; usando escritura directa`);
    const direct = await locator.evaluate((el, value) => {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
        const dispatch = (event) => el.dispatchEvent(event);

        el.focus();
        if (setter) setter.call(el, value);
        else el.value = value;
        el.setAttribute('value', value);

        if (window.InputEvent) {
            dispatch(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: value }));
        } else {
            dispatch(new Event('input', { bubbles: true }));
        }
        dispatch(new Event('change', { bubbles: true }));
        dispatch(new KeyboardEvent('keyup', { bubbles: true, key: 'Tab' }));
        el.blur();
        dispatch(new FocusEvent('blur', { bubbles: true }));

        return (el.value || '').trim() === value.trim();
    }, value);

    return direct;
}

async function commitEditTextInput(locator) {
    await locator.evaluate(el => {
        const dispatch = (event) => el.dispatchEvent(event);
        if (window.InputEvent) {
            dispatch(new InputEvent('input', {
                bubbles: true,
                inputType: 'insertText',
                data: el.value || ''
            }));
        } else {
            dispatch(new Event('input', { bubbles: true }));
        }
        dispatch(new Event('change', { bubbles: true }));
        dispatch(new KeyboardEvent('keyup', { bubbles: true, key: 'Tab' }));
        el.blur();
        dispatch(new FocusEvent('blur', { bubbles: true }));
    });
}

async function getEditTextMismatches(page, answers) {
    return await page.evaluate(({ selector, answers }) => {
        const inputs = Array.from(document.querySelectorAll(selector));
        return answers.reduce((bad, expected) => {
            const input = inputs[expected.index];
            const current = (input?.value || '').trim();
            if (current !== expected.value.trim()) {
                bad.push({ index: expected.index, current, expected: expected.value });
            }
            return bad;
        }, []);
    }, { selector: EDIT_TEXT_INPUT_SELECTOR, answers });
}

module.exports = { solveEditText };

const { verifyCorrect, waitForCheckAnswer, waitAfterSeeAnswer, clickSeeAnswer, FAST } = require('./utils.js');

const OPEN_ENDED_TEXTAREA_SELECTOR = '.prOpenEnded__qaItemText--textarea, textarea';
const OPEN_ENDED_INPUT_SELECTOR = '.prOpenEnded__qaItemText--input, input.prOpenEnded__qaItemText[type="text"], .prOpenEnded__qaItem_inputW input[type="text"]';

async function fillTextareaReliably(page, locator, value, index) {
    await locator.evaluate(el => {
        el.removeAttribute('disabled');
        el.removeAttribute('readonly');
    });

    await locator.scrollIntoViewIfNeeded();
    await locator.click({ timeout: FAST.actionTimeout });
    await locator.fill(value, { timeout: FAST.actionTimeout });

    let current = await locator.evaluate(el => el.value || '');
    if (current.trim() === value.trim()) {
        await locator.evaluate(el => {
            ['input', 'change', 'keyup', 'blur'].forEach(type => {
                el.dispatchEvent(new Event(type, { bubbles: true }));
            });
        });
        return true;
    }

    console.log(`  Fill directo no persistio en textarea ${index + 1}; usando teclado`);
    await locator.click({ timeout: FAST.actionTimeout });
    await page.keyboard.press('Control+A');
    await page.keyboard.press('Delete');
    await page.keyboard.type(value, { delay: 8 });
    await locator.evaluate(el => {
        ['input', 'change', 'keyup', 'blur'].forEach(type => {
            el.dispatchEvent(new Event(type, { bubbles: true }));
        });
    });

    current = await locator.evaluate(el => el.value || '');
    return current.trim() === value.trim();
}

async function typeInputReliably(page, locator, value, index) {
    await locator.evaluate(el => {
        el.removeAttribute('disabled');
        el.removeAttribute('readonly');
    });

    await locator.scrollIntoViewIfNeeded();
    await locator.click({ timeout: FAST.actionTimeout });
    await page.keyboard.press('Control+A');
    await page.keyboard.press('Delete');
    await page.keyboard.type(value, { delay: 8 });

    await locator.evaluate(el => {
        ['input', 'change', 'keyup', 'blur'].forEach(type => {
            el.dispatchEvent(new Event(type, { bubbles: true }));
        });
    });

    let current = await locator.evaluate(el => el.value || '');
    if (current.trim() === value.trim()) return true;

    console.log(`  Typeado no persistio en input ${index + 1}; usando fill`);
    await locator.fill(value, { timeout: FAST.actionTimeout });
    await locator.evaluate(el => {
        ['input', 'change', 'keyup', 'blur'].forEach(type => {
            el.dispatchEvent(new Event(type, { bubbles: true }));
        });
    });

    current = await locator.evaluate(el => el.value || '');
    return current.trim() === value.trim();
}

async function getRevealedInputAnswers(page) {
    return await page.evaluate((selector) => {
        const inputs = Array.from(document.querySelectorAll(selector));
        return inputs
            .map((input, index) => ({
                index,
                id: input.id || '',
                value: (input.value || input.getAttribute('ng-reflect-model') || '').trim()
            }))
            .filter(answer => answer.value);
    }, OPEN_ENDED_INPUT_SELECTOR);
}

async function solveOpenEndedTypedInputs(page) {
    console.log('Resolviendo Open Ended (inputs typeados)');

    await clickSeeAnswer(page);
    await waitAfterSeeAnswer(page);

    const answers = await getRevealedInputAnswers(page);

    if (answers.length === 0) {
        console.log('No se encontraron respuestas en inputs');
        await clickSeeAnswer(page);
        return false;
    }

    console.log(`Leidas ${answers.length} respuesta(s) en inputs`);

    await clickSeeAnswer(page);
    await page.waitForTimeout(FAST.medium);

    const inputs = page.locator(OPEN_ENDED_INPUT_SELECTOR);
    const inputCount = await inputs.count();
    const expectedCount = Math.min(inputCount, answers.length);
    let written = 0;

    for (let i = 0; i < expectedCount; i++) {
        const answer = answers[i];
        const input = answer.id
            ? page.locator(`#${answer.id}`).first()
            : inputs.nth(answer.index);

        try {
            const ok = await typeInputReliably(page, input, answer.value, i);
            if (!ok) {
                console.log(`  No se confirmo escritura en input ${i + 1}`);
                continue;
            }
            written++;
            console.log(`  Escrito input ${i + 1}`);
            await page.waitForTimeout(FAST.short);
        } catch (e) {
            console.log(`  Error input ${i + 1}: ${e.message}`);
        }
    }

    if (written !== expectedCount) {
        console.log(`OpenEnded inputs incompleto: escritos ${written}/${expectedCount}`);
        return false;
    }

    const mismatches = await page.evaluate(({ answers, selector }) => {
        const inputs = Array.from(document.querySelectorAll(selector));

        return answers.slice(0, inputs.length).reduce((bad, expected, idx) => {
            const input = expected.id
                ? document.getElementById(expected.id)
                : inputs[expected.index] || inputs[idx];
            const current = (input?.value || '').trim();
            if (current !== expected.value.trim()) {
                bad.push({ idx, current, expected: expected.value });
            }
            return bad;
        }, []);
    }, { answers, selector: OPEN_ENDED_INPUT_SELECTOR });

    if (mismatches.length > 0) {
        console.log(`OpenEnded tiene ${mismatches.length} input(s) sin la respuesta esperada`);
        return false;
    }

    await page.keyboard.press('Tab').catch(() => {});
    await page.waitForTimeout(FAST.medium);

    await waitForCheckAnswer(page);
    return await verifyCorrect(page);
}

async function solveOpenEnded(page) {
    try {
        const variant = await page.evaluate(({ inputSelector, textareaSelector }) => {
            if (document.querySelector(inputSelector)) return 'typedInputs';
            if (document.querySelector(textareaSelector)) return 'textarea';
            return null;
        }, {
            inputSelector: OPEN_ENDED_INPUT_SELECTOR,
            textareaSelector: OPEN_ENDED_TEXTAREA_SELECTOR
        });

        if (variant === 'typedInputs') {
            return await solveOpenEndedTypedInputs(page);
        }

        console.log('Resolviendo Open Ended (Dictado)');

        await clickSeeAnswer(page);
        await waitAfterSeeAnswer(page);

        const answers = await page.evaluate(() => {
            const textareas = document.querySelectorAll('.prOpenEnded__qaItemText--textarea, textarea');
            const result = [];
            textareas.forEach(ta => {
                const val = ta.value || ta.getAttribute('ng-reflect-model') || '';
                if (val.trim()) {
                    result.push(val.trim());
                }
            });
            return result;
        });

        if (answers.length === 0) {
            console.log('No se encontraron respuestas');
            await clickSeeAnswer(page);
            return false;
        }

        console.log(`Leidas ${answers.length} respuesta(s)`);

        await clickSeeAnswer(page);
        await page.waitForTimeout(FAST.medium);

        const textareas = page.locator(OPEN_ENDED_TEXTAREA_SELECTOR);
        const taCount = await textareas.count();
        const expectedCount = Math.min(taCount, answers.length);
        let written = 0;

        for (let i = 0; i < expectedCount; i++) {
            const ta = textareas.nth(i);
            try {
                const ok = await fillTextareaReliably(page, ta, answers[i], i);
                if (!ok) {
                    console.log(`  No se confirmo escritura ${i + 1}`);
                    continue;
                }
                written++;
                console.log(`  Escrito ${i + 1}`);
                await page.waitForTimeout(FAST.short);
            } catch (e) {
                console.log(`  Error ${i + 1}: ${e.message}`);
            }
        }

        if (written !== expectedCount) {
            console.log(`OpenEnded incompleto: escritos ${written}/${expectedCount}`);
            return false;
        }

        const mismatches = await page.evaluate(({ answers, selector }) => {
            const textareas = Array.from(document.querySelectorAll(selector));
            return answers.slice(0, textareas.length).reduce((bad, expected, idx) => {
                const current = (textareas[idx]?.value || '').trim();
                if (current !== expected.trim()) {
                    bad.push({ idx, current, expected });
                }
                return bad;
            }, []);
        }, { answers, selector: OPEN_ENDED_TEXTAREA_SELECTOR });

        if (mismatches.length > 0) {
            console.log(`OpenEnded tiene ${mismatches.length} textarea(s) sin la respuesta esperada`);
            return false;
        }

        await page.keyboard.press('Tab').catch(() => {});
        await page.waitForTimeout(FAST.medium);

        await waitForCheckAnswer(page);
        return await verifyCorrect(page);
    } catch (e) {
        console.log('Error en Open Ended:', e.message);
        return false;
    }
}

module.exports = { solveOpenEnded, solveOpenEndedTypedInputs };

const { askAIForJSON } = require('./ai.js');
const { extractVisibleExerciseText, mapAnswerToOption, normalizeText } = require('./common.js');
const { waitForTestCheck, verifyTestResult, FAST } = require('./utils.js');

async function openDropdownAndReadOptions(page, blankIndex) {
    const box = await page.evaluate((blankIndex) => {
        const wrappers = document.querySelectorAll('.prFITB__DDLOptionsW');
        const wrapper = wrappers[blankIndex];
        const trigger = wrapper?.querySelector('.DDLOptions__selected, button, [role="button"], [tabindex]') || wrapper;
        if (!trigger) return null;
        trigger.scrollIntoView({ block: 'center', inline: 'center' });
        const rect = trigger.getBoundingClientRect();
        return {
            x: rect.left + rect.width / 2,
            y: rect.top + rect.height / 2,
            width: rect.width,
            height: rect.height
        };
    }, blankIndex);

    if (box && box.width > 0 && box.height > 0) {
        await page.mouse.click(box.x, box.y);
    }

    await page.waitForTimeout(FAST.short);

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

        return Array.from(document.querySelectorAll('[id^="DDLOptions__listItem"], .DDLOptions__listItem, [role="option"]'))
            .filter(isVisible)
            .map((el, idx) => ({
                id: el.id || '',
                label: String.fromCharCode(65 + idx),
                text: (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim()
            }))
            .filter(option => option.text);
    });
}

async function clickFitbOption(page, optionId, optionText) {
    const box = await page.evaluate(({ optionId, optionText }) => {
        const isVisible = (el) => {
            if (!el) return false;
            const style = window.getComputedStyle(el);
            const rect = el.getBoundingClientRect();
            return style.visibility !== 'hidden' &&
                style.display !== 'none' &&
                rect.width > 0 &&
                rect.height > 0;
        };

        const options = Array.from(document.querySelectorAll('[id^="DDLOptions__listItem"], .DDLOptions__listItem, [role="option"]'))
            .filter(isVisible);
        const wanted = (optionText || '').trim().toLowerCase();
        const option = options.find(el => optionId && el.id === optionId) ||
            options.find(el => (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase() === wanted);

        if (!option) return null;
        option.scrollIntoView({ block: 'center', inline: 'center' });
        const rect = option.getBoundingClientRect();
        return {
            x: rect.left + rect.width / 2,
            y: rect.top + rect.height / 2,
            width: rect.width,
            height: rect.height
        };
    }, { optionId, optionText });

    if (!box || box.width <= 0 || box.height <= 0) return false;
    await page.mouse.click(box.x, box.y);
    return true;
}

async function getFitbSelectedText(page, blankIndex) {
    return await page.evaluate((blankIndex) => {
        const cleanText = (text) => (text || '').replace(/\s+/g, ' ').trim();
        const wrapper = document.querySelectorAll('.prFITB__DDLOptionsW')[blankIndex];
        if (!wrapper) return '';

        const selected = wrapper.querySelector(
            '.DDLOptions__selected, .DDLOptions__selectedText, [role="button"], button'
        );
        if (!selected) return '';

        return cleanText(selected.innerText || selected.textContent || '');
    }, blankIndex);
}

function selectedTextMatches(actual, expected) {
    const actualText = normalizeText(actual);
    const expectedText = normalizeText(expected);
    return !!actualText && (
        actualText === expectedText ||
        actualText.includes(expectedText) ||
        expectedText.includes(actualText)
    );
}

async function solveTestFITB(page) {
    try {
        console.log('Resolviendo Test FITB con IA');

        const blankCount = await page.locator('.prFITB__DDLOptionsW').count();
        if (blankCount === 0) {
            console.log('No se encontraron dropdowns FITB');
            return false;
        }

        const exerciseText = await extractVisibleExerciseText(page);
        const blanks = [];
        for (let i = 0; i < blankCount; i++) {
            const options = await openDropdownAndReadOptions(page, i);
            await page.keyboard.press('Escape').catch(() => {});
            if (options.length === 0) continue;
            blanks.push({ index: i, options });
        }
        if (blanks.length === 0) {
            console.log('No se pudieron leer opciones visibles de FITB');
            return false;
        }

        const prompt = [
            'Choose the best option for each blank.',
            'Return JSON: {"answers":[{"blank":0,"option":"A"}],"confidence":0.0,"explanation":"short reason"}',
            '',
            `Exercise: ${exerciseText}`,
            '',
            blanks.map(blank => [
                `Blank ${blank.index}:`,
                ...blank.options.map(option => `${option.label}. ${option.text}`)
            ].join('\n')).join('\n\n')
        ].join('\n');

        const ai = await askAIForJSON(prompt, '{"answers":[{"blank":0,"option":"A"}],"confidence":0.0,"explanation":"short reason"}');
        if (!ai.ok || !Array.isArray(ai.data?.answers)) {
            console.log(`IA no resolvio FITB (${ai.reason || 'no-answer'})`);
            return false;
        }

        let selectedCount = 0;
        for (const answer of ai.data.answers) {
            const blank = blanks.find(b => b.index === Number(answer.blank));
            if (!blank) continue;
            const selected = mapAnswerToOption(blank.options, answer.option || answer.answer);
            if (!selected) continue;

            await openDropdownAndReadOptions(page, blank.index);
            let clicked = await clickFitbOption(page, selected.id, selected.text);
            await page.waitForTimeout(FAST.short);

            if (!clicked) {
                await page.keyboard.press('Escape').catch(() => {});
                await page.waitForTimeout(FAST.short);
                await openDropdownAndReadOptions(page, blank.index);
                clicked = await clickFitbOption(page, selected.id, selected.text);
                await page.waitForTimeout(FAST.short);
            }

            const selectedText = await getFitbSelectedText(page, blank.index);
            if (!clicked || !selectedTextMatches(selectedText, selected.text)) {
                console.log(`  Blank ${blank.index}: no se pudo seleccionar ${selected.text} (actual: ${selectedText || 'vacio'})`);
                continue;
            }

            selectedCount++;
            await page.waitForTimeout(FAST.short);
            console.log(`  Blank ${blank.index}: ${selected.text}`);
        }

        if (selectedCount < blanks.length) {
            console.log(`FITB incompleto: ${selectedCount}/${blanks.length} dropdown(s) seleccionados`);
            return false;
        }

        await waitForTestCheck(page);
        return await verifyTestResult(page);
    } catch (e) {
        console.log('Error en Test FITB:', e.message);
        return false;
    }
}

module.exports = { solveTestFITB };

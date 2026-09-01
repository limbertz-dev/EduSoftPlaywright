const { askAIForJSON } = require('./ai.js');
const { extractVisibleExerciseText, labelForIndex, mapAnswerToOption, normalizeText } = require('./common.js');
const { waitForTestCheck, verifyTestResult, FAST } = require('./utils.js');

async function openDropdownAndReadOptions(page, blankIndex) {
    const opened = await page.evaluate((blankIndex) => {
        const wrappers = Array.from(document.querySelectorAll('.prFITB__DDLOptionsW'));
        const wrapper = wrappers[blankIndex];

        const fireMouse = (el, type) => {
            el.dispatchEvent(new MouseEvent(type, {
                bubbles: true,
                cancelable: true,
                view: window
            }));
        };

        const trigger = wrapper?.querySelector(
            '.DDLOptions__selected, .DDLOptions__selectedText, select, button, [role="button"], [tabindex]'
        ) || wrapper;
        if (!trigger) return { ok: false, reason: 'missing-trigger' };

        trigger.scrollIntoView({ block: 'center', inline: 'center' });
        fireMouse(trigger, 'mouseover');
        fireMouse(trigger, 'mouseenter');
        fireMouse(trigger, 'mousedown');
        fireMouse(trigger, 'mouseup');
        trigger.click();
        trigger.focus?.();

        return {
            ok: true,
            nativeSelect: trigger.tagName === 'SELECT',
            wrapperId: wrapper.id || ''
        };
    }, blankIndex);

    if (!opened.ok) return [];

    await page.waitForTimeout(FAST.short);

    let options = await page.evaluate((blankIndex) => {
        const cleanText = (text) => (text || '')
            .replace(/\u00a0/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

        const isVisible = (el) => {
            if (!el) return false;
            const style = window.getComputedStyle(el);
            const rect = el.getBoundingClientRect();
            return style.visibility !== 'hidden' &&
                style.display !== 'none' &&
                rect.width > 0 &&
                rect.height > 0;
        };

        const wrappers = Array.from(document.querySelectorAll('.prFITB__DDLOptionsW'));
        const wrapper = wrappers[blankIndex];
        const nativeSelect = wrapper?.querySelector('select');
        if (nativeSelect) {
            return Array.from(nativeSelect.options)
                .map((option, idx) => ({
                    id: option.id || '',
                    value: option.value || '',
                    label: '',
                    text: cleanText(option.innerText || option.textContent),
                    index: idx,
                    source: 'native-select'
                }))
                .filter(option => option.text && !/^(select|choose|selecciona|elija|--)/i.test(option.text));
        }

        const optionSelector = [
            '[id^="DDLOptions__listItem"]',
            '[id*="DDLOptions__listItem"]',
            '.DDLOptions__listItem',
            '.edLADropDownList li',
            '.ed-la-dropdown-list li',
            '.dropdown-menu li',
            '[role="option"]',
            'li[id*="aid_"]',
            'div[id*="aid_"]'
        ].join(', ');

        const candidates = Array.from(document.querySelectorAll(optionSelector))
            .map(el => ({
                id: el.id || '',
                text: cleanText(el.innerText || el.textContent),
                visible: isVisible(el),
                inWrapper: !!wrapper && wrapper.contains(el),
                aid: (el.id || '').match(/aid_(\d+)$/)?.[1] || ''
            }))
            .filter(option => option.text)
            .filter(option => !/^(select|choose|selecciona|elija|--|\?)$/i.test(option.text));

        const visible = candidates.filter(option => option.visible);
        const wrapperOptions = candidates.filter(option => option.inWrapper);
        const source = visible.length ? visible : (wrapperOptions.length ? wrapperOptions : candidates);
        const seen = new Set();
        return source.filter(option => {
            const key = `${option.id}|${option.text}`.toLowerCase();
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        }).map((option, idx) => ({
            id: option.id,
            value: option.aid,
            label: '',
            text: option.text,
            index: idx,
            source: option.visible ? 'visible-dom' : 'dom'
        }));
    }, blankIndex);

    if (options.length === 0) {
        await page.keyboard.press('ArrowDown').catch(() => {});
        await page.waitForTimeout(FAST.short);
        options = await page.evaluate((blankIndex) => {
            const cleanText = (text) => (text || '')
                .replace(/\u00a0/g, ' ')
                .replace(/\s+/g, ' ')
                .trim();
            const wrappers = Array.from(document.querySelectorAll('.prFITB__DDLOptionsW'));
            const wrapper = wrappers[blankIndex];
            const items = wrapper
                ? Array.from(wrapper.querySelectorAll('[id^="DDLOptions__listItem"], [id*="DDLOptions__listItem"], .DDLOptions__listItem, [role="option"], li, option'))
                : [];

            return items
                .map((el, idx) => ({
                    id: el.id || '',
                    value: el.value || (el.id || '').match(/aid_(\d+)$/)?.[1] || '',
                    label: '',
                    text: cleanText(el.innerText || el.textContent),
                    index: idx,
                    source: 'wrapper-fallback'
                }))
                .filter(option => option.text && !/^(select|choose|selecciona|elija|--|\?)$/i.test(option.text));
        }, blankIndex);
    }

    return options.map((option, idx) => ({
        ...option,
        label: labelForIndex(idx)
    }));
}

async function clickFitbOption(page, optionId, optionText) {
    const clicked = await page.evaluate(({ optionId, optionText }) => {
        const cleanText = (text) => (text || '')
            .replace(/\u00a0/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

        const isVisible = (el) => {
            if (!el) return false;
            const style = window.getComputedStyle(el);
            const rect = el.getBoundingClientRect();
            return style.visibility !== 'hidden' &&
                style.display !== 'none' &&
                rect.width > 0 &&
                rect.height > 0;
        };

        const fire = (el, type) => {
            el.dispatchEvent(new Event(type, { bubbles: true, cancelable: true }));
        };
        const fireMouse = (el, type) => {
            el.dispatchEvent(new MouseEvent(type, {
                bubbles: true,
                cancelable: true,
                view: window
            }));
        };

        const wanted = cleanText(optionText).toLowerCase();
        const nativeOptions = Array.from(document.querySelectorAll('.prFITB__DDLOptionsW select option'));
        const nativeOption = nativeOptions.find(el => optionId && el.id === optionId) ||
            nativeOptions.find(el => cleanText(el.innerText || el.textContent).toLowerCase() === wanted);
        if (nativeOption) {
            const select = nativeOption.closest('select');
            select.value = nativeOption.value;
            fire(select, 'input');
            fire(select, 'change');
            return { ok: true, via: 'native-select' };
        }

        const optionSelector = [
            '[id^="DDLOptions__listItem"]',
            '[id*="DDLOptions__listItem"]',
            '.DDLOptions__listItem',
            '.edLADropDownList li',
            '.ed-la-dropdown-list li',
            '.dropdown-menu li',
            '[role="option"]',
            'li[id*="aid_"]',
            'div[id*="aid_"]'
        ].join(', ');

        const options = Array.from(document.querySelectorAll(optionSelector))
            .map(el => ({
                el,
                visible: isVisible(el),
                text: cleanText(el.innerText || el.textContent).toLowerCase()
            }))
            .filter(item => item.text);
        const optionItem = options.find(item => optionId && item.el.id === optionId) ||
            options.find(item => item.visible && item.text === wanted) ||
            options.find(item => item.text === wanted) ||
            options.find(item => wanted && item.visible && item.text.includes(wanted)) ||
            options.find(item => wanted && item.text.includes(wanted));

        if (!optionItem) return { ok: false, reason: 'missing-option' };
        const option = optionItem.el;
        option.scrollIntoView({ block: 'center', inline: 'center' });
        fireMouse(option, 'mouseover');
        fireMouse(option, 'mouseenter');
        fireMouse(option, 'mousedown');
        fireMouse(option, 'mouseup');
        option.click();
        fire(option, 'input');
        fire(option, 'change');
        return { ok: true, via: optionItem.visible ? 'visible-dom' : 'dom' };
    }, { optionId, optionText });

    return clicked.ok;
}

async function getFitbSelectedText(page, blankIndex) {
    return await page.evaluate((blankIndex) => {
        const cleanText = (text) => (text || '').replace(/\s+/g, ' ').trim();
        const wrapper = document.querySelectorAll('.prFITB__DDLOptionsW')[blankIndex];
        if (!wrapper) return '';

        const nativeSelect = wrapper.querySelector('select');
        if (nativeSelect) {
            return cleanText(nativeSelect.selectedOptions?.[0]?.innerText || nativeSelect.selectedOptions?.[0]?.textContent);
        }

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
            if (options.length === 0) {
                console.log(`  Blank ${i}: no se leyeron opciones`);
                continue;
            }
            console.log(`  Blank ${i}: ${options.length} opcion(es) detectadas`);
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

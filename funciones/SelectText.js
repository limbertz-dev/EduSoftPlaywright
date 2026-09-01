const { verifyCorrect, waitForCheckAnswer, waitAfterSeeAnswer, clickSeeAnswer, FAST } = require('./utils.js');

const SELECT_TEXT_CANDIDATE_SELECTOR = '.learning__selectTxt_st, .readingExploreWrapper.selectText .st';

async function solveSelectText(page) {
    try {
        console.log('Resolviendo SelectText (Seleccionar texto)');

        await clickSeeAnswer(page);
        await waitAfterSeeAnswer(page);
        await waitForSelectTextAnswer(page);

        const answer = await extractSelectTextAnswer(page);
        if (answer.targetIdx < 0) {
            console.log('No se detecto la oracion correcta para SelectText');
            await clickSeeAnswer(page).catch(() => {});
            return false;
        }

        console.log(`Oracion correcta detectada: ${answer.targetIdx}`);

        await clickSeeAnswer(page);
        await page.waitForTimeout(FAST.medium);

        const clicked = await clickSelectTextTarget(page, answer.targetIdx);
        if (!clicked) {
            console.log(`No se pudo seleccionar la oracion ${answer.targetIdx}`);
            return false;
        }

        const selected = await waitForSelectTextSelection(page, answer.text, answer.targetIdx);
        if (!selected) {
            console.log('SelectText no confirmo seleccion visual; se validara con CheckAnswer');
        }

        await waitForCheckAnswer(page);
        return await verifyCorrect(page);
    } catch (e) {
        console.log('Error en SelectText:', e.message);
        return false;
    }
}

async function extractSelectTextAnswer(page) {
    return await page.evaluate((selector) => {
        const clean = (text) => (text || '').replace(/\s+/g, ' ').trim();
        const norm = (text) => clean(text).toLowerCase();
        const candidates = Array.from(document.querySelectorAll(selector));

        const answerText = clean(document.querySelector('#answerTxtBox')?.textContent || '');
        const selectedIdx = candidates.findIndex(candidate => {
            const cls = String(candidate.className || '');
            return /correct|selected|answer|active|done|c\b/i.test(cls);
        });
        if (selectedIdx >= 0) {
            return { targetIdx: selectedIdx, text: clean(candidates[selectedIdx].textContent) };
        }

        if (answerText && !/^select text$/i.test(answerText)) {
            const normalizedAnswer = norm(answerText);
            const matchedIdx = candidates.findIndex(candidate => {
                const candidateText = norm(candidate.textContent);
                return candidateText &&
                    (candidateText === normalizedAnswer ||
                        candidateText.includes(normalizedAnswer) ||
                        normalizedAnswer.includes(candidateText));
            });

            if (matchedIdx >= 0) {
                return { targetIdx: matchedIdx, text: clean(candidates[matchedIdx].textContent) };
            }
        }

        return { targetIdx: -1, text: answerText };
    }, SELECT_TEXT_CANDIDATE_SELECTOR);
}

async function waitForSelectTextAnswer(page) {
    await page.waitForFunction((selector) => {
        const clean = (text) => (text || '').replace(/\s+/g, ' ').trim();
        const answerText = clean(document.querySelector('#answerTxtBox')?.textContent || '');
        if (answerText && !/^select text$/i.test(answerText)) return true;

        return Array.from(document.querySelectorAll(selector)).some(candidate => {
            const cls = String(candidate.className || '');
            return /correct|selected|answer|active|done|right|\bc\b/i.test(cls);
        });
    }, SELECT_TEXT_CANDIDATE_SELECTOR, { timeout: 5000, polling: 100 }).catch(() => null);
}

async function clickSelectTextTarget(page, targetIdx) {
    const locator = page.locator(SELECT_TEXT_CANDIDATE_SELECTOR).nth(targetIdx);
    const count = await locator.count();
    if (count === 0) return false;

    await locator.scrollIntoViewIfNeeded().catch(() => {});

    await dragSelectTextTarget(page, targetIdx).catch(() => false);
    await page.waitForTimeout(FAST.medium);

    if (await isSelectTextAnswered(page)) return true;

    try {
        await locator.click({ timeout: FAST.actionTimeout, force: true });
        await page.waitForTimeout(FAST.medium);
    } catch {
        // Continue with lower-level fallbacks below.
    }

    if (await isSelectTextAnswered(page)) return true;

    const dispatched = await dispatchClickOnSelectTextTarget(page, targetIdx);
    await page.waitForTimeout(FAST.medium);
    if (await isSelectTextAnswered(page)) return true;

    const selected = await selectTextRangeInDom(page, targetIdx);
    await page.waitForTimeout(FAST.medium);
    return dispatched || selected;
}

async function dispatchClickOnSelectTextTarget(page, targetIdx) {
    return await page.evaluate(({ selector, targetIdx }) => {
        const target = document.querySelectorAll(selector)[targetIdx];
        if (!target) return false;

        target.scrollIntoView({ block: 'center', inline: 'center' });
        const rect = target.getBoundingClientRect();
        const x = rect.left + Math.max(1, rect.width / 2);
        const y = rect.top + Math.max(1, rect.height / 2);

        ['mouseenter', 'mouseover', 'mousemove', 'mousedown', 'mouseup', 'click'].forEach(type => {
            target.dispatchEvent(new MouseEvent(type, {
                bubbles: true,
                cancelable: true,
                view: window,
                clientX: x,
                clientY: y
            }));
        });

        return true;
    }, { selector: SELECT_TEXT_CANDIDATE_SELECTOR, targetIdx });
}

async function dragSelectTextTarget(page, targetIdx) {
    const points = await page.evaluate(({ selector, targetIdx }) => {
        const target = document.querySelectorAll(selector)[targetIdx];
        if (!target) return null;

        target.scrollIntoView({ block: 'center', inline: 'center' });
        const range = document.createRange();
        range.selectNodeContents(target);
        const rects = Array.from(range.getClientRects()).filter(rect => rect.width > 0 && rect.height > 0);
        range.detach?.();

        const first = rects[0] || target.getBoundingClientRect();
        const last = rects[rects.length - 1] || first;
        if (!first || first.width <= 0 || first.height <= 0) return null;

        return {
            startX: first.left + 2,
            startY: first.top + first.height / 2,
            endX: Math.max(last.left + 2, last.right - 2),
            endY: last.top + last.height / 2
        };
    }, { selector: SELECT_TEXT_CANDIDATE_SELECTOR, targetIdx });

    if (!points) return false;

    await page.mouse.move(points.startX, points.startY);
    await page.mouse.down();
    await page.mouse.move(points.endX, points.endY, { steps: 12 });
    await page.mouse.up();
    await page.waitForTimeout(FAST.short);
    return true;
}

async function selectTextRangeInDom(page, targetIdx) {
    return await page.evaluate(({ selector, targetIdx }) => {
        const target = document.querySelectorAll(selector)[targetIdx];
        if (!target) return false;

        target.scrollIntoView({ block: 'center', inline: 'center' });
        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(target);
        selection.removeAllRanges();
        selection.addRange(range);

        ['select', 'selectionchange', 'mouseup', 'click'].forEach(type => {
            const event = type === 'selectionchange'
                ? new Event(type, { bubbles: true, cancelable: true })
                : new MouseEvent(type, { bubbles: true, cancelable: true, view: window });
            (type === 'selectionchange' ? document : target).dispatchEvent(event);
        });

        return true;
    }, { selector: SELECT_TEXT_CANDIDATE_SELECTOR, targetIdx });
}

async function isSelectTextAnswered(page) {
    return await page.evaluate(() => {
        const answerText = (document.querySelector('#answerTxtBox')?.textContent || '').replace(/\s+/g, ' ').trim();
        return !!answerText && !/^select text$/i.test(answerText);
    });
}

async function waitForSelectTextSelection(page, expectedText, targetIdx) {
    return await page.waitForFunction(({ selector, expectedText, targetIdx }) => {
        const clean = (text) => (text || '').replace(/\s+/g, ' ').trim();
        const norm = (text) => clean(text).toLowerCase();
        const target = document.querySelectorAll(selector)[targetIdx];
        const answerText = clean(document.querySelector('#answerTxtBox')?.textContent || '');

        if (answerText && !/^select text$/i.test(answerText)) {
            const normalizedAnswer = norm(answerText);
            const normalizedExpected = norm(expectedText);
            return !normalizedExpected ||
                normalizedAnswer === normalizedExpected ||
                normalizedAnswer.includes(normalizedExpected) ||
                normalizedExpected.includes(normalizedAnswer);
        }

        return /selected|answer|active/i.test(String(target?.className || ''));
    }, { selector: SELECT_TEXT_CANDIDATE_SELECTOR, expectedText, targetIdx }, { timeout: 2500, polling: 100 }).then(() => true).catch(() => false);
}

module.exports = { solveSelectText };

const { verifyCorrect, waitForCheckAnswer, waitAfterSeeAnswer, clickSeeAnswer, FAST } = require('./utils.js');

const ADD_IN_TARGET_SELECTOR = '.learning__addinTxt_at, .readingExploreWrapper--addText .at';

async function solveAddInText(page) {
    try {
        console.log('Resolviendo AddInText (Insertar texto)');

        await clickSeeAnswer(page);
        await waitAfterSeeAnswer(page);
        await waitForAddInTextAnswer(page);

        const answer = await extractAddInTextAnswer(page);
        if (answer.targetIdx < 0) {
            console.log('No se detecto el punto correcto para insertar texto');
            await clickSeeAnswer(page).catch(() => {});
            return false;
        }

        console.log(`Punto correcto detectado: ${answer.targetIdx}`);

        await clickSeeAnswer(page);
        await page.waitForTimeout(FAST.medium);

        const clicked = await clickAddInTarget(page, answer.targetIdx);
        if (!clicked) {
            console.log(`No se pudo seleccionar el punto ${answer.targetIdx}`);
            return false;
        }

        const selected = await page.waitForFunction(({ selector, targetIdx }) => {
            const targets = Array.from(document.querySelectorAll(selector));
            const target = targets[targetIdx];
            const insertedText = target?.textContent?.replace(/\s+/g, ' ').trim() || '';
            return insertedText.length > 0 || /selected|answer|active/i.test(target?.className || '');
        }, { selector: ADD_IN_TARGET_SELECTOR, targetIdx: answer.targetIdx }, { timeout: 2500, polling: 100 }).then(() => true).catch(() => false);

        if (!selected) {
            console.log('AddInText no confirmo seleccion visual; se validara con CheckAnswer');
        }

        await waitForCheckAnswer(page);
        return await verifyCorrect(page);
    } catch (e) {
        console.log('Error en AddInText:', e.message);
        return false;
    }
}

async function extractAddInTextAnswer(page) {
    return await page.evaluate((selector) => {
        const clean = (text) => (text || '').replace(/\s+/g, ' ').trim();
        const targets = Array.from(document.querySelectorAll(selector));

        const targetIdx = targets.findIndex(target => {
            const inserted = clean(target.querySelector('.ITNewText')?.textContent || target.textContent);
            if (inserted) return true;

            const cls = String(target.className || '');
            const childCls = String(target.querySelector('*')?.className || '');
            return /correct|selected|answer|done|active|right/i.test(`${cls} ${childCls}`);
        });

        const sentence = clean(document.querySelector('#answerDiv .sentenceNoteWrapper, .addInText .sentenceNoteWrapper')?.textContent);
        return { targetIdx, sentence };
    }, ADD_IN_TARGET_SELECTOR);
}

async function waitForAddInTextAnswer(page) {
    await page.waitForFunction((selector) => {
        const clean = (text) => (text || '').replace(/\s+/g, ' ').trim();
        return Array.from(document.querySelectorAll(selector)).some(target => {
            const inserted = clean(target.querySelector('.ITNewText')?.textContent || target.textContent);
            const cls = `${target.className || ''} ${target.querySelector('*')?.className || ''}`;
            return inserted || /correct|selected|answer|done|active|right/i.test(cls);
        });
    }, ADD_IN_TARGET_SELECTOR, { timeout: 5000, polling: 100 }).catch(() => null);
}

async function clickAddInTarget(page, targetIdx) {
    const locator = page.locator(ADD_IN_TARGET_SELECTOR).nth(targetIdx);
    const count = await locator.count();
    if (count === 0) return false;

    await locator.scrollIntoViewIfNeeded().catch(() => {});

    await clickAddInByCoordinates(page, targetIdx).catch(() => false);

    await page.waitForTimeout(FAST.medium);

    const accepted = await page.evaluate(({ selector, targetIdx }) => {
        const target = document.querySelectorAll(selector)[targetIdx];
        if (!target) return false;
        const insertedText = (target.textContent || '').replace(/\s+/g, ' ').trim();
        return insertedText.length > 0 || /selected|answer|active/i.test(String(target.className || ''));
    }, { selector: ADD_IN_TARGET_SELECTOR, targetIdx });

    if (accepted) return true;
    try {
        await locator.click({ timeout: FAST.actionTimeout, force: true });
    } catch {
        // Continue with DOM event fallback below.
    }

    await page.waitForTimeout(FAST.short);
    return await dispatchClickOnAddInTarget(page, targetIdx);
}

async function dispatchClickOnAddInTarget(page, targetIdx) {
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
    }, { selector: ADD_IN_TARGET_SELECTOR, targetIdx });
}

async function clickAddInByCoordinates(page, targetIdx) {
    const point = await page.evaluate(({ selector, targetIdx }) => {
        const target = document.querySelectorAll(selector)[targetIdx];
        if (!target) return null;

        target.scrollIntoView({ block: 'center', inline: 'center' });

        const usableRect = (rect) => {
            if (!rect || rect.width <= 0 || rect.height <= 0) return null;
            return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
        };

        const own = usableRect(target.getBoundingClientRect());
        if (own) return own;

        const range = document.createRange();
        range.selectNode(target);
        const fromRange = Array.from(range.getClientRects()).map(usableRect).find(Boolean);
        range.detach?.();
        if (fromRange) return fromRange;

        const previous = target.previousSibling;
        if (previous) {
            const prevRange = document.createRange();
            prevRange.selectNode(previous);
            const rects = Array.from(prevRange.getClientRects()).filter(rect => rect.width > 0 && rect.height > 0);
            prevRange.detach?.();
            const last = rects[rects.length - 1];
            if (last) return { x: last.right + 4, y: last.top + last.height / 2 };
        }

        const next = target.nextSibling;
        if (next) {
            const nextRange = document.createRange();
            nextRange.selectNode(next);
            const rects = Array.from(nextRange.getClientRects()).filter(rect => rect.width > 0 && rect.height > 0);
            nextRange.detach?.();
            const first = rects[0];
            if (first) return { x: first.left - 4, y: first.top + first.height / 2 };
        }

        const parentRect = target.parentElement?.getBoundingClientRect();
        return usableRect(parentRect);
    }, { selector: ADD_IN_TARGET_SELECTOR, targetIdx });

    if (!point) return false;
    await page.mouse.move(point.x, point.y);
    await page.mouse.down();
    await page.mouse.up();
    await page.waitForTimeout(FAST.short);
    return true;
}

module.exports = { solveAddInText };

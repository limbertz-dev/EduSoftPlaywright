const FAST = {
    short: 100,
    medium: 280,
    afterDrag: 380,
    feedbackTimeout: 7000,
    actionTimeout: 5000,
    saveTimeout: 7000
};

async function waitAfterSeeAnswer(page) {
    try {
        await page.waitForFunction(() => {
            const isVisible = (el) => {
                if (!el) return false;
                const style = window.getComputedStyle(el);
                const rect = el.getBoundingClientRect();
                return style.visibility !== 'hidden' &&
                    style.display !== 'none' &&
                    rect.width > 0 &&
                    rect.height > 0;
            };

            const hasVisible = (selector) => {
                return Array.from(document.querySelectorAll(selector)).some(isVisible);
            };

            const hasOpenEndedAnswer = Array.from(document.querySelectorAll(
                'textarea, .prOpenEnded__qaItemText--input, input.prOpenEnded__qaItemText[type="text"]'
            )).some(el => isVisible(el) && (el.value || el.getAttribute('ng-reflect-model') || '').trim());

            const hasAddInTextAnswer = Array.from(document.querySelectorAll(
                '.learning__addinTxt_at .ITNewText, .readingExploreWrapper--addText .at .ITNewText'
            )).some(el => (el.textContent || '').replace(/\s+/g, ' ').trim());

            const selectTextAnswer = (document.querySelector('#answerTxtBox')?.textContent || '').replace(/\s+/g, ' ').trim();
            const hasSelectTextAnswer = !!selectTextAnswer && !/^select text$/i.test(selectTextAnswer);

            return hasVisible(
                '.correct, .lessonMultipleAnswer.c, ' +
                '.DDLOptions__selected[id*="aid_"], ' +
                'iframe[id^="mce_"], #tinymce'
            ) || hasVisible(
                '.prCLZ__regContainer .dndZone .dnditem[ans_id], ' +
                '.prMT_T2T__answersRow .dndZone .dnditem[ans_id], ' +
                '.prSeq__containerW .dnditem[ans_id], ' +
                '.prCl__container--normal .dndZone .dnditem[ans_id], ' +
                '.textToPic__answers .dndZone .dnditem[ans_id], ' +
                '.TTpanswerDiv.droptarget .wordBankTile[data-id], ' +
                '.wordsBankTable .wordBankTilePlaced[data-id]'
            ) || hasOpenEndedAnswer || hasAddInTextAnswer || hasSelectTextAnswer;
        }, { timeout: 2500, polling: 100 });
    } catch {
        await page.waitForTimeout(FAST.medium);
    }
}

async function clickSeeAnswer(page) {
    const seeAnswer = page.locator('#SeeAnswer');
    await seeAnswer.waitFor({ state: 'attached', timeout: FAST.actionTimeout });
    try {
        await seeAnswer.click({ timeout: FAST.actionTimeout });
    } catch {
        await seeAnswer.click({ force: true, timeout: FAST.actionTimeout });
    }
}

async function getCompletionState(page) {
    return await page.evaluate(() => {
        const isVisible = (el) => {
            if (!el) return false;
            const style = window.getComputedStyle(el);
            const rect = el.getBoundingClientRect();
            return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0;
        };

        const nextBtn = document.querySelector('.tasksBtnext');
        const nextEnabled = !!nextBtn &&
            isVisible(nextBtn) &&
            !nextBtn.disabled &&
            !nextBtn.classList.contains('disabled') &&
            nextBtn.getAttribute('aria-disabled') !== 'true';

        const checkBtn = document.querySelector('#CheckAnswer');
        const checkEnabled = !!checkBtn &&
            isVisible(checkBtn) &&
            !checkBtn.disabled &&
            !checkBtn.classList.contains('disabled') &&
            checkBtn.getAttribute('aria-disabled') !== 'true';

        const hasErrors = !!document.querySelector(
            '.incorrect, .wrong, .feedbackItem--incorrect, ' +
            '.prMT_T2T__answersRow .wrong, .prMT_T2T__answersRow .incorrect, ' +
            '.prCl__container--normal .wrong, .prCl__container--normal .incorrect, ' +
            '.textToPic__answers .wrong, .textToPic__answers .incorrect, ' +
            '.addInText .wrong, .addInText .incorrect, ' +
            '.selectText .wrong, .selectText .incorrect, ' +
            '.writingEditFrame .wrong, .writingEditFrame .incorrect, ' +
            '.writingEditPracticeWrapper .wrong, .writingEditPracticeWrapper .incorrect, ' +
            '.prCLZ__regContainer .wrong, .prCLZ__regContainer .incorrect, ' +
            '.prFITB__DDLOptionsW .wrong, .prFITB__DDLOptionsW .incorrect, ' +
            '.has-error, .error-message, .is-wrong, .is-incorrect'
        );
        const hasSuccess = !!document.querySelector(
            '.feedbackItem--correct, .passed, .completed, .success, .is-correct'
        );

        const saveSeen = window.__lastCheckAnswerSaveSeen === true;
        const stateConfirmed = window.__lastCheckAnswerStateConfirmed === true;
        return { hasErrors, hasSuccess, nextEnabled, checkEnabled, saveSeen, stateConfirmed };
    });
}

async function verifyCorrect(page) {
    try {
        await page.waitForFunction(() => {
            const isVisible = (el) => {
                if (!el) return false;
                const style = window.getComputedStyle(el);
                const rect = el.getBoundingClientRect();
                return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0;
            };
            const nextBtn = document.querySelector('.tasksBtnext');
            const nextEnabled = !!nextBtn &&
                isVisible(nextBtn) &&
                !nextBtn.disabled &&
                !nextBtn.classList.contains('disabled') &&
                nextBtn.getAttribute('aria-disabled') !== 'true';
            const hasErrors = !!document.querySelector(
                '.incorrect, .wrong, .feedbackItem--incorrect, .has-error, .error-message, .is-wrong, .is-incorrect'
            );
            const hasSuccess = !!document.querySelector(
                '.feedbackItem--correct, .passed, .completed, .success, .is-correct'
            );
            return nextEnabled || hasErrors || hasSuccess;
        }, { timeout: FAST.feedbackTimeout, polling: 150 });
    } catch {
        console.log('  Timeout esperando retroalimentacion, verificando estado actual...');
    }

    const result = await getCompletionState(page);

    console.log(`  Verify: errors=${result.hasErrors} success=${result.hasSuccess} nextBtn=${result.nextEnabled} checkBtn=${result.checkEnabled} saveSeen=${result.saveSeen} stable=${result.stateConfirmed}`);

    if (!result.hasErrors && result.nextEnabled && (!result.checkEnabled || result.saveSeen || result.stateConfirmed)) {
        console.log('Ejercicio completado correctamente');
        return true;
    }
    if (result.hasErrors) {
        console.log('Se detectaron errores en las respuestas');
        return false;
    }

    if (!result.hasErrors && result.hasSuccess && !result.checkEnabled) {
        console.log('Ejercicio completado correctamente');
        return true;
    }

    console.log('Ejercicio aun no confirmado como completado');
    return false;
}

async function dragItemToTarget(page, srcLoc, tgtLoc) {
    await srcLoc.scrollIntoViewIfNeeded({ timeout: FAST.actionTimeout }).catch(() => {});
    await tgtLoc.scrollIntoViewIfNeeded({ timeout: FAST.actionTimeout }).catch(() => {});

    const srcBox = await srcLoc.boundingBox({ timeout: FAST.actionTimeout }).catch(() => null);
    const tgtBox = await tgtLoc.boundingBox({ timeout: FAST.actionTimeout }).catch(() => null);
    if (!srcBox || !tgtBox) return false;

    try {
        await srcLoc.dragTo(tgtLoc, { timeout: 2500, force: true });
        await page.waitForTimeout(FAST.afterDrag);
        return true;
    } catch {
        // Fallback manual para componentes DnD que no aceptan dragTo().
    }

    const sx = srcBox.x + srcBox.width / 2;
    const sy = srcBox.y + srcBox.height / 2;
    const tx = tgtBox.x + tgtBox.width / 2;
    const ty = tgtBox.y + tgtBox.height / 2;

    await page.mouse.move(sx, sy);
    await page.waitForTimeout(FAST.short);
    await page.mouse.down();
    await page.waitForTimeout(FAST.short);

    const dx = tx - sx;
    const dy = ty - sy;
    const dist = Math.abs(dx) + Math.abs(dy);
    const steps = Math.min(24, Math.max(8, Math.round(dist / 12)));

    await page.mouse.move(
        sx + dx * 0.1,
        sy + dy * 0.1,
        { steps: Math.max(2, Math.round(steps * 0.1)) }
    );
    await page.mouse.move(tx, ty, { steps });
    await page.mouse.up();
    await page.waitForTimeout(FAST.afterDrag);
    return true;
}

async function waitForCheckAnswer(page) {
    const checkBtn = page.locator('#CheckAnswer');
    await page.evaluate(() => {
        window.__lastCheckAnswerSaveSeen = false;
        window.__lastCheckAnswerStateConfirmed = false;
    }).catch(() => {});
    await checkBtn.waitFor({ state: 'visible', timeout: FAST.actionTimeout });

    const possibleSave = page.waitForResponse((response) => {
        const url = response.url().toLowerCase();
        return response.status() < 500 && (
            url.includes('progress') ||
            url.includes('setprogress') ||
            url.includes('practicemanager') ||
            url.includes('checkanswer') ||
            url.includes('answer')
        );
    }, { timeout: FAST.saveTimeout }).catch(() => null);

    try {
        await checkBtn.click({ timeout: FAST.actionTimeout });
        console.log('Click en CheckAnswer');
    } catch {
        console.log('CheckAnswer no disponible, forzando...');
        await checkBtn.click({ force: true, timeout: FAST.actionTimeout });
        console.log('Click forzado en CheckAnswer');
    }

    const statePromise = page.waitForFunction(() => {
        const isVisible = (el) => {
            if (!el) return false;
            const style = window.getComputedStyle(el);
            const rect = el.getBoundingClientRect();
            return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0;
        };
        const nextBtn = document.querySelector('.tasksBtnext');
        const nextEnabled = !!nextBtn &&
            isVisible(nextBtn) &&
            !nextBtn.disabled &&
            !nextBtn.classList.contains('disabled') &&
            nextBtn.getAttribute('aria-disabled') !== 'true';
        const checkBtn = document.querySelector('#CheckAnswer');
        const checkEnabled = !!checkBtn &&
            isVisible(checkBtn) &&
            !checkBtn.disabled &&
            !checkBtn.classList.contains('disabled') &&
            checkBtn.getAttribute('aria-disabled') !== 'true';
        const hasErrors = !!document.querySelector('.incorrect, .wrong, .feedbackItem--incorrect, .has-error, .error-message, .is-wrong, .is-incorrect');
        const hasSuccess = !!document.querySelector('.feedbackItem--correct, .passed, .completed, .success, .is-correct');
        return hasErrors || hasSuccess || !checkEnabled || nextEnabled;
    }, { timeout: FAST.feedbackTimeout, polling: 100 }).catch(() => null);

    const first = await Promise.race([
        possibleSave.then(response => ({ kind: response ? 'save' : 'save-timeout' })),
        statePromise.then(() => ({ kind: 'state' })),
        page.waitForTimeout(1200).then(() => ({ kind: 'soft-timeout' }))
    ]);

    if (first.kind === 'save') {
        await page.evaluate(() => { window.__lastCheckAnswerSaveSeen = true; }).catch(() => {});
    }

    let state = await getCompletionState(page).catch(() => null);
    if (state && !state.hasErrors && state.nextEnabled) {
        if (!state.checkEnabled || state.saveSeen || state.hasSuccess) {
            await page.evaluate(() => { window.__lastCheckAnswerStateConfirmed = true; }).catch(() => {});
            return;
        }

        await page.waitForTimeout(250);
        const stable = await getCompletionState(page).catch(() => null);
        if (stable && !stable.hasErrors && stable.nextEnabled) {
            await page.evaluate(() => { window.__lastCheckAnswerStateConfirmed = true; }).catch(() => {});
            return;
        }
    }

    const saveResponse = first.kind === 'save'
        ? true
        : await Promise.race([
            possibleSave,
            page.waitForTimeout(900).then(() => null)
        ]);

    if (saveResponse && saveResponse !== true) {
        await page.evaluate(() => { window.__lastCheckAnswerSaveSeen = true; }).catch(() => {});
    }

    state = await getCompletionState(page).catch(() => null);
    if (state && !state.hasErrors && state.nextEnabled) {
        await page.evaluate(() => { window.__lastCheckAnswerStateConfirmed = true; }).catch(() => {});
    } else {
        console.log('  No se detecto guardado; estado no estable para avanzar');
    }
}

module.exports = {
    verifyCorrect,
    waitForCheckAnswer,
    dragItemToTarget,
    waitAfterSeeAnswer,
    clickSeeAnswer,
    getCompletionState,
    FAST
};

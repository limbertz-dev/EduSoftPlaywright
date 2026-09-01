const FAST = {
    short: 100,
    medium: 280,
    afterDrag: 380,
    feedbackTimeout: 10000,
    actionTimeout: 5000,
    saveTimeout: 8000
};

const TEST_CHECK_SELECTOR = [
    '#CheckAnswer',
    '#SubmitTest',
    '#SubmitAnswer',
    '#learning__tasksNav_submitTest',
    '.learning__tasksNav_testBtnW',
    'button:has-text("Check")',
    'button:has-text("Check Answer")',
    'button:has-text("Comprobar")',
    'button:has-text("Verificar")',
    'button:has-text("Submit")',
    'button:has-text("Submit Test")',
    'input[type="button"][value*="Check"]',
    'input[type="submit"][value*="Submit"]'
].join(', ');

function isTargetClosedError(error) {
    return /Target page, context or browser has been closed|Target closed|browser has been closed|context.*closed|page.*closed/i
        .test(String(error?.message || error || ''));
}

async function waitForAutomaticTestState(page, timeout = FAST.feedbackTimeout) {
    return await page.waitForFunction(() => {
        const isVisible = (el) => {
            if (!el) return false;
            const style = window.getComputedStyle(el);
            const rect = el.getBoundingClientRect();
            return style.visibility !== 'hidden' &&
                style.display !== 'none' &&
                rect.width > 0 &&
                rect.height > 0;
        };

        const hasPendingAnswers = () => {
            const clozeZones = Array.from(document.querySelectorAll('.prCLZ__regContainer .dndZone')).filter(isVisible);
            if (clozeZones.some(zone => !Array.from(zone.querySelectorAll('.dnditem[ans_id], .dnditem')).some(isVisible))) return true;

            const wordBankTargets = Array.from(document.querySelectorAll('.TTpanswerDiv.droptarget')).filter(isVisible);
            if (wordBankTargets.some(target => !Array.from(target.querySelectorAll('.wordBankTilePlaced, .wordBankTile, .draggable, [data-id]')).some(isVisible))) return true;

            return false;
        };

        const nextBtn = document.querySelector('.tasksBtnext');
        const nextEnabled = !!nextBtn &&
            isVisible(nextBtn) &&
            !nextBtn.disabled &&
            !nextBtn.classList.contains('disabled') &&
            nextBtn.getAttribute('aria-disabled') !== 'true';

        return (nextEnabled && !hasPendingAnswers()) ||
            !!document.querySelector('.incorrect, .wrong, .feedbackItem--incorrect, .has-error, .error-message, .is-wrong, .is-incorrect') ||
            !!document.querySelector('.correct, .feedbackItem--correct, .passed, .completed, .success, .is-correct');
    }, { timeout, polling: 150 });
}

async function waitForTestCheck(page) {
    const checkBtn = page.locator(TEST_CHECK_SELECTOR).first();
    await page.evaluate(() => {
        window.__lastCheckAnswerSaveSeen = false;
        window.__lastCheckAnswerStateConfirmed = false;
    }).catch(() => {});

    const mode = await checkBtn.waitFor({ state: 'visible', timeout: FAST.actionTimeout })
        .then(() => 'check')
        .catch((error) => isTargetClosedError(error) ? 'closed' : 'no-check');

    if (mode === 'closed') {
        console.log('Pagina cerrada mientras se esperaba confirmacion del test');
        return;
    }

    if (mode !== 'check') {
        console.log('No hay boton Check/Submit visible; esperando confirmacion automatica del test');
        const confirmed = await waitForAutomaticTestState(page, FAST.feedbackTimeout)
            .then(() => true)
            .catch(() => false);

        if (confirmed) {
            await page.evaluate(() => {
                window.__lastCheckAnswerStateConfirmed = true;
            }).catch(() => {});
        } else {
            console.log('  No se detecto confirmacion automatica del test');
        }
        return;
    }

    const checkInfo = await page.evaluate(() => {
        const isVisible = (el) => {
            if (!el) return false;
            const style = window.getComputedStyle(el);
            const rect = el.getBoundingClientRect();
            return style.visibility !== 'hidden' &&
                style.display !== 'none' &&
                rect.width > 0 &&
                rect.height > 0;
        };

        const check = document.querySelector('#CheckAnswer, #SubmitAnswer');
        if (isVisible(check)) return { kind: 'check', current: 0, total: 0 };

        const submit = document.querySelector('#SubmitTest, #learning__tasksNav_submitTest, .learning__tasksNav_testBtnW') ||
            Array.from(document.querySelectorAll('button, span, div')).find(el => isVisible(el) && /^submit$/i.test((el.textContent || '').trim()));

        const current = Number((document.querySelector('.learning__taskNavPCCurrentTask')?.textContent || '').trim());
        const total = Number((document.querySelector('.learning__taskNavPCTotalTasks')?.textContent || '').trim());

        return {
            kind: isVisible(submit) ? 'submit' : 'unknown',
            current: Number.isFinite(current) ? current : 0,
            total: Number.isFinite(total) ? total : 0
        };
    });

    if (checkInfo.kind === 'submit' && checkInfo.total > 0 && checkInfo.current < checkInfo.total) {
        console.log(`Submit visible pero se deja para el final (${checkInfo.current}/${checkInfo.total})`);
        await page.evaluate(() => {
            window.__lastCheckAnswerStateConfirmed = true;
        }).catch(() => {});
        return;
    }

    const possibleSave = page.waitForResponse((response) => {
        const url = response.url().toLowerCase();
        return response.status() < 500 && (
            url.includes('progress') ||
            url.includes('setprogress') ||
            url.includes('practicemanager') ||
            url.includes('checkanswer') ||
            url.includes('answer') ||
            url.includes('test')
        );
    }, { timeout: FAST.saveTimeout }).catch(() => null);

    try {
        await checkBtn.click({ timeout: FAST.actionTimeout });
        console.log('Click en boton de test');
    } catch {
        await checkBtn.click({ force: true, timeout: FAST.actionTimeout });
        console.log('Click forzado en boton de test');
    }

    const saveResponse = await Promise.race([
        possibleSave,
        page.waitForTimeout(2500).then(() => null)
    ]);
    if (saveResponse) {
        await page.evaluate(() => {
            window.__lastCheckAnswerSaveSeen = true;
        }).catch(() => {});
    }

    await page.waitForLoadState('networkidle', { timeout: 4000 }).catch(() => {});

    const state = await getTestCompletionState(page).catch(() => null);
    if (state && !state.hasErrors && state.pendingAnswers === 0 && (state.nextEnabled || state.hasSuccess || !state.checkEnabled)) {
        await page.evaluate(() => {
            window.__lastCheckAnswerStateConfirmed = true;
        }).catch(() => {});
    }
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
        // Manual fallback for older DnD widgets.
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

async function getTestCompletionState(page) {
    if (page.isClosed?.()) {
        return {
            hasErrors: false,
            hasSuccess: true,
            nextEnabled: false,
            checkEnabled: false,
            pendingAnswers: 0,
            saveSeen: false,
            stateConfirmed: true,
            closed: true
        };
    }

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
        const cleanText = (text) => (text || '').replace(/\s+/g, ' ').trim();
        const hasVisible = (selector, root = document) => Array.from(root.querySelectorAll(selector)).some(isVisible);

        const nextBtn = document.querySelector('.tasksBtnext');
        const nextEnabled = !!nextBtn &&
            isVisible(nextBtn) &&
            !nextBtn.disabled &&
            !nextBtn.classList.contains('disabled') &&
            nextBtn.getAttribute('aria-disabled') !== 'true';

        const checkBtn = document.querySelector('#CheckAnswer, #SubmitTest, #SubmitAnswer, #learning__tasksNav_submitTest, .learning__tasksNav_testBtnW') ||
            Array.from(document.querySelectorAll('button, input[type="button"], input[type="submit"], span, div')).find(el => {
                const text = cleanText(el.value || el.textContent);
                return isVisible(el) && /^(check|check answer|submit|submit test|comprobar|verificar)$/i.test(text);
            });
        const checkEnabled = !!checkBtn &&
            isVisible(checkBtn) &&
            !checkBtn.disabled &&
            !checkBtn.classList.contains('disabled') &&
            checkBtn.getAttribute('aria-disabled') !== 'true';

        const visibleRadios = Array.from(document.querySelectorAll('input[type="radio"]'))
            .filter(input => !input.disabled && (isVisible(input) || isVisible(input.closest('label, div, li, tr'))));
        const namedRadioGroups = new Map();
        const unnamedRadios = [];
        visibleRadios.forEach(input => {
            if (!input.name) {
                unnamedRadios.push(input);
                return;
            }
            if (!namedRadioGroups.has(input.name)) namedRadioGroups.set(input.name, []);
            namedRadioGroups.get(input.name).push(input);
        });
        const pendingNamedRadioGroups = Array.from(namedRadioGroups.values()).filter(group => !group.some(input => input.checked)).length;
        const pendingUnnamedRadioGroup = unnamedRadios.length > 0 && !unnamedRadios.some(input => input.checked) ? 1 : 0;
        const pendingRadioGroups = pendingNamedRadioGroups + pendingUnnamedRadioGroup;

        const visibleCheckboxes = Array.from(document.querySelectorAll('input[type="checkbox"]'))
            .filter(input => !input.disabled && (isVisible(input) || isVisible(input.closest('label, div, li, tr'))));
        const pendingCheckboxGroups = visibleCheckboxes.length > 0 && !visibleCheckboxes.some(input => input.checked) ? 1 : 0;

        const pendingTextFields = Array.from(document.querySelectorAll(
            'textarea, input[type="text"], .prOpenEnded__qaItemText--input, input.prOpenEnded__qaItemText'
        )).filter(isVisible).filter(field => !cleanText(field.value || field.getAttribute('ng-reflect-model'))).length;

        const pendingTinyMce = Array.from(document.querySelectorAll('#tinymce, [contenteditable="true"]'))
            .filter(isVisible)
            .filter(editor => !cleanText(editor.innerText || editor.textContent)).length;

        const fitbWrappers = Array.from(document.querySelectorAll('.prFITB__DDLOptionsW')).filter(isVisible);
        const pendingFitb = fitbWrappers.filter(wrapper => {
            const selected = wrapper.querySelector('.DDLOptions__selected, .DDLOptions__selectedText, [role="button"], button');
            const text = cleanText(selected?.innerText || selected?.textContent);
            return !text || /^(select|choose|selecciona|elija|--)/i.test(text);
        }).length;

        const clozeZones = Array.from(document.querySelectorAll('.prCLZ__regContainer .dndZone')).filter(isVisible);
        const pendingClozeZones = clozeZones.filter(zone => !hasVisible('.dnditem[ans_id], .dnditem', zone)).length;

        const wordBankTargets = Array.from(document.querySelectorAll('.TTpanswerDiv.droptarget')).filter(isVisible);
        const pendingWordBankTargets = wordBankTargets.filter(target => !hasVisible('.wordBankTilePlaced, .wordBankTile, .draggable, [data-id]', target)).length;

        const pendingMatchingRows = Array.from(document.querySelectorAll('.prMT_T2T__answersRow .dndZone'))
            .filter(isVisible)
            .filter(zone => !hasVisible('.dnditem[ans_id], .dnditem', zone))
            .length;

        const visibleBankItems = Array.from(document.querySelectorAll(
            '#bankContainer .dnditem[ans_id], .bankContainer .dnditem[ans_id], .wordsBankTable .draggable[data-id]'
        )).filter(isVisible).length;

        const hasErrors = !!document.querySelector(
            '.incorrect, .wrong, .feedbackItem--incorrect, .has-error, .error-message, .is-wrong, .is-incorrect'
        );

        const hasSuccess = !!document.querySelector(
            '.correct, .feedbackItem--correct, .passed, .completed, .success, .is-correct'
        );

        const saveSeen = window.__lastCheckAnswerSaveSeen === true;
        const stateConfirmed = window.__lastCheckAnswerStateConfirmed === true;

        return {
            hasErrors,
            hasSuccess,
            nextEnabled,
            checkEnabled,
            pendingAnswers: pendingRadioGroups +
                pendingCheckboxGroups +
                pendingTextFields +
                pendingTinyMce +
                pendingFitb +
                pendingClozeZones +
                pendingWordBankTargets +
                pendingMatchingRows +
                visibleBankItems,
            saveSeen,
            stateConfirmed
        };
    });
}

async function verifyTestResult(page) {
    if (page.isClosed?.()) {
        console.log('  Test verify: pagina cerrada despues de la accion de test');
        return true;
    }

    const waitResult = await waitForAutomaticTestState(page, FAST.feedbackTimeout)
        .then(() => true)
        .catch((error) => {
            if (isTargetClosedError(error)) {
                console.log('  Test verify: pagina cerrada durante la verificacion');
                return 'closed';
            }
            return false;
        });

    if (waitResult === 'closed') return true;

    let result;
    try {
        result = await getTestCompletionState(page);
    } catch (error) {
        if (isTargetClosedError(error)) {
            console.log('  Test verify: pagina cerrada al leer estado final');
            return true;
        }
        throw error;
    }

    console.log(`  Test verify: errors=${result.hasErrors} success=${result.hasSuccess} nextBtn=${result.nextEnabled} checkBtn=${result.checkEnabled} pending=${result.pendingAnswers || 0} saveSeen=${result.saveSeen} stable=${result.stateConfirmed}`);

    if (result.closed) return true;
    if (result.hasErrors) return false;
    if (result.pendingAnswers > 0) return false;
    if (result.hasSuccess || result.nextEnabled || result.saveSeen || result.stateConfirmed) return true;

    console.log('  Test aun no esta confirmado como completo');
    return false;
}

module.exports = {
    FAST,
    isTargetClosedError,
    waitForAutomaticTestState,
    waitForTestCheck,
    getTestCompletionState,
    verifyTestResult,
    dragItemToTarget
};


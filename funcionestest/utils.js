const FAST = {
    short: 180,
    medium: 500,
    feedbackTimeout: 12000,
    actionTimeout: 7000,
    saveTimeout: 10000
};

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

        const nextBtn = document.querySelector('.tasksBtnext');
        const nextEnabled = !!nextBtn &&
            isVisible(nextBtn) &&
            !nextBtn.disabled &&
            !nextBtn.classList.contains('disabled') &&
            nextBtn.getAttribute('aria-disabled') !== 'true';

        return nextEnabled ||
            !!document.querySelector('.incorrect, .wrong, .feedbackItem--incorrect, .has-error, .error-message, .is-wrong, .is-incorrect') ||
            !!document.querySelector('.correct, .feedbackItem--correct, .passed, .completed, .success, .is-correct');
    }, { timeout, polling: 150 });
}

async function waitForTestCheck(page) {
    const checkBtn = page.locator(
        '#CheckAnswer, #SubmitTest, #SubmitAnswer, button:has-text("Check"), button:has-text("Submit")'
    ).first();

    const mode = await Promise.race([
        checkBtn.waitFor({ state: 'visible', timeout: FAST.actionTimeout })
            .then(() => 'check')
            .catch((error) => isTargetClosedError(error) ? 'closed' : 'no-check'),
        waitForAutomaticTestState(page, FAST.feedbackTimeout)
            .then(() => 'auto')
            .catch((error) => isTargetClosedError(error) ? 'closed' : 'no-auto')
    ]);

    if (mode === 'closed') {
        console.log('Pagina cerrada mientras se esperaba confirmacion del test');
        return;
    }

    if (mode === 'auto') {
        console.log('Test confirmado automaticamente sin boton Check/Submit');
        return;
    }

    if (mode !== 'check') {
        console.log('No hay boton Check/Submit visible; esperando confirmacion automatica del test');
        await waitForAutomaticTestState(page, FAST.feedbackTimeout).catch(() => null);
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

    await Promise.race([
        possibleSave,
        page.waitForTimeout(2500).then(() => null)
    ]);

    await page.waitForLoadState('networkidle', { timeout: 4000 }).catch(() => {});
}

async function dragItemToTarget(page, srcLoc, tgtLoc) {
    const srcBox = await srcLoc.boundingBox();
    const tgtBox = await tgtLoc.boundingBox();
    if (!srcBox || !tgtBox) return false;

    try {
        await srcLoc.dragTo(tgtLoc, { timeout: 2500, force: true });
        await page.waitForTimeout(600);
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
    await page.mouse.move(tx, ty, { steps: 18 });
    await page.mouse.up();
    await page.waitForTimeout(600);
    return true;
}

async function getTestCompletionState(page) {
    if (page.isClosed?.()) {
        return { hasErrors: false, hasSuccess: true, nextEnabled: false, checkEnabled: false, closed: true };
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

        const nextBtn = document.querySelector('.tasksBtnext');
        const nextEnabled = !!nextBtn &&
            isVisible(nextBtn) &&
            !nextBtn.disabled &&
            !nextBtn.classList.contains('disabled') &&
            nextBtn.getAttribute('aria-disabled') !== 'true';

        const checkBtn = document.querySelector('#CheckAnswer, #SubmitTest, #SubmitAnswer') ||
            Array.from(document.querySelectorAll('button')).find(button => /^(check|submit)$/i.test((button.textContent || '').trim()));
        const checkEnabled = !!checkBtn &&
            isVisible(checkBtn) &&
            !checkBtn.disabled &&
            !checkBtn.classList.contains('disabled') &&
            checkBtn.getAttribute('aria-disabled') !== 'true';

        const hasErrors = !!document.querySelector(
            '.incorrect, .wrong, .feedbackItem--incorrect, .has-error, .error-message, .is-wrong, .is-incorrect'
        );

        const hasSuccess = !!document.querySelector(
            '.correct, .feedbackItem--correct, .passed, .completed, .success, .is-correct'
        );

        return { hasErrors, hasSuccess, nextEnabled, checkEnabled };
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

    console.log(`  Test verify: errors=${result.hasErrors} success=${result.hasSuccess} nextBtn=${result.nextEnabled} checkBtn=${result.checkEnabled}`);

    if (result.closed) return true;
    if (result.hasErrors) return false;
    return result.nextEnabled || result.hasSuccess;
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

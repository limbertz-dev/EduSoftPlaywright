async function verifyCorrect(page) {
    try {
        await page.waitForFunction(() => {
            const hasFeedback = !!document.querySelector(
                '.feedbackItem, .resultFeedback, .question-feedback, .exercise-feedback, ' +
                '.correct, .incorrect, .wrong, .passed, .completed, .success, ' +
                '.feedbackItem--correct, .feedbackItem--incorrect, ' +
                '.is-correct, .is-wrong, .is-incorrect, .has-error'
            );
            const taskBtnextVisible = !!document.querySelector('.tasksBtnext:not(.disabled)');
            return hasFeedback || taskBtnextVisible;
        }, { timeout: 15000, polling: 500 });
    } catch {
        console.log('  ⚠ Timeout esperando retroalimentación, verificando estado actual...');
    }

    const result = await page.evaluate(() => {
        const hasErrors = !!document.querySelector(
            '.incorrect, .wrong, .feedbackItem--incorrect, ' +
            '.prMT_T2T__answersRow .wrong, .prMT_T2T__answersRow .incorrect, ' +
            '.prCl__container--normal .wrong, .prCl__container--normal .incorrect, ' +
            '.prCLZ__regContainer .wrong, .prCLZ__regContainer .incorrect, ' +
            '.prFITB__DDLOptionsW .wrong, .prFITB__DDLOptionsW .incorrect, ' +
            '.has-error, .ng-invalid, .error-message, ' +
            '.is-wrong, .is-incorrect'
        );
        const hasSuccess = !!document.querySelector(
            '.correct, .feedbackItem--correct, .passed, .completed, .success, .is-correct'
        );
        const taskBtnextVisible = !!document.querySelector('.tasksBtnext:not(.disabled)');
        return { hasErrors, hasSuccess, taskBtnextVisible };
    });

    console.log(`  Verify: errors=${result.hasErrors} success=${result.hasSuccess} nextBtn=${result.taskBtnextVisible}`);

    if (result.hasSuccess || result.taskBtnextVisible) {
        console.log('✓ Ejercicio completado correctamente');
        return true;
    }
    if (result.hasErrors) {
        console.log('⚠ Se detectaron errores en las respuestas');
        return false;
    }

    console.log('✓ Ejercicio procesado (sin retroalimentación visible)');
    return true;
}

async function dragItemToTarget(page, srcLoc, tgtLoc) {
    const srcBox = await srcLoc.boundingBox();
    const tgtBox = await tgtLoc.boundingBox();
    if (!srcBox || !tgtBox) return false;

    const sx = srcBox.x + srcBox.width / 2;
    const sy = srcBox.y + srcBox.height / 2;
    const tx = tgtBox.x + tgtBox.width / 2;
    const ty = tgtBox.y + tgtBox.height / 2;

    await page.mouse.move(sx, sy);
    await page.waitForTimeout(80);
    await page.mouse.down();
    await page.waitForTimeout(150);

    const dx = tx - sx;
    const dy = ty - sy;
    const dist = Math.abs(dx) + Math.abs(dy);
    const steps = Math.min(60, Math.max(15, Math.round(dist / 5)));

    await page.mouse.move(
        sx + dx * 0.1,
        sy + dy * 0.1,
        { steps: Math.max(3, Math.round(steps * 0.1)) }
    );
    await page.waitForTimeout(50);

    await page.mouse.move(tx, ty, { steps });
    await page.waitForTimeout(80);

    await page.mouse.up();
    await page.waitForTimeout(800);
    return true;
}

async function waitForCheckAnswer(page) {
    const checkBtn = page.locator('#CheckAnswer');
    await checkBtn.waitFor({ state: 'visible', timeout: 10000 });
    try {
        await checkBtn.waitFor({ state: 'attached', timeout: 5000 });
        await page.waitForTimeout(300);
        await checkBtn.click();
        console.log('✓ Click en CheckAnswer');
    } catch {
        console.log('⚠ CheckAnswer no disponible, forzando...');
        await checkBtn.click({ force: true });
        console.log('✓ Click forzado en CheckAnswer');
    }
}

module.exports = { verifyCorrect, waitForCheckAnswer, dragItemToTarget };
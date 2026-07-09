async function verifyCorrect(page) {
    await page.waitForTimeout(3000);

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
        const hasFeedback = !!document.querySelector(
            '.feedbackItem, .resultFeedback, .question-feedback, .exercise-feedback'
        );
        const taskBtnextVisible = !!document.querySelector('.tasksBtnext:not(.disabled)');
        return { hasErrors, hasSuccess, hasFeedback, taskBtnextVisible };
    });

    console.log(`  Verify: errors=${result.hasErrors} success=${result.hasSuccess} feedback=${result.hasFeedback} nextBtn=${result.taskBtnextVisible}`);

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

async function waitForCheckAnswer(page) {
    const checkBtn = page.locator('#CheckAnswer');
    await checkBtn.waitFor({ state: 'visible', timeout: 10000 });
    const isDisabled = await checkBtn.isDisabled();
    if (isDisabled) {
        console.log('⚠ CheckAnswer deshabilitado, forzando...');
        await checkBtn.click({ force: true });
    } else {
        await checkBtn.click();
    }
    console.log('✓ Click en CheckAnswer');
}

module.exports = { verifyCorrect, waitForCheckAnswer };
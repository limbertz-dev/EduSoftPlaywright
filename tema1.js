const { chromium, login, goHome, clickLesson, clickFirstStatus, clickText, clickPlayButton, spamNext, scrollToTop } = require('./utils.js');

async function runTema1() {
    console.log('=== INICIANDO TEMA 1 ===');

    const browser = await chromium.launch({ headless: false });
    const page = await browser.newPage();

    try {
        console.log('\n=== Login ===');
        const loginSuccess = await login(page);
        if (!loginSuccess) {
            console.log('✗ Login falló');
            return;
        }
        await page.waitForTimeout(3000);

        console.log('\n=== Nick and Emily ===');
        await clickFirstStatus(page);
        await clickLesson(page, 'Nick and Emily');
        await page.waitForTimeout(2000);
        await spamNext(page, 11);
        await goHome(page);

        console.log('\n=== A New Acquaintance ===');
        await clickFirstStatus(page);
        await clickLesson(page, 'A New Acquaintance');
        await page.waitForTimeout(2000);
        await spamNext(page, 9);
        await goHome(page);

        console.log('\n=== Click en "1" y "Completed!" ===');
        await clickText(page, '1', true);
        await clickText(page, '1', true);
        await clickText(page, 'Completed!');
        await page.waitForTimeout(2000);

        console.log('\n=== Divorced ===');
        await scrollToTop(page);
        await clickLesson(page, 'Divorced');
        await page.waitForTimeout(2000);
        await spamNext(page, 10);
        await goHome(page);

        console.log('\n=== Past Form of Modals: Should/Could Have ===');
        await clickFirstStatus(page);
        await clickLesson(page, 'Past Form of Modals');
        await page.waitForTimeout(2000);
        await spamNext(page, 1);
        await clickPlayButton(page);
        await spamNext(page, 13);
        await goHome(page);

        console.log('\n=== Relationships 2 ===');
        await clickFirstStatus(page);
        await clickLesson(page, 'Relationships 2');
        await page.waitForTimeout(2000);
        await spamNext(page, 9);
        await goHome(page);

        console.log('\n✓ TEMA 1 COMPLETADO EXITOSAMENTE');

    } catch (error) {
        console.error('✗ Error en Tema 1:', error.message);
    } finally {
        await page.waitForTimeout(3000);
        await browser.close();
        console.log('=== NAVEGADOR CERRADO ===');
    }
}

if (require.main === module) {
    runTema1().catch(console.error);
}

module.exports = { runTema1 };

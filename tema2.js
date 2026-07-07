const { chromium, login, goHome, clickLesson, clickText, clickPlayButton, spamNext, scrollToTop } = require('./utils.js');

async function runTema2() {
    console.log('=== INICIANDO TEMA 2 ===');

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

        console.log('\n=== Sport And Fitness > College Sports ===');
        await clickText(page, 'Sport And Fitness', true);
        await page.waitForTimeout(3000);
        await clickLesson(page, 'College Sports');
        await spamNext(page, 10);
        await goHome(page);

        console.log('\n=== Sport And Fitness > Health and Fitness Today ===');
        await page.waitForTimeout(2000);
        await clickLesson(page, 'Health and Fitness Today');
        await spamNext(page, 10);
        await goHome(page);

        console.log('\n=== Unidad 2 > Ten Miles ===');
        await clickText(page, '2', true);
        await page.waitForTimeout(2000);
        await clickLesson(page, 'Ten Miles');
        await spamNext(page, 10);
        await goHome(page);

        console.log('\n=== Unidad 2 > More Conditionals: Past Conditionals ===');
        await clickText(page, '2', true);
        await page.waitForTimeout(2000);
        await clickLesson(page, 'More Conditionals: Past Conditionals');
        await spamNext(page, 10);
        await goHome(page);

        console.log('\n=== Sport And Fitness > Unidad 2 ===');
        await clickText(page, 'Sport And Fitness', true);
        await page.waitForTimeout(2000);
        await clickText(page, '2', true);
        await goHome(page);

        console.log('\n=== Unidad 2 > Sports 2 ===');
        await clickText(page, '2', true);
        await page.waitForTimeout(2000);
        await clickLesson(page, 'Sports 2');
        await spamNext(page, 10);
        await goHome(page);

        console.log('\n✓ TEMA 2 COMPLETADO EXITOSAMENTE');

    } catch (error) {
        console.error('✗ Error en Tema 2:', error.message);
    } finally {
        await page.waitForTimeout(3000);
        await browser.close();
        console.log('=== NAVEGADOR CERRADO ===');
    }
}

if (require.main === module) {
    runTema2().catch(console.error);
}

module.exports = { runTema2 };

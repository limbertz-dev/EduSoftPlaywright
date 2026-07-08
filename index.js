const { chromium } = require('playwright');
const { login } = require('./login.js');
const { solveSeleccionUnica } = require('./funciones/SeleccionUnica.js');

(async () => {
    console.log('=== SCRIPT INICIADO ===\n');

    const browser = await chromium.launch({ headless: false });
    const page = await browser.newPage();

    try {
        await login(page);

        console.log('=== LISTO ===');
        console.log('Navega manualmente a Practice Step 2.\n');

        while (true) {
            try {
                await page.waitForTimeout(2000);

                const url = page.url();
                if (!url.includes('learningArea')) {
                    continue;
                }

                const hasRadio = await page.$('input[type="radio"]');
                const hasSeeAnswer = await page.$('#SeeAnswer');

                if (hasRadio && hasSeeAnswer) {
                    console.log('📌 Detectado: Seleccion Unica');
                    await solveSeleccionUnica(page);
                    await page.waitForTimeout(1500);

                    const nextBtn = await page.$('.tasksBtnext');
                    if (nextBtn) {
                        await nextBtn.click();
                        console.log('📌 Avanzando...');
                        await page.waitForTimeout(2000);

                        const stillLearning = page.url().includes('learningArea');
                        if (!stillLearning) {
                            console.log('🏠 Step completado, yendo a Home...');
                            try {
                                await page.getByRole('link', { name: 'Home' }).click();
                            } catch {
                                await page.locator('.sitemenu__itemHome--learningArea a').click();
                            }
                            await page.waitForTimeout(2000);
                            console.log('✅ En Home. Navega manualmente.\n');
                        }
                    }
                }
            } catch (e) {
                if (e.message.includes('closed') || e.message.includes('Target')) break;
                await page.waitForTimeout(2000);
            }
        }
    } catch (error) {
        console.error('Error:', error.message);
    }
})();

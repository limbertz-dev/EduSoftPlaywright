const { chromium } = require('playwright');
const { login } = require('./login.js');
const { solveMCQ } = require('./funciones/MCQ.js');
const { solveOpenEnded } = require('./funciones/OpenEnded.js');
const { solveClassification } = require('./funciones/Classification.js');
const { solveMatching } = require('./funciones/Matching.js');
const { solveFITB } = require('./funciones/FITB.js');
const { solveCloze } = require('./funciones/Cloze.js');
const { solveTinyMCE } = require('./funciones/TinyMCE.js');

const MAX_RETRIES = 3;

async function solveWithRetry(page, solveFn, exerciseName) {
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            if (attempt > 1) {
                console.log(`🔄 Reintento ${attempt}/${MAX_RETRIES} para ${exerciseName}`);
                await page.waitForTimeout(1500);
            }
            const ok = await solveFn(page);
            if (ok) return true;
            console.log(`⚠ ${exerciseName} devolvió false (intento ${attempt})`);
        } catch (e) {
            console.log(`⚠ ${exerciseName} error (intento ${attempt}): ${e.message}`);
        }
        await page.waitForTimeout(2000);
    }
    console.log(`✗ ${exerciseName} falló después de ${MAX_RETRIES} intentos`);
    return false;
}

(async () => {
    console.log('=== SCRIPT INICIADO ===\n');

    const browser = await chromium.launch({
        headless: false,
        args: ['--start-maximized']
    });
    const page = await browser.newPage({ viewport: null });

    page.on('console', msg => {
        if (msg.type() === 'error') {
            console.log(`[PAGE ERROR] ${msg.text()}`);
        }
    });

    page.on('request', req => {
        const url = req.url();
        if (url.includes('/api/') && (url.includes('Progress') || url.includes('practiceManager') || url.includes('SetProgress'))) {
            console.log(`[API] ${req.method()} ${url}`);
        }
    });

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

                const exerciseInfo = await page.evaluate(() => {
                    const body = document.body;
                    let type = null;
                    if (body.classList.contains('learning__main--openEnded')) type = 'openEnded';
                    else if (body.classList.contains('learning__main--MCQ') || document.querySelector('input[type="radio"], input[type="checkbox"]')) type = 'mcq';
                    else if (document.querySelector('.prCl__main.classification')) type = 'classification';
                    else if (document.querySelector('.prMT_T2T__main')) type = 'matching';
                    else if (document.querySelector('.prFITB__main')) type = 'fitb';
                    else if (document.querySelector('.prCLZ__main')) type = 'cloze';
                    else if (document.querySelector('#SeeAnswer') && document.querySelector('iframe[id^="mce_"], #tinymce, .tox-tinymce')) type = 'tinymce';

                    const hasCheckAnswer = !!document.querySelector('#CheckAnswer');
                    const hasSeeAnswer = !!document.querySelector('#SeeAnswer');
                    const btnText = document.querySelector('.tasksBtnext')?.textContent?.trim() || '';
                    return { type, hasCheckAnswer, hasSeeAnswer, btnText };
                });

                if (!exerciseInfo.type) {
                    continue;
                }

                const nameMap = {
                    mcq: 'MCQ', openEnded: 'OpenEnded', classification: 'Classification',
                    matching: 'Matching', fitb: 'FITB', cloze: 'Cloze', tinymce: 'TinyMCE'
                };
                const exerciseName = nameMap[exerciseInfo.type] || exerciseInfo.type;
                console.log(`📌 Detectado: ${exerciseName}`);

                const solveMap = {
                    mcq: solveMCQ, openEnded: solveOpenEnded, classification: solveClassification,
                    matching: solveMatching, fitb: solveFITB, cloze: solveCloze, tinymce: solveTinyMCE
                };

                const ok = await solveWithRetry(page, solveMap[exerciseInfo.type], exerciseName);
                if (!ok) {
                    console.log(`⚠ Continuando a pesar de fallo en ${exerciseName}`);
                }

                await page.waitForTimeout(2000);

                const nextBtn = page.locator('.tasksBtnext');
                try {
                    await nextBtn.waitFor({ state: 'visible', timeout: 15000 });
                    const isDisabled = await nextBtn.isDisabled();
                    if (isDisabled) {
                        console.log('⚠ tasksBtnext deshabilitado, esperando...');
                        await page.waitForTimeout(5000);
                    }
                    await nextBtn.click();
                    console.log('📌 Avanzando...');
                    await page.waitForTimeout(3000);
                } catch {
                    console.log('⚠ No se encontró tasksBtnext');
                }

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
            } catch (e) {
                if (e.message.includes('closed') || e.message.includes('Target')) break;
                console.log('⚠ Error en loop:', e.message);
                await page.waitForTimeout(2000);
            }
        }
    } catch (error) {
        console.error('Error:', error.message);
    }
})();
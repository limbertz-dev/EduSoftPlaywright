const { verifyCorrect, waitForCheckAnswer } = require('./utils.js');

async function solveOpenEnded(page) {
    try {
        console.log('📌 Resolviendo Open Ended (Dictado)');

        await page.waitForSelector('#SeeAnswer', { timeout: 10000 });
        await page.click('#SeeAnswer');
        await page.waitForTimeout(1500);

        const answers = await page.evaluate(() => {
            const textareas = document.querySelectorAll('.prOpenEnded__qaItemText--textarea, textarea');
            const result = [];
            textareas.forEach((ta, i) => {
                const val = ta.value || ta.getAttribute('ng-reflect-model') || '';
                if (val.trim()) {
                    result.push(val.trim());
                }
            });
            return result;
        });

        if (answers.length === 0) {
            console.log('⚠ No se encontraron respuestas');
            await page.click('#SeeAnswer');
            return false;
        }

        console.log(`✓ Leidas ${answers.length} respuesta(s)`);
        answers.forEach((a, i) => console.log(`  ${i + 1}: "${a.substring(0, 50)}..."`));

        await page.click('#SeeAnswer');
        await page.waitForTimeout(1000);

        const textareas = await page.$$('.prOpenEnded__qaItemText--textarea, textarea');
        for (let i = 0; i < Math.min(textareas.length, answers.length); i++) {
            const ta = textareas[i];
            try {
                await ta.click();
                await ta.fill('');
                await ta.fill(answers[i]);
                console.log(`  ✓ Escrito ${i + 1}`);
                await page.waitForTimeout(300);
            } catch (e) {
                console.log(`  ⚠ Error escribiendo ${i + 1}: ${e.message}`);
                try {
                    await page.evaluate(({ index, text }) => {
                        const tas = document.querySelectorAll('.prOpenEnded__qaItemText--textarea, textarea');
                        if (tas[index]) {
                            const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
                                window.HTMLTextAreaElement.prototype, 'value'
                            ).set;
                            nativeInputValueSetter.call(tas[index], text);
                            tas[index].dispatchEvent(new Event('input', { bubbles: true }));
                        }
                    }, { index: i, text: answers[i] });
                    console.log(`  ✓ Escrito ${i + 1} (vía native setter)`);
                } catch (e2) {
                    console.log(`  ✗ Error en ${i + 1}: ${e2.message}`);
                }
            }
        }

        await page.waitForTimeout(500);

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

        return await verifyCorrect(page);
    } catch (e) {
        console.log('✗ Error en Open Ended:', e.message);
        return false;
    }
}

module.exports = { solveOpenEnded };
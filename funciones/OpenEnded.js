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
        await page.waitForTimeout(1500);

        const textareas = page.locator('.prOpenEnded__qaItemText--textarea, textarea');
        const taCount = await textareas.count();
        let written = 0;

        for (let i = 0; i < Math.min(taCount, answers.length); i++) {
            const ta = textareas.nth(i);
            try {
                await ta.evaluate(el => el.removeAttribute('disabled'));
                await ta.click();
                await page.waitForTimeout(300);
                await page.keyboard.press('Control+a');
                await page.waitForTimeout(100);
                await page.keyboard.press('Delete');
                await page.waitForTimeout(200);
                await page.keyboard.type(answers[i], { delay: 10 });
                written++;
                console.log(`  ✓ Escrito ${i + 1}`);
                await page.waitForTimeout(500);
            } catch (e) {
                console.log(`  ⚠ Error ${i + 1}: ${e.message}`);
            }
        }

        if (written === 0) {
            console.log('⚠ No se pudo escribir ninguna respuesta');
            return false;
        }

        console.log(`✓ Escritas ${written} respuesta(s)`);
        await page.waitForTimeout(1500);

        await waitForCheckAnswer(page);
        return await verifyCorrect(page);
    } catch (e) {
        console.log('✗ Error en Open Ended:', e.message);
        return false;
    }
}

module.exports = { solveOpenEnded };
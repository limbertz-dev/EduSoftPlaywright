async function solveSeleccionUnica(page) {
    try {
        console.log('📌 Resolviendo Selección Única');

        await page.waitForSelector('#SeeAnswer', { timeout: 10000 });

        // 1. Mostrar respuestas correctas
        await page.click('#SeeAnswer');
        await page.waitForTimeout(1000);

        // 2. Obtener todas las respuestas correctas y sus textos
        let correctHandles = await page.$$('.multiRadio.correct');
        const correctTexts = [];

        if (correctHandles.length > 0) {
            console.log(`✓ Detectadas ${correctHandles.length} respuesta(s) correcta(s)`);
            for (const handle of correctHandles) {
                const text = await handle.textContent();
                correctTexts.push(text ? text.trim() : '');
                console.log(`  → "${correctTexts[correctTexts.length - 1]}"`);
            }
        } else {
            // Fallback: radio checked
            const checkedRadio = await page.$('input[type="radio"]:checked');
            if (checkedRadio) {
                const radioId = await checkedRadio.getAttribute('id');
                if (radioId) {
                    const label = await page.$(`label[for="${radioId}"]`);
                    const text = label ? await label.textContent() : '';
                    if (text) {
                        correctTexts.push(text.trim());
                        console.log(`✓ Respuesta correcta: "${text.trim()}"`);
                    }
                }
            }
        }

        if (correctTexts.length === 0) {
            console.log('⚠ No se pudo detectar la respuesta correcta');
            await page.click('#SeeAnswer');
            return false;
        }

        // 3. Ocultar SeeAnswer
        await page.click('#SeeAnswer');
        await page.waitForTimeout(800);

        // 4. Seleccionar cada respuesta correcta por su texto
        for (let i = 0; i < correctTexts.length; i++) {
            try {
                console.log(`📌 Seleccionando pregunta ${i + 1}: "${correctTexts[i]}"`);
                await page.locator(`text="${correctTexts[i]}"`).first().click();
                await page.waitForTimeout(600);
            } catch (e) {
                console.log(`⚠ Error en pregunta ${i + 1}, intentando con radio...`);
                try {
                    await page.getByRole('radio', { name: correctTexts[i] }).check();
                    await page.waitForTimeout(600);
                } catch (e2) {
                    console.log(`⚠ No se pudo seleccionar pregunta ${i + 1}: ${e2.message}`);
                }
            }
        }

        // 5. Click CheckAnswer
        await page.waitForSelector('#CheckAnswer', { timeout: 10000 });
        await page.click('#CheckAnswer');
        console.log('✓ Click en CheckAnswer');
        await page.waitForTimeout(1500);

        return true;
    } catch (e) {
        console.log('✗ Error en Selección Única:', e.message);
        return false;
    }
}

module.exports = { solveSeleccionUnica };

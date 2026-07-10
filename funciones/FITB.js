const { verifyCorrect, waitForCheckAnswer } = require('./utils.js');

async function solveFITB(page) {
    try {
        console.log('📌 Resolviendo FITB (Fill In The Blanks)');

        await page.waitForSelector('#SeeAnswer', { timeout: 10000 });
        await page.click('#SeeAnswer');
        await page.waitForTimeout(1500);

        const answers = await page.evaluate(() => {
            const wrappers = document.querySelectorAll('.prFITB__DDLOptionsW');
            const result = [];
            wrappers.forEach((w, idx) => {
                const selected = w.querySelector('.DDLOptions__selected');
                const id = selected?.id || '';
                const match = id.match(/aid_(\d+)$/);
                if (match) {
                    result.push({ index: idx, aid: match[1] });
                }
            });
            return result;
        });

        if (answers.length === 0) {
            console.log('⚠ No se detectaron respuestas');
            await page.click('#SeeAnswer');
            return false;
        }

        console.log(`✓ Detectadas ${answers.length} respuesta(s):`);
        answers.forEach(a => console.log(`  ${a.index}: aid_${a.aid}`));

        await page.click('#SeeAnswer');
        await page.waitForTimeout(1500);

        for (const ans of answers) {
            try {
                const listNum = ans.index + 1;
                const wrapperSel = `#prFITB__DDLOptionsW_Q1_L${listNum}`;
                const optId = `DDLOptions__listItem_aid_${ans.aid}`;

                const opened = await page.evaluate((sel) => {
                    const wrapper = document.querySelector(sel);
                    if (!wrapper) return false;
                    const selected = wrapper.querySelector('.DDLOptions__selected');
                    if (selected) {
                        selected.click();
                        return true;
                    }
                    return false;
                }, wrapperSel);

                if (!opened) {
                    console.log(`⚠ No se pudo abrir dropdown para aid_${ans.aid}`);
                    continue;
                }

                await page.waitForTimeout(800);

                const option = page.locator(`#${optId}`);
                const optCount = await option.count();
                if (optCount === 0) {
                    console.log(`⚠ No se encontró opción aid_${ans.aid}`);
                    continue;
                }
                await option.click();
                await page.waitForTimeout(600);
                console.log(`  ✓ Seleccionado aid_${ans.aid}`);
            } catch (e) {
                console.log(`⚠ Error seleccionando opción ${ans.index}: aid_${ans.aid} — ${e.message}`);
            }
        }

        await waitForCheckAnswer(page);
        return await verifyCorrect(page);
    } catch (e) {
        console.log('✗ Error en FITB:', e.message);
        return false;
    }
}

module.exports = { solveFITB };
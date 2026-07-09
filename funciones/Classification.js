const { verifyCorrect, waitForCheckAnswer } = require('./utils.js');

async function solveClassification(page) {
    try {
        console.log('📌 Resolviendo Classification (Arrastrar)');

        await page.waitForSelector('#SeeAnswer', { timeout: 10000 });
        await page.click('#SeeAnswer');
        await page.waitForTimeout(1500);

        const mapping = await page.evaluate(() => {
            const containers = document.querySelectorAll('.prCl__container--normal');
            const result = [];
            containers.forEach((c, idx) => {
                const title = c.querySelector('.containerHeader')?.textContent?.trim() || `Container ${idx}`;
                const items = c.querySelectorAll('.dndZone .dnditem');
                const itemTexts = [];
                items.forEach(item => {
                    const text = item.textContent?.trim();
                    const id = item.getAttribute('ans_id');
                    if (text) itemTexts.push({ text, id });
                });
                if (itemTexts.length > 0) {
                    result.push({ containerIdx: idx, title, items: itemTexts });
                }
            });
            return result;
        });

        if (mapping.length === 0) {
            console.log('⚠ No se detectaron items clasificados');
            await page.click('#SeeAnswer');
            return false;
        }

        console.log(`✓ Detectados ${mapping.length} grupo(s) con items:`);
        mapping.forEach(g => {
            console.log(`  ${g.title}:`);
            g.items.forEach(item => console.log(`    - ${item.text}`));
        });

        await page.click('#SeeAnswer');
        await page.waitForTimeout(1000);

        const bankZone = page.locator('.bankContainer .dndZone');
        let moved = 0;

        for (const g of mapping) {
            for (const item of g.items) {
                if (!item.id) continue;
                const sourceEl = bankZone.locator('ed-la-dnditem').filter({
                    has: page.locator(`.dnditem[ans_id="${item.id}"]`)
                });
                const targetZone = page.locator('.prCl__container--normal .dndZone').nth(g.containerIdx);

                const srcBox = await sourceEl.boundingBox();
                const tgtBox = await targetZone.boundingBox();

                if (!srcBox || !tgtBox) continue;

                const sx = srcBox.x + srcBox.width / 2;
                const sy = srcBox.y + srcBox.height / 2;
                const tx = tgtBox.x + tgtBox.width / 2;
                const ty = tgtBox.y + tgtBox.height / 2;

                await page.mouse.move(sx, sy);
                await page.waitForTimeout(200);
                await page.mouse.down();
                await page.waitForTimeout(300);
                await page.mouse.move(tx, ty, { steps: 25 });
                await page.waitForTimeout(200);
                await page.mouse.up();
                await page.waitForTimeout(800);
                moved++;
            }
        }

        console.log(`✓ Movidos ${moved} item(s) a sus contenedores`);
        await page.waitForTimeout(1000);

        await waitForCheckAnswer(page);
        return await verifyCorrect(page);
    } catch (e) {
        console.log('✗ Error en Classification:', e.message);
        return false;
    }
}

module.exports = { solveClassification };
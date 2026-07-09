const { verifyCorrect, waitForCheckAnswer } = require('./utils.js');

async function solveMatching(page) {
    try {
        console.log('📌 Resolviendo Matching (Emparejar)');

        await page.waitForSelector('#SeeAnswer', { timeout: 10000 });
        await page.click('#SeeAnswer');
        await page.waitForTimeout(1500);

        const mapping = await page.evaluate(() => {
            const rows = document.querySelectorAll('.prMT_T2T__answersRow');
            const result = [];
            rows.forEach((row, idx) => {
                const zone = row.querySelector('.dndZone');
                if (!zone) return;
                const items = zone.querySelectorAll('.dnditem');
                const itemIds = [];
                items.forEach(item => {
                    const id = item.getAttribute('ans_id');
                    if (id) itemIds.push(id);
                });
                if (itemIds.length > 0) {
                    result.push({ rowIdx: idx, itemIds });
                }
            });
            return result;
        });

        if (mapping.length === 0) {
            console.log('⚠ No se detectaron items emparejados');
            await page.click('#SeeAnswer');
            return false;
        }

        console.log(`✓ Detectados ${mapping.length} fila(s) con items:`);
        mapping.forEach(m => {
            console.log(`  Fila ${m.rowIdx}: ids [${m.itemIds.join(', ')}]`);
        });

        await page.click('#SeeAnswer');
        await page.waitForTimeout(1000);

        const bankContainer = page.locator('#bankContainer');
        let moved = 0;

        for (const m of mapping) {
            for (const id of m.itemIds) {
                const sourceItem = bankContainer.locator('ed-la-dnditem').filter({
                    has: page.locator(`.dnditem[ans_id="${id}"]`)
                });
                const count = await sourceItem.count();
                if (count === 0) {
                    console.log(`⚠ Item ${id} no encontrado en banco`);
                    continue;
                }

                const targetZone = page.locator('.prMT_T2T__answersRow .dndZone').nth(m.rowIdx);

                const srcBox = await sourceItem.boundingBox();
                const tgtBox = await targetZone.boundingBox();
                if (!srcBox || !tgtBox) {
                    console.log(`⚠ No boundingBox para item ${id}`);
                    continue;
                }

                const sx = srcBox.x + srcBox.width / 2;
                const sy = srcBox.y + srcBox.height / 2;
                const tx = tgtBox.x + tgtBox.width / 2;
                const ty = tgtBox.y + tgtBox.height / 2;

                await page.mouse.move(sx, sy);
                await page.waitForTimeout(100);
                await page.mouse.down();
                await page.waitForTimeout(200);
                const steps = Math.max(10, Math.round(Math.abs(tx - sx + ty - sy) / 10));
                await page.mouse.move(tx, ty, { steps });
                await page.waitForTimeout(100);
                await page.mouse.up();
                await page.waitForTimeout(1000);

                moved++;
                console.log(`  ✓ Item ${id} → fila ${m.rowIdx}`);
            }
        }

        console.log(`✓ Movidos ${moved} item(s) a sus filas`);
        await page.waitForTimeout(1500);

        await waitForCheckAnswer(page);
        return await verifyCorrect(page);
    } catch (e) {
        console.log('✗ Error en Matching:', e.message);
        return false;
    }
}

module.exports = { solveMatching };
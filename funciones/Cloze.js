const { verifyCorrect, waitForCheckAnswer } = require('./utils.js');

async function solveCloze(page) {
    try {
        console.log('📌 Resolviendo Cloze (Completar texto)');

        await page.waitForSelector('#SeeAnswer', { timeout: 10000 });
        await page.click('#SeeAnswer');
        await page.waitForTimeout(1500);

        const mapping = await page.evaluate(() => {
            const zones = document.querySelectorAll('.prCLZ__regContainer .dndZone');
            const result = [];
            zones.forEach((zone, idx) => {
                const items = zone.querySelectorAll('.dnditem');
                const itemIds = [];
                items.forEach(item => {
                    const id = item.getAttribute('ans_id');
                    if (id) itemIds.push(id);
                });
                if (itemIds.length > 0) {
                    result.push({ zoneIdx: idx, itemIds });
                }
            });
            return result;
        });

        if (mapping.length === 0) {
            const fallback = await page.evaluate(() => {
                const banks = document.querySelectorAll('#bankContainer ed-la-dnditem .dnditem');
                const zones = document.querySelectorAll('.prCLZ__regContainer .dndZone');
                const result = [];
                const zoneMap = {};
                zones.forEach((z, i) => zoneMap[i] = []);

                banks.forEach(item => {
                    const id = item.getAttribute('ans_id');
                    if (id) {
                        const zoneIdx = parseInt(id) % zones.length;
                        zoneMap[zoneIdx] = zoneMap[zoneIdx] || [];
                        zoneMap[zoneIdx].push(id);
                    }
                });

                Object.keys(zoneMap).forEach(k => {
                    const idx = parseInt(k);
                    if (zoneMap[k].length > 0) {
                        result.push({ zoneIdx: idx, itemIds: zoneMap[k] });
                    }
                });
                return result;
            });

            if (fallback.length === 0) {
                console.log('⚠ No se detectaron respuestas');
                await page.click('#SeeAnswer');
                return false;
            }
            console.log('⚠ Usando fallback de asignación secuencial');
            mapping.push(...fallback);
        }

        console.log(`✓ Detectados ${mapping.length} espacio(s) con items:`);
        mapping.forEach(m => {
            console.log(`  Espacio ${m.zoneIdx}: ids [${m.itemIds.join(', ')}]`);
        });

        await page.click('#SeeAnswer');
        await page.waitForTimeout(1000);

        let moved = 0;

        for (const m of mapping) {
            for (const id of m.itemIds) {
                const itemLoc = page.locator('#bankContainer ed-la-dnditem').filter({
                    has: page.locator(`.dnditem[ans_id="${id}"]`)
                });
                const count = await itemLoc.count();
                if (count === 0) {
                    console.log(`⚠ Item ${id} no encontrado en banco`);
                    continue;
                }

                const targetZone = page.locator('.prCLZ__regContainer .dndZone').nth(m.zoneIdx);

                const srcBox = await itemLoc.boundingBox();
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
                console.log(`  ✓ Item ${id} → espacio ${m.zoneIdx}`);
            }
        }

        console.log(`✓ Movidos ${moved} item(s) a sus espacios`);
        await page.waitForTimeout(1500);

        await waitForCheckAnswer(page);
        return await verifyCorrect(page);
    } catch (e) {
        console.log('✗ Error en Cloze:', e.message);
        return false;
    }
}

module.exports = { solveCloze };
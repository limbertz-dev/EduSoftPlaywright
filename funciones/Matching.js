const { verifyCorrect, waitForCheckAnswer, dragItemToTarget, waitAfterSeeAnswer, clickSeeAnswer, FAST } = require('./utils.js');

async function solveMatching(page) {
    try {
        console.log('Resolviendo Matching (Emparejar)');

        await clickSeeAnswer(page);
        await waitAfterSeeAnswer(page);

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
            console.log('No se detectaron items emparejados');
            await clickSeeAnswer(page);
            return false;
        }

        console.log(`Detectadas ${mapping.length} fila(s) con items`);

        await clickSeeAnswer(page);
        await page.waitForTimeout(FAST.medium);

        const bankContainer = page.locator('#bankContainer');
        let moved = 0;

        async function dragItemWithRetry(id, rowIdx, maxRetries = 3) {
            for (let attempt = 1; attempt <= maxRetries; attempt++) {
                const sourceItem = bankContainer.locator('ed-la-dnditem').filter({
                    has: page.locator(`.dnditem[ans_id="${id}"]`)
                }).first();
                const count = await sourceItem.count();
                if (count === 0) {
                    const alreadyArrived = await page.evaluate(({ id, rowIdx }) => {
                        const row = document.querySelectorAll('.prMT_T2T__answersRow')[rowIdx];
                        return !!row?.querySelector(`.dndZone .dnditem[ans_id="${id}"]`);
                    }, { id, rowIdx });
                    return alreadyArrived;
                }

                const targetZone = page.locator('.prMT_T2T__answersRow .dndZone').nth(rowIdx);
                const ok = await dragItemToTarget(page, sourceItem, targetZone);
                if (!ok) {
                    console.log(`No se pudo mover item ${id} (intento ${attempt})`);
                    await page.waitForTimeout(FAST.short);
                    continue;
                }

                const arrived = await page.evaluate(({ id, rowIdx }) => {
                    const row = document.querySelectorAll('.prMT_T2T__answersRow')[rowIdx];
                    return !!row?.querySelector(`.dndZone .dnditem[ans_id="${id}"]`);
                }, { id, rowIdx });

                if (arrived) return true;
                console.log(`Item ${id} no llego a fila ${rowIdx} (intento ${attempt})`);
                await page.waitForTimeout(FAST.short);
            }
            return false;
        }

        for (const m of mapping) {
            for (const id of m.itemIds) {
                const ok = await dragItemWithRetry(id, m.rowIdx);
                if (!ok) {
                    console.log(`Item ${id} no quedo en la fila ${m.rowIdx}`);
                    continue;
                }

                moved++;
                console.log(`  Item ${id} -> fila ${m.rowIdx}`);
            }
        }

        console.log(`Movidos ${moved} item(s) a sus filas`);
        const missing = await page.evaluate((mapping) => {
            const rows = document.querySelectorAll('.prMT_T2T__answersRow');
            const missingItems = [];
            mapping.forEach(m => {
                const row = rows[m.rowIdx];
                m.itemIds.forEach(id => {
                    if (!row?.querySelector(`.dndZone .dnditem[ans_id="${id}"]`)) {
                        missingItems.push({ rowIdx: m.rowIdx, id });
                    }
                });
            });
            return missingItems;
        }, mapping);

        if (missing.length > 0) {
            console.log(`Faltan ${missing.length} item(s) en Matching; no se enviara CheckAnswer`);
            return false;
        }

        await page.waitForTimeout(FAST.medium);

        await waitForCheckAnswer(page);
        return await verifyCorrect(page);
    } catch (e) {
        console.log('Error en Matching:', e.message);
        return false;
    }
}

module.exports = { solveMatching };

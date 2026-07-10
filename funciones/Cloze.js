const { verifyCorrect, waitForCheckAnswer } = require('./utils.js');

async function dragItemToTarget(page, srcLoc, tgtLoc) {
    const srcBox = await srcLoc.boundingBox();
    const tgtBox = await tgtLoc.boundingBox();
    if (!srcBox || !tgtBox) return false;

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
    return true;
}

async function solveWordsBankCloze(page) {
    console.log('📌 Resolviendo Words Bank Cloze (con imagen/texto)');

    await page.click('#SeeAnswer');
    await page.waitForTimeout(1500);

    const mapping = await page.evaluate(() => {
        const targets = document.querySelectorAll('.TTpanswerDiv.droptarget');
        const result = [];
        targets.forEach((target, idx) => {
            const ans = target.getAttribute('ans');
            if (ans && ans.trim() !== '') {
                result.push({ zoneIdx: idx, itemId: ans.trim() });
            }
        });
        return result;
    });

    if (mapping.length === 0) {
        console.log('⚠ No se detectaron respuestas via ans, intentando mapeo por texto...');
        const textMapping = await page.evaluate(() => {
            const targets = document.querySelectorAll('.TTpanswerDiv.droptarget');
            const words = document.querySelectorAll('.draggable.wordBankTile');
            const wordMap = {};
            words.forEach(w => {
                const id = w.getAttribute('data-id');
                const text = w.textContent.trim();
                if (id) wordMap[text] = id;
            });
            const result = [];
            targets.forEach((target, idx) => {
                const text = target.textContent.trim();
                if (text && wordMap[text]) {
                    result.push({ zoneIdx: idx, itemId: wordMap[text] });
                }
            });
            return result;
        });
        if (textMapping.length > 0) {
            mapping.push(...textMapping);
            console.log(`  ✓ Mapeo por texto: ${textMapping.length} coincidencias`);
        }
    }

    if (mapping.length === 0) {
        console.log('⚠ No se pudo determinar el mapeo de respuestas');
        await page.click('#SeeAnswer');
        return false;
    }

    console.log(`✓ Detectados ${mapping.length} espacio(s):`);
    mapping.forEach(m => {
        console.log(`  Espacio ${m.zoneIdx} -> itemId ${m.itemId}`);
    });

    await page.click('#SeeAnswer');
    await page.waitForTimeout(1000);

    let moved = 0;
    for (const m of mapping) {
        const srcLoc = page.locator(`.draggable.wordBankTile[data-id="${m.itemId}"]`).first();
        const tgtLoc = page.locator('.TTpanswerDiv.droptarget').nth(m.zoneIdx);

        const ok = await dragItemToTarget(page, srcLoc, tgtLoc);
        if (ok) {
            moved++;
            console.log(`  ✓ Item ${m.itemId} → espacio ${m.zoneIdx}`);
        } else {
            console.log(`⚠ No se pudo mover item ${m.itemId} → espacio ${m.zoneIdx}`);
        }
    }

    console.log(`✓ Movidos ${moved} item(s)`);
    await page.waitForTimeout(1500);

    await waitForCheckAnswer(page);
    return await verifyCorrect(page);
}

async function solveStandardCloze(page) {
    console.log('📌 Resolviendo Cloze estándar (Completar texto)');

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

            const ok = await dragItemToTarget(page, itemLoc.first(), targetZone);
            if (ok) {
                moved++;
                console.log(`  ✓ Item ${id} → espacio ${m.zoneIdx}`);
            }
        }
    }

    console.log(`✓ Movidos ${moved} item(s) a sus espacios`);
    await page.waitForTimeout(1000);

    const misplaced = await page.evaluate((mapping) => {
        const zones = document.querySelectorAll('.prCLZ__regContainer .dndZone');
        const missing = [];
        mapping.forEach((m, idx) => {
            const item = zones[idx]?.querySelector('.dnditem');
            const id = item?.getAttribute('ans_id');
            if (id !== m.itemIds[0]) {
                missing.push({ zoneIdx: idx, itemId: m.itemIds[0] });
            }
        });
        return missing;
    }, mapping);

    if (misplaced.length > 0) {
        console.log(`⚠ ${misplaced.length} item(s) mal ubicados, corrigiendo...`);
        for (const m of misplaced) {
            const itemLoc = page.locator('#bankContainer ed-la-dnditem').filter({
                has: page.locator(`.dnditem[ans_id="${m.itemId}"]`)
            });
            const count = await itemLoc.count();
            if (count === 0) continue;

            const targetZone = page.locator('.prCLZ__regContainer .dndZone').nth(m.zoneIdx);
            const ok = await dragItemToTarget(page, itemLoc.first(), targetZone);
            if (ok) {
                console.log(`  ✓ Re-corregido item ${m.itemId} → espacio ${m.zoneIdx}`);
            }
        }
    }

    await page.waitForTimeout(1500);

    await waitForCheckAnswer(page);
    return await verifyCorrect(page);
}

async function solveCloze(page) {
    try {
        await page.waitForSelector('#SeeAnswer', { timeout: 10000 });

        const variant = await page.evaluate(() => {
            if (document.querySelector('.wordsBankTable') || document.querySelector('.TTpanswerDiv')) return 'wordsbank';
            if (document.querySelector('.prCLZ__regContainer')) return 'standard';
            return null;
        });

        if (variant === 'wordsbank') {
            return await solveWordsBankCloze(page);
        } else if (variant === 'standard') {
            return await solveStandardCloze(page);
        } else {
            console.log('⚠ No se reconoció variante de Cloze');
            return false;
        }
    } catch (e) {
        console.log('✗ Error en Cloze:', e.message);
        return false;
    }
}

module.exports = { solveCloze };
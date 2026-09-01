const { verifyCorrect, waitForCheckAnswer, dragItemToTarget, waitAfterSeeAnswer, clickSeeAnswer, FAST } = require('./utils.js');

async function solveTextToPicture(page) {
    try {
        console.log('Resolviendo TextToPicture (Texto a imagen)');

        let mapping = await extractMappingFromImageNames(page);

        if (mapping.length === 0) {
            await clickSeeAnswer(page);
            await waitAfterSeeAnswer(page);
            mapping = await extractMappingFromPlacedAnswers(page);

            if (mapping.length === 0) {
                console.log('No se detecto mapeo Texto a imagen');
                await clickSeeAnswer(page).catch(() => {});
                return false;
            }

            await clickSeeAnswer(page);
            await page.waitForTimeout(FAST.medium);
        }

        console.log(`Detectadas ${mapping.length} imagen(es) destino`);

        let moved = 0;
        for (const item of mapping) {
            const ok = await dragTextItemWithRetry(page, item.itemId, item.targetIdx);
            if (!ok) {
                console.log(`  Item ${item.itemId} no quedo en imagen ${item.targetIdx}`);
                continue;
            }

            moved++;
            console.log(`  Item ${item.itemId} -> imagen ${item.targetIdx}`);
        }

        console.log(`Movidos ${moved} item(s) a sus imagenes`);

        const missing = await page.evaluate((mapping) => {
            const targets = document.querySelectorAll('.textToPic__answers .prTextToPic__container--reg .dndZone');
            const missingItems = [];

            mapping.forEach(item => {
                const zone = targets[item.targetIdx];
                if (!zone?.querySelector(`.dnditem[ans_id="${item.itemId}"]`)) {
                    missingItems.push(item);
                }
            });

            return missingItems;
        }, mapping);

        if (missing.length > 0) {
            console.log(`TextToPicture incompleto: faltan ${missing.length} item(s)`);
            return false;
        }

        await page.waitForTimeout(FAST.medium);
        await waitForCheckAnswer(page);
        return await verifyCorrect(page);
    } catch (e) {
        console.log('Error en TextToPicture:', e.message);
        return false;
    }
}

async function extractMappingFromImageNames(page) {
    return await page.evaluate(() => {
        const readAnswerId = (el) => {
            const chunks = [];
            let cur = el;

            while (cur && chunks.length < 4) {
                const style = window.getComputedStyle(cur);
                chunks.push(style.backgroundImage || '');
                chunks.push(cur.getAttribute('style') || '');
                cur = cur.parentElement;
            }

            const source = chunks.join(' ');
            const match = source.match(/g(\d+)\.(?:jpg|jpeg|png|gif|webp)/i);
            return match?.[1] || '';
        };

        return Array.from(document.querySelectorAll('.textToPic__answers .prTextToPic__container--reg'))
            .map((container, targetIdx) => {
                const zone = container.querySelector('.dndZone');
                const itemId = readAnswerId(zone || container);
                return itemId ? { targetIdx, itemId } : null;
            })
            .filter(Boolean);
    });
}

async function extractMappingFromPlacedAnswers(page) {
    return await page.evaluate(() => {
        return Array.from(document.querySelectorAll('.textToPic__answers .prTextToPic__container--reg'))
            .map((container, targetIdx) => {
                const item = container.querySelector('.dndZone .dnditem[ans_id]');
                const itemId = item?.getAttribute('ans_id') || '';
                return itemId ? { targetIdx, itemId } : null;
            })
            .filter(Boolean);
    });
}

async function dragTextItemWithRetry(page, itemId, targetIdx, maxRetries = 3) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        const arrived = await isItemInTarget(page, itemId, targetIdx);
        if (arrived) return true;

        const source = await findTextItemSource(page, itemId);
        if (!source) {
            console.log(`  Item ${itemId} no encontrado (intento ${attempt})`);
            return false;
        }

        const targetZone = page.locator('.textToPic__answers .prTextToPic__container--reg .dndZone').nth(targetIdx);
        const ok = await dragItemToTarget(page, source, targetZone);
        if (!ok) {
            console.log(`  No se pudo mover item ${itemId} (intento ${attempt})`);
            await page.waitForTimeout(FAST.short);
            continue;
        }

        if (await isItemInTarget(page, itemId, targetIdx)) return true;
        console.log(`  Item ${itemId} no llego a imagen ${targetIdx} (intento ${attempt})`);
        await page.waitForTimeout(FAST.short);
    }

    return false;
}

async function findTextItemSource(page, itemId) {
    const bankItem = page.locator('#bankContainer ed-la-dnditem').filter({
        has: page.locator(`.dnditem[ans_id="${itemId}"]`)
    }).first();

    if (await bankItem.count() > 0) return bankItem;

    const placedItem = page.locator('.textToPic__answers ed-la-dnditem').filter({
        has: page.locator(`.dnditem[ans_id="${itemId}"]`)
    }).first();

    if (await placedItem.count() > 0) return placedItem;

    const directItem = page.locator(`.dnditem.draggable[ans_id="${itemId}"]`).first();
    if (await directItem.count() > 0) return directItem;

    return null;
}

async function isItemInTarget(page, itemId, targetIdx) {
    return await page.evaluate(({ itemId, targetIdx }) => {
        const zone = document.querySelectorAll('.textToPic__answers .prTextToPic__container--reg .dndZone')[targetIdx];
        return !!zone?.querySelector(`.dnditem[ans_id="${itemId}"]`);
    }, { itemId, targetIdx });
}

module.exports = { solveTextToPicture };

const { verifyCorrect, waitForCheckAnswer, dragItemToTarget, waitAfterSeeAnswer, clickSeeAnswer, FAST } = require('./utils.js');

async function solveClassification(page) {
    try {
        console.log('Resolviendo Classification (Arrastrar)');

        await clickSeeAnswer(page);
        await waitAfterSeeAnswer(page);

        const mapping = await extractRevealedClassificationMapping(page);
        if (mapping.length === 0) {
            console.log('No se detectaron items clasificados');
            await clickSeeAnswer(page).catch(() => {});
            return false;
        }

        console.log(`Detectados ${mapping.length} grupo(s) con items:`);
        mapping.forEach(group => {
            console.log(`  ${group.title}:`);
            group.items.forEach(item => console.log(`    - ${item.text}`));
        });

        await clickSeeAnswer(page);
        await page.waitForTimeout(FAST.medium);

        let moved = 0;
        for (const group of mapping) {
            for (const item of group.items) {
                if (!item.id) continue;

                const ok = await dragClassificationItemWithRetry(page, item.id, group.containerIdx, 3);
                if (ok) {
                    moved++;
                    console.log(`  Item ${item.id} (${item.text}) -> contenedor ${group.containerIdx}`);
                } else {
                    console.log(`  No se pudo colocar item ${item.id} (${item.text})`);
                }
            }
        }

        console.log(`Movidos/confirmados ${moved} item(s) a sus contenedores`);
        await page.waitForTimeout(FAST.medium);

        const finalMissing = await getClassificationMissingItems(page, mapping);
        if (finalMissing.length > 0) {
            console.log(`Classification incompleto: faltan ${finalMissing.length} item(s)`);
            return false;
        }

        await waitForCheckAnswer(page);
        return await verifyCorrect(page);
    } catch (e) {
        console.log('Error en Classification:', e.message);
        return false;
    }
}

async function extractRevealedClassificationMapping(page) {
    return await page.evaluate(() => {
        const clean = (text) => (text || '').replace(/\s+/g, ' ').trim();
        const containers = Array.from(document.querySelectorAll('.prCl__container--normal'));

        return containers.map((container, idx) => {
            const title = clean(container.querySelector('.containerHeader')?.textContent) || `Container ${idx}`;
            const items = Array.from(container.querySelectorAll('.dndZone .dnditem[ans_id]'))
                .map(item => ({
                    text: clean(item.textContent),
                    id: item.getAttribute('ans_id') || ''
                }))
                .filter(item => item.text && item.id);

            return { containerIdx: idx, title, items };
        }).filter(group => group.items.length > 0);
    });
}

async function dragClassificationItemWithRetry(page, itemId, containerIdx, maxRetries) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        if (await isClassificationItemInTarget(page, itemId, containerIdx)) {
            return true;
        }

        const srcLoc = await findClassificationItemSource(page, itemId);
        if (!srcLoc) {
            console.log(`  Item ${itemId} no tiene fuente visible (intento ${attempt})`);
            await page.waitForTimeout(FAST.short);
            continue;
        }

        const tgtZone = page.locator('.prCl__container--normal .dndZone').nth(containerIdx);
        const ok = await dragItemToTarget(page, srcLoc, tgtZone);
        if (!ok) {
            console.log(`  Drag fallo para item ${itemId} (intento ${attempt})`);
            await page.waitForTimeout(FAST.short);
            continue;
        }

        if (await isClassificationItemInTarget(page, itemId, containerIdx)) {
            return true;
        }

        console.log(`  Item ${itemId} no llego al destino (intento ${attempt})`);
        await page.waitForTimeout(FAST.short);
    }

    return await isClassificationItemInTarget(page, itemId, containerIdx);
}

async function findClassificationItemSource(page, itemId) {
    const inner = `.dnditem[ans_id="${itemId}"]`;
    const candidates = [
        page.locator('#bankContainer ed-la-dnditem').filter({ has: page.locator(inner) }).first(),
        page.locator('.bankContainer ed-la-dnditem').filter({ has: page.locator(inner) }).first(),
        page.locator(`#bankContainer ${inner}`).first(),
        page.locator(`.bankContainer ${inner}`).first(),
        page.locator('.prCl__container--normal .dndZone ed-la-dnditem').filter({ has: page.locator(inner) }).first(),
        page.locator(`.prCl__container--normal .dndZone ${inner}`).first()
    ];

    for (const locator of candidates) {
        const count = await locator.count().catch(() => 0);
        if (count === 0) continue;

        await locator.scrollIntoViewIfNeeded({ timeout: FAST.actionTimeout }).catch(() => {});
        const box = await locator.boundingBox({ timeout: 1000 }).catch(() => null);
        if (box) return locator;
    }

    return null;
}

async function isClassificationItemInTarget(page, itemId, containerIdx) {
    return await page.evaluate(({ itemId, containerIdx }) => {
        const container = document.querySelectorAll('.prCl__container--normal')[containerIdx];
        const zone = container?.querySelector('.dndZone');
        return !!zone?.querySelector(`.dnditem[ans_id="${itemId}"]`);
    }, { itemId, containerIdx });
}

async function getClassificationMissingItems(page, mapping) {
    return await page.evaluate((mapping) => {
        const containers = document.querySelectorAll('.prCl__container--normal');
        const missing = [];

        mapping.forEach(group => {
            const container = containers[group.containerIdx];
            const zone = container?.querySelector('.dndZone');
            group.items.forEach(item => {
                if (item.id && !zone?.querySelector(`.dnditem[ans_id="${item.id}"]`)) {
                    missing.push({ containerIdx: group.containerIdx, id: item.id });
                }
            });
        });

        return missing;
    }, mapping);
}

module.exports = { solveClassification };
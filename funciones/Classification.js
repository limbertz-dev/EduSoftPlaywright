const { verifyCorrect, waitForCheckAnswer, dragItemToTarget } = require('./utils.js');

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
        await page.waitForTimeout(1200);

        async function dragItemWithRetry(itemId, containerIdx, maxRetries) {
            for (let attempt = 1; attempt <= maxRetries; attempt++) {
                const srcLoc = page.locator(
                    `.bankContainer .dnditem.draggable[ans_id="${itemId}"]`
                ).first();
                const count = await srcLoc.count();
                if (count === 0) {
                    console.log(`  ⚠ Item ${itemId} no está en banco (intento ${attempt})`);
                    return false;
                }

                const tgtZone = page.locator('.prCl__container--normal .dndZone').nth(containerIdx);
                const ok = await dragItemToTarget(page, srcLoc, tgtZone);
                if (!ok) {
                    console.log(`  ⚠ Drag falló para item ${itemId} (intento ${attempt})`);
                    await page.waitForTimeout(500);
                    continue;
                }

                const arrived = await page.evaluate(({ itemId, containerIdx }) => {
                    const container = document.querySelectorAll('.prCl__container--normal')[containerIdx];
                    if (!container) return false;
                    const zone = container.querySelector('.dndZone');
                    return zone?.querySelector(`.dnditem[ans_id="${itemId}"]`) !== null;
                }, { itemId, containerIdx });

                if (arrived) return true;

                console.log(`  ⚠ Item ${itemId} no llegó al destino (intento ${attempt})`);
                await page.waitForTimeout(500);
            }
            return false;
        }

        let moved = 0;
        for (const g of mapping) {
            for (const item of g.items) {
                if (!item.id) continue;
                const ok = await dragItemWithRetry(item.id, g.containerIdx, 2);
                if (ok) {
                    moved++;
                    console.log(`  ✓ Item ${item.id} (${item.text}) → contenedor ${g.containerIdx}`);
                }
            }
        }

        console.log(`✓ Movidos ${moved} item(s) a sus contenedores`);
        await page.waitForTimeout(800);

        const corrections = await page.evaluate((mapping) => {
            const containers = document.querySelectorAll('.prCl__container--normal');
            const state = [];
            mapping.forEach(g => {
                const container = containers[g.containerIdx];
                if (!container) return;
                const zone = container.querySelector('.dndZone');
                if (!zone) return;
                const currentIds = new Set();
                zone.querySelectorAll('.dnditem[ans_id]').forEach(el => {
                    const id = el.getAttribute('ans_id');
                    if (id) currentIds.add(id);
                });
                const expectedIds = new Set(g.items.map(i => i.id).filter(Boolean));
                const missing = [...expectedIds].filter(id => !currentIds.has(id));
                if (missing.length > 0) {
                    state.push({ containerIdx: g.containerIdx, itemIds: missing });
                }
            });
            return state;
        }, mapping);

        if (corrections.length > 0) {
            console.log(`⚠ ${corrections.reduce((s, c) => s + c.itemIds.length, 0)} item(s) faltantes, corrigiendo...`);

            for (const fix of corrections) {
                for (const itemId of fix.itemIds) {
                    if (!itemId) continue;

                    const stillInBank = await page.locator(
                        `.bankContainer .dnditem.draggable[ans_id="${itemId}"]`
                    ).count();

                    if (stillInBank > 0) {
                        const ok = await dragItemWithRetry(itemId, fix.containerIdx, 2);
                        if (ok) {
                            moved++;
                            console.log(`  ✓ Corregido: item ${itemId} → contenedor ${fix.containerIdx}`);
                        }
                        continue;
                    }

                    const srcContainerIdx = await page.evaluate((itemId) => {
                        const containers = document.querySelectorAll('.prCl__container--normal');
                        for (let i = 0; i < containers.length; i++) {
                            const zone = containers[i]?.querySelector('.dndZone');
                            if (zone?.querySelector(`.dnditem[ans_id="${itemId}"]`)) return i;
                        }
                        return -1;
                    }, itemId);

                    if (srcContainerIdx === -1) continue;

                    const srcItem = page.locator(
                        `.prCl__container--normal .dndZone .dnditem.draggable[ans_id="${itemId}"]`
                    ).first();
                    const tgtZone = page.locator('.prCl__container--normal .dndZone').nth(fix.containerIdx);

                    const ok = await dragItemToTarget(page, srcItem, tgtZone);
                    if (ok) {
                        const arrived = await page.evaluate(({ itemId, containerIdx }) => {
                            const container = document.querySelectorAll('.prCl__container--normal')[containerIdx];
                            const zone = container?.querySelector('.dndZone');
                            return zone?.querySelector(`.dnditem[ans_id="${itemId}"]`) !== null;
                        }, { itemId, containerIdx: fix.containerIdx });

                        if (arrived) {
                            moved++;
                            console.log(`  ✓ Swap: item ${itemId} → contenedor ${fix.containerIdx}`);
                        }
                    }
                }
            }
        }

        await page.waitForTimeout(1500);

        await waitForCheckAnswer(page);
        return await verifyCorrect(page);
    } catch (e) {
        console.log('✗ Error en Classification:', e.message);
        return false;
    }
}

module.exports = { solveClassification };
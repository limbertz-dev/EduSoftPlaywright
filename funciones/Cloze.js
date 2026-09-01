const { verifyCorrect, waitForCheckAnswer, dragItemToTarget, waitAfterSeeAnswer, clickSeeAnswer, FAST } = require('./utils.js');

async function solveWordsBankCloze(page) {
    console.log('📌 Resolviendo Words Bank Cloze (con imagen/texto)');

    await clickSeeAnswer(page);
    await waitAfterSeeAnswer(page);

    const mapping = await page.evaluate(() => {
        const isVisible = (el) => {
            if (!el) return false;
            const style = window.getComputedStyle(el);
            const rect = el.getBoundingClientRect();
            return style.visibility !== 'hidden' &&
                style.display !== 'none' &&
                rect.width > 0 &&
                rect.height > 0;
        };

        const targets = document.querySelectorAll('.TTpanswerDiv.droptarget');
        const result = [];
        targets.forEach((target, idx) => {
            if (!isVisible(target)) return;
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
            const isVisible = (el) => {
                if (!el) return false;
                const style = window.getComputedStyle(el);
                const rect = el.getBoundingClientRect();
                return style.visibility !== 'hidden' &&
                    style.display !== 'none' &&
                    rect.width > 0 &&
                    rect.height > 0;
            };

            const targets = document.querySelectorAll('.TTpanswerDiv.droptarget');
            const words = document.querySelectorAll('.wordsBankTable .draggable[data-id]');
            const wordMap = {};
            words.forEach(w => {
                if (!isVisible(w)) return;
                const id = w.getAttribute('data-id');
                const text = w.textContent.trim();
                if (id) wordMap[text] = id;
            });
            const result = [];
            targets.forEach((target, idx) => {
                if (!isVisible(target)) return;
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
        await clickSeeAnswer(page);
        return false;
    }

    console.log(`✓ Detectados ${mapping.length} espacio(s):`);
    mapping.forEach(m => {
        console.log(`  Espacio ${m.zoneIdx} -> itemId ${m.itemId}`);
    });

    await clickSeeAnswer(page);
    await page.waitForTimeout(FAST.medium);

    async function isWordInTarget(itemId, targetIdx) {
        return await page.evaluate(({ itemId, targetIdx }) => {
            const isVisible = (el) => {
                if (!el) return false;
                const style = window.getComputedStyle(el);
                const rect = el.getBoundingClientRect();
                return style.visibility !== 'hidden' &&
                    style.display !== 'none' &&
                    rect.width > 0 &&
                    rect.height > 0;
            };

            const overlaps = (a, b) => {
                const horizontal = Math.min(a.right, b.right) - Math.max(a.left, b.left);
                const vertical = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
                return horizontal > 0 && vertical > 0;
            };

            const target = document.querySelectorAll('.TTpanswerDiv.droptarget')[targetIdx];
            if (!isVisible(target)) return false;

            if (target.querySelector(`.draggable[data-id="${CSS.escape(itemId)}"]`)) return true;

            const targetRect = target.getBoundingClientRect();
            const expandedTarget = {
                left: targetRect.left - 8,
                right: targetRect.right + 8,
                top: targetRect.top - 8,
                bottom: targetRect.bottom + 8
            };

            return Array.from(document.querySelectorAll(`.draggable[data-id="${CSS.escape(itemId)}"]`))
                .filter(isVisible)
                .some(item => {
                    const itemRect = item.getBoundingClientRect();
                    const centerX = itemRect.left + itemRect.width / 2;
                    const centerY = itemRect.top + itemRect.height / 2;
                    const centerInside = centerX >= expandedTarget.left &&
                        centerX <= expandedTarget.right &&
                        centerY >= expandedTarget.top &&
                        centerY <= expandedTarget.bottom;

                    return centerInside || overlaps(itemRect, expandedTarget);
                });
        }, { itemId, targetIdx });
    }

    async function dragWordWithRetry(itemId, targetIdx, maxRetries) {
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            const srcLoc = page.locator(`.wordsBankTable .draggable[data-id="${itemId}"]`).first();
            const count = await srcLoc.count();
            if (count === 0) {
                console.log(`  ⚠ Item ${itemId} no está en banco (intento ${attempt})`);
                return false;
            }

            const tgtLoc = page.locator('.TTpanswerDiv.droptarget').nth(targetIdx);
            const ok = await dragItemToTarget(page, srcLoc, tgtLoc);
            if (!ok) {
                console.log(`  ⚠ Drag falló para item ${itemId} (intento ${attempt})`);
                await page.waitForTimeout(FAST.short);
                continue;
            }

            const arrived = await isWordInTarget(itemId, targetIdx);

            if (arrived) return true;

            console.log(`  ⚠ Item ${itemId} no llegó al destino (intento ${attempt})`);
            await page.waitForTimeout(FAST.short);
        }
        return false;
    }

    let moved = 0;
    for (const m of mapping) {
        const ok = await dragWordWithRetry(m.itemId, m.zoneIdx, 2);
        if (ok) {
            moved++;
            console.log(`  ✓ Item ${m.itemId} → espacio ${m.zoneIdx}`);
        } else {
            console.log(`⚠ No se pudo mover item ${m.itemId} → espacio ${m.zoneIdx}`);
        }
    }

    console.log(`✓ Movidos ${moved} item(s)`);
    const missingWords = [];
    for (const m of mapping) {
        if (!await isWordInTarget(m.itemId, m.zoneIdx)) {
            missingWords.push(m);
        }
    }

    if (missingWords.length > 0) {
        console.log(`Words Bank Cloze incompleto: faltan ${missingWords.length} item(s)`);
        return false;
    }

    await page.waitForTimeout(FAST.medium);

    await waitForCheckAnswer(page);
    return await verifyCorrect(page);
}

async function solveStandardCloze(page) {
    console.log('📌 Resolviendo Cloze estándar (Completar texto)');

    await clickSeeAnswer(page);
    await waitAfterSeeAnswer(page);

    const mapping = await page.evaluate(() => {
        const isVisible = (el) => {
            if (!el) return false;
            const style = window.getComputedStyle(el);
            const rect = el.getBoundingClientRect();
            return style.visibility !== 'hidden' &&
                style.display !== 'none' &&
                rect.width > 0 &&
                rect.height > 0;
        };

        const zones = document.querySelectorAll('.prCLZ__regContainer .dndZone');
        const result = [];
        zones.forEach((zone, idx) => {
            if (!isVisible(zone)) return;
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
            const isVisible = (el) => {
                if (!el) return false;
                const style = window.getComputedStyle(el);
                const rect = el.getBoundingClientRect();
                return style.visibility !== 'hidden' &&
                    style.display !== 'none' &&
                    rect.width > 0 &&
                    rect.height > 0;
            };

            const bankItems = Array.from(document.querySelectorAll('#bankContainer .dnditem.draggable[ans_id]')).filter(isVisible);
            const zones = document.querySelectorAll('.prCLZ__regContainer .dndZone');
            const zoneMap = {};
            zones.forEach((z, i) => {
                if (isVisible(z)) zoneMap[i] = [];
            });
            bankItems.forEach((item, i) => {
                const id = item.getAttribute('ans_id');
                const targetZoneIdx = Object.keys(zoneMap).map(Number)[i];
                if (id && targetZoneIdx !== undefined) {
                    zoneMap[targetZoneIdx].push(id);
                }
            });
            const result = [];
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
            await clickSeeAnswer(page);
            return false;
        }
        console.log('⚠ Usando fallback por orden en banco');
        mapping.push(...fallback);
    }

    console.log(`✓ Detectados ${mapping.length} espacio(s) con items:`);
    mapping.forEach(m => {
        console.log(`  Espacio ${m.zoneIdx}: ids [${m.itemIds.join(', ')}]`);
    });

    await clickSeeAnswer(page);
    await page.waitForTimeout(FAST.medium);

    async function dragItemWithRetry(id, targetIdx, maxRetries) {
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            const srcLoc = page.locator(`#bankContainer .dnditem.draggable[ans_id="${id}"]`).first();
            const count = await srcLoc.count();
            if (count === 0) {
                console.log(`  ⚠ Item ${id} no está en banco (intento ${attempt})`);
                return false;
            }

            const targetZone = page.locator('.prCLZ__regContainer .dndZone').nth(targetIdx);
            const ok = await dragItemToTarget(page, srcLoc, targetZone);
            if (!ok) {
                console.log(`  ⚠ Drag falló para item ${id} (intento ${attempt})`);
                await page.waitForTimeout(FAST.short);
                continue;
            }

            const arrived = await page.evaluate(({ id, targetIdx }) => {
                const zone = document.querySelectorAll('.prCLZ__regContainer .dndZone')[targetIdx];
                return zone?.querySelector(`.dnditem[ans_id="${id}"]`) !== null;
            }, { id, targetIdx });

            if (arrived) return true;

            console.log(`  ⚠ Item ${id} no llegó al destino (intento ${attempt})`);
            await page.waitForTimeout(FAST.short);
        }
        return false;
    }

    let moved = 0;

    for (const m of mapping) {
        for (const id of m.itemIds) {
            const ok = await dragItemWithRetry(id, m.zoneIdx, 2);
            if (ok) {
                moved++;
                console.log(`  ✓ Item ${id} → espacio ${m.zoneIdx}`);
            }
        }
    }

    console.log(`✓ Movidos ${moved} item(s) a sus espacios`);
    await page.waitForTimeout(FAST.medium);

    const corrections = await page.evaluate((mapping) => {
        const zones = document.querySelectorAll('.prCLZ__regContainer .dndZone');
        const state = [];

        mapping.forEach((m) => {
            const zone = zones[m.zoneIdx];
            if (!zone) return;
            const currentItem = zone.querySelector('.dnditem');
            const currentId = currentItem?.getAttribute('ans_id') || null;
            const targetId = m.itemIds[0] || null;
            state.push({ zoneIdx: m.zoneIdx, currentId, targetId });
        });

        return state;
    }, mapping);

    const needFix = corrections.filter(c => c.currentId !== c.targetId);

    if (needFix.length > 0) {
        console.log(`⚠ ${needFix.length} zona(s) con items incorrectos, corrigiendo...`);

        for (const fix of needFix) {
            const targetId = fix.targetId;
            if (!targetId) continue;

            const stillInBank = await page.locator(
                `#bankContainer .dnditem.draggable[ans_id="${targetId}"]`
            ).count();

            if (stillInBank > 0) {
                const ok = await dragItemWithRetry(targetId, fix.zoneIdx, 2);
                if (ok) console.log(`  ✓ Corregido: item ${targetId} → espacio ${fix.zoneIdx}`);
                continue;
            }

            const srcZone = await page.evaluate((targetId) => {
                const zones = document.querySelectorAll('.prCLZ__regContainer .dndZone');
                for (let i = 0; i < zones.length; i++) {
                    const item = zones[i]?.querySelector(`.dnditem[ans_id="${targetId}"]`);
                    if (item) return i;
                }
                return -1;
            }, targetId);

            if (srcZone === -1) continue;

            const srcItem = page.locator(
                `.prCLZ__regContainer .dndZone .dnditem.draggable[ans_id="${targetId}"]`
            ).first();
            const tgtZone = page.locator('.prCLZ__regContainer .dndZone').nth(fix.zoneIdx);

            const ok = await dragItemToTarget(page, srcItem, tgtZone);
            if (ok) {
                const arrived = await page.evaluate(({ targetId, zoneIdx: fixZoneIdx }) => {
                    const zone = document.querySelectorAll('.prCLZ__regContainer .dndZone')[fixZoneIdx];
                    return zone?.querySelector(`.dnditem[ans_id="${targetId}"]`) !== null;
                }, { targetId, zoneIdx: fix.zoneIdx });

                if (arrived) {
                    moved++;
                    console.log(`  ✓ Swap: item ${targetId} → espacio ${fix.zoneIdx}`);
                }
            }
        }
    }

    const finalMissing = await page.evaluate((mapping) => {
        const zones = document.querySelectorAll('.prCLZ__regContainer .dndZone');
        const missing = [];
        mapping.forEach(m => {
            const zone = zones[m.zoneIdx];
            m.itemIds.forEach(id => {
                if (!zone?.querySelector(`.dnditem[ans_id="${id}"]`)) {
                    missing.push({ zoneIdx: m.zoneIdx, id });
                }
            });
        });
        return missing;
    }, mapping);

    if (finalMissing.length > 0) {
        console.log(`Cloze incompleto: faltan ${finalMissing.length} item(s)`);
        return false;
    }

    await page.waitForTimeout(FAST.medium);

    await waitForCheckAnswer(page);
    return await verifyCorrect(page);
}

async function solveCloze(page) {
    try {
        await page.waitForSelector('#SeeAnswer', { timeout: FAST.actionTimeout });

        const variant = await page.evaluate(() => {
            const isVisible = (el) => {
                if (!el) return false;
                const style = window.getComputedStyle(el);
                const rect = el.getBoundingClientRect();
                return style.visibility !== 'hidden' &&
                    style.display !== 'none' &&
                    rect.width > 0 &&
                    rect.height > 0;
            };
            const hasVisible = (selector) => Array.from(document.querySelectorAll(selector)).some(isVisible);
            const hasVisibleWordsBank = (
                hasVisible('.wordsBankTable .wordBankTile, .wordsBankTable .draggable') ||
                (hasVisible('.TTpanswerDiv.droptarget') && hasVisible('.draggable.wordBankTile'))
            );
            const hasVisibleStandard = (
                hasVisible('.prCLZ__main') &&
                hasVisible('.prCLZ__regContainer .dndZone') &&
                hasVisible('#bankContainer .dnditem[ans_id], #bankContainer .dnditem.draggable')
            );

            if (hasVisibleWordsBank) return 'wordsbank';
            if (hasVisibleStandard) return 'standard';
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
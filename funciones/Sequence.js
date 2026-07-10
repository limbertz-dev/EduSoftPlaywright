const { verifyCorrect, waitForCheckAnswer } = require('./utils.js');

async function solveSequence(page) {
    try {
        console.log('📌 Resolviendo Sequence (Ordenar)');

        await page.waitForSelector('#SeeAnswer', { timeout: 10000 });
        await page.click('#SeeAnswer');
        await page.waitForTimeout(1500);

        const correctOrder = await page.evaluate(() => {
            const containers = document.querySelectorAll('.prSeq__containerW');
            return Array.from(containers).map(c => {
                const item = c.querySelector('.dnditem');
                return item?.getAttribute('ans_id') || '';
            }).filter(id => id !== '');
        });

        if (correctOrder.length < 2) {
            console.log('⚠ No se detectaron suficientes items');
            await page.click('#SeeAnswer');
            return false;
        }

        console.log(`✓ Orden correcto: ${correctOrder.map((id, i) => `${i + 1}=aid_${id}`).join(', ')}`);

        await page.click('#SeeAnswer');
        await page.waitForTimeout(1000);

        const n = correctOrder.length;
        for (let targetIdx = 0; targetIdx < n; targetIdx++) {
            const targetId = correctOrder[targetIdx];

            const currentContainer = await page.evaluate((aid) => {
                const containers = document.querySelectorAll('.prSeq__containerW');
                for (let i = 0; i < containers.length; i++) {
                    const item = containers[i].querySelector('.dnditem');
                    if (item?.getAttribute('ans_id') === aid) return i;
                }
                return -1;
            }, targetId);

            if (currentContainer === targetIdx) {
                console.log(`  ✓ aid_${targetId} ya en posición ${targetIdx + 1}`);
                continue;
            }

            if (currentContainer === -1) {
                console.log(`  ⚠ aid_${targetId} no encontrado`);
                continue;
            }

            console.log(`  ↕ aid_${targetId}: [${currentContainer + 1}] → [${targetIdx + 1}]`);

            const sourceZone = page.locator('#prSeq__zone--txt_' + (currentContainer + 1));
            const targetZone = page.locator('#prSeq__zone--txt_' + (targetIdx + 1));

            const srcBox = await sourceZone.boundingBox();
            const tgtBox = await targetZone.boundingBox();
            if (!srcBox || !tgtBox) {
                console.log('  ⚠ Sin boundingBox');
                continue;
            }

            const sx = srcBox.x + srcBox.width / 2;
            const sy = srcBox.y + srcBox.height / 2;
            const tx = tgtBox.x + tgtBox.width / 2;
            const ty = tgtBox.y + tgtBox.height / 2;

            await page.mouse.move(sx, sy);
            await page.waitForTimeout(200);
            await page.mouse.down();
            await page.waitForTimeout(300);
            const steps = Math.max(10, Math.round((Math.abs(tx - sx) + Math.abs(ty - sy)) / 10));
            await page.mouse.move(tx, ty, { steps });
            await page.waitForTimeout(200);
            await page.mouse.up();
            await page.waitForTimeout(1200);

            console.log(`  ✓ aid_${targetId} → [${targetIdx + 1}]`);
        }

        await page.waitForTimeout(1000);
        await waitForCheckAnswer(page);
        return await verifyCorrect(page);
    } catch (e) {
        console.log('✗ Error en Sequence:', e.message);
        return false;
    }
}

module.exports = { solveSequence };

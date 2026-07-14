const { verifyCorrect, waitForCheckAnswer, dragItemToTarget, waitAfterSeeAnswer, clickSeeAnswer, FAST } = require('./utils.js');

async function solveSequence(page) {
    try {
        console.log('Resolviendo Sequence (Ordenar)');

        await clickSeeAnswer(page);
        await waitAfterSeeAnswer(page);

        const correctOrder = await page.evaluate(() => {
            const containers = document.querySelectorAll('.prSeq__containerW');
            return Array.from(containers).map(c => {
                const item = c.querySelector('.dnditem');
                return item?.getAttribute('ans_id') || '';
            }).filter(id => id !== '');
        });

        if (correctOrder.length < 2) {
            console.log('No se detectaron suficientes items');
            await clickSeeAnswer(page);
            return false;
        }

        console.log(`Orden correcto: ${correctOrder.map((id, i) => `${i + 1}=aid_${id}`).join(', ')}`);

        await clickSeeAnswer(page);
        await page.waitForTimeout(FAST.medium);

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
                console.log(`  aid_${targetId} ya en posicion ${targetIdx + 1}`);
                continue;
            }

            if (currentContainer === -1) {
                console.log(`  aid_${targetId} no encontrado`);
                continue;
            }

            const sourceZone = page.locator('#prSeq__zone--txt_' + (currentContainer + 1));
            const targetZone = page.locator('#prSeq__zone--txt_' + (targetIdx + 1));
            const ok = await dragItemToTarget(page, sourceZone, targetZone);
            if (!ok) {
                console.log(`  No se pudo mover aid_${targetId}`);
                continue;
            }

            console.log(`  aid_${targetId} -> [${targetIdx + 1}]`);
        }

        const currentOrder = await page.evaluate(() => {
            const containers = document.querySelectorAll('.prSeq__containerW');
            return Array.from(containers).map(c => {
                const item = c.querySelector('.dnditem');
                return item?.getAttribute('ans_id') || '';
            }).filter(id => id !== '');
        });

        const isComplete = correctOrder.length === currentOrder.length &&
            correctOrder.every((id, idx) => currentOrder[idx] === id);

        if (!isComplete) {
            console.log(`Sequence incompleto: esperado [${correctOrder.join(', ')}], actual [${currentOrder.join(', ')}]`);
            return false;
        }

        await page.waitForTimeout(FAST.medium);
        await waitForCheckAnswer(page);
        return await verifyCorrect(page);
    } catch (e) {
        console.log('Error en Sequence:', e.message);
        return false;
    }
}

module.exports = { solveSequence };

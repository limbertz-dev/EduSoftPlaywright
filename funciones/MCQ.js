const { verifyCorrect, waitForCheckAnswer } = require('./utils.js');

async function solveMCQ(page) {
    try {
        console.log('📌 Resolviendo MCQ (Selección Única/Múltiple)');

        await page.waitForSelector('#SeeAnswer', { timeout: 10000 });
        await page.click('#SeeAnswer');
        await page.waitForTimeout(1500);

        let correctIds = [];

        const patterns = [
            '.multiRadio.correct input[type="radio"]',
            '.multiRadioWrapper.correct input[type="radio"]',
            '.prMCQ__answers .correct input[type="radio"]',
            '.lessonMultipleAnswer.c',
            '.prMCQ__item.correct',
            '.multiRadio.correct',
            '.prMCQ__multiCheck--container.correct',
            'input[type="radio"]:checked, input[type="checkbox"]:checked',
            '.multiCheck.correct',
            '.correct .answerText, .correct .multiRadio--text',
            '.c .multiTextInline, .c .multiRadio--text, .c .answerText',
        ];

        for (const sel of patterns) {
            const els = await page.$$(sel);
            const ids = [];
            for (const el of els) {
                const tag = await el.evaluate(e => e.tagName.toLowerCase());
                if (tag === 'input') {
                    const id = await el.getAttribute('id');
                    if (id) ids.push(id);
                } else {
                    const childId = await el.evaluate(e => {
                        const inp = e.querySelector('input');
                        return inp?.getAttribute('id') || '';
                    });
                    if (childId) ids.push(childId);
                }
            }
            if (ids.length > 0) {
                correctIds = ids;
                console.log(`✓ Detectados ${correctIds.length} correctos por selector: ${sel}`);
                break;
            }
        }

        if (correctIds.length === 0) {
            const idsWithText = await page.evaluate(() => {
                const corrects = document.querySelectorAll('.multiRadioWrapper.correct, .multiRadio.correct, .lessonMultipleAnswer.c, .c');
                const result = [];
                corrects.forEach(el => {
                    const inp = el.querySelector('input[id]');
                    if (inp) result.push(inp.getAttribute('id'));
                });
                return result;
            });
            if (idsWithText.length > 0) {
                correctIds = idsWithText;
                console.log(`✓ Detectados ${correctIds.length} correctos por clase "correct"`);
            }
        }

        if (correctIds.length === 0) {
            const checkedInfo = await page.evaluate(() => {
                const checked = document.querySelectorAll('input[type="checkbox"]:checked, input[type="radio"]:checked');
                return Array.from(checked).map(c => ({
                    id: c.getAttribute('id'),
                    parentId: c.closest('[id]')?.getAttribute('id') || '',
                    text: c.closest('.lessonMultipleAnswer')?.querySelector('.multiTextInline, .multiRadio--text, .answerText')?.textContent?.trim() || ''
                })).filter(x => x.text);
            });

            if (checkedInfo.length > 0) {
                correctIds = checkedInfo.map(x => x.id || x.parentId);
                console.log(`✓ Detectados ${correctIds.length} correctos por input:checked`);
            }
        }

        if (correctIds.length === 0) {
            console.log('⚠ No se pudo detectar la respuesta correcta');
            await page.click('#SeeAnswer');
            return false;
        }

        console.log(`✓ IDs correctos: [${correctIds.join(', ')}]`);
        await page.click('#SeeAnswer');
        await page.waitForTimeout(800);

        for (const id of correctIds) {
            try {
                console.log(`📌 Seleccionando id="${id}"`);

                const input = page.locator(`#${id}`);
                const inputCount = await input.count();

                if (inputCount > 0) {
                    await input.first().click({ force: true });
                } else {
                    const fallback = page.locator(`[id="${id}"] input[type="radio"], [id="${id}"] input[type="checkbox"]`);
                    const fbCount = await fallback.count();
                    if (fbCount > 0) {
                        await fallback.first().click({ force: true });
                    } else {
                        console.log(`⚠ Elemento #${id} no encontrado`);
                        continue;
                    }
                }
                await page.waitForTimeout(500);
            } catch (e) {
                console.log(`⚠ Error seleccionando id="${id}": ${e.message}`);
            }
        }

        await waitForCheckAnswer(page);
        return await verifyCorrect(page);
    } catch (e) {
        console.log('✗ Error en MCQ:', e.message);
        return false;
    }
}

module.exports = { solveMCQ };
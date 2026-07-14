const { verifyCorrect, waitForCheckAnswer, waitAfterSeeAnswer, clickSeeAnswer, FAST } = require('./utils.js');

async function getRevealedFitbAnswers(page) {
    return await page.evaluate(() => {
        const wrappers = document.querySelectorAll('.prFITB__DDLOptionsW');
        const result = [];
        wrappers.forEach((wrapper, idx) => {
            const selected = wrapper.querySelector('.DDLOptions__selected');
            const id = selected?.id || '';
            const match = id.match(/aid_(\d+)$/);
            if (match) {
                result.push({
                    index: idx,
                    wrapperId: wrapper.id || '',
                    aid: match[1]
                });
            }
        });
        return result;
    });
}

async function openFitbDropdown(page, answer) {
    return await page.evaluate((answer) => {
        const getWrapper = () => {
            if (answer.wrapperId) {
                const byId = document.getElementById(answer.wrapperId);
                if (byId) return byId;
            }
            return document.querySelectorAll('.prFITB__DDLOptionsW')[answer.index] || null;
        };

        const fireMouse = (el, type) => {
            el.dispatchEvent(new MouseEvent(type, {
                bubbles: true,
                cancelable: true,
                view: window
            }));
        };

        const wrapper = getWrapper();
        if (!wrapper) return { ok: false, reason: 'missing-wrapper' };

        const trigger = wrapper.querySelector('.DDLOptions__selected, button, [role="button"], [tabindex]') || wrapper;
        trigger.scrollIntoView({ block: 'center', inline: 'center' });
        fireMouse(trigger, 'mousedown');
        fireMouse(trigger, 'mouseup');
        trigger.click();

        return {
            ok: true,
            wrapperId: wrapper.id || answer.wrapperId || '',
            selectedId: wrapper.querySelector('.DDLOptions__selected')?.id || ''
        };
    }, answer);
}

async function clickFitbOption(page, aid) {
    const optId = `DDLOptions__listItem_aid_${aid}`;
    const option = page.locator(`#${optId}`).first();

    if (await option.count()) {
        try {
            await option.click({ timeout: FAST.actionTimeout });
            return { ok: true, via: 'locator-id' };
        } catch {
            // Some FITB lists are rebuilt after opening; fall through to DOM click.
        }
    }

    return await page.evaluate((aid) => {
        const isVisible = (el) => {
            const style = window.getComputedStyle(el);
            const rect = el.getBoundingClientRect();
            return style.visibility !== 'hidden' &&
                style.display !== 'none' &&
                rect.width > 0 &&
                rect.height > 0;
        };

        const fireMouse = (el, type) => {
            el.dispatchEvent(new MouseEvent(type, {
                bubbles: true,
                cancelable: true,
                view: window
            }));
        };

        const candidates = Array.from(document.querySelectorAll(
            `#DDLOptions__listItem_aid_${aid}, [id$="aid_${aid}"]`
        ));
        const option = candidates.find(isVisible) || candidates[0];
        if (!option) return { ok: false, reason: 'missing-option' };

        option.scrollIntoView({ block: 'center', inline: 'center' });
        fireMouse(option, 'mousedown');
        fireMouse(option, 'mouseup');
        option.click();
        return { ok: true, via: 'dom-click', id: option.id || '' };
    }, aid);
}

async function getMissingFitbAnswers(page, answers) {
    return await page.evaluate((answers) => {
        const getWrapper = (answer) => {
            if (answer.wrapperId) {
                const byId = document.getElementById(answer.wrapperId);
                if (byId) return byId;
            }
            return document.querySelectorAll('.prFITB__DDLOptionsW')[answer.index] || null;
        };

        return answers.filter(answer => {
            const wrapper = getWrapper(answer);
            const selected = wrapper?.querySelector('.DDLOptions__selected');
            return !selected?.id?.endsWith(`aid_${answer.aid}`);
        });
    }, answers);
}

async function solveFITB(page) {
    try {
        console.log('📌 Resolviendo FITB (Fill In The Blanks)');

        await clickSeeAnswer(page);
        await waitAfterSeeAnswer(page);

        const answers = await getRevealedFitbAnswers(page);

        if (answers.length === 0) {
            console.log('⚠ No se detectaron respuestas');
            await clickSeeAnswer(page);
            return false;
        }

        console.log(`✓ Detectadas ${answers.length} respuesta(s):`);
        answers.forEach(a => console.log(`  ${a.index}: aid_${a.aid}`));

        await clickSeeAnswer(page);
        await page.waitForTimeout(FAST.medium);

        for (const ans of answers) {
            try {
                const opened = await openFitbDropdown(page, ans);
                if (!opened.ok) {
                    console.log(`⚠ No se pudo abrir dropdown para aid_${ans.aid} (${opened.reason})`);
                    continue;
                }

                await page.waitForTimeout(FAST.short);

                const selected = await clickFitbOption(page, ans.aid);
                if (!selected.ok) {
                    console.log(`⚠ No se encontró opción aid_${ans.aid} (${selected.reason})`);
                    continue;
                }

                await page.waitForTimeout(FAST.short);
                console.log(`  ✓ Seleccionado aid_${ans.aid}`);
            } catch (e) {
                console.log(`⚠ Error seleccionando opción ${ans.index}: aid_${ans.aid} — ${e.message}`);
            }
        }

        const missing = await getMissingFitbAnswers(page, answers);

        if (missing.length > 0) {
            console.log(`FITB incompleto: faltan ${missing.length} opcion(es)`);
            return false;
        }

        await waitForCheckAnswer(page);
        return await verifyCorrect(page);
    } catch (e) {
        console.log('✗ Error en FITB:', e.message);
        return false;
    }
}

module.exports = { solveFITB };

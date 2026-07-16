const { askAIForJSON } = require('./ai.js');
const { extractVisibleExerciseText } = require('./common.js');
const { waitForTestCheck, verifyTestResult } = require('./utils.js');

async function fillTinyMCE(page, answer) {
    const frames = page.frames().filter(frame => /^mce_/.test(frame.name()) || /tinymce/i.test(frame.url()));

    for (const frame of frames) {
        try {
            const body = frame.locator('body#tinymce, body').first();
            await body.waitFor({ state: 'visible', timeout: 1200 });
            await body.fill(answer, { timeout: 1500 });
            return true;
        } catch {
            continue;
        }
    }

    return await page.evaluate((answer) => {
        const editor = document.querySelector('#tinymce, [contenteditable="true"]');
        if (!editor) return false;
        editor.focus();
        editor.innerHTML = answer;
        editor.textContent = answer;
        editor.dispatchEvent(new Event('input', { bubbles: true }));
        editor.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
    }, answer);
}

async function solveTestTinyMCE(page) {
    try {
        console.log('Resolviendo Test TinyMCE con IA');
        const text = await extractVisibleExerciseText(page);
        const ai = await askAIForJSON(
            [
                'Answer this English writing item.',
                'Return JSON: {"answer":"text to type","confidence":0.0,"explanation":"short reason"}',
                '',
                text
            ].join('\n'),
            '{"answer":"text to type","confidence":0.0,"explanation":"short reason"}'
        );

        if (!ai.ok || !ai.data?.answer) {
            console.log(`IA no resolvio TinyMCE (${ai.reason || 'no-answer'})`);
            return false;
        }

        const filled = await fillTinyMCE(page, String(ai.data.answer));
        if (!filled) {
            console.log('No se encontro editor TinyMCE visible');
            return false;
        }

        await waitForTestCheck(page);
        return await verifyTestResult(page);
    } catch (e) {
        console.log('Error en Test TinyMCE:', e.message);
        return false;
    }
}

module.exports = { solveTestTinyMCE };

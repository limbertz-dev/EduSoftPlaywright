const { askAIForJSON } = require('./ai.js');
const { extractVisibleExerciseText } = require('./common.js');
const { waitForTestCheck, verifyTestResult } = require('./utils.js');

async function fillTextFields(page, answer) {
    return await page.evaluate((answer) => {
        const isVisible = (el) => {
            if (!el) return false;
            const style = window.getComputedStyle(el);
            const rect = el.getBoundingClientRect();
            return style.visibility !== 'hidden' &&
                style.display !== 'none' &&
                rect.width > 0 &&
                rect.height > 0;
        };

        const fields = Array.from(document.querySelectorAll(
            'textarea, input[type="text"], .prOpenEnded__qaItemText--input, input.prOpenEnded__qaItemText'
        )).filter(isVisible);

        const dispatch = (el, type) => el.dispatchEvent(new Event(type, { bubbles: true }));

        fields.forEach(field => {
            field.focus();
            field.value = answer;
            field.setAttribute('value', answer);
            dispatch(field, 'input');
            dispatch(field, 'change');
            dispatch(field, 'blur');
        });

        return fields.length;
    }, answer);
}

async function solveTestOpenEnded(page) {
    try {
        console.log('Resolviendo Test OpenEnded con IA');

        const text = await extractVisibleExerciseText(page);
        const ai = await askAIForJSON(
            [
                'Answer this English learning test item.',
                'Return JSON: {"answer":"short answer text","confidence":0.0,"explanation":"short reason"}',
                '',
                text
            ].join('\n'),
            '{"answer":"short answer text","confidence":0.0,"explanation":"short reason"}'
        );

        if (!ai.ok || !ai.data?.answer) {
            console.log(`IA no resolvio OpenEnded (${ai.reason || 'no-answer'})`);
            return false;
        }

        console.log(`IA respuesta: ${ai.data.answer}`);
        const count = await fillTextFields(page, String(ai.data.answer));
        if (count === 0) {
            console.log('No se encontraron campos de texto visibles');
            return false;
        }

        await waitForTestCheck(page);
        return await verifyTestResult(page);
    } catch (e) {
        console.log('Error en Test OpenEnded:', e.message);
        return false;
    }
}

module.exports = { solveTestOpenEnded };

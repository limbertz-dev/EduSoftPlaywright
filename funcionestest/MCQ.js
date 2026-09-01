const { waitForTestCheck, verifyTestResult, FAST } = require('./utils.js');
const { extractMCQForAI } = require('./extract.js');
const { askAIForMCQ } = require('./ai.js');
const { askForManualTestContext, askForManualMCQAnswer } = require('./common.js');

async function selectMcqOption(page, id) {
    return await page.evaluate((id) => {
        const dispatch = (el, type) => el.dispatchEvent(new Event(type, { bubbles: true }));
        const el = document.getElementById(id);
        if (!el) return { ok: false, reason: 'missing' };

        const input = el.matches?.('input[type="radio"], input[type="checkbox"]')
            ? el
            : el.querySelector?.('input[type="radio"], input[type="checkbox"]');

        const label = input?.id ? document.querySelector(`label[for="${CSS.escape(input.id)}"]`) : null;
        const wrapper = input?.closest?.(
            '.lessonMultipleAnswer, .multiRadio, .multiRadioWrapper, .multiCheck, ' +
            '.prMCQ__item, .prMCQ__multiCheck--container, li, tr, div'
        );
        const clickable = label || wrapper || el;

        clickable.scrollIntoView({ block: 'center', inline: 'center' });
        clickable.click();

        if (input && !input.checked) {
            input.checked = true;
            dispatch(input, 'input');
            dispatch(input, 'change');
            dispatch(input, 'click');
        }

        ['input', 'change', 'keyup', 'blur'].forEach(type => dispatch(clickable, type));
        return { ok: true };
    }, id);
}

async function getMcqCandidateIds(page) {
    return await page.evaluate(() => {
        const isVisible = (el) => {
            if (!el) return false;
            const style = window.getComputedStyle(el);
            const rect = el.getBoundingClientRect();
            return style.visibility !== 'hidden' &&
                style.display !== 'none' &&
                rect.width > 0 &&
                rect.height > 0;
        };

        const optionSelector = [
            '.multiRadio.correct input[type="radio"]',
            '.multiRadioWrapper.correct input[type="radio"]',
            '.prMCQ__answers .correct input[type="radio"]',
            '.lessonMultipleAnswer.c input[type="radio"]',
            '.lessonMultipleAnswer.c input[type="checkbox"]',
            '.prMCQ__item.correct input[type="radio"]',
            '.prMCQ__item.correct input[type="checkbox"]',
            '.multiCheck.correct input[type="checkbox"]',
            '[data-correct="true"] input[type="radio"]',
            '[data-correct="true"] input[type="checkbox"]',
            '[correct="true"] input[type="radio"]',
            '[correct="true"] input[type="checkbox"]',
            '[ng-reflect-is-correct="true"] input[type="radio"]',
            '[ng-reflect-is-correct="true"] input[type="checkbox"]'
        ].join(', ');

        const known = Array.from(document.querySelectorAll(optionSelector))
            .filter(input => !input.disabled)
            .filter(input => isVisible(input) || isVisible(input.closest('label, div, li, tr')))
            .map(input => input.id)
            .filter(Boolean);

        if (known.length > 0) {
            return { ids: [...new Set(known)], source: 'dom-correct-marker' };
        }

        const checked = Array.from(document.querySelectorAll('input[type="radio"]:checked, input[type="checkbox"]:checked'))
            .filter(input => !input.disabled)
            .filter(input => isVisible(input) || isVisible(input.closest('label, div, li, tr')))
            .map(input => input.id)
            .filter(Boolean);

        if (checked.length > 0) {
            return { ids: [...new Set(checked)], source: 'already-checked' };
        }

        const allVisible = Array.from(document.querySelectorAll('input[type="radio"], input[type="checkbox"]'))
            .filter(input => !input.disabled)
            .filter(input => isVisible(input) || isVisible(input.closest('label, div, li, tr')));

        const radioGroups = new Map();
        const checkboxIds = [];

        allVisible.forEach(input => {
            if (!input.id) return;
            if (input.type === 'radio') {
                const group = input.name || '__default_radio__';
                if (!radioGroups.has(group)) radioGroups.set(group, input.id);
            } else {
                checkboxIds.push(input.id);
            }
        });

        const fallbackIds = [...radioGroups.values()];
        if (checkboxIds.length === 1) fallbackIds.push(checkboxIds[0]);

        return { ids: fallbackIds, source: 'first-visible-fallback' };
    });
}

function mapAIAnswersToIds(exercise, answers) {
    const byLabel = new Map(exercise.options.map(option => [option.label.toUpperCase(), option.id]));
    const byText = new Map(exercise.options.map(option => [option.text.toLowerCase(), option.id]));
    const ids = [];

    for (const answer of answers) {
        const normalized = String(answer).trim();
        const label = normalized.replace(/[^A-Z]/gi, '').toUpperCase();
        const text = normalized.toLowerCase();

        if (byLabel.has(label)) {
            ids.push(byLabel.get(label));
        } else if (byText.has(text)) {
            ids.push(byText.get(text));
        }
    }

    return [...new Set(ids)];
}

async function askManualAnswerForExercise(page, exercise, reason) {
    const manualAnswers = await askForManualMCQAnswer(page, {
        type: 'multiple_choice',
        questionText: exercise.questionText,
        options: exercise.options.map(option => ({ label: option.label, text: option.text })),
        multiSelect: exercise.multiSelect
    }, reason);
    const manualIds = mapAIAnswersToIds(exercise, manualAnswers);
    if (manualIds.length) {
        console.log(`Respuesta manual seleccionada: [${manualAnswers.join(', ')}]`);
        return { ids: manualIds, source: 'manual' };
    }
    return { ids: [], source: 'manual-empty' };
}
async function getAISelectedIds(page) {
    const exercise = await extractMCQForAI(page);
    if (!exercise.options.length) {
        console.log('IA: no se pudieron extraer opciones visibles');
        return { ids: [], source: 'ai-no-options' };
    }

    console.log(`IA pregunta: ${exercise.questionText || '(sin texto detectado)'}`);
    exercise.options.forEach(option => {
        console.log(`  ${option.label}. ${option.text} [${option.id}]`);
    });

    const manualContext = await askForManualTestContext(page, {
        type: 'multiple_choice',
        questionText: exercise.questionText,
        options: exercise.options.map(option => ({ label: option.label, text: option.text }))
    });
    if (manualContext) {
        exercise.manualContext = manualContext;
        console.log(`Contexto manual agregado para IA (${manualContext.length} caracteres)`);
    }

    if (global.__testAIAuthFailed) {
        console.log('IA deshabilitada temporalmente por error de autenticacion previo; usando selector manual');
        return await askManualAnswerForExercise(page, exercise, 'api-auth');
    }

    const ai = await askAIForMCQ(exercise);
    if (!ai.ok) {
        console.log(`IA no disponible (${ai.reason})${ai.detail ? `: ${ai.detail}` : ''}`);
        if (ai.reason === 'api-401' || ai.reason === 'api-403') {
            global.__testAIAuthFailed = true;
            console.log('La key de IA no es valida; no se reintentara IA en esta ejecucion. Abriendo selector manual.');
        }
        const manualResult = await askManualAnswerForExercise(page, exercise, ai.reason);
        if (manualResult.ids.length) return manualResult;
        return { ids: [], source: 'ai-failed' };
    }

    const ids = mapAIAnswersToIds(exercise, ai.answers);
    console.log(`IA sugiere: [${ai.answers.join(', ')}], confianza=${ai.confidence}`);
    if (ai.explanation) console.log(`IA razon: ${ai.explanation}`);

    if (!ids.length) {
        console.log('IA respondio, pero no se pudo mapear a ningun input visible');
        return { ids: [], source: 'ai-unmapped' };
    }

    return { ids, source: 'ai' };
}

async function solveTestMCQ(page) {
    try {
        console.log('Resolviendo Test MCQ sin boton de vista');

        let candidates = await getMcqCandidateIds(page);
        if (candidates.ids.length === 0) {
            console.log('No se encontraron opciones MCQ visibles');
            return false;
        }

        console.log(`MCQ candidatos (${candidates.source}): [${candidates.ids.join(', ')}]`);
        if (candidates.source === 'first-visible-fallback') {
            console.log('Sin clave visible en DOM; intentando resolver con IA');
            const aiCandidates = await getAISelectedIds(page);

            if (aiCandidates.source === 'manual') {
                candidates = aiCandidates;
            } else if (aiCandidates.source === 'ai' && process.env.AI_AUTO_SELECT === 'true') {
                candidates = aiCandidates;
            } else if (aiCandidates.source === 'ai') {
                console.log('AI_AUTO_SELECT no esta activo; no se enviara la respuesta automaticamente');
                return false;
            } else if (process.env.TEST_ALLOW_GUESS === 'true') {
                console.log('IA no resolvio; TEST_ALLOW_GUESS=true, se usara fallback visible');
            } else {
                console.log('No se enviara fallback. La IA no resolvio y no se eligio respuesta manual; activa AI_API_KEY + AI_AUTO_SELECT=true, o TEST_ALLOW_GUESS=true para pruebas exploratorias.');
                return false;
            }
        }

        for (const id of candidates.ids) {
            const selected = await selectMcqOption(page, id);
            if (!selected.ok) {
                console.log(`No se pudo seleccionar ${id} (${selected.reason})`);
            }
            await page.waitForTimeout(FAST.short);
        }

        await waitForTestCheck(page);
        return await verifyTestResult(page);
    } catch (e) {
        console.log('Error en Test MCQ:', e.message);
        return false;
    }
}

module.exports = { solveTestMCQ };

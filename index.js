const { loadEnv } = require('./env.js');
loadEnv();

const { chromium } = require('playwright');
const { login } = require('./login.js');
const { solveMCQ } = require('./funciones/MCQ.js');
const { solveOpenEnded } = require('./funciones/OpenEnded.js');
const { solveClassification } = require('./funciones/Classification.js');
const { solveMatching } = require('./funciones/Matching.js');
const { solveFITB } = require('./funciones/FITB.js');
const { solveCloze } = require('./funciones/Cloze.js');
const { solveSequence } = require('./funciones/Sequence.js');
const { solveTinyMCE } = require('./funciones/TinyMCE.js');
const { solveTextToPicture } = require('./funciones/TextToPicture.js');
const { solveAddInText } = require('./funciones/AddInText.js');
const { solveSelectText } = require('./funciones/SelectText.js');
const { solveEditText } = require('./funciones/EditText.js');
const { getCompletionState } = require('./funciones/utils.js');
const { solveTestExercise } = require('./funcionestest/index.js');
const { getTestCompletionState, isTargetClosedError } = require('./funcionestest/utils.js');

const MAX_RETRIES = Number(process.env.MAX_RETRIES || 2);
const MAX_STUCK_RETRIES = Number(process.env.MAX_STUCK_RETRIES || 5);
const HEADLESS = process.env.HEADLESS === 'true';
const DEBUG_API = process.env.DEBUG_API === 'true';

const solveMap = {
    mcq: solveMCQ,
    openEnded: solveOpenEnded,
    classification: solveClassification,
    matching: solveMatching,
    fitb: solveFITB,
    cloze: solveCloze,
    sequence: solveSequence,
    tinymce: solveTinyMCE,
    textToPicture: solveTextToPicture,
    addInText: solveAddInText,
    selectText: solveSelectText,
    editText: solveEditText
};

const nameMap = {
    mcq: 'MCQ',
    openEnded: 'OpenEnded',
    classification: 'Classification',
    matching: 'Matching',
    fitb: 'FITB',
    cloze: 'Cloze',
    sequence: 'Sequence',
    tinymce: 'TinyMCE',
    textToPicture: 'TextToPicture',
    addInText: 'AddInText',
    selectText: 'SelectText',
    editText: 'EditText'
};

const localSeeAnswerTypes = new Set(['textToPicture', 'addInText', 'selectText', 'editText']);

function detectExercise() {
    const body = document.body;
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
    const hasVisibleInput = () => Array.from(document.querySelectorAll('input[type="radio"], input[type="checkbox"]')).some(input => {
        const label = input.id ? document.querySelector(`label[for="${CSS.escape(input.id)}"]`) : null;
        const wrapper = input.closest?.('.lessonMultipleAnswer, .multiRadio, .multiRadioWrapper, .multiCheck, .prMCQ__item, .prMCQ__multiCheck--container');
        return isVisible(input) || isVisible(label) || isVisible(wrapper);
    });
    const hasVisibleWordsBankCloze = () => (
        hasVisible('.wordsBankTable .wordBankTile, .wordsBankTable .draggable') ||
        (hasVisible('.TTpanswerDiv.droptarget') && hasVisible('.draggable.wordBankTile'))
    );
    const hasVisibleStandardCloze = () => (
        hasVisible('.prCLZ__main') &&
        hasVisible('.prCLZ__regContainer .dndZone') &&
        hasVisible('#bankContainer .dnditem[ans_id], #bankContainer .dnditem.draggable')
    );
    const hasVisibleEditTextInput = () => hasVisible('.writingEditFrame input[type="text"], .writingEditPracticeWrapper input[type="text"]');
    let type = null;
    if (hasVisibleEditTextInput()) type = 'editText';
    else if (body.classList.contains('learning__main--openEnded')) type = 'openEnded';
    else if (body.classList.contains('learning__main--MCQ') || hasVisibleInput()) type = 'mcq';
    else if (hasVisible('.prCl__main.classification')) type = 'classification';
    else if (hasVisible('.prMT_T2T__main')) type = 'matching';
    else if (hasVisible('.prFITB__main')) type = 'fitb';
    else if (hasVisibleWordsBankCloze() || hasVisibleStandardCloze()) type = 'cloze';
    else if (hasVisible('.prSeq__main')) type = 'sequence';
    else if (hasVisible('ed-la-text-to-picture, .textToPic__main, .prTextToPic__container--reg')) type = 'textToPicture';
    else if (hasVisible('.addInText.answersWrapper, .readingExploreWrapper--addText, .learning__addinTxt_at')) type = 'addInText';
    else if (hasVisible('.selectText.answersWrapper, .readingExploreWrapper.selectText, .learning__selectTxt_st')) type = 'selectText';
    else if (document.querySelector('#SeeAnswer') && hasVisible('iframe[id^="mce_"], #tinymce, .tox-tinymce')) type = 'tinymce';

    const hasCheckAnswer = !!document.querySelector('#CheckAnswer');
    const hasSeeAnswer = !!document.querySelector('#SeeAnswer');
    const btnText = document.querySelector('.tasksBtnext')?.textContent?.trim() || '';
    const stepTitle = document.querySelector('#learning__dropDownListTitleW_steps .learning__dropDownListTitle')?.textContent?.trim() || '';
    const isTest = !hasSeeAnswer || /test/i.test(stepTitle);
    return { type, hasCheckAnswer, hasSeeAnswer, btnText, stepTitle, isTest };
}

async function waitForExercise(page) {
    await page.waitForFunction(() => {
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
        const hasVisibleInput = () => Array.from(document.querySelectorAll('input[type="radio"], input[type="checkbox"]')).some(input => {
            const label = input.id ? document.querySelector(`label[for="${CSS.escape(input.id)}"]`) : null;
            const wrapper = input.closest?.('.lessonMultipleAnswer, .multiRadio, .multiRadioWrapper, .multiCheck, .prMCQ__item, .prMCQ__multiCheck--container');
            return isVisible(input) || isVisible(label) || isVisible(wrapper);
        });
        const hasVisibleWordsBankCloze = (
            hasVisible('.wordsBankTable .wordBankTile, .wordsBankTable .draggable') ||
            (hasVisible('.TTpanswerDiv.droptarget') && hasVisible('.draggable.wordBankTile'))
        );
        const hasVisibleStandardCloze = (
            hasVisible('.prCLZ__main') &&
            hasVisible('.prCLZ__regContainer .dndZone') &&
            hasVisible('#bankContainer .dnditem[ans_id], #bankContainer .dnditem.draggable')
        );

        if (!location.href.includes('learningArea')) return false;
        return !!(
            document.body.classList.contains('learning__main--openEnded') ||
            document.body.classList.contains('learning__main--MCQ') ||
            hasVisible('.prCl__main.classification, .prMT_T2T__main, .prFITB__main, .prSeq__main, ed-la-text-to-picture, .textToPic__main, .addInText.answersWrapper, .selectText.answersWrapper, .learning__addinTxt_at, .learning__selectTxt_st, .writingEditFrame input[type="text"], .writingEditPracticeWrapper input[type="text"]') ||
            hasVisibleWordsBankCloze ||
            hasVisibleStandardCloze ||
            hasVisibleInput() ||
            hasVisible('iframe[id^="mce_"], #tinymce, .tox-tinymce')
        );
    }, { timeout: 30000, polling: 300 });
}

async function solveWithRetry(page, solveFn, exerciseName) {
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            if (attempt > 1) {
                console.log(`Reintento ${attempt}/${MAX_RETRIES} para ${exerciseName}`);
                await page.waitForTimeout(250);
            }
            const ok = await solveFn(page);
            if (ok) return true;
            console.log(`${exerciseName} devolvio false (intento ${attempt})`);
        } catch (e) {
            console.log(`${exerciseName} error (intento ${attempt}): ${e.message}`);
        }
        await page.waitForTimeout(300);
    }
    console.log(`${exerciseName} fallo despues de ${MAX_RETRIES} intentos`);
    return false;
}

async function waitUntilReadyToAdvance(page) {
    await page.waitForFunction(() => {
        const isVisible = (el) => {
            if (!el) return false;
            const style = window.getComputedStyle(el);
            const rect = el.getBoundingClientRect();
            return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0;
        };
        const btn = document.querySelector('.tasksBtnext');
        return !!btn &&
            isVisible(btn) &&
            !btn.disabled &&
            !btn.classList.contains('disabled') &&
            btn.getAttribute('aria-disabled') !== 'true';
    }, { timeout: 6000, polling: 100 });
}

async function clickNext(page) {
    await waitUntilReadyToAdvance(page);
    const nextBtn = page.locator('.tasksBtnext').first();

    try {
        await nextBtn.scrollIntoViewIfNeeded({ timeout: 2000 }).catch(() => {});
        await nextBtn.click({ timeout: 2500 });
        return true;
    } catch {
        const clicked = await page.evaluate(() => {
            const isVisible = (el) => {
                if (!el) return false;
                const style = window.getComputedStyle(el);
                const rect = el.getBoundingClientRect();
                return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0;
            };
            const btn = document.querySelector('.tasksBtnext');
            if (!btn || !isVisible(btn) || btn.disabled || btn.classList.contains('disabled') || btn.getAttribute('aria-disabled') === 'true') {
                return false;
            }
            btn.click();
            return true;
        });
        if (!clicked) throw new Error('tasksBtnext no esta habilitado');
        return true;
    }
}

(async () => {
    console.log('=== SCRIPT INICIADO ===\n');

    const browser = await chromium.launch({
        headless: HEADLESS,
        args: HEADLESS ? [] : ['--start-maximized']
    });
    const page = await browser.newPage({ viewport: HEADLESS ? { width: 1366, height: 768 } : null });
    page.setDefaultTimeout(5000);
    page.setDefaultNavigationTimeout(15000);

    await page.addInitScript(() => {
        const disableAnimations = () => {
            if (document.getElementById('__pw_no_anim')) return;
            const style = document.createElement('style');
            style.id = '__pw_no_anim';
            style.textContent = '* { transition-duration: 0s !important; animation-duration: 0s !important; }';
            (document.head || document.documentElement).appendChild(style);
        };

        if (document.documentElement) {
            disableAnimations();
        } else {
            document.addEventListener('DOMContentLoaded', disableAnimations, { once: true });
        }
    });

    page.on('console', msg => {
        if (msg.type() === 'error') {
            console.log(`[PAGE ERROR] ${msg.text()}`);
        }
    });

    if (DEBUG_API) {
        page.on('request', req => {
            const url = req.url();
            if (url.includes('/api/') && (url.includes('Progress') || url.includes('practiceManager') || url.includes('SetProgress'))) {
                console.log(`[API] ${req.method()} ${url}`);
            }
        });
    }

    try {
        const loggedIn = await login(page);
        if (!loggedIn) {
            console.log('No se continuara porque el login no fue exitoso. Revisa LOGIN_USERNAME/LOGIN_PASSWORD en .env.');
            return;
        }

        console.log('=== LISTO ===');
        console.log(HEADLESS ? 'Modo headless activo.' : 'Navega manualmente a Practice Step 2.\n');

        let stuckCount = 0;
        let lastExerciseKey = '';

        while (true) {
            try {
                if (page.isClosed()) break;

                try {
                    await waitForExercise(page);
                } catch (e) {
                    if (page.isClosed() || isTargetClosedError(e)) break;
                    continue;
                }

                const exerciseInfo = await page.evaluate(detectExercise);
                if (!exerciseInfo.type) continue;

                const exerciseName = `${exerciseInfo.isTest ? 'Test ' : ''}${nameMap[exerciseInfo.type] || exerciseInfo.type}`;
                console.log(`Detectado: ${exerciseName}`);
                const exerciseKey = `${page.url()}|${exerciseInfo.type}`;
                if (exerciseKey === lastExerciseKey) {
                    stuckCount++;
                } else {
                    stuckCount = 0;
                    lastExerciseKey = exerciseKey;
                }

                const solveFn = localSeeAnswerTypes.has(exerciseInfo.type)
                    ? solveMap[exerciseInfo.type]
                    : exerciseInfo.isTest
                    ? solveTestExercise
                    : solveMap[exerciseInfo.type];
                await page.evaluate(() => {
                    window.__lastCheckAnswerSaveSeen = false;
                    window.__lastCheckAnswerStateConfirmed = false;
                }).catch(() => {});
                const ok = await solveWithRetry(page, solveFn, exerciseName);
                if (!ok) {
                    console.log(`${exerciseName} no quedo completo. No se avanzara al siguiente ejercicio.`);
                    if (stuckCount >= MAX_STUCK_RETRIES) {
                        console.log(`Revisar manualmente este ejercicio: ya fallo ${stuckCount + 1} veces seguidas.`);
                        await page.waitForTimeout(800);
                    }
                    continue;
                }

                const completion = exerciseInfo.isTest
                    ? await getTestCompletionState(page)
                    : await getCompletionState(page);
                if (completion.closed) break;
                if (completion.hasErrors || completion.pendingAnswers > 0 || !completion.nextEnabled || (completion.checkEnabled && !completion.hasSuccess && !completion.saveSeen && !completion.stateConfirmed)) {
                    console.log(`${exerciseName} aun no esta confirmado como completo. No se avanzara.`);
                    await page.waitForTimeout(500);
                    continue;
                }

                try {
                    await clickNext(page);
                    console.log('Avanzando...');
                    stuckCount = 0;
                    await page.waitForTimeout(300);
                } catch {
                    console.log('No se pudo avanzar porque tasksBtnext no esta listo');
                }

                if (!page.url().includes('learningArea')) {
                    console.log('Step completado, yendo a Home...');
                    try {
                        await page.getByRole('link', { name: 'Home' }).click({ timeout: 5000 });
                    } catch {
                        await page.locator('.sitemenu__itemHome--learningArea a').click({ timeout: 5000 });
                    }
                    await page.waitForTimeout(300);
                    console.log('En Home. Navega manualmente.\n');
                }
            } catch (e) {
                if (isTargetClosedError(e)) break;
                console.log('Error en loop:', e.message);
                await page.waitForTimeout(300);
            }
        }
    } catch (error) {
        console.error('Error:', error.message);
    }
})();

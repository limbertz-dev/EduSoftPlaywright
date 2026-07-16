const { solveTestMCQ } = require('./MCQ.js');
const { solveTestOpenEnded } = require('./OpenEnded.js');
const { solveTestClassification } = require('./Classification.js');
const { solveTestMatching } = require('./Matching.js');
const { solveTestFITB } = require('./FITB.js');
const { solveTestCloze } = require('./Cloze.js');
const { solveTestSequence } = require('./Sequence.js');
const { solveTestTinyMCE } = require('./TinyMCE.js');

const testSolveMap = {
    mcq: solveTestMCQ,
    openEnded: solveTestOpenEnded,
    classification: solveTestClassification,
    matching: solveTestMatching,
    fitb: solveTestFITB,
    cloze: solveTestCloze,
    sequence: solveTestSequence,
    tinymce: solveTestTinyMCE
};

async function detectTestExercise(page) {
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

        const hasVisibleInput = Array.from(
            document.querySelectorAll('input[type="radio"], input[type="checkbox"]')
        ).some(input => isVisible(input) || isVisible(input.closest('label, div, li, tr')));

        const hasVisible = (selector) => Array.from(document.querySelectorAll(selector)).some(isVisible);

        if (document.body.classList.contains('learning__main--openEnded') ||
            hasVisible('textarea, .prOpenEnded__qaItemText--input, input.prOpenEnded__qaItemText[type="text"]')) return 'openEnded';
        if (document.body.classList.contains('learning__main--MCQ') || hasVisibleInput) return 'mcq';
        if (hasVisible('.prCl__main.classification, .prCl__container--normal')) return 'classification';
        if (hasVisible('.prMT_T2T__main, .prMT_T2T__answersRow')) return 'matching';
        if (hasVisible('.prFITB__main, .prFITB__DDLOptionsW')) return 'fitb';
        if (hasVisible('.prCLZ__main, .wordsBankTable, .TTpanswerDiv.droptarget, .prCLZ__regContainer')) return 'cloze';
        if (hasVisible('.prSeq__main, .prSeq__containerW')) return 'sequence';
        if (hasVisible('iframe[id^="mce_"], #tinymce, .tox-tinymce, [contenteditable="true"]')) return 'tinymce';

        return null;
    });
}

async function solveTestExercise(page) {
    const type = await detectTestExercise(page);

    if (testSolveMap[type]) return await testSolveMap[type](page);

    console.log('No se reconocio el tipo de ejercicio de test');
    return false;
}

module.exports = {
    detectTestExercise,
    solveTestExercise,
    solveTestMCQ,
    solveTestOpenEnded,
    solveTestClassification,
    solveTestMatching,
    solveTestFITB,
    solveTestCloze,
    solveTestSequence,
    solveTestTinyMCE
};

async function extractVisibleExerciseText(page) {
    return await page.evaluate(() => {
        const cleanText = (text) => (text || '')
            .replace(/\u00a0/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

        const isVisible = (el) => {
            if (!el) return false;
            const style = window.getComputedStyle(el);
            const rect = el.getBoundingClientRect();
            return style.visibility !== 'hidden' &&
                style.display !== 'none' &&
                rect.width > 0 &&
                rect.height > 0;
        };

        const root = [
            '#pmContainer',
            '#rightDiv',
            '.learning__practiceArea',
            '.learning__angPracticeW:not([hidden])',
            '.learning__main'
        ].map(sel => document.querySelector(sel)).find(isVisible) || document.body;

        const clone = root.cloneNode(true);
        clone.querySelectorAll(
            'script, style, svg, .learning__lessonsStepsNav, .learning__settingsMenu, ' +
            '.learning__lessonsNavShim, .learning__lessonsNavCover, .edLADropDownList'
        ).forEach(el => el.remove());

        return cleanText(clone.innerText || clone.textContent);
    });
}

function labelForIndex(index) {
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    if (index < letters.length) return letters[index];
    return `O${index + 1}`;
}

function normalizeText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function mapAnswerToOption(options, answer) {
    const raw = String(answer || '').trim();
    const label = raw.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    const text = normalizeText(raw);

    return options.find(option => option.label.toUpperCase() === label) ||
        options.find(option => normalizeText(option.text) === text) ||
        options.find(option => normalizeText(option.text).includes(text) && text.length > 1) ||
        options.find(option => text.includes(normalizeText(option.text)) && option.text.length > 1) ||
        null;
}

module.exports = {
    extractVisibleExerciseText,
    labelForIndex,
    normalizeText,
    mapAnswerToOption
};

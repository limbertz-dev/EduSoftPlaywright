async function extractMCQForAI(page) {
    return await page.evaluate(() => {
        const cleanText = (text) => (text || '')
            .replace(/\s+/g, ' ')
            .replace(/\u00a0/g, ' ')
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

        const getRoot = () => {
            const candidates = [
                '#pmContainer',
                '#rightDiv',
                '.learning__practiceArea',
                '.learning__angPracticeW:not([hidden])',
                '.learning__main--angularPractice',
                '.learning__main'
            ];

            for (const selector of candidates) {
                const el = document.querySelector(selector);
                if (isVisible(el)) return el;
            }

            return document.body;
        };

        const optionWrapperSelector = [
            '.lessonMultipleAnswer',
            '.multiRadio',
            '.multiRadioWrapper',
            '.multiCheck',
            '.prMCQ__item',
            '.prMCQ__multiCheck--container',
            'label',
            'li',
            'tr'
        ].join(', ');

        const getOptionText = (input) => {
            const label = input.id ? document.querySelector(`label[for="${CSS.escape(input.id)}"]`) : null;
            const wrapper = input.closest(optionWrapperSelector);
            const source = label || wrapper || input.parentElement;
            return cleanText(source?.innerText || source?.textContent || input.value || input.id);
        };

        const root = getRoot();
        const inputs = Array.from(root.querySelectorAll('input[type="radio"], input[type="checkbox"]'))
            .filter(input => !input.disabled)
            .filter(input => isVisible(input) || isVisible(input.closest(optionWrapperSelector)));

        const options = inputs.map((input, idx) => ({
            id: input.id || '',
            label: String.fromCharCode(65 + idx),
            text: getOptionText(input),
            type: input.type,
            name: input.name || ''
        })).filter(option => option.id && option.text);

        const questionSelectors = [
            '.question',
            '.questionText',
            '.prMCQ__question',
            '.prMCQ__questionText',
            '.TextDiv[id^="qt_"]',
            '[id^="qt_"]',
            '.instruction',
            '.instructions'
        ];

        let questionText = '';
        for (const selector of questionSelectors) {
            const texts = Array.from(root.querySelectorAll(selector))
                .filter(isVisible)
                .map(el => cleanText(el.innerText || el.textContent))
                .filter(Boolean);
            if (texts.length > 0) {
                questionText = texts.join(' ');
                break;
            }
        }

        if (!questionText) {
            const clone = root.cloneNode(true);
            clone.querySelectorAll(
                'script, style, svg, .learning__lessonsStepsNav, .learning__settingsMenu, ' +
                '.learning__lessonsNavShim, .learning__lessonsNavCover, .edLADropDownList'
            ).forEach(el => el.remove());

            let text = cleanText(clone.innerText || clone.textContent);
            for (const option of options) {
                text = cleanText(text.replace(option.text, ''));
            }
            questionText = text;
        }

        const hasCheckbox = options.some(option => option.type === 'checkbox');
        const hasRadio = options.some(option => option.type === 'radio');

        return {
            questionText,
            options,
            multiSelect: hasCheckbox && !hasRadio,
            url: location.href
        };
    });
}

module.exports = { extractMCQForAI };

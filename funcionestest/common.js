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

async function askForManualTestContext(page, exercise) {
    if (process.env.TEST_CONTEXT_MODAL === 'false') return '';

    return await page.evaluate((exercise) => {
        const cleanText = (text) => String(text || '').replace(/\s+/g, ' ').trim();
        const key = [
            exercise.type || 'test',
            cleanText(exercise.questionText),
            ...(exercise.options || []).map(option => `${option.label}:${cleanText(option.text)}`)
        ].join('|').slice(0, 2000);

        window.__testManualContextByKey = window.__testManualContextByKey || {};
        if (Object.prototype.hasOwnProperty.call(window.__testManualContextByKey, key)) {
            return window.__testManualContextByKey[key];
        }

        const existing = document.getElementById('__test_context_modal');
        if (existing) existing.remove();

        const overlay = document.createElement('div');
        overlay.id = '__test_context_modal';
        overlay.style.cssText = [
            'position:fixed',
            'inset:0',
            'background:rgba(0,0,0,0.58)',
            'z-index:999999',
            'display:flex',
            'align-items:center',
            'justify-content:center',
            'font-family:Arial,sans-serif'
        ].join(';');

        const modal = document.createElement('div');
        modal.style.cssText = [
            'background:#fff',
            'border-radius:10px',
            'padding:22px',
            'width:720px',
            'max-width:92vw',
            'max-height:86vh',
            'box-shadow:0 10px 40px rgba(0,0,0,0.32)',
            'display:flex',
            'flex-direction:column',
            'gap:12px',
            'box-sizing:border-box'
        ].join(';');

        const title = document.createElement('h2');
        title.textContent = 'Contexto para la IA';
        title.style.cssText = 'margin:0;color:#222;font-size:18px;line-height:1.3;';

        const hint = document.createElement('p');
        hint.textContent = 'Pega aqui el texto del audio, lectura o anuncio que no aparece en pantalla. Ctrl+Enter envia.';
        hint.style.cssText = 'margin:0;color:#555;font-size:13px;line-height:1.35;';

        const summary = document.createElement('div');
        summary.style.cssText = [
            'background:#f6f7f9',
            'border:1px solid #dde1e7',
            'border-radius:6px',
            'padding:10px',
            'font-size:13px',
            'color:#222',
            'max-height:160px',
            'overflow:auto',
            'white-space:pre-wrap'
        ].join(';');
        const optionLines = (exercise.options || []).map(option => `${option.label}. ${option.text}`).join('\n');
        summary.textContent = [
            `Pregunta: ${exercise.questionText || '(sin pregunta detectada)'}`,
            optionLines ? `Opciones:\n${optionLines}` : ''
        ].filter(Boolean).join('\n\n');

        const textarea = document.createElement('textarea');
        textarea.placeholder = 'Ejemplo: The announcement says Mr. Winkler will speak in the main auditorium at 3 p.m.';
        textarea.style.cssText = [
            'width:100%',
            'min-height:180px',
            'padding:12px',
            'border:1px solid #bcc3cf',
            'border-radius:6px',
            'font-size:14px',
            'font-family:Arial,sans-serif',
            'resize:vertical',
            'box-sizing:border-box',
            'outline:none'
        ].join(';');

        const btnRow = document.createElement('div');
        btnRow.style.cssText = 'display:flex;gap:10px;justify-content:flex-end;align-items:center;';

        const skipBtn = document.createElement('button');
        skipBtn.textContent = 'Sin contexto';
        skipBtn.style.cssText = 'padding:9px 16px;background:#eef1f5;color:#222;border:1px solid #c7ced8;border-radius:6px;cursor:pointer;font-size:14px;';

        const submitBtn = document.createElement('button');
        submitBtn.textContent = 'Enviar contexto';
        submitBtn.style.cssText = 'padding:9px 18px;background:#2563eb;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:14px;font-weight:bold;';

        return new Promise(resolve => {
            const finish = (value) => {
                const normalized = String(value || '').trim();
                window.__testManualContextByKey[key] = normalized;
                overlay.remove();
                resolve(normalized);
            };

            submitBtn.onclick = () => finish(textarea.value);
            skipBtn.onclick = () => finish('');
            textarea.onkeydown = event => {
                if (event.key === 'Enter' && event.ctrlKey) submitBtn.click();
                if (event.key === 'Escape') skipBtn.click();
            };

            btnRow.appendChild(skipBtn);
            btnRow.appendChild(submitBtn);
            modal.appendChild(title);
            modal.appendChild(hint);
            modal.appendChild(summary);
            modal.appendChild(textarea);
            modal.appendChild(btnRow);
            overlay.appendChild(modal);
            document.body.appendChild(overlay);
            setTimeout(() => textarea.focus(), 100);
        });
    }, exercise).catch(error => {
        console.log(`No se pudo abrir modal de contexto: ${error.message}`);
        return '';
    });
}

async function askForManualMCQAnswer(page, exercise, reason = '') {
    if (process.env.TEST_MANUAL_ANSWER_MODAL === 'false') return [];

    return await page.evaluate(({ exercise, reason }) => {
        const cleanText = (text) => String(text || '').replace(/\s+/g, ' ').trim();
        const existing = document.getElementById('__test_answer_modal');
        if (existing) existing.remove();

        const overlay = document.createElement('div');
        overlay.id = '__test_answer_modal';
        overlay.style.cssText = [
            'position:fixed',
            'inset:0',
            'background:rgba(0,0,0,0.58)',
            'z-index:999999',
            'display:flex',
            'align-items:center',
            'justify-content:center',
            'font-family:Arial,sans-serif'
        ].join(';');

        const modal = document.createElement('div');
        modal.style.cssText = [
            'background:#fff',
            'border-radius:10px',
            'padding:22px',
            'width:680px',
            'max-width:92vw',
            'max-height:86vh',
            'box-shadow:0 10px 40px rgba(0,0,0,0.32)',
            'display:flex',
            'flex-direction:column',
            'gap:12px',
            'box-sizing:border-box'
        ].join(';');

        const title = document.createElement('h2');
        title.textContent = 'Selecciona la respuesta';
        title.style.cssText = 'margin:0;color:#222;font-size:18px;line-height:1.3;';

        const hint = document.createElement('p');
        hint.textContent = reason ? `La IA no respondio (${reason}). Elige la opcion correcta para continuar.` : 'Elige la opcion correcta para continuar.';
        hint.style.cssText = 'margin:0;color:#555;font-size:13px;line-height:1.35;';

        const question = document.createElement('div');
        question.textContent = exercise.questionText || '(sin pregunta detectada)';
        question.style.cssText = 'background:#f6f7f9;border:1px solid #dde1e7;border-radius:6px;padding:10px;font-size:14px;color:#222;line-height:1.35;';

        const optionsWrap = document.createElement('div');
        optionsWrap.style.cssText = 'display:flex;flex-direction:column;gap:8px;max-height:260px;overflow:auto;';

        const inputType = exercise.multiSelect ? 'checkbox' : 'radio';
        const groupName = '__test_answer_choice';
        for (const option of exercise.options || []) {
            const label = document.createElement('label');
            label.style.cssText = 'display:flex;gap:10px;align-items:flex-start;padding:10px;border:1px solid #d7dce4;border-radius:6px;cursor:pointer;font-size:14px;color:#222;line-height:1.35;';

            const input = document.createElement('input');
            input.type = inputType;
            input.name = groupName;
            input.value = option.label;
            input.style.cssText = 'margin-top:2px;';

            const text = document.createElement('span');
            text.textContent = `${option.label}. ${cleanText(option.text)}`;

            label.appendChild(input);
            label.appendChild(text);
            optionsWrap.appendChild(label);
        }

        const btnRow = document.createElement('div');
        btnRow.style.cssText = 'display:flex;gap:10px;justify-content:flex-end;align-items:center;';

        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = 'Cancelar';
        cancelBtn.style.cssText = 'padding:9px 16px;background:#eef1f5;color:#222;border:1px solid #c7ced8;border-radius:6px;cursor:pointer;font-size:14px;';

        const submitBtn = document.createElement('button');
        submitBtn.textContent = 'Usar respuesta';
        submitBtn.style.cssText = 'padding:9px 18px;background:#2563eb;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:14px;font-weight:bold;';

        return new Promise(resolve => {
            const finish = (labels) => {
                overlay.remove();
                resolve(labels);
            };

            submitBtn.onclick = () => {
                const selected = Array.from(optionsWrap.querySelectorAll('input:checked')).map(input => input.value);
                if (!selected.length) {
                    hint.textContent = 'Selecciona al menos una opcion para continuar.';
                    hint.style.color = '#b91c1c';
                    return;
                }
                finish(selected);
            };
            cancelBtn.onclick = () => finish([]);
            overlay.onkeydown = event => {
                if (event.key === 'Enter') submitBtn.click();
                if (event.key === 'Escape') cancelBtn.click();
            };

            btnRow.appendChild(cancelBtn);
            btnRow.appendChild(submitBtn);
            modal.appendChild(title);
            modal.appendChild(hint);
            modal.appendChild(question);
            modal.appendChild(optionsWrap);
            modal.appendChild(btnRow);
            overlay.appendChild(modal);
            document.body.appendChild(overlay);
            overlay.tabIndex = -1;
            overlay.focus();
        });
    }, { exercise, reason }).catch(error => {
        console.log(`No se pudo abrir modal de respuesta: ${error.message}`);
        return [];
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
    askForManualTestContext,
    askForManualMCQAnswer,
    labelForIndex,
    normalizeText,
    mapAnswerToOption
};

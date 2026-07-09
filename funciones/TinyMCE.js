async function solveTinyMCE(page) {
    try {
        console.log('📌 Resolviendo TinyMCE (Editor de texto)');

        let answerText = '';

        // 1 — Intentar revelar SeeAnswer desde dropdown
        try {
            const seeAnswer = page.locator('#SeeAnswer');
            const count = await seeAnswer.count();

            if (count > 0) {
                const isHidden = await seeAnswer.evaluate(el => el.offsetParent === null);
                if (isHidden) {
                    console.log('⚠ SeeAnswer oculto, abriendo dropdown...');
                    await page.evaluate(() => {
                        const el = document.getElementById('SeeAnswer');
                        const parent = el?.closest('.btn-group, .dropdown, ul, li[class*="group"], [class*="menu"], [class*="toolbar"]');
                        if (parent) {
                            const toggle = parent.querySelector('.dropdown-toggle, [data-toggle], button:first-of-type, a:first-of-type, .btn');
                            if (toggle) toggle.click();
                            else el.click();
                        } else {
                            el?.click();
                        }
                    });
                    await page.waitForTimeout(1500);
                }

                if (await seeAnswer.isVisible()) {
                    await seeAnswer.click();
                } else {
                    await seeAnswer.click({ force: true });
                }
                console.log('✓ Click en SeeAnswer');
                await page.waitForTimeout(1500);
            }
        } catch (e) {
            console.log(`⚠ SeeAnswer: ${e.message}`);
        }

        // 2 — Leer respuesta desde TinyMCE
        answerText = await page.evaluate(() => {
            const iframe = document.querySelector('iframe[id^="mce_"]');
            if (iframe) {
                try {
                    const doc = iframe.contentDocument || iframe.contentWindow.document;
                    return doc.body.textContent?.trim() || '';
                } catch { return ''; }
            }
            const body = document.querySelector('#tinymce');
            if (body) return body.textContent?.trim() || '';
            const ta = document.querySelector('textarea[id^="mce_"], .tox-textarea');
            if (ta) return ta.value?.trim() || '';
            return '';
        });

        // 3 — Modal HTML si no hay texto detectado
        if (!answerText) {
            console.log('⚠ No se detectó texto. Mostrando modal para pegar texto...');

            answerText = await page.evaluate(() => {
                const existing = document.getElementById('__playwright_modal');
                if (existing) existing.remove();

                const overlay = document.createElement('div');
                overlay.id = '__playwright_modal';
                overlay.style.cssText = `
                    position:fixed;top:0;left:0;width:100%;height:100%;
                    background:rgba(0,0,0,0.6);z-index:999999;
                    display:flex;align-items:center;justify-content:center;
                    font-family:Arial,sans-serif;
                `;

                const modal = document.createElement('div');
                modal.style.cssText = `
                    background:#fff;border-radius:12px;padding:30px;width:650px;
                    max-width:90%;max-height:80%;box-shadow:0 10px 40px rgba(0,0,0,0.3);
                    display:flex;flex-direction:column;
                `;

                const title = document.createElement('h2');
                title.textContent = 'Pega el texto a transcribir';
                title.style.cssText = 'margin:0 0 8px 0;color:#333;font-size:18px;';

                const hint = document.createElement('p');
                hint.textContent = 'Ctrl+V para pegar, luego presiona Enviar';
                hint.style.cssText = 'margin:0 0 15px 0;color:#666;font-size:13px;';

                const textarea = document.createElement('textarea');
                textarea.style.cssText = `
                    width:100%;min-height:200px;padding:12px;border:1px solid #ccc;
                    border-radius:6px;font-size:14px;font-family:monospace;
                    resize:vertical;box-sizing:border-box;
                `;
                textarea.placeholder = 'Pega aquí el texto...';
                textarea.autofocus = true;

                const btnRow = document.createElement('div');
                btnRow.style.cssText = 'display:flex;gap:10px;margin-top:15px;justify-content:flex-end;';

                const submitBtn = document.createElement('button');
                submitBtn.textContent = '✓ Enviar';
                submitBtn.style.cssText = `
                    padding:10px 24px;background:#4CAF50;color:#fff;border:none;
                    border-radius:6px;cursor:pointer;font-size:14px;font-weight:bold;
                `;
                submitBtn.onmouseover = () => submitBtn.style.background = '#45a049';
                submitBtn.onmouseout = () => submitBtn.style.background = '#4CAF50';

                const cancelBtn = document.createElement('button');
                cancelBtn.textContent = '✕ Cancelar';
                cancelBtn.style.cssText = `
                    padding:10px 24px;background:#f44336;color:#fff;border:none;
                    border-radius:6px;cursor:pointer;font-size:14px;font-weight:bold;
                `;
                cancelBtn.onmouseover = () => cancelBtn.style.background = '#d32f2f';
                cancelBtn.onmouseout = () => cancelBtn.style.background = '#f44336';

                return new Promise(resolve => {
                    submitBtn.onclick = () => {
                        const val = textarea.value.trim();
                        if (val) {
                            overlay.remove();
                            resolve(val);
                        } else {
                            textarea.style.borderColor = '#f44336';
                            textarea.placeholder = '⚠ Escribe o pega algo primero';
                        }
                    };
                    cancelBtn.onclick = () => {
                        overlay.remove();
                        resolve('');
                    };
                    textarea.onkeydown = e => {
                        if (e.key === 'Enter' && e.ctrlKey) {
                            submitBtn.click();
                        }
                    };

                    btnRow.appendChild(cancelBtn);
                    btnRow.appendChild(submitBtn);
                    modal.appendChild(title);
                    modal.appendChild(hint);
                    modal.appendChild(textarea);
                    modal.appendChild(btnRow);
                    overlay.appendChild(modal);
                    document.body.appendChild(overlay);

                    setTimeout(() => textarea.focus(), 100);
                });
            });

            if (!answerText) {
                console.log('⚠ El usuario canceló el modal');
                return false;
            }
        }

        console.log(`✓ Texto: "${answerText.substring(0, 80)}..."`);

        // 4 — Ocultar SeeAnswer
        try {
            const seeAnswer = page.locator('#SeeAnswer');
            if (await seeAnswer.isVisible()) {
                await seeAnswer.click();
                await page.waitForTimeout(1000);
            }
        } catch { }

        // 5 — Inyectar texto en TinyMCE
        const iframe = page.frameLocator('iframe[id^="mce_"]').first();
        const iframeExists = await iframe.locator('body').count();

        if (iframeExists > 0) {
            await iframe.locator('body').click();
            await page.waitForTimeout(300);

            await page.evaluate((text) => {
                const iframeEl = document.querySelector('iframe[id^="mce_"]');
                if (iframeEl) {
                    try {
                        const win = iframeEl.contentWindow;
                        const doc = win.document;
                        const body = doc.body;
                        body.innerHTML = `<p>${text.replace(/\n/g, '</p><p>')}</p>`;
                        ['input', 'change', 'keyup', 'keydown'].forEach(evt => {
                            body.dispatchEvent(new Event(evt, { bubbles: true }));
                        });
                        if (win.tinyMCE && win.tinyMCE.activeEditor) {
                            win.tinyMCE.activeEditor.setContent(`<p>${text.replace(/\n/g, '</p><p>')}</p>`);
                        }
                    } catch (e) {
                        return 'error: ' + e.message;
                    }
                }
                return 'ok';
            }, answerText);
            console.log('✓ Texto inyectado en TinyMCE');
        } else {
            const ta = page.locator('textarea[id^="mce_"], .tox-textarea').first();
            const taCount = await ta.count();
            if (taCount > 0) {
                await ta.click();
                await ta.fill('');
                await ta.fill(answerText);
                console.log('✓ Texto escrito en textarea');
            } else {
                console.log('⚠ No se encontró editor');
                return false;
            }
        }

        await page.waitForTimeout(500);

        const checkBtn = page.locator('#CheckAnswer');
        await checkBtn.waitFor({ state: 'visible', timeout: 10000 });
        const isDisabled = await checkBtn.isDisabled();
        if (isDisabled) {
            console.log('⚠ CheckAnswer deshabilitado, forzando...');
            await checkBtn.click({ force: true });
        } else {
            await checkBtn.click();
        }
        console.log('✓ Click en CheckAnswer');
        await page.waitForTimeout(2000);
        return true;
    } catch (e) {
        console.log('✗ Error en TinyMCE:', e.message);
        return false;
    }
}

module.exports = { solveTinyMCE };
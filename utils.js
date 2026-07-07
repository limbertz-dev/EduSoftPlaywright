const { chromium } = require('playwright');
const { clickPlay } = require('./funciones/RamButton.js');
const { solveSeleccionUnica } = require('./funciones/SeleccionUnica.js');

async function fillWithFallback(page, selectors, value) {
    for (const selector of selectors) {
        try {
            await page.fill(selector, value, { timeout: 3000 });
            return true;
        } catch (e) {
            continue;
        }
    }
    return false;
}

async function clickWithFallback(page, selectors) {
    for (const selector of selectors) {
        try {
            await page.click(selector, { timeout: 3000 });
            return true;
        } catch (e) {
            continue;
        }
    }
    return false;
}

async function handleAlreadyLoggedInModal(page) {
    try {
        await page.waitForTimeout(1000);
        const modal = await page.$('text=You are already logged in');
        if (modal) {
            console.log('⚠ Modal detectado: Ya estás logueado en otro dispositivo');
            const clicked = await clickWithFallback(page, [
                '#btnOk',
                'input[value="Login on This Device"]',
                'input.okButton',
                'input.utils__BSOKBtn',
                'input[type="button"]:has-text("Login on This Device")',
                '#popupButtonsWrapper input[type="button"]',
                'input[type="button"]'
            ]);
            if (clicked) {
                console.log('✓ Botón "Login on This Device" presionado');
                await page.waitForTimeout(2000);
                return true;
            }
        }
        return false;
    } catch (error) {
        console.log('Error al manejar el modal:', error.message);
        return false;
    }
}

async function login(page) {
    await page.goto('https://ed.engdis.com/ucbtarija#/login', { waitUntil: 'domcontentloaded' });

    const userFilled = await fillWithFallback(page, [
        'input[name="username"]',
        'input[id="username"]',
        'input[type="text"]',
        'input[placeholder*="user" i]',
        'input[placeholder*="usuario" i]'
    ], 'VILLCAL');
    if (!userFilled) throw new Error('No se pudo encontrar el campo de usuario');
    console.log('✓ Usuario ingresado');

    const passFilled = await fillWithFallback(page, [
        'input[name="password"]',
        'input[id="password"]',
        'input[type="password"]',
        'input[placeholder*="pass" i]',
        'input[placeholder*="contraseña" i]'
    ], '10654982');
    if (!passFilled) throw new Error('No se pudo encontrar el campo de contraseña');
    console.log('✓ Contraseña ingresada');

    const clicked = await clickWithFallback(page, [
        'button[type="submit"]',
        'input[type="submit"]',
        'button:has-text("Login")',
        'button:has-text("Ingresar")',
        'button:has-text("Entrar")',
        'button:has-text("Acceder")'
    ]);
    if (!clicked) {
        await page.keyboard.press('Enter');
    }
    console.log('✓ Login enviado');

    await handleAlreadyLoggedInModal(page);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2000);

    const currentUrl = page.url();
    if (!currentUrl.toLowerCase().includes('login')) {
        console.log('✓ Login exitoso!');
        return true;
    } else {
        console.log('✗ Login fallido');
        return false;
    }
}

async function scrollToTop(page) {
    try {
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.waitForTimeout(500);
    } catch (e) {
        console.log('⚠ Error al hacer scroll:', e.message);
    }
}

async function goHome(page) {
    try {
        await page.click('a[href="#/home"], a:has-text("Home")', { force: true, timeout: 5000 });
        console.log('✓ Navegando a Home');
        await page.waitForTimeout(3000);
        await scrollToTop(page);
        await page.waitForTimeout(1000);
        return true;
    } catch (e) {
        console.log('⚠ Error al navegar a Home con click, intentando por URL...');
        try {
            await page.goto('https://ed.engdis.com/ucbtarija#/home', { waitUntil: 'domcontentloaded', timeout: 10000 });
            console.log('✓ Navegado a Home por URL');
            await page.waitForTimeout(3000);
            return true;
        } catch (e2) {
            console.log('✗ Error al navegar a Home:', e2.message);
            return false;
        }
    }
}

async function clickLesson(page, lessonName) {
    try {
        const elements = await page.$$('span.home__courseListItemName.ng-binding, span.home__courseListItemName, .home__lessonList span, .lesson-name, span.ng-binding');
        for (const el of elements) {
            const text = await el.textContent();
            if (text && text.includes(lessonName)) {
                await el.scrollIntoViewIfNeeded();
                await el.click({ force: true });
                console.log(`✓ Click en lección: "${lessonName}"`);
                await page.waitForTimeout(3000);
                return true;
            }
        }
        console.log(`✗ No se encontró lección: "${lessonName}"`);
        return false;
    } catch (e) {
        console.log(`✗ Error al hacer click en lección "${lessonName}":`, e.message);
        return false;
    }
}

async function clickFirstStatus(page) {
    try {
        await scrollToTop(page);
        await page.waitForTimeout(1000);
        const el = page.locator('.home__status').first();
        await el.scrollIntoViewIfNeeded();
        await el.click({ force: true });
        console.log('✓ Click en primer .home__status');
        await page.waitForTimeout(2000);
        return true;
    } catch (e) {
        console.log('✗ Error al hacer click en .home__status:', e.message);
        return false;
    }
}

async function clickText(page, text, exact = false) {
    try {
        const locator = exact ? page.locator(`text="${text}"`).first() : page.locator(`text=${text}`).first();
        const exists = await locator.isVisible().catch(() => false);
        if (!exists) {
            console.log(`⚠ Elemento "${text}" no visible, buscando en DOM...`);
            const found = await page.evaluate((t) => {
                const els = document.querySelectorAll('span, a, div, button');
                for (const el of els) {
                    if (el.textContent.trim() === t || el.textContent.trim().includes(t)) {
                        el.click();
                        return true;
                    }
                }
                return false;
            }, text);
            if (found) {
                console.log(`✓ Click(Eval) en texto: "${text}"`);
                await page.waitForTimeout(2000);
                return true;
            }
            console.log(`✗ No se encontró elemento con texto: "${text}"`);
            return false;
        }
        await locator.click({ timeout: 5000 });
        console.log(`✓ Click en texto: "${text}"`);
        await page.waitForTimeout(2000);
        return true;
    } catch (e) {
        console.log(`⚠ Click normal falló, intentando con evaluate...`);
        try {
            const found = await page.evaluate((t) => {
                const els = document.querySelectorAll('span, a, div, button');
                for (const el of els) {
                    if (el.textContent.trim() === t || el.textContent.trim().includes(t)) {
                        el.click();
                        return true;
                    }
                }
                return false;
            }, text);
            if (found) {
                console.log(`✓ Click(Eval) en texto: "${text}"`);
                await page.waitForTimeout(2000);
                return true;
            }
        } catch (e2) {
            console.log(`✗ Error al hacer click en texto "${text}":`, e2.message);
        }
        return false;
    }
}

async function clickPlayButton(page) {
    try {
        await page.waitForSelector('#CTrackerPlayBtn', { timeout: 10000 });
        await page.click('#CTrackerPlayBtn');
        console.log('✓ Click en botón Play (#CTrackerPlayBtn)');
        await page.waitForTimeout(3000);
        return true;
    } catch (e) {
        console.log('✗ Error al hacer click en Play:', e.message);
        return false;
    }
}

async function spamNext(page, times) {
    let emptyConsecutive = 0;
    for (let i = 0; i < times; i++) {
        try {
            await page.waitForTimeout(2000);
            const hasRadio = await page.$('input[type="radio"]');
            const hasSeeAnswer = await page.$('#SeeAnswer');
            const hasNext = await page.$('.tasksBtnext');

            if (hasRadio && hasSeeAnswer) {
                emptyConsecutive = 0;
                console.log(`📌 Paso ${i + 1}/${times}: Detectado ejercicio, resolviendo...`);
                await solveSeleccionUnica(page);
            } else if (hasNext) {
                emptyConsecutive = 0;
                await page.waitForSelector('.tasksBtnext', { timeout: 5000 });
                await page.click('.tasksBtnext', { force: true, timeout: 5000 });
                await page.waitForTimeout(1500);
            } else {
                const playClicked = await clickPlay(page);
                if (playClicked) {
                    emptyConsecutive = 0;
                    console.log(`📌 Paso ${i + 1}/${times}: Click en botón Play`);
                    await page.waitForTimeout(4000);
                } else {
                    emptyConsecutive++;
                    if (emptyConsecutive >= 3) {
                        console.log(`✓ Lección completada (${i + 1} pasos, sin más acciones)`);
                        return;
                    }
                    console.log(`⚠ Paso ${i + 1}/${times}: Sin Next ni Play, esperando...`);
                    await page.waitForTimeout(3000);
                }
            }
        } catch (e) {
            console.log(`⚠ No se pudo completar el paso ${i + 1}/${times}: ${e.message}`);
        }
    }
    console.log(`✓ Lección completada (${times} pasos)`);
}

module.exports = {
    chromium, login, goHome, clickLesson, clickFirstStatus, clickText,
    clickPlayButton, spamNext, scrollToTop
};

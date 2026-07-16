const { loadEnv } = require('./env.js');

loadEnv();

async function fillWithFallback(page, selectors, value) {
    for (const selector of selectors) {
        try {
            await page.fill(selector, value, { timeout: 1500 });
            return true;
        } catch {
            continue;
        }
    }
    return false;
}

async function clickWithFallback(page, selectors) {
    for (const selector of selectors) {
        try {
            await page.click(selector, { timeout: 1500 });
            return true;
        } catch {
            continue;
        }
    }
    return false;
}

async function clickLoginOnThisDevice(page) {
    const candidates = [
        page.getByRole('button', { name: /Login on This Device/i }),
        page.getByText('Login on This Device', { exact: true }),
        page.locator('input[value*="Login on This Device" i]'),
        page.locator('button:has-text("Login on This Device")'),
        page.locator('a:has-text("Login on This Device")'),
        page.locator('#popupButtonsWrapper input[type="button"]')
    ];

    for (const candidate of candidates) {
        try {
            const first = candidate.first();
            await first.waitFor({ state: 'visible', timeout: 1200 });
            await first.click({ timeout: 1200, force: true });
            return true;
        } catch {
            continue;
        }
    }

    return await page.evaluate(() => {
        const elements = Array.from(document.querySelectorAll('button, input, a, div, span'));
        const button = elements.find((el) => {
            const text = `${el.innerText || ''} ${el.textContent || ''} ${el.value || ''}`.trim();
            return /Login on This Device/i.test(text);
        });

        if (!button) return false;
        button.click();
        return true;
    });
}

async function handleAlreadyLoggedInModal(page) {
    try {
        await page.waitForFunction(() => {
            return /You are already logged in/i.test(document.body?.innerText || '');
        }, { timeout: 6000, polling: 200 });

        console.log('Modal detectado: sesion abierta en otro dispositivo');
        const clicked = await clickLoginOnThisDevice(page);
        if (clicked) {
            console.log('Boton "Login on This Device" presionado');
            await page.waitForLoadState('domcontentloaded', { timeout: 8000 }).catch(() => {});
            await page.waitForTimeout(800);
            return true;
        }

        console.log('No se encontro el boton "Login on This Device"');
        return false;
    } catch (error) {
        if (!/Timeout/i.test(error.message)) {
            console.log('Error al manejar el modal:', error.message);
        }
        return false;
    }
}

async function login(page) {
    const loginUrl = process.env.LOGIN_URL || 'https://ed.engdis.com/ucbtarija#/login';
    const username = process.env.LOGIN_USERNAME;
    const password = process.env.LOGIN_PASSWORD;

    if (!username) throw new Error('Falta LOGIN_USERNAME en .env');
    if (!password) throw new Error('Falta LOGIN_PASSWORD en .env');

    await page.goto(loginUrl, { waitUntil: 'domcontentloaded' });

    const userFilled = await fillWithFallback(page, [
        'input[name="username"]',
        'input[id="username"]',
        'input[type="text"]',
        'input[placeholder*="user" i]',
        'input[placeholder*="usuario" i]'
    ], username);
    if (!userFilled) throw new Error('No se pudo encontrar el campo de usuario');
    console.log('Usuario ingresado');

    const passFilled = await fillWithFallback(page, [
        'input[name="password"]',
        'input[id="password"]',
        'input[type="password"]',
        'input[placeholder*="pass" i]',
        'input[placeholder*="contrasena" i]',
        'input[placeholder*="contraseña" i]'
    ], password);
    if (!passFilled) throw new Error('No se pudo encontrar el campo de contrasena');
    console.log('Contrasena ingresada');

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
    console.log('Login enviado');

    await handleAlreadyLoggedInModal(page);
    await page.waitForLoadState('domcontentloaded', { timeout: 8000 }).catch(() => {});
    await page.waitForFunction(() => {
        return !location.href.toLowerCase().includes('login');
    }, { timeout: 10000, polling: 300 }).catch(() => {});
    await page.waitForTimeout(500);

    const currentUrl = page.url();
    if (!currentUrl.toLowerCase().includes('login')) {
        console.log('Login exitoso!');
        return true;
    }

    console.log('Login fallido');
    return false;
}

module.exports = { login };

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

module.exports = { login };

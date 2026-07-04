const { chromium } = require('playwright');
const { login } = require('./login.js');
const { navigateToHome } = require('./home.js');

async function run() {
    const browser = await chromium.launch({ headless: false });
    const page = await browser.newPage();

    try {
        console.log('=== Iniciando Login ===');
        const loginSuccess = await login(page);
        
        if (!loginSuccess) {
            console.log('Login falló, abortando...');
            return;
        }

        console.log('=== Navegando a Home ===');
        const homeSuccess = await navigateToHome(page);
        
        if (homeSuccess) {
            console.log('✓ Successfully clicked unit element');
            await page.waitForTimeout(5000);
        }

    } catch (error) {
        console.error('Error:', error.message);
    } finally {
        await browser.close();
    }
}

run();
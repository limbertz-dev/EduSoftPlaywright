const { chromium } = require('playwright');

async function goToHomeUnit(page) {
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(3000);

    const unitSelectors = [
        'div.home__statusW.utils__unitColors_Unit1_Sub4-border',
        'div[ng-click*="statusClick"]',
        'div[edo-unit-gotolesson-tooltip=""]',
        'div[title="Go to lesson list"]',
        'div[style*="U_22202.jpg"]',
        'div.utils__unitColors_Unit1_Sub4-border'
    ];

    for (const selector of unitSelectors) {
        try {
            await page.waitForSelector(selector, { timeout: 5000 });
            const element = await page.$(selector);
            if (element) {
                await element.click({ timeout: 5000 });
                console.log('✓ Clicked on unit element');
                await page.waitForTimeout(3000);
                return true;
            }
        } catch (e) {
            continue;
        }
    }

    console.log('✗ Could not find unit element');
    return false;
}

async function navigateToHome(page) {
    await page.goto('https://ed.engdis.com/ucbtarija#/home', { waitUntil: 'domcontentloaded' });
    console.log('✓ Navigated to home page');
    return await goToHomeUnit(page);
}

module.exports = { goToHomeUnit, navigateToHome };
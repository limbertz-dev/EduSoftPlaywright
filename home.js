const { chromium } = require('playwright');

async function goToHomeUnit(page) {
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(3000);

    // Primero buscar el botón "Continue" (modo continue)
    try {
        const continueButton = await page.$('a:has-text("Continue"), button:has-text("Continue"), .continue-button, [class*="continue"]');
        if (continueButton) {
            console.log('✓ Detectado botón "Continue" - Haciendo clic para continuar');
            await continueButton.click();
            await page.waitForTimeout(3000);
            console.log('✓ Continuando a la lección');
            return true;
        }
    } catch (e) {
        console.log('⚠ No se encontró botón Continue, buscando unidad...');
    }

    // Si no hay Continue, buscar la unidad con title "Continue lesson" o "Go to lesson list"
    const unitSelectors = [
        'div.home__statusW[title="Continue lesson"]',
        'div.home__statusW[title="Go to lesson list"]',
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
                const title = await element.getAttribute('title') || '';
                console.log(`✓ Encontrado elemento con title: "${title}"`);
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

async function clickNickAndEmily(page) {
    await page.waitForTimeout(5000);
    
    try {
        const selectors = [
            'span.home__courseListItemName.ng-binding',
            'span.home__courseListItemName',
            'div.home__courseListItem span',
            '.home__courseListItem .ng-binding',
            '[class*="courseListItem"] span',
            'span[ng-binding]',
            '.home__lessonList span',
            '.lesson-name'
        ];
        
        let spans = [];
        let usedSelector = '';
        
        for (const selector of selectors) {
            try {
                await page.waitForSelector(selector, { timeout: 5000 });
                spans = await page.$$(selector);
                if (spans.length > 0) {
                    usedSelector = selector;
                    console.log(`✓ Encontrados ${spans.length} elementos con selector: ${selector}`);
                    break;
                }
            } catch (e) {
                continue;
            }
        }
        
        if (spans.length === 0) {
            console.log('✗ No se encontraron elementos de lecciones con ningún selector');
            try {
                const html = await page.content();
                console.log('Page HTML sample:', html.substring(0, 5000));
            } catch (e) {
                console.log('Could not get page content:', e.message);
            }
            return false;
        }
        
        // Buscar el que contiene "Nick and Emily"
        for (let i = 0; i < spans.length; i++) {
            const text = await spans[i].textContent();
            console.log(`Elemento ${i}: "${text}"`);
            
            if (text && text.includes('Nick and Emily')) {
                await spans[i].scrollIntoViewIfNeeded();
                await page.waitForTimeout(500);
                await spans[i].click();
                console.log('✓ Clicked on Nick and Emily');
                await page.waitForTimeout(3000);
                return true;
            }
        }
        
        console.log('✗ No se encontró "Nick and Emily" en los elementos');
        return false;
        
    } catch (e) {
        console.log('✗ Error buscando Nick and Emily:', e.message);
        return false;
    }
}

async function navigateToHome(page) {
    await page.goto('https://ed.engdis.com/ucbtarija#/home', { waitUntil: 'domcontentloaded' });
    console.log('✓ Navigated to home page');
    return await goToHomeUnit(page);
}

module.exports = { goToHomeUnit, navigateToHome, clickNickAndEmily };
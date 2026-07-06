const { chromium } = require('playwright');

async function goToLearningArea(page) {
    try {
        await page.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(3000);
        console.log('✓ Navegando al área de aprendizaje');
        return true;
    } catch (e) {
        console.log('✗ Error al navegar al área de aprendizaje:', e.message);
        return false;
    }
}

async function clickNextButton(page) {
    try {
        const nextButtonSelector = 'a.tasksBtnext.learning__pnItemLink.learning__nextItemLink';
        await page.waitForSelector(nextButtonSelector, { timeout: 5000 });
        await page.click(nextButtonSelector);
        console.log('✓ Click en botón Next');
        await page.waitForTimeout(2000);
        return true;
    } catch (e) {
        console.log('✗ Error al hacer click en botón Next:', e.message);
        return false;
    }
}

async function clickPlayButton(page) {
    try {
        const playButtonSelector = 'div.learning__RAMRButton.learning__RAMRButton--play';
        await page.waitForSelector(playButtonSelector, { timeout: 10000, state: 'visible' });
        await page.waitForTimeout(1000);
        
        const isDisabled = await page.$eval(playButtonSelector, el => 
            el.classList.contains('disabled') || el.hasAttribute('disabled')
        ).catch(() => false);
        
        if (isDisabled) {
            console.log('⚠ Botón Play está deshabilitado, esperando...');
            await page.waitForTimeout(3000);
        }
        
        await page.click(playButtonSelector);
        console.log('✓ Click en botón Play');
        await page.waitForTimeout(3000);
        return true;
    } catch (e) {
        console.log('✗ Error al hacer click en botón Play:', e.message);
        return false;
    }
}

async function completeExploreStep(page) {
    try {
        console.log('=== Iniciando Step 1: Explore ===');
        
        // Esperar a que la página cargue
        await page.waitForTimeout(3000);
        
        // DETECTAR ESTADO DE LA PÁGINA
        console.log('📌 Detectando estado de la página...');
        
        // 1. VERIFICAR SI YA ESTAMOS EN PRACTICE (Step 2)
        const hasPractice = await page.$('.multiRadioWrapper, .layout__radio, .multiRadio, .question-container, li#SeeAnswer, input.layout__radio');
        if (hasPractice) {
            console.log('✓ Ya estamos en Step 2: Practice - Saltando Step 1');
            return true;
        }
        
        // 2. VERIFICAR SI HAY BOTÓN "See Answer" (también indica Practice)
        const hasSeeAnswer = await page.$('li#SeeAnswer');
        if (hasSeeAnswer) {
            console.log('✓ Detectado botón "See Answer" - Saltando Step 1');
            return true;
        }
        
        // 3. VERIFICAR SI HAY BOTÓN PLAY
        const hasPlay = await page.$('div.learning__RAMRButton.learning__RAMRButton--play');
        const hasNext = await page.$('a.tasksBtnext.learning__pnItemLink.learning__nextItemLink');
        
        console.log(`📊 Debug - Play button: ${!!hasPlay}, Next button: ${!!hasNext}, Practice: ${!!hasPractice}`);
        
        // 4. MODO CONTINUE: Si hay Play y Next, es modo continue - solo ejecutar Play y Nexts
        if (hasPlay && hasNext) {
            console.log('✓ Detectado modo Continue - Ejecutando flujo simplificado');
            
            // Play
            console.log('📌 Click en botón Play');
            const success2 = await clickPlayButton(page);
            if (!success2) {
                console.log('⚠ No se pudo hacer click en Play');
                return false;
            }
            
            // Primer Next
            console.log('📌 Click en primer botón Next');
            const success3 = await clickNextButton(page);
            if (!success3) return false;
            
            // Segundo Next
            console.log('📌 Click en segundo botón Next');
            const success4 = await clickNextButton(page);
            if (!success4) return false;
            
            console.log('✓ Step 1: Explore (modo Continue) completado');
            return true;
        }
        
        // 5. PRIMERA VEZ: Si solo hay Play (sin Next) - primera vez
        if (hasPlay && !hasNext) {
            console.log('✓ Detectado primera vez - Ejecutando flujo completo');
            
            // Primer Next
            console.log('📌 Click en primer botón Next');
            const success1 = await clickNextButton(page);
            if (!success1) {
                console.log('⚠ No se encontró primer Next');
            }
            
            // Play
            console.log('📌 Click en botón Play');
            const success2 = await clickPlayButton(page);
            if (!success2) {
                console.log('⚠ No se pudo hacer click en Play');
            }
            
            // Segundo Next
            console.log('📌 Click en segundo botón Next');
            const success3 = await clickNextButton(page);
            if (!success3) {
                console.log('⚠ No se encontró segundo Next');
            }
            
            // Tercer Next
            console.log('📌 Click en tercer botón Next');
            const success4 = await clickNextButton(page);
            if (!success4) {
                console.log('⚠ No se encontró tercer Next');
            }
            
            console.log('✓ Step 1: Explore (primera vez) completado');
            return true;
        }
        
        console.log('✓ Step 1: Explore completado (o no necesario)');
        return true;
        
    } catch (e) {
        console.log('✗ Error al completar Step 1:', e.message);
        return false;
    }
}

module.exports = { goToLearningArea, clickNextButton, clickPlayButton, completeExploreStep };
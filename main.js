const { chromium } = require('playwright');
const { login } = require('./login.js');
const { navigateToHome, clickNickAndEmily } = require('./home.js');
const { completeExploreStep } = require('./learningArea.js');
const { completePracticeStep } = require('./practice.js');

console.log('=== SCRIPT INICIADO ===');

async function run() {
    console.log('=== Función run iniciada ===');
    const browser = await chromium.launch({ headless: false });
    const page = await browser.newPage();

    try {
        console.log('=== Iniciando Login ===');
        const loginSuccess = await login(page);
        console.log('Login result:', loginSuccess);
        
        if (!loginSuccess) {
            console.log('Login falló, abortando...');
            return;
        }

        console.log('=== Navegando a Home y seleccionando unidad/continuar ===');
        const homeSuccess = await navigateToHome(page);
        console.log('Home navigation result:', homeSuccess);
        
        if (homeSuccess) {
            console.log('✓ Navegación exitosa');
            await page.waitForTimeout(5000);
            
            // Ahora buscamos Nick and Emily si es necesario (por si acaso)
            // Pero en el modo directo, ya deberíamos estar en la lección
            // Verificamos si estamos en la página de lección
            const isLearningPage = await page.$('.learning__RAMRButton, .tasksBtnext').then(el => !!el).catch(() => false);
            
            if (!isLearningPage) {
                console.log('=== Buscando Nick and Emily para entrar a la lección ===');
                const nickAndEmilySuccess = await clickNickAndEmily(page);
                console.log('Nick and Emily result:', nickAndEmilySuccess);
                
                if (!nickAndEmilySuccess) {
                    console.log('✗ No se encontró Nick and Emily, abortando...');
                    return;
                }
                await page.waitForTimeout(5000);
            } else {
                console.log('✓ Ya estamos en la página de lección');
            }
            
            // Step 1: Explore
            console.log('=== Ejecutando Step 1: Explore ===');
            const exploreSuccess = await completeExploreStep(page);
            
            if (exploreSuccess) {
                console.log('✓ Step 1 completado exitosamente');
                await page.waitForTimeout(3000);
                
                // Step 2: Practice
                console.log('=== Ejecutando Step 2: Practice ===');
                const practiceSuccess = await completePracticeStep(page);
                
                if (practiceSuccess) {
                    console.log('✓ Step 2 completado exitosamente');
                    await page.waitForTimeout(5000);
                } else {
                    console.log('✗ Error al completar Step 2');
                }
            } else {
                console.log('✗ Error al completar Step 1');
            }
        } else {
            console.log('✗ No se pudo navegar a la unidad');
        }

    } catch (error) {
        console.error('Error en main:', error.message);
        console.error('Stack trace:', error.stack);
    } finally {
        console.log('=== Cerrando navegador ===');
        await browser.close();
        console.log('=== SCRIPT FINALIZADO ===');
    }
}

// Ejecutar la función run y manejar errores de promesa
run().catch(error => {
    console.error('Error no capturado:', error);
});
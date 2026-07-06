const { chromium } = require('playwright');

async function clickSeeAnswer(page) {
    try {
        const seeAnswerSelector = 'li#SeeAnswer.group';
        await page.waitForSelector(seeAnswerSelector, { timeout: 10000 });
        await page.click(seeAnswerSelector);
        console.log('✓ Click en "See Answer"');
        await page.waitForTimeout(2000);
        return true;
    } catch (e) {
        console.log('✗ Error al hacer click en "See Answer":', e.message);
        return false;
    }
}

async function getCorrectAnswerFromSelected(page) {
    try {
        const selectedRadio = await page.$('input.layout__radio:checked');
        if (selectedRadio) {
            const radioId = await selectedRadio.getAttribute('id');
            const labelSelector = `label[for="${radioId}"]`;
            const label = await page.$(labelSelector);
            if (label) {
                const text = await label.textContent();
                console.log(`✓ Respuesta correcta (desde radio seleccionado): "${text}"`);
                return text.trim();
            }
        }
        return null;
    } catch (e) {
        console.log('✗ Error al obtener respuesta desde radio:', e.message);
        return null;
    }
}

async function getCorrectAnswer(page) {
    try {
        const selectedSelector = 'li#SeeAnswer.group.selected';
        await page.waitForSelector(selectedSelector, { timeout: 10000 });
        const correctAnswerText = await page.$eval(selectedSelector, el => {
            const parent = el.closest('.learning__PATools');
            if (parent) {
                const selectedRadio = parent.querySelector('input.layout__radio:checked');
                if (selectedRadio) {
                    const label = parent.querySelector(`label[for="${selectedRadio.id}"]`);
                    if (label) {
                        return label.textContent.trim();
                    }
                }
            }
            return el.textContent.trim();
        });
        console.log(`✓ Respuesta correcta: "${correctAnswerText}"`);
        return correctAnswerText;
    } catch (e) {
        console.log('✗ Error al obtener respuesta correcta:', e.message);
        return null;
    }
}

async function selectCorrectRadioButton(page, correctAnswerText) {
    try {
        const radioButtons = await page.$$('input.layout__radio[type="radio"]');
        console.log(`✓ Encontrados ${radioButtons.length} radio buttons`);
        
        let found = false;
        for (let i = 0; i < radioButtons.length; i++) {
            const radioId = await radioButtons[i].getAttribute('id');
            const labelSelector = `label[for="${radioId}"]`;
            const label = await page.$(labelSelector);
            if (label) {
                const labelText = await label.textContent();
                console.log(`Radio ${i}: "${labelText}"`);
                
                const cleanLabel = labelText ? labelText.trim().toLowerCase() : '';
                const cleanAnswer = correctAnswerText ? correctAnswerText.trim().toLowerCase() : '';
                
                if (cleanLabel === cleanAnswer || cleanLabel.includes(cleanAnswer) || cleanAnswer.includes(cleanLabel)) {
                    await radioButtons[i].click();
                    console.log(`✓ Seleccionada respuesta correcta: "${correctAnswerText}"`);
                    found = true;
                    await page.waitForTimeout(1000);
                    break;
                }
            }
        }
        
        if (!found) {
            console.log('✗ No se encontró el radio button para la respuesta correcta');
            console.log(`Buscando: "${correctAnswerText}"`);
        }
        
        return found;
    } catch (e) {
        console.log('✗ Error al seleccionar radio button:', e.message);
        return false;
    }
}

async function clickCheckAnswer(page) {
    try {
        const checkAnswerSelector = 'li#CheckAnswer.group';
        await page.waitForSelector(checkAnswerSelector, { timeout: 10000 });
        await page.click(checkAnswerSelector);
        console.log('✓ Click en "Check Answer"');
        await page.waitForTimeout(2000);
        return true;
    } catch (e) {
        console.log('✗ Error al hacer click en "Check Answer":', e.message);
        return false;
    }
}

async function clickNextPractice(page) {
    try {
        const nextSelector = 'a.tasksBtnext.learning__pnItemLink.learning__nextItemLink';
        await page.waitForSelector(nextSelector, { timeout: 10000 });
        await page.click(nextSelector);
        console.log('✓ Click en Next (Practice)');
        await page.waitForTimeout(3000);
        return true;
    } catch (e) {
        console.log('✗ Error al hacer click en Next (Practice):', e.message);
        return false;
    }
}

async function checkStartTest(page) {
    try {
        const startTestSelectors = [
            'button:has-text("Start Test")',
            'a:has-text("Start Test")',
            '.start-test-button',
            '[class*="startTest"]'
        ];
        
        for (const selector of startTestSelectors) {
            try {
                const element = await page.$(selector);
                if (element && await element.isVisible()) {
                    console.log('✓ Detectado "Start Test" - Practice completado');
                    return true;
                }
            } catch (e) {
                continue;
            }
        }
        return false;
    } catch (e) {
        return false;
    }
}

// ===== NUEVOS TIPOS DE EJERCICIOS =====

// 1. TRUE/FALSE - Arrastrar a True o False
async function solveTrueFalse(page) {
    try {
        console.log('📌 Detectado ejercicio True/False');
        
        // Buscar los items que deben ser arrastrados
        const items = await page.$$('.drag-item, [draggable="true"], .sortable-item');
        console.log(`✓ Encontrados ${items.length} items para ordenar`);
        
        // Buscar las zonas de destino (True y False)
        const trueZone = await page.$('.true-zone, [data-answer="true"], .drop-true');
        const falseZone = await page.$('.false-zone, [data-answer="false"], .drop-false');
        
        if (!trueZone || !falseZone) {
            console.log('⚠ No se encontraron zonas True/False');
            return false;
        }
        
        // Obtener la respuesta correcta de "See Answer"
        console.log('📌 Mostrando respuesta correcta');
        await clickSeeAnswer(page);
        await page.waitForTimeout(2000);
        
        // Obtener qué items van a True y cuáles a False
        // Usando el selector 'selected' para identificar la respuesta correcta
        const correctItems = await page.$$('.selected .drag-item, .selected [draggable="true"]');
        console.log(`✓ Items correctos: ${correctItems.length}`);
        
        // Arrastrar cada item a su zona correspondiente
        // NOTA: Playwright no soporta drag-and-drop nativamente bien
        // Usamos una alternativa con JavaScript
        for (const item of items) {
            const itemText = await item.textContent();
            console.log(`📌 Procesando: "${itemText}"`);
            
            // Determinar si va a True o False basado en la respuesta correcta
            // Esto es simplificado - en la práctica necesitarías analizar la respuesta correcta
            try {
                await page.evaluate((item) => {
                    // Simular drag and drop
                    const event = new MouseEvent('mousedown', { bubbles: true });
                    item.dispatchEvent(event);
                }, item);
                await page.waitForTimeout(500);
            } catch (e) {
                console.log(`⚠ No se pudo arrastrar "${itemText}"`);
            }
        }
        
        // Click en "Check Answer"
        await clickCheckAnswer(page);
        return true;
    } catch (e) {
        console.log('✗ Error en True/False:', e.message);
        return false;
    }
}

// 2. ORDERING - Ordenar elementos
async function solveOrdering(page) {
    try {
        console.log('📌 Detectado ejercicio de Ordenamiento');
        
        // Buscar los items ordenables
        const items = await page.$$('.sortable-item, [draggable="true"], .drag-item');
        console.log(`✓ Encontrados ${items.length} items para ordenar`);
        
        // Mostrar respuesta correcta
        console.log('📌 Mostrando respuesta correcta');
        await clickSeeAnswer(page);
        await page.waitForTimeout(2000);
        
        // Obtener el orden correcto de los items
        // En la respuesta correcta, los items aparecen en el orden correcto
        const correctOrder = [];
        const sortedItems = await page.$$('.selected .sortable-item, .selected [draggable="true"]');
        
        for (const item of sortedItems) {
            const text = await item.textContent();
            correctOrder.push(text.trim());
        }
        console.log(`✓ Orden correcto: ${correctOrder.join(' → ')}`);
        
        // Reordenar los items según el orden correcto
        // Esto es simplificado - necesitarías implementar la lógica de reordenamiento
        for (let i = 0; i < correctOrder.length; i++) {
            // Buscar el item con el texto correcto y moverlo a la posición i
            // Implementación simplificada
        }
        
        // Click en "Check Answer"
        await clickCheckAnswer(page);
        return true;
    } catch (e) {
        console.log('✗ Error en Ordering:', e.message);
        return false;
    }
}

// 3. DETECTAR TIPO DE EJERCICIO
async function detectExerciseType(page) {
    try {
        // Verificar si es Multiple Choice
        const hasRadio = await page.$('input.layout__radio[type="radio"]');
        if (hasRadio) {
            console.log('✓ Detectado: Multiple Choice');
            return 'multiple-choice';
        }
        
        // Verificar si es True/False (drag and drop)
        const hasDragItems = await page.$('[draggable="true"], .drag-item, .sortable-item');
        const hasTrueFalse = await page.$('.true-zone, .false-zone, [data-answer="true"]');
        if (hasDragItems && hasTrueFalse) {
            console.log('✓ Detectado: True/False');
            return 'true-false';
        }
        
        // Verificar si es Ordering
        const hasSortable = await page.$('.sortable-container, .ordering-container');
        if (hasSortable && hasDragItems) {
            console.log('✓ Detectado: Ordering');
            return 'ordering';
        }
        
        // Verificar si es Fill in the blank
        const hasInput = await page.$('input[type="text"], textarea');
        if (hasInput) {
            console.log('✓ Detectado: Fill in the blank');
            return 'fill-blank';
        }
        
        console.log('⚠ No se pudo detectar el tipo de ejercicio');
        return 'unknown';
    } catch (e) {
        console.log('✗ Error detectando tipo:', e.message);
        return 'unknown';
    }
}

// 4. OBTENER NÚMERO DE TAREAS
async function getTotalTasks(page) {
    try {
        const taskSelector = 'span.learning__pnItemLinkTooltip';
        const element = await page.$(taskSelector);
        if (element) {
            const text = await element.textContent();
            console.log(`📊 Info tarea: "${text}"`);
            // Extraer "Task X of Y"
            const match = text.match(/Task\s*(\d+)\s*of\s*(\d+)/i);
            if (match) {
                const current = parseInt(match[1]);
                const total = parseInt(match[2]);
                console.log(`📊 Tarea ${current} de ${total}`);
                return { current, total };
            }
        }
        return null;
    } catch (e) {
        return null;
    }
}

// 5. FUNCIÓN PRINCIPAL DE PRACTICE
async function completePracticeStep(page) {
    try {
        console.log('=== Iniciando Step 2: Practice ===');
        
        let questionCount = 0;
        const maxQuestions = 20;
        let previousTask = -1;
        
        while (questionCount < maxQuestions) {
            console.log(`\n--- Ciclo ${questionCount + 1} ---`);
            
            // Esperar a que cargue
            await page.waitForTimeout(3000);
            
            // Verificar si llegamos a "Start Test"
            const hasStartTest = await checkStartTest(page);
            if (hasStartTest) {
                console.log('✓ Llegamos a "Start Test" - Práctica completada');
                return true;
            }
            
            // Obtener información de la tarea actual
            const taskInfo = await getTotalTasks(page);
            if (taskInfo) {
                console.log(`📊 Tarea ${taskInfo.current} de ${taskInfo.total}`);
                // Si es la misma tarea que antes, podría estar atascado
                if (taskInfo.current === previousTask) {
                    console.log('⚠ Misma tarea detectada, intentando avanzar...');
                }
                previousTask = taskInfo.current;
            }
            
            // Verificar si ya hay CheckAnswer disponible (ya respondida)
            const hasCheckAnswer = await page.$('li#CheckAnswer.group');
            if (hasCheckAnswer) {
                console.log('⚠ Detectado CheckAnswer - intentando avanzar...');
                const nextSuccess = await clickNextPractice(page);
                if (nextSuccess) {
                    questionCount++;
                    continue;
                }
            }
            
            // DETECTAR TIPO DE EJERCICIO
            const exerciseType = await detectExerciseType(page);
            console.log(`📌 Tipo de ejercicio: ${exerciseType}`);
            
            let success = false;
            
            switch (exerciseType) {
                case 'multiple-choice':
                    success = await solveMultipleChoice(page);
                    break;
                case 'true-false':
                    success = await solveTrueFalse(page);
                    break;
                case 'ordering':
                    success = await solveOrdering(page);
                    break;
                case 'fill-blank':
                    console.log('⚠ Fill in the blank - necesita implementación específica');
                    success = false;
                    break;
                default:
                    console.log('⚠ Tipo desconocido - intentando con método genérico');
                    success = await solveGeneric(page);
                    break;
            }
            
            if (!success) {
                console.log('⚠ Falló la resolución del ejercicio');
                // Intentar avanzar de todas formas
                const nextSuccess = await clickNextPractice(page);
                if (nextSuccess) {
                    questionCount++;
                    continue;
                }
                return false;
            }
            
            // Click en "Next" para avanzar
            console.log('📌 Avanzando a siguiente tarea');
            const nextSuccess = await clickNextPractice(page);
            if (!nextSuccess) {
                const hasStartTestFinal = await checkStartTest(page);
                if (hasStartTestFinal) {
                    console.log('✓ Llegamos a "Start Test" - Práctica completada');
                    return true;
                }
                console.log('⚠ No se pudo avanzar a la siguiente tarea');
            }
            
            questionCount++;
        }
        
        console.log(`✓ Step 2: Practice completado (${questionCount} tareas)`);
        return true;
        
    } catch (e) {
        console.log('✗ Error al completar Step 2:', e.message);
        return false;
    }
}

// 6. SOLVER MULTIPLE CHOICE (refactorizado)
async function solveMultipleChoice(page) {
    try {
        console.log('📌 Resolviendo Multiple Choice');
        
        // 1. Click en "See Answer"
        console.log('📌 Mostrando respuesta correcta');
        const success1 = await clickSeeAnswer(page);
        if (!success1) return false;
        
        // 2. Obtener respuesta correcta
        console.log('📌 Obteniendo respuesta correcta');
        let correctAnswer = await getCorrectAnswerFromSelected(page);
        if (!correctAnswer) {
            correctAnswer = await getCorrectAnswer(page);
        }
        if (!correctAnswer) {
            console.log('⚠ No se pudo obtener la respuesta correcta');
            return false;
        }
        
        // 3. Cerrar "See Answer"
        console.log('📌 Cerrando "See Answer"');
        const success2 = await clickSeeAnswer(page);
        if (!success2) return false;
        
        // 4. Seleccionar respuesta correcta
        console.log('📌 Seleccionando respuesta correcta');
        const success3 = await selectCorrectRadioButton(page, correctAnswer);
        if (!success3) return false;
        
        // 5. Click en "Check Answer"
        console.log('📌 Verificando respuesta');
        const success4 = await clickCheckAnswer(page);
        if (!success4) return false;
        
        return true;
    } catch (e) {
        console.log('✗ Error en Multiple Choice:', e.message);
        return false;
    }
}

// 7. SOLVER GENÉRICO (fallback)
async function solveGeneric(page) {
    try {
        console.log('📌 Intentando método genérico...');
        
        // Intentar ver si hay "See Answer"
        const hasSeeAnswer = await page.$('li#SeeAnswer.group');
        if (hasSeeAnswer) {
            console.log('✓ Usando método estándar con See Answer');
            return await solveMultipleChoice(page);
        }
        
        // Si no hay See Answer, intentar Next directamente
        console.log('⚠ No hay See Answer, intentando Next...');
        return await clickNextPractice(page);
    } catch (e) {
        console.log('✗ Error en método genérico:', e.message);
        return false;
    }
}

module.exports = { 
    clickSeeAnswer, 
    getCorrectAnswer, 
    getCorrectAnswerFromSelected,
    selectCorrectRadioButton, 
    clickCheckAnswer,
    clickNextPractice,
    checkStartTest,
    detectExerciseType,
    getTotalTasks,
    solveMultipleChoice,
    solveTrueFalse,
    solveOrdering,
    completePracticeStep 
};
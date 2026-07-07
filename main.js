const readline = require('readline');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

console.log('=== SCRIPT INICIADO ===');
console.log('Seleccione el tema a ejecutar:');
console.log('  1 - Tema 1');
console.log('  2 - Tema 2');
console.log('  3 - Tema 3');
console.log('  4 - Tema 4');
console.log('  5 - Tema 5');
console.log('  6 - Tema 6');
console.log('  7 - Tema 7');
console.log('  8 - Tema 8');
console.log('  9 - Tema 9');
console.log(' 10 - Tema 10');

rl.question('Ingrese el número del tema (1-10): ', async (answer) => {
    rl.close();
    const tema = parseInt(answer.trim(), 10);

    if (isNaN(tema) || tema < 1 || tema > 10) {
        console.log('✗ Opción inválida. Debe ingresar un número entre 1 y 10.');
        return;
    }

    console.log(`\n=== Ejecutando Tema ${tema} ===`);

    try {
        switch (tema) {
            case 1: {
                const { runTema1 } = require('./tema1.js');
                await runTema1();
                break;
            }
            case 2: {
                const { runTema2 } = require('./tema2.js');
                await runTema2();
                break;
            }
            default:
                console.log(`✗ Tema ${tema} aún no implementado.`);
        }
    } catch (error) {
        console.error('Error:', error.message);
    }
});

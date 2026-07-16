# funcionestest

Resolvers para pantallas de Test donde no existe el boton `#SeeAnswer`.

## IA para ejercicios de Test

El flujo de Test hace esto:

1. Busca una respuesta marcada en el DOM (`correct`, `data-correct`, `ng-reflect-is-correct`, etc.).
2. Si no existe, extrae pregunta y opciones visibles.
3. Si hay API configurada, pide una sugerencia a la IA.
4. Solo selecciona automaticamente la respuesta de IA cuando `AI_AUTO_SELECT=true`.

Tipos soportados en esta carpeta:

- `MCQ`
- `OpenEnded`
- `TinyMCE`
- `FITB`
- `Cloze`
- `Matching`
- `Classification`
- `Sequence`

`index.js` usa estos resolvers automaticamente cuando el ejercicio no tiene `#SeeAnswer`, que es el caso normal en Step 3/Test.

Variables de entorno:

```powershell
$env:AI_API_KEY="tu_api_key"
$env:AI_BASE_URL="https://api.groq.com/openai/v1/chat/completions"
$env:AI_MODEL="llama-3.3-70b-versatile"
$env:AI_AUTO_SELECT="true"
```

Opcionales:

```powershell
$env:TEST_ALLOW_GUESS="true"
```

`TEST_ALLOW_GUESS=true` permite usar la primera opcion visible si la IA no responde. Es solo para pruebas exploratorias porque puede fallar.

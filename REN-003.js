
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Rate } from 'k6/metrics';

const BASE_URL = 'https://agora-hub.vercel.app';
const PASSWORD = __ENV.AGORA_PASSWORD;
const TEST_RUN_ID = __ENV.TEST_RUN_ID || 'TEST_DEFAULT';

const VUS = parseInt(__ENV.VUS || '1');

// Métricas de rendimiento
const flashcardDuration = new Trend('create_flashcard_duration');
const dictionaryDuration = new Trend('add_dictionary_term_duration');

// Métricas de éxito
const flashcardSuccessRate = new Rate('flashcard_success_rate');
const dictionarySuccessRate = new Rate('dictionary_success_rate');

// 54 cuentas: driveram2000 a driveram2053
const accounts = Array.from({ length: 54 }, (_, i) => {
    return `driveram${2000 + i}@alumno.ipn.mx`;
});

// Encabezados comunes
const commonHeaders = {
    'Content-Type': 'application/json',
    'Origin': BASE_URL,
    'Referer': `${BASE_URL}/`,
};

export const options = {
    setupTimeout: '20m',

    scenarios: {
        writing_operations: {
            executor: 'per-vu-iterations',
            vus: VUS,
            iterations: 1,
            maxDuration: '5m',
        },
    },
};

// Validar respuesta de tRPC
function isTrpcSuccess(response) {
    try {
        const body = JSON.parse(response.body);

        return response.status === 200 &&
            Array.isArray(body) &&
            body.length > 0 &&
            body[0].result !== undefined &&
            body[0].error === undefined;
    } catch {
        return false;
    }
}

// ==================================================
// FASE 1: PREPARACIÓN Y VALIDACIÓN DE SESIONES
// ==================================================

export function setup() {

    if (!PASSWORD) {
        throw new Error('Falta configurar AGORA_PASSWORD');
    }

    if (VUS < 1 || VUS > 100) {
        throw new Error('VUS debe estar entre 1 y 100');
    }

    const sessions = [];

    console.log('========================================');
    console.log('PREPARACIÓN DE SESIONES');
    console.log(`Usuarios requeridos: ${VUS}`);
    console.log('========================================');

    for (let i = 0; i < VUS; i++) {

        const accountIndex = i % accounts.length;
        const email = accounts[accountIndex];

        console.log(
            `Preparando sesión ${i + 1}/${VUS} | ${email}`
        );

        // Distribuir los inicios de sesión
        if (i > 0) {
            sleep(10);
        }

        // 1. Iniciar sesión
        const loginResponse = http.post(
            `${BASE_URL}/api/auth/sign-in/email`,
            JSON.stringify({
                email: email,
                password: PASSWORD,
            }),
            {
                headers: commonHeaders,
                tags: { operation: 'setup_login' },
            }
        );

       if (loginResponse.status !== 200) {
    console.error(
        `ERROR LOGIN ${i + 1}/${VUS} | ` +
        `Cuenta: ${email} | ` +
        `HTTP: ${loginResponse.status} | ` +
        `Respuesta: ${String(loginResponse.body).slice(0, 500)}`
    );

    console.error(
        `Retry-After: ${loginResponse.headers['X-Retry-After']} | ` +
        `Headers: ${JSON.stringify(loginResponse.headers)}`
    );

    throw new Error(
        `Preparación cancelada: falló el login de ${email}. ` +
        'No se ejecutarán las escrituras.'
    );
}

        // 2. Recuperar cookies
        const cookieParts = [];

        for (const [name, cookies] of Object.entries(loginResponse.cookies)) {
            for (const cookie of cookies) {
                cookieParts.push(`${name}=${cookie.value}`);
            }
        }

        const cookieHeader = cookieParts.join('; ');

        if (!cookieHeader) {
            throw new Error(
                `Preparación cancelada: no se recibieron cookies para ${email}.`
            );
        }

        // 3. Validar sesión
        const sessionResponse = http.get(
            `${BASE_URL}/api/auth/get-session`,
            {
                headers: {
                    ...commonHeaders,
                    'Cookie': cookieHeader,
                },
                tags: { operation: 'setup_session' },
            }
        );

        let sessionBody = null;

        try {
            sessionBody = JSON.parse(sessionResponse.body);
        } catch {
            sessionBody = null;
        }

        const sessionValid =
            sessionResponse.status === 200 &&
            sessionBody !== null &&
            typeof sessionBody === 'object' &&
            sessionBody.user !== undefined;

        if (!sessionValid) {

            console.error(
                `ERROR SESIÓN ${i + 1}/${VUS} | ` +
                `Cuenta: ${email} | ` +
                `HTTP: ${sessionResponse.status} | ` +
                `Respuesta: ${String(sessionResponse.body).slice(0, 500)}`
            );

            throw new Error(
                `Preparación cancelada: sesión inválida para ${email}. ` +
                'No se ejecutarán las escrituras.'
            );
        }

        // 4. Guardar sesión para el VU correspondiente
        sessions.push({
            cookieHeader: cookieHeader,
        });
    }

    // 5. Verificación final obligatoria
    if (sessions.length !== VUS) {
        throw new Error(
            `Preparación incompleta: ${sessions.length}/${VUS} sesiones. ` +
            'No se ejecutarán las escrituras.'
        );
    }

    console.log('========================================');
    console.log('PREPARACIÓN COMPLETADA');
    console.log(`Logins exitosos: ${sessions.length}/${VUS}`);
    console.log(`Sesiones válidas: ${sessions.length}/${VUS}`);
    console.log('Todas las sesiones están listas.');
    console.log('Iniciando prueba de escritura...');
    console.log('========================================');

    return sessions;
}

// ==================================================
// FASE 2: PRUEBA DE ESCRITURA
// ==================================================

export default function (sessions) {

    // Cada VU recibe su sesión correspondiente
    const session = sessions[__VU - 1];

    if (!session || !session.cookieHeader) {
        throw new Error(
            `No existe una sesión válida para el VU ${__VU}`
        );
    }

    const headers = {
        ...commonHeaders,
        'Cookie': session.cookieHeader,
    };

    console.log(
        `VU ${__VU} | Iniciando operaciones de escritura`
    );

    // Cinco flashcards y cinco términos
    for (let i = 1; i <= 5; i++) {

        const identifier =
            `REN003_${TEST_RUN_ID}_VU${__VU}_ITER${__ITER}_N${i}`;

        // ------------------------------------------
        // 1. CREAR FLASHCARD
        // ------------------------------------------

        const flashcardInput = {
            0: {
                term: `Flashcard ${identifier}`,
                definition: `Definicion de prueba de rendimiento ${identifier}.`,
            },
        };

        const flashcardResponse = http.post(
            `${BASE_URL}/api/trpc/glossary.create?batch=1`,
            JSON.stringify(flashcardInput),
            {
                headers: headers,
                tags: { operation: 'create_flashcard' },
            }
        );

        flashcardDuration.add(
            flashcardResponse.timings.duration
        );

        const flashcardSuccess = isTrpcSuccess(flashcardResponse);

        flashcardSuccessRate.add(flashcardSuccess);

        check(flashcardResponse, {
            'Creación de flashcard exitosa': () => flashcardSuccess,
        });

        if (!flashcardSuccess) {
            console.error(
                `VU ${__VU} | Error flashcard ${i} | ` +
                `HTTP: ${flashcardResponse.status} | ` +
                `Respuesta: ${String(flashcardResponse.body).slice(0, 500)}`
            );
        }

        // ------------------------------------------
        // 2. AGREGAR TÉRMINO AL DICCIONARIO
        // ------------------------------------------

        const dictionaryInput = {
            0: {
                word: `Dictionary ${identifier}`,
                definition: `Definicion de prueba de rendimiento ${identifier}.`,
                language: 'en',
            },
        };

        const dictionaryResponse = http.post(
            `${BASE_URL}/api/trpc/dictionary.create?batch=1`,
            JSON.stringify(dictionaryInput),
            {
                headers: headers,
                tags: { operation: 'add_dictionary_term' },
            }
        );

        dictionaryDuration.add(
            dictionaryResponse.timings.duration
        );

        const dictionarySuccess = isTrpcSuccess(dictionaryResponse);

        dictionarySuccessRate.add(dictionarySuccess);

        check(dictionaryResponse, {
            'Alta de término en diccionario exitosa': () => dictionarySuccess,
        });

        if (!dictionarySuccess) {
            console.error(
                `VU ${__VU} | Error diccionario ${i} | ` +
                `HTTP: ${dictionaryResponse.status} | ` +
                `Respuesta: ${String(dictionaryResponse.body).slice(0, 500)}`
            );
        }
    }
}

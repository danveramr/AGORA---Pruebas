
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Rate } from 'k6/metrics';

const BASE_URL = 'https://agora-hub.vercel.app';
const PASSWORD = 'password';
const TEST_RUN_ID = __ENV.TEST_RUN_ID || 'REN005_PRUEBA001';

const VUS = 100;
const DURATION = '10m';

// ==================================================
// MÉTRICAS DE RENDIMIENTO
// ==================================================

const statsDuration = new Trend('meetings_stats_duration');
const meetingsDuration = new Trend('meetings_get_many_duration');

const flashcardDuration = new Trend('create_flashcard_duration');
const dictionaryDuration = new Trend('add_dictionary_term_duration');

const flashcardDeleteDuration = new Trend('delete_flashcard_duration');
const dictionaryDeleteDuration = new Trend('delete_dictionary_term_duration');

// ==================================================
// MÉTRICAS DE ÉXITO
// ==================================================

const statsSuccessRate = new Rate('meetings_stats_success_rate');
const meetingsSuccessRate = new Rate('meetings_get_many_success_rate');

const flashcardSuccessRate = new Rate('flashcard_success_rate');
const dictionarySuccessRate = new Rate('dictionary_success_rate');

const flashcardDeleteSuccessRate = new Rate('flashcard_delete_success_rate');
const dictionaryDeleteSuccessRate = new Rate('dictionary_delete_success_rate');

// ==================================================
// CUENTAS
// ==================================================

const accounts = Array.from({ length: 54 }, (_, i) => {
    return `driveram${2000 + i}@alumno.ipn.mx`;
});

const commonHeaders = {
    'Content-Type': 'application/json',
    'Origin': BASE_URL,
    'Referer': `${BASE_URL}/`,
};

// ==================================================
// CONFIGURACIÓN K6
// ==================================================

export const options = {
    setupTimeout: '10m',

    scenarios: {
        sustained_load: {
            executor: 'constant-vus',
            vus: VUS,
            duration: DURATION,
            gracefulStop: '30s',
        },
    },
};

// ==================================================
// FUNCIONES AUXILIARES
// ==================================================

function getTrpcData(response) {
    try {
        const body = JSON.parse(response.body);
        const envelope = Array.isArray(body) ? body[0] : body;

        if (!envelope || !envelope.result || envelope.error) {
            return null;
        }

        const result = envelope.result;

        if (
            result.data &&
            Object.prototype.hasOwnProperty.call(result.data, 'json')
        ) {
            return result.data.json;
        }

        if (Object.prototype.hasOwnProperty.call(result, 'json')) {
            return result.json;
        }

        if (result.data !== undefined) {
            return result.data;
        }

        return result;

    } catch {
        return null;
    }
}

function isTrpcSuccess(response) {
    return response.status === 200 &&
        getTrpcData(response) !== null;
}

function getCookieHeader(response) {
    const cookieParts = [];

    for (const [name, cookies] of Object.entries(response.cookies)) {
        for (const cookie of cookies) {
            cookieParts.push(`${name}=${cookie.value}`);
        }
    }

    return cookieParts.join('; ');
}

// ==================================================
// FASE 1: PREPARACIÓN DE SESIONES
// ==================================================

export function setup() {

    if (!PASSWORD) {
        throw new Error('Falta configurar AGORA_PASSWORD');
    }

    const sessions = [];

    console.log('========================================');
    console.log('PREPARACIÓN REN-005');
    console.log(`Usuarios virtuales: ${VUS}`);
    console.log(`Cuentas únicas: ${accounts.length}`);
    console.log(`Duración: ${DURATION}`);
    console.log('========================================');

    // Una sesión por cuenta.
    // Los VUs restantes reutilizarán estas sesiones.

    for (let i = 0; i < accounts.length; i++) {

        const email = accounts[i];

        console.log(
            `Preparando cuenta ${i + 1}/${accounts.length} | ${email}`
        );

// Distribuir los inicios de sesión
        if (i > 0) {
            sleep(10);
        }

        // ------------------------------------------
        // 1. LOGIN
        // ------------------------------------------

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
            throw new Error(
                `ERROR LOGIN | ${email} | HTTP ${loginResponse.status} | ` +
                `${String(loginResponse.body).slice(0, 500)}`
            );
        }

        const cookieHeader = getCookieHeader(loginResponse);

        if (!cookieHeader) {
            throw new Error(
                `No se recibieron cookies para ${email}`
            );
        }

        // ------------------------------------------
        // 2. VALIDAR SESIÓN
        // ------------------------------------------

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
            sessionBody.user !== undefined;

        if (!sessionValid) {
            throw new Error(
                `SESIÓN INVÁLIDA | ${email} | HTTP ${sessionResponse.status}`
            );
        }

        sessions.push({
            cookieHeader: cookieHeader,
        });
    }

    if (sessions.length !== accounts.length) {
        throw new Error('No se prepararon todas las sesiones.');
    }

    console.log('========================================');
    console.log('PREPARACIÓN COMPLETADA');
    console.log(`Sesiones válidas: ${sessions.length}/${accounts.length}`);
    console.log(`Usuarios virtuales: ${VUS}`);
    console.log('Iniciando carga sostenida...');
    console.log('========================================');

    return sessions;
}

// ==================================================
// FASE 2: CARGA SOSTENIDA
// ==================================================

export default function (sessions) {

    // Reutilizar las 54 sesiones entre los 100 VUs.

    const sessionIndex = (__VU - 1) % accounts.length;
    const session = sessions[sessionIndex];

    if (!session || !session.cookieHeader) {
        throw new Error(`No existe sesión para VU ${__VU}`);
    }

    const headers = {
        ...commonHeaders,
        'Cookie': session.cookieHeader,
    };

    const identifier =
        `${TEST_RUN_ID}_VU${__VU}_ITER${__ITER}`;

    // ==================================================
    // 1. CONSULTAR ESTADÍSTICAS
    // ==================================================

    const statsResponse = http.get(
        `${BASE_URL}/api/trpc/meetings.getStats`,
        {
            headers: headers,
            tags: { operation: 'meetings_get_stats' },
        }
    );

    statsDuration.add(statsResponse.timings.duration);

    const statsSuccess = isTrpcSuccess(statsResponse);

    statsSuccessRate.add(statsSuccess);

    check(statsResponse, {
        'Consulta de estadísticas exitosa': () => statsSuccess,
    });

    // ==================================================
    // 2. CONSULTAR ENTREVISTAS
    // ==================================================

    const meetingsInput = {
        json: {
            page: 1,
            pageSize: 10,
        },
    };

    const meetingsResponse = http.get(
        `${BASE_URL}/api/trpc/meetings.getMany?input=${encodeURIComponent(
            JSON.stringify(meetingsInput)
        )}`,
        {
            headers: headers,
            tags: { operation: 'meetings_get_many' },
        }
    );

    meetingsDuration.add(meetingsResponse.timings.duration);

    const meetingsSuccess = isTrpcSuccess(meetingsResponse);

    meetingsSuccessRate.add(meetingsSuccess);

    check(meetingsResponse, {
        'Consulta de entrevistas exitosa': () => meetingsSuccess,
    });

    // ==================================================
    // 3. CREAR FLASHCARD
    // ==================================================

    const flashcardInput = {
        0: {
            term: `Flashcard REN005_${identifier}`,
            definition: `Flashcard de prueba de estabilidad ${identifier}.`,
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

    flashcardDuration.add(flashcardResponse.timings.duration);

    const flashcardData = getTrpcData(flashcardResponse);

    const flashcardSuccess =
        flashcardResponse.status === 200 &&
        flashcardData !== null &&
        typeof flashcardData.id === 'string' &&
        flashcardData.id.length > 0;

    flashcardSuccessRate.add(flashcardSuccess);

    check(flashcardResponse, {
        'Creación de flashcard exitosa': () => flashcardSuccess,
    });

    // ==================================================
    // 4. CREAR TÉRMINO EN DICCIONARIO
    // ==================================================

    const dictionaryInput = {
        0: {
            word: `Dictionary REN005_${identifier}`,
            definition: `Dictionary de prueba de estabilidad ${identifier}.`,
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

    dictionaryDuration.add(dictionaryResponse.timings.duration);

    const dictionaryData = getTrpcData(dictionaryResponse);

    const dictionarySuccess =
        dictionaryResponse.status === 200 &&
        dictionaryData !== null &&
        typeof dictionaryData.id === 'string' &&
        dictionaryData.id.length > 0;

    dictionarySuccessRate.add(dictionarySuccess);

    check(dictionaryResponse, {
        'Alta de término en diccionario exitosa': () => dictionarySuccess,
    });

    // ==================================================
    // 5. ELIMINAR ÚNICAMENTE LA FLASHCARD RECIÉN CREADA
    // ==================================================

    if (flashcardSuccess) {

        const deleteFlashcardInput = {
            0: {
                id: flashcardData.id,
            },
        };

        const deleteFlashcardResponse = http.post(
            `${BASE_URL}/api/trpc/glossary.remove?batch=1`,
            JSON.stringify(deleteFlashcardInput),
            {
                headers: headers,
                tags: { operation: 'delete_flashcard' },
            }
        );

        flashcardDeleteDuration.add(
            deleteFlashcardResponse.timings.duration
        );

        const deleteSuccess = isTrpcSuccess(deleteFlashcardResponse);

        flashcardDeleteSuccessRate.add(deleteSuccess);

        check(deleteFlashcardResponse, {
            'Eliminación de flashcard exitosa': () => deleteSuccess,
        });

        if (!deleteSuccess) {
            console.error(
                `VU ${__VU} | Error eliminando flashcard REN-005 | ` +
                `ID: ${flashcardData.id} | ` +
                `HTTP: ${deleteFlashcardResponse.status}`
            );
        }

    } else {

        flashcardDeleteSuccessRate.add(false);

        check(null, {
            'Eliminación de flashcard exitosa': () => false,
        });

        console.error(
            `VU ${__VU} | No se eliminó flashcard: creación fallida.`
        );
    }

    // ==================================================
    // 6. ELIMINAR ÚNICAMENTE EL TÉRMINO RECIÉN CREADO
    // ==================================================

    if (dictionarySuccess) {

        const deleteDictionaryInput = {
            0: {
                id: dictionaryData.id,
            },
        };

        const deleteDictionaryResponse = http.post(
            `${BASE_URL}/api/trpc/dictionary.remove?batch=1`,
            JSON.stringify(deleteDictionaryInput),
            {
                headers: headers,
                tags: { operation: 'delete_dictionary_term' },
            }
        );

        dictionaryDeleteDuration.add(
            deleteDictionaryResponse.timings.duration
        );

        const deleteSuccess = isTrpcSuccess(deleteDictionaryResponse);

        dictionaryDeleteSuccessRate.add(deleteSuccess);

        check(deleteDictionaryResponse, {
            'Eliminación de término exitosa': () => deleteSuccess,
        });

        if (!deleteSuccess) {
            console.error(
                `VU ${__VU} | Error eliminando término REN-005 | ` +
                `ID: ${dictionaryData.id} | ` +
                `HTTP: ${deleteDictionaryResponse.status}`
            );
        }

    } else {

        dictionaryDeleteSuccessRate.add(false);

        check(null, {
            'Eliminación de término exitosa': () => false,
        });

        console.error(
            `VU ${__VU} | No se eliminó término: creación fallida.`
        );
    }
}

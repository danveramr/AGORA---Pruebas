
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Rate } from 'k6/metrics';

const BASE_URL = 'https://agora-hub.vercel.app';
const PASSWORD = 'password';
const TEST_RUN_ID = __ENV.TEST_RUN_ID || 'PRUEBA001';
const VUS = parseInt(__ENV.VUS || '1');

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

// ==================================================
// ENCABEZADOS
// ==================================================

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
        concurrent_operations: {
            executor: 'per-vu-iterations',
            vus: VUS,
            iterations: 1,
            maxDuration: '5m',
        },
    },
};

// ==================================================
// FUNCIONES AUXILIARES
// ==================================================

// Extraer resultado de una respuesta tRPC
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

// Validar respuesta tRPC
function isTrpcSuccess(response) {
    if (response.status !== 200) {
        return false;
    }

    return getTrpcData(response) !== null;
}

// Recuperar cookies
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
// FASE 1: PREPARACIÓN DE SESIONES Y REGISTROS
// ==================================================

export function setup() {

    if (!PASSWORD) {
        throw new Error('Falta configurar AGORA_PASSWORD');
    }

    if (VUS < 1 || VUS > 100) {
        throw new Error('VUS debe estar entre 1 y 100');
    }

    const vuData = new Array(VUS);

    const uniqueAccounts = Math.min(VUS, accounts.length);

    console.log('========================================');
    console.log('PREPARACIÓN REN-004');
    console.log(`Escenario: ${TEST_RUN_ID}`);
    console.log(`Usuarios virtuales: ${VUS}`);
    console.log(`Cuentas únicas: ${uniqueAccounts}`);
    console.log('========================================');

    // Una sesión por cuenta.
    // Si una cuenta corresponde a dos VUs, ambos reutilizan su sesión.

    for (let accountIndex = 0; accountIndex < uniqueAccounts; accountIndex++) {

        const email = accounts[accountIndex];

        console.log(
            `Preparando cuenta ${accountIndex + 1}/${uniqueAccounts} | ${email}`
        );

// Distribuir los inicios de sesión
        if (accountIndex > 0) {
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
            throw new Error(`No se recibieron cookies para ${email}`);
        }

        const headers = {
            ...commonHeaders,
            'Cookie': cookieHeader,
        };

        // ------------------------------------------
        // 2. VALIDAR SESIÓN
        // ------------------------------------------

        const sessionResponse = http.get(
            `${BASE_URL}/api/auth/get-session`,
            {
                headers: headers,
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

        // ------------------------------------------
        // 3. RECUPERAR FLASHCARDS DE REN-003
        // ------------------------------------------

        const glossaryResponse = http.get(
            `${BASE_URL}/api/trpc/glossary.getMany`,
            {
                headers: headers,
                tags: { operation: 'setup_glossary_lookup' },
            }
        );

        if (!isTrpcSuccess(glossaryResponse)) {
            throw new Error(
                `Error al consultar glosario de ${email}: ` +
                `${String(glossaryResponse.body).slice(0, 500)}`
            );
        }

        const glossaryEntries = getTrpcData(glossaryResponse);

        if (!Array.isArray(glossaryEntries)) {
            throw new Error(`Respuesta inválida de glossary.getMany para ${email}`);
        }

        // ------------------------------------------
        // 4. RECUPERAR TÉRMINOS DE REN-003
        // ------------------------------------------

        const dictionaryResponse = http.get(
            `${BASE_URL}/api/trpc/dictionary.getMany`,
            {
                headers: headers,
                tags: { operation: 'setup_dictionary_lookup' },
            }
        );

        if (!isTrpcSuccess(dictionaryResponse)) {
            throw new Error(
                `Error al consultar diccionario de ${email}: ` +
                `${String(dictionaryResponse.body).slice(0, 500)}`
            );
        }

        const dictionaryEntries = getTrpcData(dictionaryResponse);

        if (!Array.isArray(dictionaryEntries)) {
            throw new Error(`Respuesta inválida de dictionary.getMany para ${email}`);
        }

        // ------------------------------------------
        // 5. ASIGNAR REGISTROS A CADA VU
        // ------------------------------------------

        // Una misma cuenta puede corresponder a varios VUs.
        // Ejemplo: con 100 VUs, la cuenta 1 corresponde a VU 1 y VU 55.

        for (
            let vu = accountIndex + 1;
            vu <= VUS;
            vu += accounts.length
        ) {

            const identifier =
                `REN003_${TEST_RUN_ID}_VU${vu}_ITER0_N1`;

            const flashcard = glossaryEntries.find(
                entry => entry.term === `Flashcard ${identifier}`
            );

            const dictionaryTerm = dictionaryEntries.find(
                entry => entry.word === `Dictionary ${identifier}`
            );

            if (!flashcard || !dictionaryTerm) {
                throw new Error(
                    `No se encontraron los registros de REN-003 para VU ${vu}. ` +
                    `Identificador: ${identifier}. ` +
                    `Cuenta: ${email}`
                );
            }

            vuData[vu - 1] = {
                cookieHeader: cookieHeader,
                flashcardId: flashcard.id,
                dictionaryId: dictionaryTerm.id,
            };

            console.log(
                `VU ${vu} | Registros recuperados correctamente`
            );
        }
    }

    // ------------------------------------------
    // 6. VALIDACIÓN FINAL
    // ------------------------------------------

    if (vuData.some(data => !data)) {
        throw new Error(
            'Preparación incompleta: no todos los VUs tienen sus registros.'
        );
    }

    console.log('========================================');
    console.log('PREPARACIÓN COMPLETADA');
    console.log(`Sesiones: ${uniqueAccounts}/${uniqueAccounts}`);
    console.log(`Registros asignados: ${VUS}/${VUS}`);
    console.log('Iniciando operaciones concurrentes...');
    console.log('========================================');

    return vuData;
}

// ==================================================
// FASE 2: OPERACIONES CONCURRENTES
// ==================================================

export default function (vuData) {

    const data = vuData[__VU - 1];

    if (!data || !data.cookieHeader) {
        throw new Error(`No existe información para VU ${__VU}`);
    }

    const headers = {
        ...commonHeaders,
        'Cookie': data.cookieHeader,
    };

    const identifier =
        `REN004_${TEST_RUN_ID}_VU${__VU}_ITER${__ITER}`;

    console.log(`VU ${__VU} | Iniciando operaciones REN-004`);

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

    if (!statsSuccess) {
        console.error(
            `VU ${__VU} | Error getStats | HTTP ${statsResponse.status}`
        );
    }

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

    if (!meetingsSuccess) {
        console.error(
            `VU ${__VU} | Error getMany | HTTP ${meetingsResponse.status}`
        );
    }

    // ==================================================
    // 3. CREAR FLASHCARD
    // ==================================================

    const flashcardInput = {
        0: {
            term: `Flashcard ${identifier}`,
            definition: `Flashcard creada durante REN-004 ${identifier}.`,
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

    const flashcardSuccess = isTrpcSuccess(flashcardResponse);

    flashcardSuccessRate.add(flashcardSuccess);

    check(flashcardResponse, {
        'Creación de flashcard exitosa': () => flashcardSuccess,
    });

    if (!flashcardSuccess) {
        console.error(
            `VU ${__VU} | Error create flashcard | HTTP ${flashcardResponse.status}`
        );
    }

    // ==================================================
    // 4. CREAR TÉRMINO EN DICCIONARIO
    // ==================================================

    const dictionaryInput = {
        0: {
            word: `Dictionary ${identifier}`,
            definition: `Término creado durante REN-004 ${identifier}.`,
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

    const dictionarySuccess = isTrpcSuccess(dictionaryResponse);

    dictionarySuccessRate.add(dictionarySuccess);

    check(dictionaryResponse, {
        'Alta de término en diccionario exitosa': () => dictionarySuccess,
    });

    if (!dictionarySuccess) {
        console.error(
            `VU ${__VU} | Error create dictionary | HTTP ${dictionaryResponse.status}`
        );
    }

    // ==================================================
    // 5. ELIMINAR FLASHCARD DE REN-003
    // ==================================================

    const deleteFlashcardInput = {
        0: {
            id: data.flashcardId,
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

    const flashcardDeleteSuccess = isTrpcSuccess(deleteFlashcardResponse);

    flashcardDeleteSuccessRate.add(flashcardDeleteSuccess);

    check(deleteFlashcardResponse, {
        'Eliminación de flashcard exitosa': () => flashcardDeleteSuccess,
    });

    if (!flashcardDeleteSuccess) {
        console.error(
            `VU ${__VU} | Error delete flashcard | ` +
            `HTTP ${deleteFlashcardResponse.status} | ` +
            `${String(deleteFlashcardResponse.body).slice(0, 500)}`
        );
    }

    // ==================================================
    // 6. ELIMINAR TÉRMINO DE REN-003
    // ==================================================

    const deleteDictionaryInput = {
        0: {
            id: data.dictionaryId,
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

    const dictionaryDeleteSuccess = isTrpcSuccess(deleteDictionaryResponse);

    dictionaryDeleteSuccessRate.add(dictionaryDeleteSuccess);

    check(deleteDictionaryResponse, {
        'Eliminación de término exitosa': () => dictionaryDeleteSuccess,
    });

    if (!dictionaryDeleteSuccess) {
        console.error(
            `VU ${__VU} | Error delete dictionary | ` +
            `HTTP ${deleteDictionaryResponse.status} | ` +
            `${String(deleteDictionaryResponse.body).slice(0, 500)}`
        );
    }

    console.log(`VU ${__VU} | Operaciones REN-004 finalizadas`);
}

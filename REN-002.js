
import http from 'k6/http';
import { check } from 'k6';
import { Trend } from 'k6/metrics';

const BASE_URL = 'https://agora-hub.vercel.app';
const PASSWORD = __ENV.AGORA_PASSWORD;

const statsDuration = new Trend('get_stats_duration');
const manyDuration = new Trend('get_many_duration');

// 54 cuentas: driveram2004 a driveram2058,
// excluyendo driveram2005.
const accounts = Array.from({ length: 54 }, (_, i) => {
    return `driveram${2000 + i}@alumno.ipn.mx`;
});

const VUS = parseInt(__ENV.VUS || '1');

export const options = {
    scenarios: {
        meetings_queries: {
            executor: 'per-vu-iterations',
            vus: VUS,
            iterations: 1,
            maxDuration: '3m',
        },
    },
};

function isTrpcSuccess(response) {
    try {
        const body = JSON.parse(response.body);

        return response.status === 200 &&
            body.result !== undefined &&
            body.error === undefined;
    } catch {
        return false;
    }
}

export default function () {

    // 1. Seleccionar una cuenta para cada VU
    const accountIndex = (__VU - 1) % accounts.length;
    const email = accounts[accountIndex];

    console.log(`VU ${__VU} | Cuenta: ${email}`);

    // 2. Inicio de sesión
    const loginResponse = http.post(
        `${BASE_URL}/api/auth/sign-in/email`,
        JSON.stringify({
            email: email,
            password: PASSWORD,
        }),
        {
            headers: {
                'Content-Type': 'application/json',
            },
            tags: { operation: 'auth' },
        }
    );

    const loginSuccess = check(loginResponse, {
        'Inicio de sesión HTTP 200': (r) => r.status === 200,
    });

    if (!loginSuccess) {
        console.error(
            `VU ${__VU} | Cuenta: ${email} | HTTP: ${loginResponse.status} | Respuesta: ${String(loginResponse.body).slice(0, 300)}`
        );
        return;
    }

    // 3. Verificar sesión
    const sessionResponse = http.get(
        `${BASE_URL}/api/auth/get-session`,
        {
            tags: { operation: 'auth' },
        }
    );

    const sessionSuccess = check(sessionResponse, {
        'Consulta de sesión HTTP 200': (r) =>
            r.status === 200 && r.body !== 'null',
    });

    if (!sessionSuccess) {
        console.error(
            `VU ${__VU} | Error al verificar sesión | HTTP: ${sessionResponse.status}`
        );
        return;
    }

    // 4. Consultar estadísticas
    const statsResponse = http.get(
        `${BASE_URL}/api/trpc/meetings.getStats`,
        {
            tags: { operation: 'getStats' },
        }
    );

    statsDuration.add(statsResponse.timings.duration);

    check(statsResponse, {
        'getStats ejecutado correctamente': (r) => isTrpcSuccess(r),
    });

    if (!isTrpcSuccess(statsResponse)) {
        console.error(
            `VU ${__VU} | Error getStats | HTTP: ${statsResponse.status} | Respuesta: ${String(statsResponse.body).slice(0, 300)}`
        );
    }

    // 5. Consultar entrevistas paginadas
    const input = {
        json: {
            page: 1,
            pageSize: 10,
        },
    };

    const encodedInput = encodeURIComponent(JSON.stringify(input));

    const manyResponse = http.get(
        `${BASE_URL}/api/trpc/meetings.getMany?input=${encodedInput}`,
        {
            tags: { operation: 'getMany' },
        }
    );

    manyDuration.add(manyResponse.timings.duration);

    check(manyResponse, {
        'getMany ejecutado correctamente': (r) => isTrpcSuccess(r),
    });

    if (!isTrpcSuccess(manyResponse)) {
        console.error(
            `VU ${__VU} | Error getMany | HTTP: ${manyResponse.status} | Respuesta: ${String(manyResponse.body).slice(0, 300)}`
        );
    }
}

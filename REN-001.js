
import http from 'k6/http';
import { check } from 'k6';
import { Trend } from 'k6/metrics';

// URL de Agora
const BASE_URL = 'https://agora-hub.vercel.app';

// Métricas personalizadas
const loginDuration = new Trend('login_duration');
const sessionDuration = new Trend('session_duration');

// Contraseña común de las cuentas de prueba
const PASSWORD = __ENV.AGORA_PASSWORD;

// Generar las 50 cuentas automáticamente
const accounts = Array.from({ length: 50 }, (_, i) => {
    return `driveram${2004 + i}@alumno.ipn.mx`;
});

// Número de usuarios virtuales configurable
const VUS = parseInt(__ENV.VUS || '1');

// Configuración de la prueba
export const options = {
    scenarios: {
        login_load: {
            executor: 'per-vu-iterations',
            vus: VUS,
            iterations: 1,
            maxDuration: '2m',
        },
    },
};

export default function () {

    // Distribuir las cuentas entre los usuarios virtuales.
    // Si hay más de 50 VUs, las cuentas comenzarán a reutilizarse.
    const accountIndex = (__VU - 1) % accounts.length;

    const email = accounts[accountIndex];

    console.log(`VU ${__VU} | Cuenta: ${email}`);

    // 1. Inicio de sesión
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
            tags: {
                operation: 'login',
            },
        }
    );

    loginDuration.add(loginResponse.timings.duration);

    const loginSuccess = check(loginResponse, {
        'Inicio de sesión HTTP 200': (r) => r.status === 200,
    });

    if (!loginSuccess) {
        console.log(
            `VU ${__VU} | Login fallido | HTTP ${loginResponse.status}`
        );

        return;
    }

    // 2. Consulta de sesión
    const sessionResponse = http.get(
        `${BASE_URL}/api/auth/get-session`,
        {
            tags: {
                operation: 'session',
            },
        }
    );

    sessionDuration.add(sessionResponse.timings.duration);

    const sessionHttpSuccess = check(sessionResponse, {
        'Consulta de sesión HTTP 200': (r) => r.status === 200,
    });

    if (!sessionHttpSuccess) {
        console.log(
            `VU ${__VU} | Consulta de sesión fallida | HTTP ${sessionResponse.status}`
        );

        return;
    }

    // 3. Comprobar que la sesión contiene un usuario válido
    let sessionData = null;

    try {
        sessionData = sessionResponse.json();
    } catch (error) {
        console.log(`VU ${__VU} | Error al interpretar la sesión`);
    }

    check(sessionData, {
        'Sesión de usuario válida': (data) =>
            data !== null &&
            data.session !== null &&
            data.session !== undefined &&
            data.user !== null &&
            data.user !== undefined,
    });
}

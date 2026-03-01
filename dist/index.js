"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const axios_1 = __importDefault(require("axios"));
const crypto_js_1 = __importDefault(require("crypto-js"));
const csv_writer_1 = require("csv-writer");
const telegraf_1 = require("telegraf");
const fs = __importStar(require("fs"));
const CLIENT_ID = process.env.TUYA_CLIENT_ID || '';
const CLIENT_SECRET = process.env.TUYA_CLIENT_SECRET || '';
const REGION = process.env.TUYA_REGION || 'us';
const BASE_URL = REGION === 'eu'
    ? 'https://openapi.tuyaeu.com'
    : REGION === 'cn'
        ? 'https://openapi.tuyacn.com'
        : 'https://openapi.tuyaus.com';
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '';
const ALERTAS_FILE = 'alertas_enviadas.json';
const DEVICE_NAMES = {
    [process.env.TUYA_DEVICE_ID_BALCONY || '']: 'Balcón',
    [process.env.TUYA_DEVICE_ID_INTERIOR || '']: 'Interior'
};
const BATTERY_STATES = {
    'high': 'Alta',
    'middle': 'Media',
    'low': 'Baja'
};
let bot = null;
if (TELEGRAM_BOT_TOKEN) {
    bot = new telegraf_1.Telegraf(TELEGRAM_BOT_TOKEN);
}
function leerAlertasEnviadas() {
    try {
        if (fs.existsSync(ALERTAS_FILE)) {
            const data = fs.readFileSync(ALERTAS_FILE, 'utf-8');
            return JSON.parse(data);
        }
    }
    catch (error) {
        console.error('Error al leer archivo de alertas:', error);
    }
    return {};
}
function guardarAlertaEnviada(sensor, fecha) {
    try {
        const alertas = leerAlertasEnviadas();
        alertas[sensor] = fecha;
        fs.writeFileSync(ALERTAS_FILE, JSON.stringify(alertas, null, 2));
    }
    catch (error) {
        console.error('Error al guardar alerta:', error);
    }
}
function debeEnviarAlerta(sensor) {
    const ahora = new Date();
    const horaActual = ahora.getHours();
    if (horaActual < 10 || horaActual >= 22) {
        return false;
    }
    const alertas = leerAlertasEnviadas();
    const ultimaAlerta = alertas[sensor];
    if (!ultimaAlerta) {
        return true;
    }
    const hoy = ahora.toLocaleDateString('es-AR');
    return ultimaAlerta !== hoy;
}
async function enviarAlerta(sensor, estadoBateria) {
    if (!bot || !TELEGRAM_CHAT_ID) {
        console.log('⚠️  Telegram no configurado, no se puede enviar alerta');
        return;
    }
    if (!debeEnviarAlerta(sensor)) {
        console.log(`⏭️  Alerta para ${sensor} ya enviada hoy o fuera de horario (10-22hs)`);
        return;
    }
    const mensaje = `🔋 ⚠️ BATERÍA BAJA\n\nSensor: ${sensor}\nEstado de batería: ${estadoBateria}\n\nPor favor, reemplaza la batería pronto.`;
    try {
        await bot.telegram.sendMessage(TELEGRAM_CHAT_ID, mensaje);
        const ahora = new Date();
        const hoy = ahora.toLocaleDateString('es-AR');
        guardarAlertaEnviada(sensor, hoy);
        console.log(`📱 Alerta enviada por Telegram: ${sensor} - Batería ${estadoBateria}`);
    }
    catch (error) {
        console.error('Error al enviar mensaje de Telegram:', error);
    }
}
const csvWriter = (0, csv_writer_1.createObjectCsvWriter)({
    path: 'devices.csv',
    append: true,
    header: [
        { id: 'fecha', title: 'FECHA' },
        { id: 'hora', title: 'HORA' },
        { id: 'sensor', title: 'SENSOR' },
        { id: 'temperatura', title: 'TEMPERATURA' },
        { id: 'unidad_temp', title: 'UNIDAD' },
        { id: 'humedad', title: 'HUMEDAD_%' },
        { id: 'bateria', title: 'ESTADO_BATERIA' },
        { id: 'device_id', title: 'DEVICE_ID' },
        { id: 'otros_datos', title: 'OTROS_DATOS' }
    ]
});
function getFechaBuenosAires() {
    const now = new Date();
    const buenosAires = new Date(now.toLocaleString('en-US', { timeZone: 'America/Argentina/Buenos_Aires' }));
    const fecha = buenosAires.toLocaleDateString('es-AR', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    });
    const hora = buenosAires.toLocaleTimeString('es-AR', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    });
    return { fecha, hora };
}
function sha256(content) {
    return crypto_js_1.default.SHA256(content).toString(crypto_js_1.default.enc.Hex);
}
function hmac(str) {
    return crypto_js_1.default.HmacSHA256(str, CLIENT_SECRET)
        .toString(crypto_js_1.default.enc.Hex)
        .toUpperCase();
}
function buildSign(method, path, token, t, body = '') {
    const bodyHash = sha256(body);
    const stringToSign = method + '\n' +
        bodyHash + '\n' +
        '\n' +
        path;
    const signStr = CLIENT_ID + token + t + stringToSign;
    return hmac(signStr);
}
async function getToken() {
    const t = Date.now().toString();
    const path = '/v1.0/token?grant_type=1';
    const sign = buildSign('GET', path, '', t);
    const res = await axios_1.default.get(`${BASE_URL}${path}`, {
        headers: {
            client_id: CLIENT_ID,
            sign,
            t,
            sign_method: 'HMAC-SHA256'
        }
    });
    if (!res.data.success) {
        throw new Error(res.data.msg);
    }
    return res.data.result.access_token;
}
async function getDeviceStatus(token, deviceId) {
    const t = Date.now().toString();
    const path = `/v1.0/devices/${deviceId}/status`;
    const sign = buildSign('GET', path, token, t);
    const res = await axios_1.default.get(`${BASE_URL}${path}`, {
        headers: {
            client_id: CLIENT_ID,
            access_token: token,
            sign,
            t,
            sign_method: 'HMAC-SHA256'
        }
    });
    return res.data.result;
}
function parsearDatos(status) {
    const datos = {};
    for (const item of status) {
        switch (item.code) {
            case 'va_temperature':
                datos.temperatura = item.value / 10;
                break;
            case 'va_humidity':
                datos.humedad = item.value;
                break;
            case 'battery_state':
                datos.bateria_raw = item.value;
                datos.bateria = BATTERY_STATES[item.value] || item.value;
                break;
            case 'temp_unit_convert':
                datos.unidad_temp = item.value.toUpperCase();
                break;
            case 'battery_percentage':
            case 'battery':
                datos.bateria_porcentaje = item.value;
                break;
            default:
                if (!datos.otros)
                    datos.otros = [];
                datos.otros.push({ [item.code]: item.value });
        }
    }
    return datos;
}
async function main() {
    try {
        const token = await getToken();
        const devices = [
            process.env.TUYA_DEVICE_ID_BALCONY || '',
            process.env.TUYA_DEVICE_ID_INTERIOR || ''
        ];
        const { fecha, hora } = getFechaBuenosAires();
        console.log('\n--- Registro de sensores ---');
        for (const d of devices) {
            if (!d)
                continue;
            const status = await getDeviceStatus(token, d);
            const datos = parsearDatos(status);
            const row = {
                fecha,
                hora,
                sensor: DEVICE_NAMES[d] || 'Desconocido',
                temperatura: datos.temperatura ?? 'N/A',
                unidad_temp: datos.unidad_temp ?? 'N/A',
                humedad: datos.humedad ?? 'N/A',
                bateria: datos.bateria ?? 'N/A',
                device_id: d,
                otros_datos: datos.otros ? JSON.stringify(datos.otros) : ''
            };
            await csvWriter.writeRecords([row]);
            console.log(`${row.fecha},${row.hora},${row.sensor},${row.temperatura},${row.unidad_temp},${row.humedad},${row.bateria},${row.device_id},"${row.otros_datos}"`);
            if (datos.bateria_raw === 'low') {
                await enviarAlerta(row.sensor, datos.bateria);
            }
        }
        console.log('--- Fin del registro ---\n');
    }
    catch (err) {
        console.error('ERROR:', err);
    }
}
async function testTelegram() {
    if (!bot || !TELEGRAM_CHAT_ID) {
        console.log('❌ Telegram no está configurado correctamente');
        console.log('Verifica que tengas TELEGRAM_BOT_TOKEN y TELEGRAM_CHAT_ID en tu .env');
        return;
    }
    console.log('📱 Enviando mensaje de prueba a Telegram...');
    try {
        await bot.telegram.sendMessage(TELEGRAM_CHAT_ID, '✅ Test exitoso!\n\nEl bot de Telegram está funcionando correctamente.');
        console.log('✅ Mensaje de prueba enviado correctamente');
    }
    catch (error) {
        console.error('❌ Error al enviar mensaje de prueba:', error);
    }
}
if (process.argv.includes('test')) {
    testTelegram();
}
else {
    main();
}

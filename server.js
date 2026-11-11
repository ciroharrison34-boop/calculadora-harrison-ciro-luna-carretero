/**
 * server.js — Servidor Express de la calculadora de métodos numéricos.
 *
 * - Sirve SOLO la carpeta /public (nunca la raíz del proyecto: .git, .env,
 *   server.js, package.json, etc. quedan fuera del alcance del navegador).
 * - API REST para guardar/cargar cálculos en MySQL/MariaDB con mysql2
 *   y consultas parametrizadas (sin inyección SQL).
 * - Toda la configuración sale de variables de entorno (ver .env.example).
 *
 * Uso:   npm start        →  http://localhost:5173  (o process.env.PORT)
 */
const path = require('path');
const fs = require('fs');
const express = require('express');
const mysql = require('mysql2/promise');

/* ------------------------------------------------------------------ */
/* Carga mínima de .env (sin dependencias extra)                       */
/* En Render las variables se configuran en el panel; el archivo .env  */
/* solo hace falta en local (ya está en .gitignore).                   */
/* ------------------------------------------------------------------ */
function cargarEnv(ruta) {
  try {
    if (!fs.existsSync(ruta)) return;
    fs.readFileSync(ruta, 'utf8').split(/\r?\n/).forEach(function (linea) {
      const t = linea.trim();
      if (!t || t.charAt(0) === '#') return;
      const i = t.indexOf('=');
      if (i <= 0) return;
      const clave = t.slice(0, i).trim();
      let valor = t.slice(i + 1).trim();
      if ((valor.charAt(0) === '"' && valor.charAt(valor.length - 1) === '"') ||
          (valor.charAt(0) === "'" && valor.charAt(valor.length - 1) === "'")) {
        valor = valor.slice(1, -1);
      }
      if (!(clave in process.env)) process.env[clave] = valor;
    });
  } catch (e) {
    console.warn('[aviso] No se pudo leer el archivo .env:', e.message);
  }
}
cargarEnv(path.join(__dirname, '.env'));

const PORT = parseInt(process.env.PORT || '5173', 10);
const PUBLIC_DIR = path.join(__dirname, 'public');

/* ------------------------------------------------------------------ */
/* Configuración de MySQL desde variables de entorno                   */
/* ------------------------------------------------------------------ */
const dbCfg = {
  host: process.env.DB_HOST || '',
  port: parseInt(process.env.DB_PORT || '3306', 10),
  user: process.env.DB_USER || '',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || '',
};
const dbSsl = String(process.env.DB_SSL || '').trim().toLowerCase() === 'true';
const dbConfigurada = Boolean(dbCfg.host && dbCfg.database && dbCfg.user);

let pool = null;
function getPool() {
  if (!dbConfigurada) {
    const err = new Error(
      'Base de datos no configurada. Falta DB_HOST, DB_USER o DB_NAME (ver .env.example).'
    );
    err.sinConfigurar = true;
    throw err;
  }
  if (!pool) {
    pool = mysql.createPool(Object.assign({}, dbCfg, {
      waitForConnections: true,
      connectionLimit: 5,
      enableKeepAlive: true,
      charset: 'utf8mb4',
      // SSL opcional: DB_SSL=true (p. ej. Aiven). Si no, conexión directa.
      ssl: dbSsl ? { rejectUnauthorized: true } : undefined,
      connectTimeout: 10000,
    }));
  }
  return pool;
}

/* ------------------------------------------------------------------ */
/* Validación y sanitización de lo que llega por la API                */
/* ------------------------------------------------------------------ */
const METODOS_VALIDOS = ['bairstow', 'ridders'];
const LIMITE_JSON = 8000;      // caracteres por campo (entradas/resultados)
const LIMITE_PROFUNDIDAD = 8;  // profundidad máxima del JSON
const LIMITE_CLAVES = 50;      // máximo de claves por objeto
const LIMITE_CADENA = 2000;    // caracteres por cadena
const LIMITE_ARREGLO = 500;    // elementos por arreglo
const CLAVES_PROHIBIDAS = ['__proto__', 'constructor', 'prototype'];

function esObjetoPlano(v) {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

/** Limpia un valor JSON: tipos permitidos, tamaños acotados, claves seguras. */
function sanitizar(valor, profundidad) {
  if (profundidad > LIMITE_PROFUNDIDAD) return null;
  if (valor === null) return null;
  const t = typeof valor;
  if (t === 'string') return valor.slice(0, LIMITE_CADENA);
  if (t === 'number') return isFinite(valor) ? valor : null; // sin NaN/Infinity
  if (t === 'boolean') return valor;
  if (Array.isArray(valor)) {
    return valor.slice(0, LIMITE_ARREGLO).map(function (v) {
      return sanitizar(v, profundidad + 1);
    });
  }
  if (esObjetoPlano(valor)) {
    const salida = {};
    let n = 0;
    Object.keys(valor).forEach(function (k) {
      if (n >= LIMITE_CLAVES) return;
      if (CLAVES_PROHIBIDAS.indexOf(k) !== -1) return; // sin prototype pollution
      n++;
      salida[k.slice(0, 100)] = sanitizar(valor[k], profundidad + 1);
    });
    return salida;
  }
  return null; // funciones, símbolos, instancias, etc.
}

class ErrorValidacion extends Error {
  constructor(mensaje) {
    super(mensaje);
    this.status = 400;
  }
}

function validarCuerpoCalculo(cuerpo) {
  if (!esObjetoPlano(cuerpo)) {
    throw new ErrorValidacion('El cuerpo debe ser un objeto JSON con metodo, entradas y resultados.');
  }
  const metodo = String(cuerpo.metodo === undefined || cuerpo.metodo === null ? '' : cuerpo.metodo)
    .trim().toLowerCase();
  if (METODOS_VALIDOS.indexOf(metodo) === -1) {
    throw new ErrorValidacion('metodo debe ser "bairstow" o "ridders".');
  }
  if (!esObjetoPlano(cuerpo.entradas)) {
    throw new ErrorValidacion('entradas debe ser un objeto JSON (no una cadena ni una lista).');
  }
  if (!esObjetoPlano(cuerpo.resultados)) {
    throw new ErrorValidacion('resultados debe ser un objeto JSON (no una cadena ni una lista).');
  }
  // 1) Límite de tamaño sobre el JSON crudo (antes de sanitizar).
  let eCrudo, rCrudo;
  try {
    eCrudo = JSON.stringify(cuerpo.entradas);
    rCrudo = JSON.stringify(cuerpo.resultados);
  } catch (err) {
    throw new ErrorValidacion('entradas/resultados deben ser JSON serializable (sin referencias circulares).');
  }
  if (typeof eCrudo !== 'string' || typeof rCrudo !== 'string') {
    throw new ErrorValidacion('entradas y resultados deben contener valores JSON válidos.');
  }
  if (eCrudo.length > LIMITE_JSON || rCrudo.length > LIMITE_JSON) {
    throw new ErrorValidacion('El tamaño de entradas/resultados excede el máximo permitido (' +
      LIMITE_JSON + ' caracteres).');
  }
  // 2) Sanitización defensiva: tipos, claves prohibidas, profundidad y longitudes.
  const entradas = sanitizar(cuerpo.entradas, 0);
  const resultados = sanitizar(cuerpo.resultados, 0);
  if (Object.keys(entradas).length === 0) {
    throw new ErrorValidacion('entradas no puede estar vacío.');
  }
  const eJson = JSON.stringify(entradas);
  const rJson = JSON.stringify(resultados);
  if (eJson.length > LIMITE_JSON || rJson.length > LIMITE_JSON) {
    throw new ErrorValidacion('El tamaño de entradas/resultados excede el máximo permitido (' +
      LIMITE_JSON + ' caracteres).');
  }
  // Se reparsea para garantizar que solo viaja JSON válido.
  return { metodo: metodo, entradas: JSON.parse(eJson), resultados: JSON.parse(rJson) };
}

function validarId(texto) {
  const t = String(texto === undefined || texto === null ? '' : texto).trim();
  if (!/^[1-9]\d{0,9}$/.test(t)) {
    throw new ErrorValidacion('El id debe ser un número entero positivo.');
  }
  return parseInt(t, 10);
}

/** Convierte una fila de la tabla "calculos" en un objeto JSON limpio. */
function filaAJson(fila) {
  return {
    id: fila.id,
    metodo: fila.metodo,
    entradas: parsearJson(fila.entradas),
    resultados: parsearJson(fila.resultados),
    fecha: fila.fecha instanceof Date ? fila.fecha.toISOString() : fila.fecha,
  };
}

function parsearJson(v) {
  if (typeof v === 'string') {
    try { return JSON.parse(v); } catch (e) { return {}; }
  }
  return v && typeof v === 'object' ? v : {};
}

/* ------------------------------------------------------------------ */
/* App                                                                 */
/* ------------------------------------------------------------------ */
const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1); // Render u otros proxies inversos

/* -------- CORS: permite usar la API desde index.html abierto con doble  */
/* clic (origen "null") o desde http://localhost / 127.0.0.1 (p. ej. WAMP). */
function origenPermitido(origen) {
  if (origen === 'null') return true; // archivo local (file://)
  return /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origen || '');
}
app.use('/api', function (req, res, next) {
  const origen = req.headers.origin;
  if (origen && origenPermitido(origen)) {
    res.setHeader('Access-Control-Allow-Origin', origen);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.use(express.json({ limit: '100kb' }));

/* -------- API REST: /api/calculos -------- */

// Últimos 50 cálculos guardados.
app.get('/api/calculos', async function (req, res) {
  try {
    const [filas] = await getPool().query(
      'SELECT id, metodo, entradas, resultados, fecha FROM calculos ORDER BY id DESC LIMIT 50'
    );
    res.json({ ok: true, calculos: filas.map(filaAJson) });
  } catch (e) {
    responderErrorBD(res, e);
  }
});

// Detalle de un cálculo por id.
app.get('/api/calculos/:id', async function (req, res) {
  try {
    const id = validarId(req.params.id);
    const [filas] = await getPool().query(
      'SELECT id, metodo, entradas, resultados, fecha FROM calculos WHERE id = ? LIMIT 1',
      [id]
    );
    if (filas.length === 0) {
      return res.status(404).json({ ok: false, error: 'No existe ningún cálculo con id ' + id + '.' });
    }
    res.json({ ok: true, calculo: filaAJson(filas[0]) });
  } catch (e) {
    responderError(res, e);
  }
});

// Guardar un cálculo nuevo.
app.post('/api/calculos', async function (req, res) {
  try {
    const datos = validarCuerpoCalculo(req.body);
    const [resultado] = await getPool().query(
      'INSERT INTO calculos (metodo, entradas, resultados) VALUES (?, ?, ?)',
      [datos.metodo, JSON.stringify(datos.entradas), JSON.stringify(datos.resultados)]
    );
    const [filas] = await getPool().query(
      'SELECT id, metodo, entradas, resultados, fecha FROM calculos WHERE id = ? LIMIT 1',
      [resultado.insertId]
    );
    res.status(201).json({ ok: true, calculo: filaAJson(filas[0]) });
  } catch (e) {
    responderError(res, e);
  }
});

// Borrar un cálculo por id.
app.delete('/api/calculos/:id', async function (req, res) {
  try {
    const id = validarId(req.params.id);
    const [resultado] = await getPool().query('DELETE FROM calculos WHERE id = ?', [id]);
    if (resultado.affectedRows === 0) {
      return res.status(404).json({ ok: false, error: 'No existe ningún cálculo con id ' + id + '.' });
    }
    res.json({ ok: true, id: id, borrados: resultado.affectedRows });
  } catch (e) {
    responderError(res, e);
  }
});

/** Respuesta uniforme para errores de validación o de base de datos. */
function responderError(res, e) {
  if (e instanceof ErrorValidacion) {
    return res.status(400).json({ ok: false, error: e.message });
  }
  responderErrorBD(res, e);
}

/** Traduce los errores típicos de MySQL de configuración a un mensaje claro. */
const ERRORES_CONFIG_BD = {
  ER_BAD_DB_ERROR: 'la base de datos "' + dbCfg.database + '" no existe. Importa schema.sql en phpMyAdmin.',
  ER_NO_SUCH_TABLE: 'la tabla "calculos" no existe. Importa schema.sql en phpMyAdmin.',
  ER_ACCESS_DENIED_ERROR: 'usuario o contraseña de MySQL incorrectos (revisa DB_USER / DB_PASSWORD en .env).',
  ER_DBACCESS_DENIED_ERROR: 'el usuario "' + dbCfg.user + '" no tiene permisos sobre la base "' + dbCfg.database + '".',
};

function responderErrorBD(res, e) {
  if (e && ERRORES_CONFIG_BD[e.code]) {
    console.error('[api] Base de datos mal configurada:', e.code, e.message);
    return res.status(503).json({
      ok: false,
      error: 'La base de datos no está lista: ' + ERRORES_CONFIG_BD[e.code] +
        ' La calculadora sigue funcionando; el cálculo no se guardó.',
    });
  }
  if (e && (e.sinConfigurar || e.code === 'ECONNREFUSED' || e.code === 'ENOTFOUND' ||
      e.code === 'ETIMEDOUT' || e.code === 'PROTOCOL_CONNECTION_LOST' ||
      e.code === 'ECONNRESET' || e.fatal)) {
    console.error('[api] Base de datos no disponible:', e.message);
    return res.status(503).json({
      ok: false,
      error: 'La base de datos no está disponible (' + e.message +
        '). La calculadora sigue funcionando; el cálculo no se guardó.',
    });
  }
  console.error('[api] Error inesperado:', e);
  res.status(500).json({ ok: false, error: 'Error interno del servidor al consultar los cálculos.' });
}

/* -------- Archivos estáticos: SOLO /public -------- */
app.use(express.static(PUBLIC_DIR, {
  dotfiles: 'ignore',   // .env, .git... jamás se sirven
  index: 'index.html',
  etag: true,
  lastModified: true,
  setHeaders: function (res) { res.setHeader('Cache-Control', 'no-cache'); },
}));

/* -------- 404: cualquier otra ruta (incluye /server.js y /.env) -------- */
app.use(function (req, res) {
  if (req.path.indexOf('/api/') === 0) {
    return res.status(404).json({ ok: false, error: 'Ruta no encontrada: ' + req.path });
  }
  res.status(404).type('text/plain; charset=utf-8').send('404 - No encontrado: ' + req.path);
});

/* -------- Manejador de errores (JSON mal formado, etc.) -------- */
app.use(function (err, req, res, next) {
  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json({ ok: false, error: 'El cuerpo no es un JSON válido.' });
  }
  if (err && err.type === 'entity.too.large') {
    return res.status(413).json({ ok: false, error: 'El cuerpo de la petición es demasiado grande.' });
  }
  console.error('[error]', err);
  if (res.headersSent) return next(err);
  res.status(500).json({ ok: false, error: 'Error interno del servidor.' });
});

/* ------------------------------------------------------------------ */
app.listen(PORT, function () {
  console.log('Calculadora de métodos numéricos (Bairstow y Ridders)');
  console.log('  → http://localhost:' + PORT);
  console.log('  Archivos estáticos: ' + PUBLIC_DIR);
  console.log('  Base de datos: ' + (dbConfigurada
    ? dbCfg.user + '@' + dbCfg.host + ':' + dbCfg.port + '/' + dbCfg.database +
      (dbSsl ? ' (SSL)' : '')
    : 'NO CONFIGURADA (faltan DB_HOST / DB_USER / DB_NAME) — la calculadora funcionará sin guardar.'));
  comprobarConexionBD();
});

/**
 * Crea la base de datos y la tabla si aún no existen (mismo esquema que
 * schema.sql), para que en un PC nuevo no haya que importar nada a mano.
 */
async function crearBDSiNoExiste() {
  if (!/^[A-Za-z0-9_]+$/.test(dbCfg.database)) return; // nombre raro: no se toca
  const conn = await mysql.createConnection({
    host: dbCfg.host, port: dbCfg.port, user: dbCfg.user, password: dbCfg.password,
    ssl: dbSsl ? { rejectUnauthorized: true } : undefined, connectTimeout: 10000,
  });
  try {
    await conn.query('CREATE DATABASE IF NOT EXISTS `' + dbCfg.database + '` ' +
      'DEFAULT CHARACTER SET utf8mb4 DEFAULT COLLATE utf8mb4_unicode_ci');
    await conn.query('CREATE TABLE IF NOT EXISTS `' + dbCfg.database + '`.`calculos` (' +
      '`id` INT UNSIGNED NOT NULL AUTO_INCREMENT,' +
      "`metodo` ENUM('bairstow', 'ridders') NOT NULL," +
      '`entradas` JSON NOT NULL,' +
      '`resultados` JSON NOT NULL,' +
      '`fecha` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,' +
      'PRIMARY KEY (`id`)' +
      ') ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci');
  } finally {
    await conn.end();
  }
}

/** Prueba la conexión al arrancar para avisar enseguida si algo falla. */
async function comprobarConexionBD() {
  if (!dbConfigurada) return;
  try {
    await crearBDSiNoExiste();
    const [filas] = await getPool().query('SELECT COUNT(*) AS total FROM calculos');
    console.log('  ✓ Conexión a MySQL correcta (' + filas[0].total + ' cálculos guardados).');
  } catch (e) {
    const detalle = ERRORES_CONFIG_BD[e.code] ||
      (e.code === 'ECONNREFUSED'
        ? 'MySQL no está encendido en ' + dbCfg.host + ':' + dbCfg.port + ' (¿iniciaste WAMP?).'
        : e.message);
    console.warn('  ✗ Sin conexión a MySQL: ' + detalle);
    console.warn('    La calculadora funciona igual, pero no guardará el historial.');
  }
}

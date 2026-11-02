/**
 * server.js — Servidor estático mínimo para ejecutar la calculadora en local.
 * NO depende de ningún paquete externo: solo módulos de Node.js.
 *
 * Uso:   npm start      (o "node server.js")
 * Luego: abre http://localhost:5173
 *
 * Nota: la app también puede abrirse directamente con doble clic en
 * index.html (las librerías math.js y Plotly.js se cargan por CDN).
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const PORT = process.env.PORT || 5173;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.csv': 'text/csv; charset=utf-8',
};

const server = http.createServer((req, res) => {
  let ruta = decodeURIComponent(req.url.split('?')[0]);
  if (ruta === '/') ruta = '/index.html';

  // Protección contra path traversal (../)
  const archivo = path.resolve(path.join(ROOT, ruta));
  if (!archivo.startsWith(ROOT)) {
    res.writeHead(403);
    return res.end('403 - Prohibido');
  }

  fs.readFile(archivo, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('404 - No encontrado: ' + ruta);
    }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(archivo)] || 'application/octet-stream' });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log('Calculadora de métodos numéricos');
  console.log('  → http://localhost:' + PORT);
  console.log('  (Ctrl+C para detener)');
});

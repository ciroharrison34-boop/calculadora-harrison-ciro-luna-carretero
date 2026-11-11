/**
 * js/app.js
 * Capa de interfaz: pestañas, validación, tablas, gráficas (Plotly),
 * y ayuda didáctica. No contiene matemática de los
 * métodos: delega en js/bairstow.js y js/ridders.js.
 */
(function () {
  'use strict';

  /* ================= Utilidades generales ================= */

  var $ = function (id) { return document.getElementById(id); };

  function fmt(x, digits) {
    digits = digits || 8;
    if (x === null || x === undefined) return '—';
    if (typeof x !== 'number' || !isFinite(x)) return '—';
    if (x === 0) return '0';
    var s = Number(x.toPrecision(digits)).toString();
    return s;
  }

  function fmtComplexo(z, digits) {
    if (!z || !isFinite(z.re)) return '—';
    var tol = 1e-9;
    if (Math.abs(z.im) < tol) return fmt(z.re, digits);
    var signo = z.im >= 0 ? '+' : '-';
    return fmt(z.re, digits) + ' ' + signo + ' ' + fmt(Math.abs(z.im), digits) + 'i';
  }

  function escaparHtml(txt) {
    return String(txt)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function num(val) {
    // Acepta coma decimal y punto decimal.
    if (typeof val === 'number') return val;
    return parseFloat(String(val).trim().replace(',', '.'));
  }

  function mostrarError(idBox, mensaje) {
    var box = $(idBox);
    box.innerHTML = '⚠ ' + escaparHtml(mensaje);
    box.hidden = false;
  }
  function limpiarError(idBox) { $(idBox).hidden = true; $(idBox).innerHTML = ''; }

  function mostrarAvisos(idBox, lista) {
    var box = $(idBox);
    if (!lista || lista.length === 0) { box.hidden = true; box.innerHTML = ''; return; }
    box.innerHTML = 'ℹ ' + lista.map(escaparHtml).join('<br>ℹ ');
    box.hidden = false;
  }

  /* ================= Tema claro / oscuro ================= */

  var btnTema = $('btn-tema');
  function aplicarTema(tema) {
    document.documentElement.setAttribute('data-theme', tema);
    btnTema.textContent = tema === 'dark' ? '☀️ Claro' : '🌙 Oscuro';
    try { localStorage.setItem('tema', tema); } catch (e) { /* sin almacenamiento */ }
  }
  btnTema.addEventListener('click', function () {
    var actual = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    aplicarTema(actual);
    redibujarGraficas();
  });
  (function initTema() {
    var guardado = null;
    try { guardado = localStorage.getItem('tema'); } catch (e) { /* ignore */ }
    if (!guardado && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) guardado = 'dark';
    aplicarTema(guardado || 'light');
  })();

  /* ================= Pestañas ================= */

  var tabs = document.querySelectorAll('.tab');

  /** Activa una pestaña por nombre: 'bairstow' | 'ridders' | 'historial'. */
  function activarTab(nombre) {
    tabs.forEach(function (t) {
      var activa = t.dataset.tab === nombre;
      t.classList.toggle('active', activa);
      t.setAttribute('aria-selected', activa ? 'true' : 'false');
    });
    document.querySelectorAll('.panel').forEach(function (p) {
      p.classList.toggle('active', p.id === 'panel-' + nombre);
    });
    if (nombre === 'historial') cargarHistorial();
    redibujarGraficas();
  }

  tabs.forEach(function (t) {
    t.addEventListener('click', function () { activarTab(t.dataset.tab); });
  });

  /* ================= Parser de f(x) con math.js ================= */

  function crearFuncion(expresion) {
    if (typeof math === 'undefined') {
      throw new Error('No se pudo cargar math.js (¿sin conexión a internet?). Verifique su red.');
    }
    var txt = String(expresion || '').trim();
    if (!txt) throw new Error('La función f(x) está vacía. Escriba una expresión, por ejemplo: x^3 - x - 2');

    // Normaliza notación común en español → notación de math.js.
    txt = txt
      .replace(/\barcsen\b/gi, 'asin')
      .replace(/\barccos\b/gi, 'acos')
      .replace(/\barctan\b/gi, 'atan')
      .replace(/\bsen\b/gi, 'sin')
      .replace(/\bctg\b/gi, 'cot')
      .replace(/\btg\b/gi, 'tan')
      .replace(/\bln\b/gi, 'log')
      .replace(/\blog10\b/gi, 'log10'); // \blog10\b tras \bln\b: sin efectos cruzados

    var nodo;
    try {
      nodo = math.parse(txt);
    } catch (e) {
      throw new Error('No se pudo interpretar la función "' + expresion + '": ' + e.message);
    }
    var code = nodo.compile();
    // Validación temprana: compila y evalúa en un punto de prueba para
    // detectar funciones/símbolos desconocidos antes de iterar.
    try {
      code.evaluate({ x: 1 });
    } catch (e) {
      var msj = String(e.message || e);
      if (/undefined (function|symbol)/i.test(msj) || /no está definida|not defined/i.test(msj)) {
        throw new Error('La función "' + expresion + '" usa un nombre no reconocido (' + msj +
          '). Verifique la expresión: dispone de x, sin, cos, tan, exp, log, sqrt, abs, pi, e.');
      }
      // Otros errores en el punto de prueba (p. ej. log de negativo) no invalidan la función.
    }
    return function (x) {
      var v;
      try {
        v = code.evaluate({ x: x });
      } catch (e) {
        throw new Error('Error al evaluar f(' + fmt(x) + '): ' + e.message);
      }
      if (typeof v !== 'number') {
        throw new Error('La expresión debe devolver un número real (resultado = ' + String(v) + ').');
      }
      if (!isFinite(v)) {
        throw new Error('f(' + fmt(x) + ') no es un número finito (' + v + '). Revise la función.');
      }
      return v;
    };
  }

  function parsearRaicesVerdaderas(txt) {
    txt = String(txt || '').trim();
    if (!txt) return [];
    if (typeof math === 'undefined') throw new Error('No se pudo cargar math.js para interpretar las raíces verdaderas.');
    var partes = txt.split(/[,;\s]+/).filter(Boolean);
    var out = [];
    partes.forEach(function (p) {
      var v;
      try {
        v = math.evaluate(p.replace(/j$/i, 'i'));
      } catch (e) {
        throw new Error('La raíz verdadera "' + p + '" no es válida. Use formato como 1.5 o 1+1i.');
      }
      if (typeof v === 'number') out.push({ re: v, im: 0 });
      else if (v && typeof v.re === 'number' && typeof v.im === 'number') out.push({ re: v.re, im: v.im });
      else throw new Error('La raíz verdadera "' + p + '" no es un número real o complejo válido.');
    });
    return out;
  }

  /* ================= Gráficas (Plotly) ================= */

  function plotlyListo() { return typeof Plotly !== 'undefined'; }

  // Al exportar a PDF las gráficas se generan siempre con el tema claro.
  var forzarTemaClaro = false;

  function temaPlot() {
    var oscuro = !forzarTemaClaro && document.documentElement.getAttribute('data-theme') === 'dark';
    return {
      bg: oscuro ? '#171d2b' : '#ffffff',
      grid: oscuro ? '#2a3346' : '#e6e9f0',
      font: oscuro ? '#e7ecf5' : '#1d2433',
    };
  }

  function layoutBase(titulo, etiquetaX, etiquetaY, extra) {
    var t = temaPlot();
    var base = {
      title: { text: titulo, font: { size: 14 } },
      paper_bgcolor: t.bg, plot_bgcolor: t.bg,
      font: { color: t.font },
      margin: { l: 60, r: 20, t: 45, b: 50 },
      xaxis: { title: etiquetaX, gridcolor: t.grid, zerolinecolor: t.grid },
      yaxis: { title: etiquetaY, gridcolor: t.grid, zerolinecolor: t.grid },
      legend: { orientation: 'h', y: -0.2 },
      responsive: true,
    };
    if (extra) Object.keys(extra).forEach(function (k) { base[k] = extra[k]; });
    return base;
  }

  function dibujar(idDiv, data, layout) {
    if (!plotlyListo()) {
      $(idDiv).innerHTML = '<p class="msg-aviso">⚠ No se pudo cargar Plotly.js (¿sin conexión a internet?).</p>';
      return;
    }
    Plotly.newPlot(idDiv, data, layout, { responsive: true, displayModeBar: false });
  }

  function dibujarTodas(graficas) {
    graficas.forEach(function (g) { dibujar(g.id, g.data, g.layout); });
  }

  /* Estado de la aplicación (para guardar y redibujar) */
  var estado = { bairstow: null, ridders: null };

  function redibujarGraficas() {
    if (estado.bairstow) dibujarGraficasBairstow(estado.bairstow);
    if (estado.ridders) dibujarGraficasRidders(estado.ridders);
  }

  /* ================= MÉTODO BAIRSTOW ================= */

  $('b-ejemplo').addEventListener('click', function () {
    $('b-coef').value = '1, -3.5, 2.75, 2.125, -3.875, 1.25';
    $('b-r0').value = '-1';
    $('b-s0').value = '-1';
    $('b-tol').value = '0.0001';
    $('b-iters').value = '100';
    $('b-verdaderas').value = '0.5, -1, 2, 1+0.5i, 1-0.5i';
  });

  $('b-limpiar').addEventListener('click', function () {
    $('form-bairstow').reset();
    $('b-r0').value = '-1'; $('b-s0').value = '-1';
    $('b-tol').value = '0.0001'; $('b-iters').value = '100';
    limpiarError('b-error'); mostrarAvisos('b-avisos', []);
    $('b-resultado').hidden = true;
    estado.bairstow = null;
    $('b-guardar').disabled = true;
    $('b-pdf').disabled = true;
    limpiarGuardado('b-guardado');
  });

  $('form-bairstow').addEventListener('submit', function (ev) {
    ev.preventDefault();
    calcularBairstow();
  });

  function calcularBairstow(avisosExtra) {
    limpiarError('b-error');
    mostrarAvisos('b-avisos', avisosExtra || []);
    $('b-resultado').hidden = true;
    estado.bairstow = null;
    $('b-guardar').disabled = true;
    $('b-pdf').disabled = true;
    limpiarGuardado('b-guardado');

    try {
      var entradas = entradasBairstow();
      var res = resolverBairstow(entradas);
      res.entradas = entradas;

      mostrarAvisos('b-avisos', res.avisos);
      renderizarRaices(res);
      renderizarTablasBairstow(res);
      renderizarErroresBairstow(res);
      renderizarPasosBairstow(res);
      dibujarGraficasBairstow(res);

      estado.bairstow = res;
      $('b-resultado').hidden = false;
      $('b-guardar').disabled = false;
      $('b-pdf').disabled = false;
    } catch (e) {
      mostrarError('b-error', e.message || String(e));
      if (avisosExtra && avisosExtra.length) mostrarAvisos('b-avisos', avisosExtra);
    }
  }

  /**
   * Valida unas entradas (las del formulario o las guardadas en el historial)
   * y ejecuta el método de Bairstow. Lanza Error con un mensaje claro si algo
   * no es válido.
   */
  function resolverBairstow(e) {
    var txtCoef = String(e.coeficientes || '').trim();
    if (!txtCoef) throw new Error('Los coeficientes del polinomio están vacíos.');

    var coef = txtCoef.split(/[,;\s]+/).filter(Boolean).map(function (c) {
      var v = num(c);
      if (!isFinite(v)) throw new Error('"' + c + '" no es un número válido. Separe los coeficientes por comas.');
      return v;
    });
    if (coef.length < 2) throw new Error('Se necesitan al menos 2 coeficientes (un polinomio de grado 1).');
    if (Math.abs(coef[0]) < 1e-14) throw new Error('El primer coeficiente (grado mayor) no puede ser cero.');

    var r0 = num(e.r0);
    var s0 = num(e.s0);
    if (!isFinite(r0) || !isFinite(s0)) throw new Error('r₀ y s₀ deben ser números válidos.');

    var tol = num(e.tolerancia);
    if (!isFinite(tol) || tol < 0) throw new Error('La tolerancia debe ser un número mayor o igual a 0 (%).');

    var maxIter = parseInt(e.maxIteraciones, 10);
    if (!isFinite(maxIter) || maxIter < 1 || maxIter > 10000) throw new Error('El máximo de iteraciones debe estar entre 1 y 10000.');

    var verdaderas = parsearRaicesVerdaderas(e.raicesVerdaderas || '');

    var res = Bairstow.resolver(coef, r0, s0, tol, maxIter);
    res.coeficientes = coef;
    res.verdaderas = verdaderas;
    res.tolerancia = tol;
    return res;
  }

  function renderizarRaices(res) {
    var ul = $('b-raices');
    ul.innerHTML = '';
    res.raices.forEach(function (z, i) {
      var li = document.createElement('li');
      var esCompleja = Math.abs(z.im) > 1e-9;
      li.innerHTML = 'x' + (i + 1) + ' = ' + fmtComplexo(z) +
        '<span class="badge ' + (esCompleja ? 'compleja' : 'real') + '">' +
        (esCompleja ? 'compleja' : 'real') + '</span>';
      ul.appendChild(li);
    });
  }

  function renderizarTablasBairstow(res) {
    var cont = $('b-tablas');
    cont.innerHTML = '';
    var hayTablas = false;
    res.factores.forEach(function (f) {
      if (!f.iteraciones || f.iteraciones.length === 0) return;
      hayTablas = true;
      var h = document.createElement('h3');
      h.className = 'subtitulo';
      h.textContent = tituloFactor(f);
      cont.appendChild(h);
      cont.insertAdjacentHTML('beforeend', construirTabla(CABECERA_ITER_BAIRSTOW, filasIteracionesBairstow(f)));
    });
    $('b-card-tablas').hidden = !hayTablas;
  }

  var CABECERA_ITER_BAIRSTOW = ['Iteración', 'r', 's', 'Δr', 'Δs', 'εa de r (%)', 'εa de s (%)'];
  var CABECERA_ERR_BAIRSTOW = ['#', 'Raíz verdadera', 'Raíz aproximada', 'Et = verdadera − aproximada', 'εt (%)'];

  function tituloFactor(f) {
    return 'Factor ' + f.indice + ':  x² − ' + fmt(f.r) + ' x − ' + fmt(f.s) +
      (f.convergido ? '  ✓ convergió' : '  ✗ sin convergir');
  }

  function filasIteracionesBairstow(f) {
    return f.iteraciones.map(function (it) {
      return [it.iter, fmt(it.r), fmt(it.s), fmt(it.dr), fmt(it.ds),
        it.er === null || !isFinite(it.er) ? '—' : fmt(it.er, 4),
        it.es === null || !isFinite(it.es) ? '—' : fmt(it.es, 4)];
    });
  }

  function filasErroresBairstow(res) {
    if (!res.verdaderas || res.verdaderas.length === 0) return [];
    return emparejarRaices(res.raices, res.verdaderas).map(function (p, i) {
      var et = { re: p.verdadera.re - p.aproximada.re, im: p.verdadera.im - p.aproximada.im };
      var modT = Math.sqrt(p.verdadera.re * p.verdadera.re + p.verdadera.im * p.verdadera.im);
      var modE = Math.sqrt(et.re * et.re + et.im * et.im);
      var etp = modT > 1e-14 ? (modE / modT) * 100 : modE * 100;
      return [i + 1, fmtComplexo(p.verdadera), fmtComplexo(p.aproximada), fmtComplexo(et), fmt(etp, 4)];
    });
  }

  function renderizarErroresBairstow(res) {
    var cont = $('b-errores');
    cont.innerHTML = '';
    var filas = filasErroresBairstow(res);
    if (!filas.length) {
      $('b-card-errores').hidden = true;
      return;
    }
    cont.insertAdjacentHTML('beforeend', construirTabla(CABECERA_ERR_BAIRSTOW, filas));
    $('b-card-errores').hidden = false;
  }

  /** Empareja cada raíz verdadera con la aproximada más cercana (uno a uno). */
  function emparejarRaices(aprox, verd) {
    var disponibles = aprox.slice();
    var out = [];
    verd.forEach(function (v) {
      var mejorIdx = 0, mejorD = Infinity;
      disponibles.forEach(function (a, i) {
        var d = Math.hypot(a.re - v.re, a.im - v.im);
        if (d < mejorD) { mejorD = d; mejorIdx = i; }
      });
      out.push({ verdadera: v, aproximada: disponibles.splice(mejorIdx, 1)[0] });
    });
    return out;
  }

  function construirTabla(headers, filas) {
    var html = '<div class="table-wrap"><table><thead><tr>';
    headers.forEach(function (h) { html += '<th>' + escaparHtml(h) + '</th>'; });
    html += '</tr></thead><tbody>';
    filas.forEach(function (f) {
      html += '<tr>';
      f.forEach(function (c) { html += '<td>' + escaparHtml(String(c)) + '</td>'; });
      html += '</tr>';
    });
    return html + '</tbody></table></div>';
  }

  /** Escribe un polinomio (coef. de mayor a menor grado) como texto legible. */
  function polinomioTexto(coef) {
    var n = coef.length - 1;
    var partes = [];
    coef.forEach(function (c, i) {
      if (Math.abs(c) < 1e-14) return;
      var g = n - i;
      var abs = Math.abs(c);
      var numero = (abs === 1 && g > 0) ? '' : fmt(abs);
      var x = g === 0 ? '' : (g === 1 ? 'x' : 'x^' + g);
      var signo = c < 0 ? '−' : '+';
      partes.push((partes.length ? ' ' + signo + ' ' : (c < 0 ? '−' : '')) + numero + x);
    });
    return partes.length ? partes.join('') : '0';
  }

  /** Número con paréntesis si es negativo (para mostrar sustituciones). */
  function pn(x, d) {
    var t = fmt(x, d);
    return x < 0 ? '(' + t + ')' : t;
  }

  /**
   * Paso a paso COMPLETO de Bairstow: una sección por cada iteración de cada
   * factor, más las raíces y la deflación de cada factor.
   * Devuelve [{ titulo, pasos: [[título, texto], ...] }, ...] (página y PDF).
   */
  function pasosBairstow(res) {
    var grupos = [];
    var tol = res.tolerancia;

    grupos.push({
      titulo: 'Planteamiento',
      pasos: [
        ['Polinomio', 'P(x) = ' + polinomioTexto(res.coeficientes) + '   (grado ' + res.grado + ')'],
        ['Idea del método', 'Se busca un factor cuadrático x² − r·x − s que divida exactamente a P(x). ' +
          'Se hace la división sintética doble (coeficientes b y c) y se corrigen r y s con Δr y Δs ' +
          'hasta que el residuo b(n−1)·x + b(n) sea ≈ 0.'],
        ['Fórmulas', 'bᵢ = aᵢ + r·bᵢ₋₁ + s·bᵢ₋₂ ;  cᵢ = bᵢ + r·cᵢ₋₁ + s·cᵢ₋₂\n' +
          'Sistema:  c(n−2)·Δr + c(n−3)·Δs = −b(n−1) ;  c(n−1)·Δr + c(n−2)·Δs = −b(n)'],
        ['Criterio de parada', 'εa(r) < ' + fmt(tol) + ' %  y  εa(s) < ' + fmt(tol) + ' %  (o máximo de iteraciones).'],
      ],
    });

    res.factores.forEach(function (f) {
      if (f.tipo === 'cuadratico') {
        var a = f.coeficientesAntesDeDeflactar;
        var n = a.length - 1;
        f.iteraciones.forEach(function (it, idx) {
          var pasos = [];
          if (idx === 0) {
            pasos.push(['Polinomio de trabajo', 'a(x) = ' + polinomioTexto(a) + '\n' +
              a.map(function (c, i) { return 'a' + i + ' = ' + fmt(c); }).join(', ')]);
          }
          pasos.push(['Valores actuales', 'r = ' + fmt(it.rAnt) + ',  s = ' + fmt(it.sAnt)]);
          if (it.b) {
            var lineasB = it.b.map(function (v, i) {
              if (i === 0) return 'b0 = a0 = ' + fmt(v);
              if (i === 1) return 'b1 = ' + pn(a[1]) + ' + ' + pn(it.rAnt) + '·' + pn(it.b[0]) + ' = ' + fmt(v);
              return 'b' + i + ' = ' + pn(a[i]) + ' + ' + pn(it.rAnt) + '·' + pn(it.b[i - 1]) +
                ' + ' + pn(it.sAnt) + '·' + pn(it.b[i - 2]) + ' = ' + fmt(v);
            });
            pasos.push(['División sintética (b)', lineasB.join('\n')]);
            var lineasC = it.c.map(function (v, i) {
              if (i === 0) return 'c0 = b0 = ' + fmt(v);
              if (i === 1) return 'c1 = ' + pn(it.b[1]) + ' + ' + pn(it.rAnt) + '·' + pn(it.c[0]) + ' = ' + fmt(v);
              return 'c' + i + ' = ' + pn(it.b[i]) + ' + ' + pn(it.rAnt) + '·' + pn(it.c[i - 1]) +
                ' + ' + pn(it.sAnt) + '·' + pn(it.c[i - 2]) + ' = ' + fmt(v);
            });
            pasos.push(['Segunda división (c)', lineasC.join('\n')]);
            pasos.push(['Sistema de ecuaciones',
              pn(it.c[n - 2]) + '·Δr + ' + pn(it.c[n - 3]) + '·Δs = ' + fmt(-it.b[n - 1]) + '\n' +
              pn(it.c[n - 1]) + '·Δr + ' + pn(it.c[n - 2]) + '·Δs = ' + fmt(-it.b[n])]);
            pasos.push(['Determinante', 'det = c' + (n - 2) + '² − c' + (n - 1) + '·c' + (n - 3) + ' = ' +
              pn(it.c[n - 2]) + '² − ' + pn(it.c[n - 1]) + '·' + pn(it.c[n - 3]) + ' = ' + fmt(it.det)]);
          }
          if (it.singular || !isFinite(it.dr)) {
            pasos.push(['Sistema singular', 'det ≈ 0: no se pueden despejar Δr ni Δs. El proceso se detiene con los últimos r y s.']);
            grupos.push({ titulo: 'Factor ' + f.indice + ' — Iteración ' + it.iter, pasos: pasos });
            return;
          }
          pasos.push(['Incrementos (regla de Cramer)',
            'Δr = (b' + n + '·c' + (n - 3) + ' − b' + (n - 1) + '·c' + (n - 2) + ')/det = (' +
              pn(it.b[n]) + '·' + pn(it.c[n - 3]) + ' − ' + pn(it.b[n - 1]) + '·' + pn(it.c[n - 2]) + ')/' + pn(it.det) +
              ' = ' + fmt(it.dr) + '\n' +
            'Δs = (b' + (n - 1) + '·c' + (n - 1) + ' − b' + n + '·c' + (n - 2) + ')/det = (' +
              pn(it.b[n - 1]) + '·' + pn(it.c[n - 1]) + ' − ' + pn(it.b[n]) + '·' + pn(it.c[n - 2]) + ')/' + pn(it.det) +
              ' = ' + fmt(it.ds)]);
          pasos.push(['Nuevos valores',
            'r = ' + fmt(it.rAnt) + ' + ' + pn(it.dr) + ' = ' + fmt(it.r) + '\n' +
            's = ' + fmt(it.sAnt) + ' + ' + pn(it.ds) + ' = ' + fmt(it.s)]);
          pasos.push(['Errores aproximados',
            'εa(r) = |Δr / r|·100 = |' + fmt(it.dr) + ' / ' + fmt(it.r) + '|·100 = ' + fmt(it.er, 4) + ' %\n' +
            'εa(s) = |Δs / s|·100 = |' + fmt(it.ds) + ' / ' + fmt(it.s) + '|·100 = ' + fmt(it.es, 4) + ' %']);
          var esUltima = idx === f.iteraciones.length - 1;
          pasos.push(['¿Se detiene?', esUltima && f.convergido
            ? 'Sí: los errores ya son menores que la tolerancia (' + fmt(tol) + ' %). El factor convergió.'
            : (esUltima
              ? 'Se alcanzó el máximo de iteraciones sin cumplir la tolerancia.'
              : 'No: algún error es ≥ ' + fmt(tol) + ' %. Se repite con los nuevos r y s.')]);
          grupos.push({ titulo: 'Factor ' + f.indice + ' — Iteración ' + it.iter, pasos: pasos });
        });

        var defl = Bairstow.deflactar(a, f.r, f.s);
        var disc = f.r * f.r + 4 * f.s;
        grupos.push({
          titulo: 'Factor ' + f.indice + ' — Raíces y deflación',
          pasos: [
            ['Factor encontrado', 'x² − ' + pn(f.r) + '·x − ' + pn(f.s) + ' = 0'],
            ['Fórmula cuadrática', 'x = [ r ± √(r² + 4s) ] / 2 ;  r² + 4s = ' + pn(f.r) + '² + 4·' + pn(f.s) +
              ' = ' + fmt(disc) + (disc < 0 ? '  (negativo → raíces complejas)' : '  (≥ 0 → raíces reales)')],
            ['Raíces del factor', f.raices.map(function (z) { return 'x = ' + fmtComplexo(z, 10); }).join('\n')],
            ['Deflación', 'a(x) ÷ (x² − ' + pn(f.r) + '·x − ' + pn(f.s) + ') = ' + polinomioTexto(defl.cociente) +
              '\nSe continúa con este cociente (grado ' + (defl.cociente.length - 1) + ').'],
          ],
        });
      } else if (f.tipo === 'cuadratico-directo') {
        var q = f.coeficientesRestantes;
        var d = q[1] * q[1] - 4 * q[0] * q[2];
        grupos.push({
          titulo: 'Factor ' + f.indice + ' — Cuadrática restante',
          pasos: [
            ['Polinomio restante', polinomioTexto(q) + ' = 0'],
            ['Discriminante', 'b² − 4ac = ' + pn(q[1]) + '² − 4·' + pn(q[0]) + '·' + pn(q[2]) + ' = ' + fmt(d) +
              (d < 0 ? '  (negativo → raíces complejas)' : '  (≥ 0 → raíces reales)')],
            ['Fórmula cuadrática', 'x = (−b ± √(b² − 4ac)) / 2a'],
            ['Raíces', f.raices.map(function (z) { return 'x = ' + fmtComplexo(z, 10); }).join('\n')],
          ],
        });
      } else if (f.tipo === 'lineal') {
        var l = f.coeficientesRestantes || f.coefLineal;
        grupos.push({
          titulo: 'Factor ' + (f.indice || 1) + ' — Factor lineal',
          pasos: [
            ['Polinomio restante', polinomioTexto(l) + ' = 0'],
            ['Despeje', 'x = −a1 / a0 = −' + pn(l[1]) + ' / ' + pn(l[0]) + ' = ' + fmt(f.raices[0].re, 10)],
          ],
        });
      }
    });

    grupos.push({
      titulo: 'Resultado final',
      pasos: [['Raíces de P(x)', res.raices.map(function (z, i) {
        return 'x' + (i + 1) + ' = ' + fmtComplexo(z, 10);
      }).join('\n')]],
    });
    return grupos;
  }

  function pasosAHtml(pasos) {
    return '<ol>' + pasos.map(function (p) {
      return '<li class="paso"><b>' + escaparHtml(p[0]) + ':</b> ' +
        escaparHtml(p[1]).replace(/\n/g, '<br>').replace(/ {2,}/g, function (m) { return m.replace(/ /g, '&nbsp;'); }) + '</li>';
    }).join('') + '</ol>';
  }

  /** Grupos de pasos como bloques desplegables (planteamiento, 1ª iteración y resultado abiertos). */
  function gruposAHtml(grupos) {
    return grupos.map(function (g, i) {
      var abierto = i <= 1 || i === grupos.length - 1;
      return '<details class="paso-grupo"' + (abierto ? ' open' : '') + '><summary>' +
        escaparHtml(g.titulo) + '</summary>' + pasosAHtml(g.pasos) + '</details>';
    }).join('');
  }

  function renderizarPasosBairstow(res) {
    $('b-pasos').innerHTML = gruposAHtml(pasosBairstow(res));
  }

  function dibujarGraficasBairstow(res) {
    dibujarTodas(graficasBairstow(res));
  }

  /** Devuelve las gráficas de Bairstow como [{ id, titulo, data, layout }], en orden de página. */
  function graficasBairstow(res) {
    var coef = res.coeficientes;
    var raices = res.raices;
    var reales = raices.filter(function (z) { return Math.abs(z.im) < 1e-9; }).map(function (z) { return z.re; });
    var partesReales = raices.map(function (z) { return z.re; });

    /* (a) Polinomio en el eje real */
    var minR = partesReales.length ? Math.min.apply(null, partesReales) : -2;
    var maxR = partesReales.length ? Math.max.apply(null, partesReales) : 2;
    var pad = Math.max(0.6, (maxR - minR) * 0.25);
    var x0 = minR - pad, x1 = maxR + pad;
    var N = 400;
    var xs = [], ys = [];
    for (var i = 0; i <= N; i++) {
      var x = x0 + (x1 - x0) * i / N;
      xs.push(x);
      ys.push(Bairstow.evaluarPolinomio(coef, x));
    }
    var escalaY = Math.max.apply(null, ys.map(Math.abs));
    var tracePol = {
      x: xs, y: ys, mode: 'lines', name: 'P(x)',
      line: { color: '#5c7cfa', width: 2.5 },
      yaxis: 'y',
    };
    var traceRaices = {
      x: reales, y: reales.map(function () { return 0; }), mode: 'markers',
      name: 'Raíces reales', marker: { color: '#e64980', size: 10, symbol: 'circle' },
    };
    var graficaPol = { id: 'plot-b-pol', data: [tracePol, traceRaices], layout: layoutBase(
      'Polinomio en el eje real (raíces reales marcadas en rosa)', 'x', 'P(x)',
      { yaxis: Object.assign(layoutBase('', '', '').yaxis, {
          gridcolor: temaPlot().grid, zerolinecolor: temaPlot().grid,
          range: [-Math.max(1, escalaY * 0.6), Math.max(1, escalaY * 0.6)],
        }) }
    ) };

    /* (b) Plano cartesiano (va primero en la página) */
    return [graficaPlanoCartesiano(coef, reales), graficaPol];
  }

  /**
   * Gráfica de P(x) en el plano cartesiano clásico: ejes X e Y que se cruzan
   * en el origen (0, 0), los cuatro cuadrantes, las raíces reales (cortes con
   * el eje X) y el corte con el eje Y en (0, P(0)).
   */
  function graficaPlanoCartesiano(coef, reales) {
    var t = temaPlot();
    var colorEje = t.font;

    // Rango X simétrico alrededor del origen que incluya todas las raíces reales.
    var maxAbsX = reales.length ? Math.max.apply(null, reales.map(Math.abs)) : 2;
    var X = Math.max(2, Math.ceil(maxAbsX * 1.4 + 0.5));

    var N = 600;
    var xs = [], ys = [];
    for (var i = 0; i <= N; i++) {
      var x = -X + 2 * X * i / N;
      xs.push(x);
      ys.push(Bairstow.evaluarPolinomio(coef, x));
    }

    // Rango Y simétrico basado en la "zona de las raíces": así se ven las
    // oscilaciones de P(x) entre raíces y las ramas exteriores salen del cuadro
    // (como en un plano cartesiano de cuaderno), en vez de aplastarlo todo.
    var corteY = Bairstow.evaluarPolinomio(coef, 0);
    var zIni, zFin;
    if (reales.length >= 2) {
      zIni = Math.min.apply(null, reales); zFin = Math.max.apply(null, reales);
    } else if (reales.length === 1) {
      zIni = reales[0] - 1.5; zFin = reales[0] + 1.5;
    } else {
      zIni = -2; zFin = 2;
    }
    var maxZona = 0;
    for (var k = 0; k <= 200; k++) {
      var v = Math.abs(Bairstow.evaluarPolinomio(coef, zIni + (zFin - zIni) * k / 200));
      if (isFinite(v) && v > maxZona) maxZona = v;
    }
    var Y = Math.max(1, maxZona * 1.6, Math.abs(corteY) * 1.3);
    var potencia = Math.pow(10, Math.floor(Math.log10(Y)));
    Y = Math.ceil(Y / potencia * 2) * potencia / 2; // redondeo "bonito" (1, 1.5, 2, 2.5…)

    var trazoCurva = {
      x: xs, y: ys, mode: 'lines', name: 'P(x)',
      line: { color: '#5c7cfa', width: 3 },
      hovertemplate: '(%{x:.4f}, %{y:.4f})<extra>P(x)</extra>',
    };
    var trazoRaices = {
      x: reales, y: reales.map(function () { return 0; }),
      mode: 'markers+text', name: 'Raíces (cortes con el eje X)',
      text: reales.map(function (r) { return '(' + fmt(r, 4) + ', 0)'; }),
      textposition: 'bottom center',
      textfont: { size: 11, color: '#e64980' },
      marker: { color: '#e64980', size: 11, line: { color: '#ffffff', width: 1.5 } },
      hovertemplate: 'Raíz: (%{x:.6f}, 0)<extra></extra>',
    };
    var trazoCorteY = {
      x: [0], y: [corteY], mode: 'markers+text', name: 'Corte con el eje Y',
      text: ['(0, ' + fmt(corteY, 4) + ')'], textposition: 'middle right',
      textfont: { size: 11, color: '#0ca678' },
      marker: { color: '#0ca678', size: 10, symbol: 'diamond', line: { color: '#ffffff', width: 1.5 } },
      hovertemplate: 'Corte eje Y: (0, %{y:.6f})<extra></extra>',
    };

    var ejeBase = {
      gridcolor: t.grid, zeroline: true, zerolinecolor: colorEje, zerolinewidth: 2,
      showline: false, ticks: 'outside', tickcolor: t.grid, title: '',
    };
    function etiqueta(x, y, texto, extra) {
      return Object.assign({
        x: x, y: y, text: texto, showarrow: false,
        font: { color: colorEje, size: 15 },
      }, extra || {});
    }
    function cuadrante(x, y, texto) {
      return etiqueta(x, y, texto, { font: { color: t.font, size: 22 }, opacity: 0.18 });
    }

    var layout = layoutBase('Plano cartesiano — P(x), raíces y corte con el eje Y', '', '', {
      xaxis: Object.assign({}, ejeBase, { range: [-X, X] }),
      yaxis: Object.assign({}, ejeBase, { range: [-Y, Y] }),
      margin: { l: 50, r: 20, t: 45, b: 40 },
      annotations: [
        etiqueta(X, 0, '<b>x</b>', { xanchor: 'right', yanchor: 'bottom' }),
        etiqueta(0, Y, '<b>y</b>', { xanchor: 'left', yanchor: 'top', xshift: 6 }),
        etiqueta(0, 0, 'O', { xanchor: 'right', yanchor: 'top', xshift: -4, font: { color: colorEje, size: 12 } }),
        cuadrante(X / 2, Y / 2, 'I'),
        cuadrante(-X / 2, Y / 2, 'II'),
        cuadrante(-X / 2, -Y / 2, 'III'),
        cuadrante(X / 2, -Y / 2, 'IV'),
      ],
    });

    return { id: 'plot-b-cartesiano', data: [trazoCurva, trazoRaices, trazoCorteY], layout: layout };
  }


  /* ================= MÉTODO RID DERS ================= */

  $('r-ejemplo').addEventListener('click', function () {
    $('r-func').value = 'x^3 - x - 2';
    $('r-xl').value = '1';
    $('r-xu').value = '2';
    $('r-tol').value = '0.0001';
    $('r-iters').value = '100';
    $('r-verdadera').value = '';
  });

  $('r-limpiar').addEventListener('click', function () {
    $('form-ridders').reset();
    $('r-xl').value = '1'; $('r-xu').value = '2';
    $('r-tol').value = '0.0001'; $('r-iters').value = '100';
    limpiarError('r-error');
    $('r-resultado').hidden = true;
    estado.ridders = null;
    $('r-guardar').disabled = true;
    $('r-pdf').disabled = true;
    limpiarGuardado('r-guardado');
  });

  $('form-ridders').addEventListener('submit', function (ev) {
    ev.preventDefault();
    calcularRidders();
  });

  function calcularRidders(avisosExtra) {
    limpiarError('r-error');
    $('r-resultado').hidden = true;
    estado.ridders = null;
    $('r-guardar').disabled = true;
    $('r-pdf').disabled = true;
    limpiarGuardado('r-guardado');

    try {
      var entradas = entradasRidders();
      var res = resolverRidders(entradas);
      res.entradas = entradas;
      mostrarAvisos('r-avisos', (avisosExtra || []).concat(res.avisos));

      renderizarResumenRidders(res);
      renderizarPasosRidders(res);
      renderizarTablaRidders(res);
      dibujarGraficasRidders(res);

      estado.ridders = res;
      $('r-resultado').hidden = false;
      $('r-guardar').disabled = false;
      $('r-pdf').disabled = false;
    } catch (e) {
      mostrarError('r-error', e.message || String(e));
      if (avisosExtra && avisosExtra.length) mostrarAvisos('r-avisos', avisosExtra);
    }
  }

  /**
   * Valida unas entradas (formulario o historial) y ejecuta Ridders.
   * Devuelve el resultado con res.f (la función) y res.avisos (mensajes).
   */
  function resolverRidders(e) {
    var f = crearFuncion(e.funcion || '');

    var xl = num(e.xl);
    var xu = num(e.xu);
    if (!isFinite(xl) || !isFinite(xu)) throw new Error('xl y xu deben ser números válidos.');
    if (xl === xu) throw new Error('xl y xu no pueden ser iguales (el intervalo debe tener amplitud).');

    var tol = num(e.tolerancia);
    if (!isFinite(tol) || tol < 0) throw new Error('La tolerancia debe ser un número mayor o igual a 0 (%).');

    var maxIter = parseInt(e.maxIteraciones, 10);
    if (!isFinite(maxIter) || maxIter < 1 || maxIter > 10000) throw new Error('El máximo de iteraciones debe estar entre 1 y 10000.');

    var vt = null;
    var txtVt = String(e.valorVerdadero || '').trim();
    if (txtVt) {
      vt = num(txtVt);
      if (!isFinite(vt)) throw new Error('El valor verdadero debe ser un número válido (o dejarlo vacío).');
    }

    var res = Ridders.resolver(f, xl, xu, tol, maxIter, vt);
    res.f = f;
    res.tolerancia = tol;

    var avisos = [];
    if (!res.convergido) {
      avisos.push('El método NO convergió en ' + maxIter + ' iteraciones. Se muestra la última aproximación: x = ' + fmt(res.raiz) + '.');
    }
    if (res.valorVerdaderoCalculado) {
      avisos.push('No se indicó valor verdadero: se usó una referencia obtenida por bisección de alta precisión (≈ ' + fmt(res.valorVerdadero, 12) + ').');
    }
    if (res.nota) avisos.push(res.nota);
    res.avisos = avisos;
    return res;
  }

  /** Resumen de Ridders como pares [etiqueta, valor]. */
  function resumenRidders(res) {
    var et = res.valorVerdadero - res.raiz;
    var etp = Math.abs(res.valorVerdadero) > 1e-14
      ? Math.abs((et / res.valorVerdadero) * 100)
      : Math.abs(et) * 100;
    return [
      ['Raíz', fmt(res.raiz, 10)],
      ['f(raíz)', fmt(res.fRaiz, 6)],
      ['Iteraciones', String(res.nIteraciones)],
      ['Convergió', res.convergido ? 'Sí ✓' : 'No ✗'],
      ['Valor de referencia', fmt(res.valorVerdadero, 12)],
      ['Et', fmt(et, 6)],
      ['εt', fmt(etp, 4) + ' %'],
    ];
  }

  function renderizarResumenRidders(res) {
    $('r-resumen').innerHTML = resumenRidders(res).map(function (p) {
      return '<span class="chip">' + escaparHtml(p[0]) + ': <b>' + escaparHtml(p[1]) + '</b></span>';
    }).join('');
  }

  /**
   * Paso a paso COMPLETO de Ridders: una sección por iteración.
   * Devuelve [{ titulo, pasos: [[título, texto], ...] }, ...].
   */
  function pasosRidders(res) {
    if (!res.iteraciones.length) return null;
    var tol = res.tolerancia;
    var grupos = [{
      titulo: 'Planteamiento',
      pasos: [
        ['Fórmulas', 'xm = (xl + xu)/2\n' +
          'x4 = xm + (xm − xl)·sign(f(xl) − f(xu))·f(xm) / √( f(xm)² − f(xl)·f(xu) )'],
        ['Error aproximado', 'εa = |(x4 − x4_anterior) / x4|·100'],
        ['Criterio de parada', 'εa < ' + fmt(tol) + ' %  (o máximo de iteraciones).'],
        ['Valor de referencia', fmt(res.valorVerdadero, 12) +
          (res.valorVerdaderoCalculado ? '  (calculado por bisección de alta precisión)' : '  (indicado por el usuario)')],
      ],
    }];

    res.iteraciones.forEach(function (it, idx) {
      var pasos = [];
      pasos.push(['Intervalo', '[xl, xu] = [' + fmt(it.xl, 10) + ', ' + fmt(it.xu, 10) + ']\n' +
        'f(xl) = ' + fmt(it.fxl, 8) + ',  f(xu) = ' + fmt(it.fxu, 8) + '  → f(xl)·f(xu) < 0 (hay cambio de signo)']);
      pasos.push(['Punto medio', 'xm = (' + fmt(it.xl, 10) + ' + ' + pn(it.xu, 10) + ')/2 = ' + fmt(it.xm, 10) +
        '\nf(xm) = ' + fmt(it.fxm, 8)]);
      pasos.push(['Signo', 'f(xl) − f(xu) = ' + fmt(it.fxl - it.fxu, 8) + '  → sign = ' + (it.sgn > 0 ? '+1' : '−1')]);
      pasos.push(['Denominador', '√( ' + pn(it.fxm, 8) + '² − ' + pn(it.fxl, 8) + '·' + pn(it.fxu, 8) + ' ) = ' + fmt(it.den, 8)]);
      pasos.push(['Nueva aproximación', 'x4 = ' + fmt(it.xm, 10) + ' + (' + fmt(it.xm, 10) + ' − ' + pn(it.xl, 10) + ')·(' +
        (it.sgn > 0 ? '+1' : '−1') + ')·' + pn(it.fxm, 8) + ' / ' + fmt(it.den, 8) + ' = ' + fmt(it.x4, 10) +
        '\nf(x4) = ' + fmt(it.f4, 8)]);
      if (it.ea === null || !isFinite(it.ea)) {
        pasos.push(['Error aproximado', 'Primera iteración: aún no hay x4 anterior para calcular εa.']);
      } else {
        var ant = res.iteraciones[idx - 1].x4;
        pasos.push(['Error aproximado', 'εa = |(' + fmt(it.x4, 10) + ' − ' + pn(ant, 10) + ') / ' + fmt(it.x4, 10) +
          '|·100 = ' + fmt(it.ea, 4) + ' %']);
      }
      pasos.push(['Error verdadero', 'Et = ' + fmt(res.valorVerdadero, 12) + ' − ' + pn(it.x4, 10) + ' = ' + fmt(it.et, 6) +
        ' ;  εt = ' + fmt(it.etp, 4) + ' %']);
      var cambiaXu = it.f4 * it.fxl < 0;
      pasos.push(['Actualización del intervalo', 'f(x4)·f(xl) = ' + fmt(it.f4 * it.fxl, 6) +
        (cambiaXu ? ' < 0  → xu = x4 = ' : ' ≥ 0  → xl = x4 = ') + fmt(it.x4, 10)]);
      var esUltima = idx === res.iteraciones.length - 1;
      pasos.push(['¿Se detiene?', esUltima && res.convergido
        ? 'Sí: εa < ' + fmt(tol) + ' % (o x4 ya no cambia). Raíz ≈ ' + fmt(it.x4, 10)
        : (esUltima
          ? 'Se alcanzó el máximo de iteraciones sin cumplir la tolerancia.'
          : (it.ea === null || !isFinite(it.ea)
            ? 'No: se necesita al menos otra iteración para estimar εa.'
            : 'No: εa = ' + fmt(it.ea, 4) + ' % ≥ ' + fmt(tol) + ' %. Se repite con el nuevo intervalo.'))]);
      grupos.push({ titulo: 'Iteración ' + it.iter, pasos: pasos });
    });

    grupos.push({
      titulo: 'Resultado final',
      pasos: [['Raíz', 'x ≈ ' + fmt(res.raiz, 12) + '  con f(x) = ' + fmt(res.fRaiz, 6) +
        '  tras ' + res.nIteraciones + ' iteración(es).']],
    });
    return grupos;
  }

  function renderizarPasosRidders(res) {
    var grupos = pasosRidders(res);
    $('r-pasos').innerHTML = grupos
      ? gruposAHtml(grupos)
      : '<p>Sin iteraciones: la raíz estaba en un extremo del intervalo.</p>';
  }

  var CABECERA_ITER_RIDDERS = ['Iteración', 'xl', 'xu', 'xm', 'f(xm)', 'x4', 'f(x4)', 'εa (%)', 'Et', 'εt (%)'];

  function filasIteracionesRidders(res) {
    return res.iteraciones.map(function (it) {
      return [
        it.iter, fmt(it.xl, 8), fmt(it.xu, 8), fmt(it.xm, 8), fmt(it.fxm, 6),
        fmt(it.x4, 10), fmt(it.f4, 6),
        it.ea === null || !isFinite(it.ea) ? '—' : fmt(it.ea, 4),
        fmt(it.et, 6), fmt(it.etp, 4),
      ];
    });
  }

  function renderizarTablaRidders(res) {
    $('r-tabla').innerHTML = construirTabla(CABECERA_ITER_RIDDERS, filasIteracionesRidders(res));
  }

  function dibujarGraficasRidders(res) {
    dibujarTodas(graficasRidders(res));
  }

  function graficasRidders(res) {
    var f = res.f;
    var xl = res.iteraciones.length ? res.iteraciones[0].xl : res.intervaloFinal[0];
    var xu = res.iteraciones.length ? res.iteraciones[0].xu : res.intervaloFinal[1];
    var pad = Math.max(Math.abs(xu - xl) * 0.15, 1e-6);
    var x0 = xl - pad, x1 = xu + pad;

    var xs = [], ys = [];
    for (var i = 0; i <= 300; i++) {
      var x = x0 + (x1 - x0) * i / 300;
      var y;
      try { y = f(x); } catch (e) { y = NaN; }
      xs.push(x); ys.push(isFinite(y) ? y : null);
    }
    var traceF = { x: xs, y: ys, mode: 'lines', name: 'f(x)', line: { color: '#5c7cfa', width: 2.5 } };
    var traceRaiz = {
      x: [res.raiz], y: [0], mode: 'markers+text', text: ['raíz ≈ ' + fmt(res.raiz, 8)],
      textposition: 'top center', name: 'Raíz', marker: { color: '#e64980', size: 12 },
    };
    var layout = layoutBase('f(x) con el intervalo inicial sombreado', 'x', 'f(x)', {
      shapes: [{
        type: 'rect', xref: 'x', yref: 'paper', x0: xl, x1: xu, y0: 0, y1: 1,
        fillcolor: 'rgba(12, 166, 120, 0.15)', line: { width: 0 },
      }],
    });
    return [{ id: 'plot-r-func', data: [traceF, traceRaiz], layout: layout }];
  }



  /* ================= Guardar cálculo e historial (backend) =================
   * La calculadora es autónoma: si el servidor o la base de datos fallan,
   * todo sigue funcionando y solo se muestra un aviso claro.
   * ==================================================================== */

  // Si la página se sirve desde el servidor Node (http://localhost:5173) se usa
  // la ruta relativa. Si se abre el index.html con doble clic (file://) o desde
  // otro servidor (p. ej. Apache de WAMP), se apunta al servidor Node local.
  var SERVIDOR_API = 'http://localhost:5173';
  var API_CALCULOS = (location.protocol !== 'file:' && location.port === '5173')
    ? '/api/calculos'
    : SERVIDOR_API + '/api/calculos';
  var backendOk = null;                 // null = sin sondear, true/false tras sondear
  var modoLocal = false;                // true = sin servidor: registro de PDFs en el navegador
  var CLAVE_REGISTRO = 'registroPdfs';

  function leerRegistroLocal() {
    try {
      var lista = JSON.parse(localStorage.getItem(CLAVE_REGISTRO) || '[]');
      return Array.isArray(lista) ? lista : [];
    } catch (e) { return []; }
  }

  function guardarRegistroLocal(lista) {
    try { localStorage.setItem(CLAVE_REGISTRO, JSON.stringify(lista)); } catch (e) { /* sin almacenamiento */ }
  }

  function registrarPdfLocal(c) {
    var lista = leerRegistroLocal();
    var maxId = lista.reduce(function (m, x) { return Math.max(m, x.id || 0); }, 0);
    lista.unshift({ id: maxId + 1, metodo: c.metodo, fecha: c.fecha, entradas: c.entradas, resultados: c.resultados });
    guardarRegistroLocal(lista.slice(0, 50));
  }

  function jsonDe(resp) {
    return resp.json()
      .catch(function () { return null; })
      .then(function (data) { return { ok: resp.ok, status: resp.status, data: data }; });
  }

  function mensajeGuardado(idBox, tipo, texto) {
    var box = $(idBox);
    box.className = 'msg-guardado' + (tipo ? ' ' + tipo : '');
    box.textContent = texto;
    box.hidden = false;
  }

  function avisoBackendNoDisponible(idBox) {
    mensajeGuardado(idBox, 'fallo',
      '⚠ Guardado no disponible: el servidor o la base de datos no responden. ' +
      'Ejecuta «npm start» en la carpeta del proyecto (con WAMP encendido) y recarga la página. ' +
      'Puedes seguir calculando normalmente; este cálculo no se guardará.');
  }

  function limpiarGuardado(idBox) {
    if (backendOk === false && !modoLocal) { avisoBackendNoDisponible(idBox); return; }
    var box = $(idBox);
    box.hidden = true;
    box.textContent = '';
  }

  /* -------- Construcción de los datos que se guardan -------- */

  function entradasBairstow() {
    return {
      coeficientes: $('b-coef').value.trim(),
      r0: $('b-r0').value.trim(),
      s0: $('b-s0').value.trim(),
      tolerancia: $('b-tol').value,
      maxIteraciones: $('b-iters').value,
      raicesVerdaderas: $('b-verdaderas').value.trim(),
    };
  }

  function resultadosBairstow(res) {
    return {
      grado: typeof res.grado === 'number' ? res.grado : null,
      raices: res.raices.map(function (z) { return { re: z.re, im: z.im }; }),
      nFactores: res.factores.length,
      convergieronTodos: res.factores.every(function (f) { return f.convergido !== false; }),
    };
  }

  function entradasRidders() {
    return {
      funcion: $('r-func').value.trim(),
      xl: $('r-xl').value.trim(),
      xu: $('r-xu').value.trim(),
      tolerancia: $('r-tol').value,
      maxIteraciones: $('r-iters').value,
      valorVerdadero: $('r-verdadera').value.trim(),
    };
  }

  function resultadosRidders(res) {
    return {
      raiz: typeof res.raiz === 'number' ? res.raiz : null,
      fRaiz: typeof res.fRaiz === 'number' ? res.fRaiz : null,
      convergido: !!res.convergido,
      nIteraciones: res.nIteraciones,
      valorVerdadero: typeof res.valorVerdadero === 'number' ? res.valorVerdadero : null,
      referenciaCalculada: !!res.valorVerdaderoCalculado,
    };
  }

  /* -------- Guardar -------- */

  function guardarCalculo(metodo) {
    var esBairstow = metodo === 'bairstow';
    var res = esBairstow ? estado.bairstow : estado.ridders;
    var idBox = esBairstow ? 'b-guardado' : 'r-guardado';
    var btn = $(esBairstow ? 'b-guardar' : 'r-guardar');

    if (!res) {
      mensajeGuardado(idBox, 'fallo', 'Primero realiza un cálculo para poder guardarlo.');
      return;
    }

    btn.disabled = true;
    var textoOriginal = btn.textContent;
    btn.textContent = '⏳ Guardando…';

    var cuerpo = {
      metodo: metodo,
      entradas: res.entradas,
      resultados: esBairstow ? resultadosBairstow(res) : resultadosRidders(res),
    };

    fetch(API_CALCULOS, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cuerpo),
    })
      .then(jsonDe)
      .then(function (r) {
        if (r.ok && r.data && r.data.calculo) {
          backendOk = true;
          mensajeGuardado(idBox, 'ok',
            '✓ Cálculo guardado con id #' + r.data.calculo.id +
            '. Puedes verlo en la pestaña Historial.');
        } else {
          var msj = (r.data && r.data.error)
            ? r.data.error
            : 'el servidor respondió con HTTP ' + r.status + '.';
          mensajeGuardado(idBox, 'fallo',
            '✗ No se pudo guardar: ' + msj +
            ' La calculadora sigue funcionando; este cálculo no se guardó.');
        }
      })
      .catch(function (e) {
        backendOk = false;
        mensajeGuardado(idBox, 'fallo',
          '✗ No se pudo guardar: no hay conexión con el servidor (' + (e.message || e) + '). ' +
          'La calculadora sigue funcionando; este cálculo no se guardó.');
      })
      .then(function () {
        btn.disabled = false;
        btn.textContent = textoOriginal;
      });
  }

  $('b-guardar').addEventListener('click', function () { guardarCalculo('bairstow'); });
  $('r-guardar').addEventListener('click', function () { guardarCalculo('ridders'); });

  /* -------- Historial -------- */

  function formatoFecha(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return String(iso || '');
    return d.toLocaleString();
  }

  function resumenEntradas(c) {
    var e = c.entradas || {};
    if (c.metodo === 'bairstow') {
      var grado = (c.resultados && typeof c.resultados.grado === 'number')
        ? 'grado ' + c.resultados.grado + ' · ' : '';
      return grado + 'P(x) = ' + (e.coeficientes || '—') +
        ' (r₀ = ' + (e.r0 || '—') + ', s₀ = ' + (e.s0 || '—') + ')';
    }
    return 'f(x) = ' + (e.funcion || '—') +
      ' en [' + (e.xl || '—') + ', ' + (e.xu || '—') + ']';
  }

  function resumenResultados(c) {
    var r = c.resultados || {};
    if (c.metodo === 'bairstow') {
      var raices = Array.isArray(r.raices)
        ? r.raices.map(function (z) { return fmtComplexo(z); }).join(', ')
        : '—';
      return 'Raíces: ' + raices;
    }
    return 'Raíz ≈ ' + fmt(r.raiz, 10) +
      (r.convergido === false ? ' (sin convergir)' : '');
  }

  function errorHistorial(msj) {
    historialActual = [];
    $('h-pdf').disabled = true;
    mostrarError('h-error',
      'No se pudo cargar el historial: ' + msj +
      ' Comprueba que el servidor esté en marcha y que las variables de entorno ' +
      'DB_HOST, DB_USER, DB_NAME estén bien configuradas.');
    $('h-lista').innerHTML =
      '<p class="hist-vacio">La calculadora sigue funcionando con normalidad; ' +
      'el historial se cargará cuando el servidor y la base de datos estén disponibles.</p>';
  }

  var historialActual = [];             // última lista cargada (para el PDF)

  function renderizarHistorial(calculos) {
    historialActual = calculos.slice();
    $('h-pdf').disabled = !calculos.length;
    var cont = $('h-lista');
    cont.innerHTML = '';
    if (!calculos.length) {
      cont.innerHTML = modoLocal
        ? '<p class="hist-vacio">Aún no has descargado ningún PDF. ' +
          'Haz un cálculo y pulsa «📄 Descargar PDF»; quedará registrado aquí.</p>'
        : '<p class="hist-vacio">Aún no hay cálculos guardados. ' +
          'Haz un cálculo y pulsa «💾 Guardar cálculo».</p>';
      return;
    }
    var lista = document.createElement('div');
    lista.className = 'hist-lista';

    calculos.forEach(function (c) {
      var item = document.createElement('div');
      item.className = 'hist-item';

      var main = document.createElement('div');
      main.className = 'hist-main';

      var titulo = document.createElement('div');
      titulo.className = 'hist-titulo';
      var badge = document.createElement('span');
      badge.className = 'badge-metodo' + (c.metodo === 'ridders' ? ' ridders' : '');
      badge.textContent = c.metodo;
      var idTxt = document.createElement('span');
      idTxt.textContent = '#' + c.id;
      var fecha = document.createElement('span');
      fecha.className = 'hist-meta';
      fecha.textContent = formatoFecha(c.fecha);
      titulo.appendChild(badge);
      titulo.appendChild(idTxt);
      titulo.appendChild(fecha);

      var resumen = document.createElement('div');
      resumen.className = 'hist-resumen';
      resumen.textContent = resumenEntradas(c) + '  →  ' + resumenResultados(c);

      main.appendChild(titulo);
      main.appendChild(resumen);

      var acciones = document.createElement('div');
      acciones.className = 'hist-acciones';

      var btnRecargar = document.createElement('button');
      btnRecargar.type = 'button';
      btnRecargar.className = 'btn btn-secondary';
      btnRecargar.textContent = '♻ Recargar';
      btnRecargar.addEventListener('click', function () { recargarCalculo(c); });

      var btnBorrar = document.createElement('button');
      btnBorrar.type = 'button';
      btnBorrar.className = 'btn btn-ghost';
      btnBorrar.textContent = '🗑 Borrar';
      btnBorrar.addEventListener('click', function () { borrarCalculo(c); });

      var btnPdf = document.createElement('button');
      btnPdf.type = 'button';
      btnPdf.className = 'btn btn-save';
      btnPdf.textContent = '📄 Descargar PDF';
      btnPdf.title = 'Descargar un PDF con el detalle de este cálculo';
      btnPdf.addEventListener('click', function () { descargarCalculoPdf(c, btnPdf); });

      acciones.appendChild(btnPdf);
      acciones.appendChild(btnRecargar);
      acciones.appendChild(btnBorrar);
      item.appendChild(main);
      item.appendChild(acciones);
      lista.appendChild(item);
    });
    cont.appendChild(lista);
  }

  function cargarHistorial(mensajeExito) {
    limpiarError('h-error');
    mostrarAvisos('h-aviso', []);
    if (modoLocal) {
      renderizarHistorial(leerRegistroLocal());
      if (mensajeExito) mostrarAvisos('h-aviso', [mensajeExito]);
      return;
    }
    $('h-lista').innerHTML = '<p class="hist-vacio">Cargando historial…</p>';

    fetch(API_CALCULOS)
      .then(jsonDe)
      .then(function (r) {
        if (!r.ok || !r.data || !Array.isArray(r.data.calculos)) {
          errorHistorial((r.data && r.data.error)
            ? r.data.error
            : 'el servidor respondió con HTTP ' + r.status + '.');
          return;
        }
        backendOk = true;
        renderizarHistorial(r.data.calculos);
        if (mensajeExito) mostrarAvisos('h-aviso', [mensajeExito]);
      })
      .catch(function (e) {
        backendOk = false;
        errorHistorial('sin conexión con el servidor (' + (e.message || e) + ').');
      });
  }

  $('h-actualizar').addEventListener('click', function () { cargarHistorial(); });

  /* -------- Descargar historial en PDF (jsPDF + autoTable) -------- */

  // Las fuentes estándar de jsPDF solo admiten Latin-1: se sustituyen los
  // símbolos que no existen ahí (subíndices, ≈, →, ε...) por equivalentes.
  var MAPA_PDF = {
    '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4', '₅': '5', '₆': '6', '₇': '7', '₈': '8', '₉': '9',
    '≈': '~', '→': '->', '—': '-', '–': '-', 'ε': 'e', '√': 'sqrt', '≤': '<=', '≥': '>=',
    '−': '-', '…': '...', 'ᵢ': 'i', '₋': '-', 'Δ': 'Delta ', '✓': '', '✗': '',
  };
  function textoPdf(txt) {
    return String(txt).replace(/[^\x00-\xFF]/g, function (ch) {
      return MAPA_PDF[ch] !== undefined ? MAPA_PDF[ch] : '?';
    });
  }

  var COLOR_BAIRSTOW = [59, 91, 219];
  var COLOR_RIDDERS = [12, 166, 120];

  /** Crea un documento jsPDF listo para usar, o muestra el error y devuelve null. */
  function nuevoDocPdf(orientacion, idError) {
    idError = idError || 'h-error';
    limpiarError(idError);
    if (!window.jspdf || !window.jspdf.jsPDF) {
      mostrarError(idError, 'No se pudo cargar la librería de PDF (jsPDF) desde el CDN. ' +
        'Comprueba tu conexión a internet y recarga la página.');
      return null;
    }
    var doc = new window.jspdf.jsPDF({ orientation: orientacion, unit: 'mm', format: 'a4' });
    if (typeof doc.autoTable !== 'function') {
      mostrarError(idError, 'No se pudo cargar el complemento de tablas del PDF (jspdf-autotable).');
      return null;
    }
    return doc;
  }

  function encabezadoPdf(doc, titulo, subtitulo) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.setTextColor(0);
    doc.text(textoPdf(titulo), 14, 16);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(90);
    doc.text(textoPdf(subtitulo), 14, 22);
    doc.setTextColor(0);
  }

  /** Numera todas las páginas del documento ("Página i de N"). */
  function numerarPaginasPdf(doc) {
    var total = doc.internal.getNumberOfPages();
    var ancho = doc.internal.pageSize.getWidth();
    var alto = doc.internal.pageSize.getHeight();
    for (var i = 1; i <= total; i++) {
      doc.setPage(i);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(120);
      doc.text('Página ' + i + ' de ' + total, ancho - 14, alto - 8, { align: 'right' });
    }
    doc.setTextColor(0);
  }

  function fechaArchivo(d) {
    var dos = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + '-' + dos(d.getMonth() + 1) + '-' + dos(d.getDate());
  }

  function estadoCalculo(c) {
    var r = c.resultados || {};
    if (c.metodo === 'bairstow') {
      return r.convergieronTodos === false ? 'No convergió' : 'Convergió';
    }
    return (r.convergido === false ? 'No convergió' : 'Convergió') +
      (typeof r.nIteraciones === 'number' ? ' (' + r.nIteraciones + ' it.)' : '');
  }

  function valorOGuion(v) {
    return (v === undefined || v === null || v === '') ? '—' : String(v);
  }

  /**
   * PDF completo de un cálculo del historial: datos de entrada, resultados,
   * avisos, errores, tablas de iteraciones, paso a paso y gráficas.
   * Como en la base de datos solo se guarda un resumen, el método se vuelve a
   * ejecutar con las entradas guardadas (los métodos son deterministas, así
   * que se obtiene exactamente el mismo resultado).
   */
  function descargarCalculoPdf(c, btn, idError) {
    idError = idError || 'h-error';
    var doc = nuevoDocPdf('portrait', idError);
    if (!doc) return Promise.resolve();

    var textoBtn = btn ? btn.textContent : '';
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Generando…'; }

    return construirPdfCalculo(doc, c)
      .then(function () {
        numerarPaginasPdf(doc);
        doc.save('calculo-' + (c.id ? c.id + '-' : '') + c.metodo + '-' + fechaArchivo(new Date()) + '.pdf');
        return true;
      })
      .catch(function (err) {
        mostrarError(idError, 'No se pudo generar el PDF' + (c.id ? ' del cálculo #' + c.id : '') + ': ' +
          ((err && err.message) || err));
        return false;
      })
      .then(function (ok) {
        if (btn) { btn.disabled = false; btn.textContent = textoBtn; }
        return ok;
      });
  }

  function construirPdfCalculo(doc, c) {
    var esB = c.metodo === 'bairstow';
    var e = c.entradas || {};
    var r = c.resultados || {};
    var color = esB ? COLOR_BAIRSTOW : COLOR_RIDDERS;
    var margen = 14;
    var anchoUtil = doc.internal.pageSize.getWidth() - 2 * margen;
    var altoPag = doc.internal.pageSize.getHeight();
    var y = 30;

    encabezadoPdf(doc, (c.id ? 'Cálculo #' + c.id : 'Cálculo actual') + ' — Método de ' + (esB ? 'Bairstow' : 'Ridders'),
      'Realizado el ' + formatoFecha(c.fecha) + ' · Generado el ' + new Date().toLocaleString());

    /* --- Utilidades de maquetación --- */
    function asegurarEspacio(alto) {
      if (y + alto > altoPag - 16) { doc.addPage(); y = 18; }
    }
    function tituloSeccion(txt) {
      asegurarEspacio(20);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12.5);
      doc.setTextColor(color[0], color[1], color[2]);
      doc.text(textoPdf(txt), margen, y + 4);
      doc.setDrawColor(color[0], color[1], color[2]);
      doc.setLineWidth(0.4);
      doc.line(margen, y + 6, margen + anchoUtil, y + 6);
      doc.setTextColor(0);
      doc.setFont('helvetica', 'normal');
      y += 10;
    }
    function subtitulo(txt) {
      asegurarEspacio(16);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.text(textoPdf(txt), margen, y + 3);
      doc.setFont('helvetica', 'normal');
      y += 5.5;
    }
    function limpiar(filas) {
      return filas.map(function (f) { return f.map(textoPdf); });
    }
    function tablaClaveValor(filas) {
      doc.autoTable({
        startY: y, margin: { left: margen, right: margen },
        body: limpiar(filas),
        theme: 'grid',
        styles: { font: 'helvetica', fontSize: 9.5, cellPadding: 2.2, overflow: 'linebreak' },
        columnStyles: { 0: { cellWidth: 58, fontStyle: 'bold', fillColor: [244, 246, 251] } },
      });
      y = doc.lastAutoTable.finalY + 7;
    }
    function tablaDatos(cabecera, filas, tamFuente) {
      doc.autoTable({
        startY: y, margin: { left: margen, right: margen },
        head: [cabecera.map(textoPdf)],
        body: limpiar(filas.map(function (f) { return f.map(String); })),
        theme: 'grid',
        styles: { font: 'helvetica', fontSize: tamFuente || 8.5, cellPadding: 1.6, halign: 'right', overflow: 'linebreak' },
        headStyles: { fillColor: color, textColor: 255, fontStyle: 'bold', halign: 'center' },
        columnStyles: { 0: { halign: 'center' } },
        alternateRowStyles: { fillColor: [244, 246, 251] },
      });
      y = doc.lastAutoTable.finalY + 7;
    }
    function tablaAvisos(lista, tipo) {
      if (!lista.length) return;
      var esError = tipo === 'error';
      doc.autoTable({
        startY: y, margin: { left: margen, right: margen },
        body: lista.map(function (a) { return [textoPdf((esError ? '' : '! ') + a)]; }),
        theme: 'plain',
        styles: {
          font: 'helvetica', fontSize: 9, cellPadding: 2.2,
          fillColor: esError ? [255, 240, 240] : [255, 248, 236],
          textColor: esError ? [224, 49, 49] : [180, 83, 9],
        },
      });
      y = doc.lastAutoTable.finalY + 7;
    }
    function agregarGraficas(graficas) {
      if (!graficas.length) return Promise.resolve();
      doc.addPage();
      y = 18;
      tituloSeccion('Gráficas');
      if (!plotlyListo()) {
        tablaAvisos(['No se pudo cargar Plotly.js (¿sin conexión a internet?): las gráficas no se incluyeron.']);
        return Promise.resolve();
      }
      return graficas.reduce(function (cadena, g) {
        return cadena.then(function () {
          var w = 1100;
          var h = g.id === 'plot-b-cartesiano' ? 820 : 560;
          var layout = Object.assign({}, g.layout, { width: w, height: h });
          return Plotly.toImage({ data: g.data, layout: layout },
            { format: 'jpeg', width: w, height: h, scale: 1.6 })
            .then(function (img) {
              var altoMm = anchoUtil * h / w;
              asegurarEspacio(altoMm + 4);
              doc.addImage(img, 'JPEG', margen, y, anchoUtil, altoMm);
              y += altoMm + 8;
            });
        });
      }, Promise.resolve());
    }

    function pasosEnPdf(grupos) {
      if (!grupos || !grupos.length) return;
      tituloSeccion('Procedimiento paso a paso (todas las iteraciones)');
      grupos.forEach(function (g) {
        subtitulo(g.titulo);
        tablaClaveValor(g.pasos);
      });
    }

    /* --- 1. Datos de entrada --- */
    tituloSeccion('Datos de entrada');
    tablaClaveValor(filasEntradasPdf(c));

    /* --- 2. Recalcular con las entradas guardadas --- */
    var res;
    try {
      res = esB ? resolverBairstow(e) : resolverRidders(e);
    } catch (err) {
      tituloSeccion('Resultados guardados');
      tablaClaveValor(filasResultadosGuardadosPdf(c));
      tablaAvisos(['No se pudieron regenerar las tablas y gráficas de este cálculo: ' +
        (err.message || err)], 'error');
      return Promise.resolve();
    }

    if (res.avisos && res.avisos.length) {
      tituloSeccion('Avisos');
      tablaAvisos(res.avisos);
    }

    var graficas;
    forzarTemaClaro = true;
    try {
      graficas = esB ? graficasBairstow(res) : graficasRidders(res);
    } finally {
      forzarTemaClaro = false;
    }

    if (esB) {
      tituloSeccion('Resultados');
      tablaClaveValor([
        ['Grado del polinomio', valorOGuion(res.grado)],
        ['Factores cuadráticos', String(res.factores.length)],
        ['Estado', res.factores.every(function (f) { return f.convergido !== false; }) ? 'Convergió' : 'No convergió'],
      ]);
      subtitulo('Raíces encontradas');
      tablaDatos(['#', 'Raíz', 'Tipo'], res.raices.map(function (z, i) {
        return ['x' + (i + 1), fmtComplexo(z, 10), Math.abs(z.im) > 1e-9 ? 'compleja' : 'real'];
      }), 9.5);

      var filasErr = filasErroresBairstow(res);
      if (filasErr.length) {
        tituloSeccion('Errores respecto a las raíces verdaderas');
        tablaDatos(CABECERA_ERR_BAIRSTOW, filasErr, 8.5);
      }

      var conIter = res.factores.filter(function (f) { return f.iteraciones && f.iteraciones.length; });
      if (conIter.length) {
        tituloSeccion('Tablas de iteraciones');
        conIter.forEach(function (f) {
          subtitulo(tituloFactor(f));
          tablaDatos(CABECERA_ITER_BAIRSTOW, filasIteracionesBairstow(f), 8);
        });
      }

      pasosEnPdf(pasosBairstow(res));
    } else {
      tituloSeccion('Resultados');
      tablaClaveValor(resumenRidders(res));

      if (res.iteraciones.length) {
        tituloSeccion('Tabla de iteraciones');
        tablaDatos(CABECERA_ITER_RIDDERS, filasIteracionesRidders(res), 7);
      }

      pasosEnPdf(pasosRidders(res));
    }

    return agregarGraficas(graficas);
  }

  function filasEntradasPdf(c) {
    var e = c.entradas || {};
    if (c.metodo === 'bairstow') {
      return [
        ['Coeficientes de P(x)', valorOGuion(e.coeficientes)],
        ['r₀ inicial', valorOGuion(e.r0)],
        ['s₀ inicial', valorOGuion(e.s0)],
        ['Tolerancia', valorOGuion(e.tolerancia)],
        ['Máximo de iteraciones', valorOGuion(e.maxIteraciones)],
        ['Raíces verdaderas (referencia)', valorOGuion(e.raicesVerdaderas)],
      ];
    }
    return [
      ['Función f(x)', valorOGuion(e.funcion)],
      ['Extremo inferior xl', valorOGuion(e.xl)],
      ['Extremo superior xu', valorOGuion(e.xu)],
      ['Tolerancia', valorOGuion(e.tolerancia)],
      ['Máximo de iteraciones', valorOGuion(e.maxIteraciones)],
      ['Valor verdadero (referencia)', valorOGuion(e.valorVerdadero)],
    ];
  }

  /** Resumen guardado en la base de datos (se usa si no se puede recalcular). */
  function filasResultadosGuardadosPdf(c) {
    var r = c.resultados || {};
    var filas;
    if (c.metodo === 'bairstow') {
      filas = [
        ['Grado del polinomio', valorOGuion(r.grado)],
        ['Factores cuadráticos', valorOGuion(r.nFactores)],
        ['Estado', estadoCalculo(c)],
      ];
      (Array.isArray(r.raices) ? r.raices : []).forEach(function (z, i) {
        var tipo = Math.abs(z.im) < 1e-9 ? 'real' : 'compleja';
        filas.push(['Raíz x' + (i + 1) + ' (' + tipo + ')', fmtComplexo(z, 10)]);
      });
      return filas;
    }
    filas = [
      ['Raíz aproximada', fmt(r.raiz, 12)],
      ['f(raíz)', fmt(r.fRaiz, 8)],
      ['Iteraciones', valorOGuion(r.nIteraciones)],
      ['Estado', r.convergido === false ? 'No convergió' : 'Convergió'],
    ];
    if (typeof r.valorVerdadero === 'number') {
      filas.push(['Valor verdadero usado', fmt(r.valorVerdadero, 12) +
        (r.referenciaCalculada ? ' (calculado automáticamente)' : '')]);
    }
    return filas;
  }

  /** PDF con la tabla de todo el historial cargado. */
  function descargarHistorialPdf() {
    if (!historialActual.length) {
      mostrarError('h-error', 'No hay cálculos en el historial para exportar.');
      return;
    }
    var doc = nuevoDocPdf('landscape');
    if (!doc) return;
    var ahora = new Date();

    encabezadoPdf(doc, 'Historial de cálculos — Calculadora de Raíces',
      'Métodos de Bairstow y Ridders · Generado el ' + ahora.toLocaleString() +
      ' · ' + historialActual.length + ' cálculo(s)');

    var filas = historialActual.map(function (c) {
      var estadoTxt = estadoCalculo(c);
      return [
        '#' + c.id,
        c.metodo === 'bairstow' ? 'Bairstow' : 'Ridders',
        formatoFecha(c.fecha),
        resumenEntradas(c),
        resumenResultados(c),
        estadoTxt,
      ].map(textoPdf);
    });

    doc.autoTable({
      startY: 27,
      head: [['ID', 'Método', 'Fecha', 'Datos de entrada', 'Resultados', 'Estado'].map(textoPdf)],
      body: filas,
      theme: 'grid',
      styles: { font: 'helvetica', fontSize: 8.5, cellPadding: 2, overflow: 'linebreak', valign: 'top' },
      headStyles: { fillColor: COLOR_BAIRSTOW, textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [244, 246, 251] },
      columnStyles: {
        0: { cellWidth: 14, halign: 'center' },
        1: { cellWidth: 20 },
        2: { cellWidth: 34 },
        3: { cellWidth: 85 },
        4: { cellWidth: 'auto' },
        5: { cellWidth: 28 },
      },
      didParseCell: function (data) {
        if (data.section === 'body' && data.column.index === 1) {
          data.cell.styles.textColor = data.cell.raw === 'Ridders' ? COLOR_RIDDERS : COLOR_BAIRSTOW;
          data.cell.styles.fontStyle = 'bold';
        }
      },
    });

    numerarPaginasPdf(doc);
    doc.save('historial-calculos-' + fechaArchivo(ahora) + '.pdf');
  }

  $('h-pdf').addEventListener('click', descargarHistorialPdf);

  /** PDF del cálculo que se ve en pantalla (con las entradas con que se calculó). */
  function descargarPdfActual(metodo) {
    var esB = metodo === 'bairstow';
    var res = esB ? estado.bairstow : estado.ridders;
    if (!res) return;
    var c = { id: null, metodo: metodo, fecha: new Date().toISOString(), entradas: res.entradas, resultados: {} };
    descargarCalculoPdf(c, $(esB ? 'b-pdf' : 'r-pdf'), esB ? 'b-error' : 'r-error')
      .then(function (ok) {
        if (ok && modoLocal) {
          c.resultados = esB ? resultadosBairstow(res) : resultadosRidders(res);
          registrarPdfLocal(c);
        }
      });
  }
  $('b-pdf').addEventListener('click', function () { descargarPdfActual('bairstow'); });
  $('r-pdf').addEventListener('click', function () { descargarPdfActual('ridders'); });

  function recargarCalculo(c) {
    var e = c.entradas || {};
    if (c.metodo === 'bairstow') {
      $('b-coef').value = e.coeficientes !== undefined ? e.coeficientes : '';
      $('b-r0').value = e.r0 !== undefined && e.r0 !== '' ? e.r0 : '-1';
      $('b-s0').value = e.s0 !== undefined && e.s0 !== '' ? e.s0 : '-1';
      $('b-tol').value = e.tolerancia || '0.0001';
      $('b-iters').value = e.maxIteraciones || '100';
      $('b-verdaderas').value = e.raicesVerdaderas || '';
      activarTab('bairstow');
      calcularBairstow(['Cálculo #' + c.id + ' del historial recargado en el formulario.']);
    } else {
      $('r-func').value = e.funcion !== undefined ? e.funcion : '';
      $('r-xl').value = e.xl !== undefined && e.xl !== '' ? e.xl : '1';
      $('r-xu').value = e.xu !== undefined && e.xu !== '' ? e.xu : '2';
      $('r-tol').value = e.tolerancia || '0.0001';
      $('r-iters').value = e.maxIteraciones || '100';
      $('r-verdadera').value = e.valorVerdadero || '';
      activarTab('ridders');
      calcularRidders(['Cálculo #' + c.id + ' del historial recargado en el formulario.']);
    }
  }

  function borrarCalculo(c) {
    if (!window.confirm('¿Borrar el cálculo #' + c.id + ' (' + c.metodo + ')? ' +
        'Esta acción no se puede deshacer.')) return;

    if (modoLocal) {
      guardarRegistroLocal(leerRegistroLocal().filter(function (x) { return x.id !== c.id; }));
      cargarHistorial('✓ Cálculo #' + c.id + ' borrado.');
      return;
    }

    fetch(API_CALCULOS + '/' + encodeURIComponent(c.id), { method: 'DELETE' })
      .then(jsonDe)
      .then(function (r) {
        if (r.ok) {
          cargarHistorial('✓ Cálculo #' + c.id + ' borrado.');
        } else if (r.status === 404) {
          cargarHistorial();
          mostrarError('h-error', 'El cálculo #' + c.id + ' ya no existe (¿borrado antes?).');
        } else {
          mostrarError('h-error', 'No se pudo borrar el cálculo #' + c.id + ': ' +
            ((r.data && r.data.error) ? r.data.error : 'HTTP ' + r.status + '.'));
        }
      })
      .catch(function (e) {
        backendOk = false;
        mostrarError('h-error', 'No se pudo borrar el cálculo #' + c.id +
          ': sin conexión con el servidor (' + (e.message || e) + ').');
      });
  }

  /* -------- Sondeo inicial: ¿responde el backend? -------- */

  // Sin servidor (p. ej. publicada en GitHub Pages): se ocultan Guardar e
  // Historial y la calculadora funciona sola (cálculos, gráficas y PDFs).
  // En ese modo el Historial es un registro de los PDFs descargados, guardado
  // solo en el navegador de quien usa la página (localStorage).
  function modoSinServidor() {
    backendOk = false;
    modoLocal = true;
    ['b-guardar', 'r-guardar', 'b-guardado', 'r-guardado']
      .forEach(function (id) { if ($(id)) $(id).hidden = true; });
    var panel = $('panel-historial');
    panel.querySelector('h2').textContent = 'Registro de PDFs descargados';
    panel.querySelector('.texto-suave').innerHTML =
      'Cada vez que descargas el PDF de un cálculo queda anotado aquí (últimos 50, ' +
      'guardados solo en este navegador). Con <b>Descargar PDF</b> lo vuelves a descargar, ' +
      'con <b>Recargar</b> vuelves a llenar el formulario y con <b>Borrar</b> lo quitas de la lista.';
    if (panel.classList.contains('active')) cargarHistorial();
  }

  window.addEventListener('load', function () {
    if (/\.github\.io$/i.test(location.hostname)) { modoSinServidor(); return; }
    fetch(API_CALCULOS)
      .then(jsonDe)
      .then(function (r) {
        backendOk = !!(r.ok && r.data && Array.isArray(r.data.calculos));
        if (!backendOk) modoSinServidor();
      })
      .catch(modoSinServidor);
  });

  /* ================= Aviso de librerías CDN ================= */

  window.addEventListener('load', function () {
    if (typeof math === 'undefined' || typeof Plotly === 'undefined') {
      mostrarAvisos('b-avisos', ['Advertencia: no se cargaron math.js y/o Plotly.js desde el CDN. Compruebe su conexión a internet; los cálculos podrían fallar.']);
    }
  });
})();

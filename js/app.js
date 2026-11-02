/**
 * js/app.js
 * Capa de interfaz: pestañas, validación, tablas, gráficas (Plotly),
 * exportación a CSV y ayuda didáctica. No contiene matemática de los
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
  tabs.forEach(function (t) {
    t.addEventListener('click', function () {
      tabs.forEach(function (o) {
        o.classList.remove('active');
        o.setAttribute('aria-selected', 'false');
      });
      t.classList.add('active');
      t.setAttribute('aria-selected', 'true');
      document.querySelectorAll('.panel').forEach(function (p) { p.classList.remove('active'); });
      $('panel-' + t.dataset.tab).classList.add('active');
      redibujarGraficas();
    });
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

  function temaPlot() {
    var oscuro = document.documentElement.getAttribute('data-theme') === 'dark';
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

  /* Estado de la aplicación (para CSV y redibujado) */
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
    $('b-csv').disabled = true;
  });

  $('form-bairstow').addEventListener('submit', function (ev) {
    ev.preventDefault();
    calcularBairstow();
  });

  function calcularBairstow() {
    limpiarError('b-error');
    mostrarAvisos('b-avisos', []);
    $('b-resultado').hidden = true;
    estado.bairstow = null;
    $('b-csv').disabled = true;

    try {
      var txtCoef = $('b-coef').value.trim();
      if (!txtCoef) throw new Error('Los coeficientes del polinomio están vacíos.');

      var coef = txtCoef.split(/[,;\s]+/).filter(Boolean).map(function (c) {
        var v = num(c);
        if (!isFinite(v)) throw new Error('"' + c + '" no es un número válido. Separe los coeficientes por comas.');
        return v;
      });
      if (coef.length < 2) throw new Error('Se necesitan al menos 2 coeficientes (un polinomio de grado 1).');
      if (Math.abs(coef[0]) < 1e-14) throw new Error('El primer coeficiente (grado mayor) no puede ser cero.');

      var r0 = num($('b-r0').value);
      var s0 = num($('b-s0').value);
      if (!isFinite(r0) || !isFinite(s0)) throw new Error('r₀ y s₀ deben ser números válidos.');

      var tol = num($('b-tol').value);
      if (!isFinite(tol) || tol < 0) throw new Error('La tolerancia debe ser un número mayor o igual a 0 (%).');

      var maxIter = parseInt($('b-iters').value, 10);
      if (!isFinite(maxIter) || maxIter < 1 || maxIter > 10000) throw new Error('El máximo de iteraciones debe estar entre 1 y 10000.');

      var verdaderas = parsearRaicesVerdaderas($('b-verdaderas').value);

      var res = Bairstow.resolver(coef, r0, s0, tol, maxIter);
      res.coeficientes = coef;
      res.verdaderas = verdaderas;

      mostrarAvisos('b-avisos', res.avisos);
      renderizarRaices(res);
      renderizarTablasBairstow(res);
      renderizarErroresBairstow(res);
      renderizarPasosBairstow(res);
      dibujarGraficasBairstow(res);

      estado.bairstow = res;
      $('b-resultado').hidden = false;
      $('b-csv').disabled = false;
    } catch (e) {
      mostrarError('b-error', e.message || String(e));
    }
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
      h.textContent = 'Factor ' + f.indice + ':  x² − ' + fmt(f.r) + ' x − ' + fmt(f.s) +
        (f.convergido ? '  ✓ convergió' : '  ✗ sin convergir');
      cont.appendChild(h);
      cont.insertAdjacentHTML('beforeend', construirTabla(
        ['Iteración', 'r', 's', 'Δr', 'Δs', 'εa de r (%)', 'εa de s (%)'],
        f.iteraciones.map(function (it) {
          return [it.iter, fmt(it.r), fmt(it.s), fmt(it.dr), fmt(it.ds),
            it.er === null || !isFinite(it.er) ? '—' : fmt(it.er, 4),
            it.es === null || !isFinite(it.es) ? '—' : fmt(it.es, 4)];
        })
      ));
    });
    $('b-card-tablas').hidden = !hayTablas;
  }

  function renderizarErroresBairstow(res) {
    var cont = $('b-errores');
    cont.innerHTML = '';
    if (!res.verdaderas || res.verdaderas.length === 0) {
      $('b-card-errores').hidden = true;
      return;
    }
    var pareadas = emparejarRaices(res.raices, res.verdaderas);
    cont.insertAdjacentHTML('beforeend', construirTabla(
      ['#', 'Raíz verdadera', 'Raíz aproximada', 'Et = verdadera − aproximada', 'εt (%)'],
      pareadas.map(function (p, i) {
        var et = { re: p.verdadera.re - p.aproximada.re, im: p.verdadera.im - p.aproximada.im };
        var modT = Math.sqrt(p.verdadera.re * p.verdadera.re + p.verdadera.im * p.verdadera.im);
        var modE = Math.sqrt(et.re * et.re + et.im * et.im);
        var etp = modT > 1e-14 ? (modE / modT) * 100 : modE * 100;
        return [i + 1, fmtComplexo(p.verdadera), fmtComplexo(p.aproximada), fmtComplexo(et), fmt(etp, 4)];
      })
    ));
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

  function renderizarPasosBairstow(res) {
    var cont = $('b-pasos');
    var f = res.factores.find(function (x) { return x.primerPaso; });
    if (!f) { cont.innerHTML = '<p>No hay iteraciones que mostrar (el polinomio era de grado 1 o 2).</p>'; return; }
    var p = f.primerPaso;
    var n = p.b.length - 1;
    var html = '<ol>';
    html += '<li class="paso"><b>Polinomio:</b> a(x) = ' +
      p.a.map(function (c, i) { return fmt(c) + 'x^' + (n - i); }).join(' + ').replace(/\+ -/g, '− ') +
      '<br><b>Factor inicial:</b> x² − (' + fmt(p.r0) + ')x − (' + fmt(p.s0) + ')</li>';

    var bTxt = p.b.map(function (v, i) { return 'b' + i + ' = ' + fmt(v); }).join(', ');
    var cTxt = p.c.map(function (v, i) { return 'c' + i + ' = ' + fmt(v); }).join(', ');
    html += '<li class="paso"><b>División sintética (b):</b> b₀ = a₀ = ' + fmt(p.b[0]) +
      '; bᵢ = aᵢ + r·bᵢ₋₁ + s·bᵢ₋₂<br>' + escaparHtml(bTxt) + '</li>';
    html += '<li class="paso"><b>Segunda división (c):</b> cᵢ = bᵢ + r·cᵢ₋₁ + s·cᵢ₋₂<br>' + escaparHtml(cTxt) + '</li>';
    html += '<li class="paso"><b>Determinante del sistema:</b> det = c' + (n - 2) + '² − c' + (n - 1) + '·c' + (n - 3) + ' = ' + fmt(p.det) + '</li>';
    html += '<li class="paso"><b>Incrementos:</b> Δr = ' + fmt(p.dr) + ', Δs = ' + fmt(p.ds) + '</li>';
    html += '<li class="paso"><b>Nuevos valores:</b> r = ' + fmt(p.r0) + ' + (' + fmt(p.dr) + ') = ' + fmt(p.r0 + p.dr) +
      ' &nbsp; s = ' + fmt(p.s0) + ' + (' + fmt(p.ds) + ') = ' + fmt(p.s0 + p.ds) + '</li>';
    html += '<li class="paso"><b>Errores aproximados:</b> εa(r) = ' + fmt(p.er, 4) + ' %, εa(s) = ' + fmt(p.es, 4) + ' %</li>';
    html += '<li class="paso"><b>Condiciones de parada:</b> se itera hasta que εa(r) y εa(s) sean menores que la tolerancia (o se alcance el máximo de iteraciones).</li>';
    html += '</ol>';
    cont.innerHTML = html;
  }

  function dibujarGraficasBairstow(res) {
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
    dibujar('plot-b-pol', [tracePol, traceRaices], layoutBase(
      'Polinomio en el eje real (raíces reales marcadas en rosa)', 'x', 'P(x)',
      { yaxis: Object.assign(layoutBase('', '', '').yaxis, {
          gridcolor: temaPlot().grid, zerolinecolor: temaPlot().grid,
          range: [-Math.max(1, escalaY * 0.6), Math.max(1, escalaY * 0.6)],
        }) }
    ));

    /* (b) Plano complejo */
    var trazoRaices = {
      x: raices.map(function (z) { return z.re; }),
      y: raices.map(function (z) { return z.im; }),
      mode: 'markers+text', text: raices.map(function (z, i) { return 'x' + (i + 1); }),
      textposition: 'top center', name: 'Raíces',
      marker: {
        size: 12,
        color: raices.map(function (z) { return Math.abs(z.im) < 1e-9 ? '#3b5bdb' : '#e64980'; }),
      },
    };
    var cmin = raices.length ? Math.min.apply(null, raices.map(function (z) { return Math.min(z.re, z.im); })) : -2;
    var cmax = raices.length ? Math.max.apply(null, raices.map(function (z) { return Math.max(z.re, z.im); })) : 2;
    var cpad = Math.max(1, (cmax - cmin) * 0.3);
    dibujar('plot-b-complex', [trazoRaices], layoutBase(
      'Plano complejo — todas las raíces', 'Parte real', 'Parte imaginaria',
      {
        xaxis: Object.assign({ range: [cmin - cpad, cmax + cpad], gridcolor: temaPlot().grid, zeroline: true, zerolinecolor: '#888' }, {}),
        yaxis: { range: [cmin - cpad, cmax + cpad], gridcolor: temaPlot().grid, zeroline: true, zerolinecolor: '#888', scaleanchor: 'x' },
      }
    ));

    /* (c) Error vs iteración (log) */
    var datosErr = [];
    res.factores.forEach(function (f) {
      if (!f.iteraciones || !f.iteraciones.length) return;
      datosErr.push({
        x: f.iteraciones.map(function (it) { return it.iter; }),
        y: f.iteraciones.map(function (it) { return Math.max(it.er || 0, 1e-16); }),
        mode: 'lines+markers', name: 'Factor ' + f.indice + ' — εa(r)',
        line: { color: '#3b5bdb' },
      });
      datosErr.push({
        x: f.iteraciones.map(function (it) { return it.iter; }),
        y: f.iteraciones.map(function (it) { return Math.max(it.es || 0, 1e-16); }),
        mode: 'lines+markers', name: 'Factor ' + f.indice + ' — εa(s)',
        line: { color: '#0ca678', dash: 'dash' },
      });
    });
    if (datosErr.length) {
      dibujar('plot-b-error', datosErr, layoutBase(
        'Error aproximado vs. iteración (escala logarítmica)', 'Iteración', 'Error aproximado (%)',
        { yaxis: { type: 'log', gridcolor: temaPlot().grid, rangemode: 'tozero' } }
      ));
    } else {
      $('plot-b-error').innerHTML = '<p>Sin iteraciones de Bairstow (polinomio de grado ≤ 2).</p>';
    }
  }

  $('b-csv').addEventListener('click', function () {
    if (!estado.bairstow) return;
    var res = estado.bairstow;
    var lineas = ['Factor;Iteración;r;s;Δr;Δs;εa_r_%;εa_s_%'];
    res.factores.forEach(function (f) {
      (f.iteraciones || []).forEach(function (it) {
        lineas.push([f.indice, it.iter, it.r, it.s, it.dr, it.ds,
          isFinite(it.er) ? it.er : '', isFinite(it.es) ? it.es : ''].join(';'));
      });
    });
    lineas.push('');
    lineas.push('Raíces');
    lineas.push('Parte real;Parte imaginaria');
    res.raices.forEach(function (z) { lineas.push([z.re, z.im].join(';')); });
    descargarCSV(lineas, 'bairstow_iteraciones.csv');
  });

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
    $('r-csv').disabled = true;
  });

  $('form-ridders').addEventListener('submit', function (ev) {
    ev.preventDefault();
    calcularRidders();
  });

  function calcularRidders() {
    limpiarError('r-error');
    $('r-resultado').hidden = true;
    estado.ridders = null;
    $('r-csv').disabled = true;

    try {
      var f = crearFuncion($('r-func').value);

      var xl = num($('r-xl').value);
      var xu = num($('r-xu').value);
      if (!isFinite(xl) || !isFinite(xu)) throw new Error('xl y xu deben ser números válidos.');
      if (xl === xu) throw new Error('xl y xu no pueden ser iguales (el intervalo debe tener amplitud).');

      var tol = num($('r-tol').value);
      if (!isFinite(tol) || tol < 0) throw new Error('La tolerancia debe ser un número mayor o igual a 0 (%).');

      var maxIter = parseInt($('r-iters').value, 10);
      if (!isFinite(maxIter) || maxIter < 1 || maxIter > 10000) throw new Error('El máximo de iteraciones debe estar entre 1 y 10000.');

      var vt = null;
      var txtVt = $('r-verdadera').value.trim();
      if (txtVt) {
        vt = num(txtVt);
        if (!isFinite(vt)) throw new Error('El valor verdadero debe ser un número válido (o dejarlo vacío).');
      }

      var res = Ridders.resolver(f, xl, xu, tol, maxIter, vt);
      res.f = f;

      var avisos = [];
      if (!res.convergido) {
        avisos.push('El método NO convergió en ' + maxIter + ' iteraciones. Se muestra la última aproximación: x = ' + fmt(res.raiz) + '.');
      }
      if (res.valorVerdaderoCalculado) {
        avisos.push('No se indicó valor verdadero: se usó una referencia obtenida por bisección de alta precisión (≈ ' + fmt(res.valorVerdadero, 12) + ').');
      }
      if (res.nota) avisos.push(res.nota);
      mostrarAvisos('r-avisos', avisos);

      renderizarResumenRidders(res);
      renderizarPasosRidders(res);
      renderizarTablaRidders(res);
      dibujarGraficasRidders(res);

      estado.ridders = res;
      $('r-resultado').hidden = false;
      $('r-csv').disabled = false;
    } catch (e) {
      mostrarError('r-error', e.message || String(e));
    }
  }

  function renderizarResumenRidders(res) {
    var et = res.valorVerdadero - res.raiz;
    var etp = Math.abs(res.valorVerdadero) > 1e-14
      ? Math.abs((et / res.valorVerdadero) * 100)
      : Math.abs(et) * 100;
    var cont = $('r-resumen');
    cont.innerHTML =
      '<span class="chip">Raíz: <b>' + fmt(res.raiz, 10) + '</b></span>' +
      '<span class="chip">f(raíz): <b>' + fmt(res.fRaiz, 6) + '</b></span>' +
      '<span class="chip">Iteraciones: <b>' + res.nIteraciones + '</b></span>' +
      '<span class="chip">Convergió: <b>' + (res.convergido ? 'Sí ✓' : 'No ✗') + '</b></span>' +
      '<span class="chip">Valor de referencia: <b>' + fmt(res.valorVerdadero, 12) + '</b></span>' +
      '<span class="chip">Et: <b>' + fmt(et, 6) + '</b></span>' +
      '<span class="chip">εt: <b>' + fmt(etp, 4) + ' %</b></span>';
  }

  function renderizarPasosRidders(res) {
    var cont = $('r-pasos');
    if (!res.iteraciones.length) { cont.innerHTML = '<p>Sin iteraciones: la raíz estaba en un extremo del intervalo.</p>'; return; }
    var it = res.iteraciones[0];
    var html = '<ol>';
    html += '<li class="paso"><b>Intervalo inicial:</b> [' + fmt(it.xl) + ', ' + fmt(it.xu) + '], con f(xl)·f(xu) &lt; 0 (hay cambio de signo).</li>';
    html += '<li class="paso"><b>Punto medio:</b> xm = (' + fmt(it.xl) + ' + ' + fmt(it.xu) + ')/2 = ' + fmt(it.xm) +
      ' &nbsp;→&nbsp; f(xm) = ' + fmt(it.fxm) + '</li>';
    html += '<li class="paso"><b>Signo:</b> sign(f(xl) − f(xu)) = ' + (it.sgn > 0 ? '+' : '−') + '</li>';
    html += '<li class="paso"><b>Denominador:</b> √( f(xm)² − f(xl)·f(xu) ) = ' + fmt(it.den, 8) + '</li>';
    html += '<li class="paso"><b>Nueva aproximación:</b> x4 = xm + (xm − xl)·sign·f(xm)/den = ' + fmt(it.x4, 10) +
      ' &nbsp;→&nbsp; f(x4) = ' + fmt(it.f4, 8) + '</li>';
    if (it.ea !== null && isFinite(it.ea)) {
      html += '<li class="paso"><b>Error aproximado:</b> εa = |(x4 − x_anterior)/x4|·100 = ' + fmt(it.ea, 4) + ' %</li>';
    }
    html += '<li class="paso"><b>Actualización del intervalo:</b> se conserva el subintervalo que mantiene el cambio de signo, y se repite el proceso.</li>';
    html += '</ol>';
    cont.innerHTML = html;
  }

  function renderizarTablaRidders(res) {
    var filas = res.iteraciones.map(function (it) {
      return [
        it.iter, fmt(it.xl, 8), fmt(it.xu, 8), fmt(it.xm, 8), fmt(it.fxm, 6),
        fmt(it.x4, 10), fmt(it.f4, 6),
        it.ea === null || !isFinite(it.ea) ? '—' : fmt(it.ea, 4),
        fmt(it.et, 6), fmt(it.etp, 4),
      ];
    });
    $('r-tabla').innerHTML = construirTabla(
      ['Iteración', 'xl', 'xu', 'xm', 'f(xm)', 'x4', 'f(x4)', 'εa (%)', 'Et', 'εt (%)'],
      filas
    );
  }

  function dibujarGraficasRidders(res) {
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
    var t = temaPlot();
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
    dibujar('plot-r-func', [traceF, traceRaiz], layout);

    /* (b) Convergencia del error */
    var conEa = res.iteraciones.filter(function (it) { return it.ea !== null && isFinite(it.ea); });
    var datos = [];
    if (conEa.length) {
      datos.push({
        x: conEa.map(function (it) { return it.iter; }),
        y: conEa.map(function (it) { return Math.max(it.ea, 1e-16); }),
        mode: 'lines+markers', name: 'Error aproximado εa (%)', line: { color: '#3b5bdb' },
      });
      datos.push({
        x: res.iteraciones.map(function (it) { return it.iter; }),
        y: res.iteraciones.map(function (it) { return Math.max(Math.abs(it.etp), 1e-16); }),
        mode: 'lines+markers', name: 'Error verdadero εt (%)', line: { color: '#e64980', dash: 'dash' },
      });
      dibujar('plot-r-error', datos, layoutBase(
        'Convergencia del error vs. iteración (escala logarítmica)', 'Iteración', 'Error (%)',
        { yaxis: { type: 'log', gridcolor: t.grid } }
      ));
    } else {
      $('plot-r-error').innerHTML = '<p>Sin datos de error (raíz encontrada en el extremo del intervalo).</p>';
    }
  }

  $('r-csv').addEventListener('click', function () {
    if (!estado.ridders) return;
    var res = estado.ridders;
    var lineas = ['Iteración;xl;xu;xm;f(xm);x4;f(x4);ea_%;Et;et_%'];
    res.iteraciones.forEach(function (it) {
      lineas.push([it.iter, it.xl, it.xu, it.xm, it.fxm, it.x4, it.f4,
        it.ea === null ? '' : it.ea, it.et, it.etp].join(';'));
    });
    lineas.push('');
    lineas.push('Raíz;' + res.raiz);
    lineas.push('Valor de referencia;' + res.valorVerdadero);
    descargarCSV(lineas, 'ridders_iteraciones.csv');
  });

  /* ================= Descarga de CSV ================= */

  function descargarCSV(lineas, nombreArchivo) {
    var bom = '\uFEFF'; // para que Excel reconozca acentos
    var blob = new Blob([bom + lineas.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = nombreArchivo;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  /* ================= Aviso de librerías CDN ================= */

  window.addEventListener('load', function () {
    if (typeof math === 'undefined' || typeof Plotly === 'undefined') {
      mostrarAvisos('b-avisos', ['Advertencia: no se cargaron math.js y/o Plotly.js desde el CDN. Compruebe su conexión a internet; los cálculos podrían fallar.']);
    }
  });
})();

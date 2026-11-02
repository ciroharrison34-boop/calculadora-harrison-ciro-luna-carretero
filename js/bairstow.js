/**
 * js/bairstow.js
 * Método de Bairstow — puro, sin dependencias de la interfaz.
 * Encuentra todas las raíces (reales y complejas) de un polinomio
 * mediante factorización sucesiva de factores cuadráticos x^2 - r·x - s.
 *
 * API pública:
 *   Bairstow.solve(coeficientes, r0, s0, toleranciaPorcentaje, maxIteraciones)
 *
 * Los coeficientes van de MAYOR a menor grado.
 */
(function (global) {
  'use strict';

  /* ------------------------------------------------------------------ */
  /* Utilidades numéricas                                                */
  /* ------------------------------------------------------------------ */

  var EPS = 1e-14;

  /** Elimina ceros al inicio del polinomio (coeficiente principal nulo). */
  function recortarCerosIniciales(coef) {
    var i = 0;
    while (i < coef.length - 1 && Math.abs(coef[i]) <= EPS) i++;
    return coef.slice(i);
  }

  /** Evalúa un polinomio (coef. de mayor a menor grado) con Horner. */
  function evaluarPolinomio(coef, x) {
    var y = 0;
    for (var i = 0; i < coef.length; i++) y = y * x + coef[i];
    return y;
  }

  function raicesDeCuadratica(a, b, c) {
    var disc = b * b - 4 * a * c;
    if (disc >= 0) {
      var s = Math.sqrt(disc);
      // Estabilidad numérica: usar la raíz con mejor cancelación.
      var q = -0.5 * (b + (b >= 0 ? s : -s));
      var r1 = q / a;
      var r2 = (Math.abs(q) > EPS ? c / q : (-b - s) / (2 * a));
      return [
        { re: r1, im: 0 },
        { re: r2, im: 0 },
      ];
    }
    var re = -b / (2 * a);
    var im = Math.sqrt(-disc) / (2 * a);
    return [
      { re: re, im: im },
      { re: re, im: -im },
    ];
  }

  /* ------------------------------------------------------------------ */
  /* Núcleo de Bairstow                                                  */
  /* ------------------------------------------------------------------ */

  /**
   * Calcula los coeficientes b y c (división sintética doble) para el
   * polinomio a (mayor a menor grado) y el factor x^2 - r·x - s:
   *
   *   b0 = a0
   *   bi = ai + r·b(i-1) + s·b(i-2)      i = 1..n
   *   c0 = b0 ;  ci = bi + r·c(i-1) + s·c(i-2)
   *
   * El residuo de dividir a entre (x^2 - r·x - s) es  b(n-1)·x + b(n),
   * así que el factor es exacto cuando b(n-1) = b(n) = 0.
   */
  function calcularBC(a, r, s) {
    var n = a.length - 1; // grado
    var b = new Array(n + 1);
    var c = new Array(n + 1);
    b[0] = a[0];
    for (var i = 1; i <= n; i++) {
      b[i] = a[i] + r * (i >= 1 ? b[i - 1] : 0) + (i >= 2 ? s * b[i - 2] : 0);
    }
    c[0] = b[0];
    for (var j = 1; j <= n; j++) {
      c[j] = b[j] + r * (j >= 1 ? c[j - 1] : 0) + (j >= 2 ? s * c[j - 2] : 0);
    }
    return { b: b, c: c, n: n };
  }

  /**
   * Una iteración de Bairstow: dados r y s, devuelve Δr y Δs resolviendo
   * (método de Newton sobre el residuo b(n-1)·x + b(n)):
   *
   *   [ c(n-2)  c(n-3) ] [ Δr ]   [ -b(n-1) ]
   *   [ c(n-1)  c(n-2) ] [ Δs ] = [ -b(n)   ]
   */
  function pasoBairstow(a, r, s) {
    var res = calcularBC(a, r, s);
    var b = res.b, c = res.c, n = res.n;

    var det = c[n - 2] * c[n - 2] - c[n - 1] * c[n - 3];
    var dr = 0, ds = 0;
    if (Math.abs(det) < 1e-13) {
      return { b: b, c: c, det: det, dr: NaN, ds: NaN, singular: true };
    }
    dr = (b[n] * c[n - 3] - b[n - 1] * c[n - 2]) / det;
    ds = (b[n - 1] * c[n - 1] - b[n] * c[n - 2]) / det;
    return { b: b, c: c, det: det, dr: dr, ds: ds, singular: false };
  }

  /**
   * Busca el factor cuadrático x^2 - r·x - s que divide al polinomio.
   * Devuelve un registro con todas las iteraciones.
   */
  function factorCuadratico(a, r, s, tol, maxIter) {
    var iteraciones = [];
    var convergido = false;
    var primerPaso = null;

    for (var k = 1; k <= maxIter; k++) {
      var p = pasoBairstow(a, r, s);

      if (p.singular || !isFinite(p.dr) || !isFinite(p.ds)) {
        if (k === 1) {
          throw new Error(
            'El sistema es singular en la primera iteración (determinante ≈ 0). ' +
              'Pruebe con otros valores iniciales r0 y s0.'
          );
        }
        // Última iteración válida: se marca como no convergido.
        iteraciones.push({
          iter: k, r: r, s: s, dr: NaN, ds: NaN, er: NaN, es: NaN,
        });
        break;
      }

      var rNuevo = r + p.dr;
      var sNuevo = s + p.ds;

      var er = Math.abs(rNuevo) > EPS ? Math.abs((p.dr / rNuevo) * 100) : Math.abs(p.dr) * 100;
      var es = Math.abs(sNuevo) > EPS ? Math.abs((p.ds / sNuevo) * 100) : Math.abs(p.ds) * 100;

      iteraciones.push({
        iter: k, r: rNuevo, s: sNuevo, dr: p.dr, ds: p.ds, er: er, es: es,
      });
      if (!primerPaso) {
        primerPaso = {
          a: a.slice(), r0: r, s0: s, b: p.b.slice(), c: p.c.slice(),
          det: p.det, dr: p.dr, ds: p.ds, er: er, es: es,
        };
      }

      r = rNuevo;
      s = sNuevo;

      if (Math.abs(p.dr) < EPS && Math.abs(p.ds) < EPS) { convergido = true; break; }
      if (er < tol && es < tol) { convergido = true; break; }
    }

    var raices = raicesDeCuadratica(1, -r, -s); // x^2 - r·x - s = 0
    return {
      tipo: 'cuadratico',
      r: r, s: s,
      iteraciones: iteraciones,
      convergido: convergido,
      primerPaso: primerPaso,
      raices: raices,
    };
  }

  /**
   * Deflación: divide el polinomio a(x) entre (x^2 - r·x - s) y devuelve
   * el cociente (grado n-2). Verifica los residuos.
   */
  function deflactar(a, r, s) {
    var n = a.length - 1;
    var q = new Array(n - 1); // índices 0..n-2
    q[0] = a[0];
    q[1] = a[1] + r * q[0];
    for (var i = 2; i <= n - 2; i++) {
      q[i] = a[i] + r * q[i - 1] + s * q[i - 2];
    }
    // Verificación de los residuos de la división (deben ser ~0 salvo
    // error de redondeo acumulado); se tolera y no interrumpe el cálculo.
    var res1 = a[n - 1] + r * q[n - 2] + (n - 3 >= 0 ? s * q[n - 3] : 0);
    var res2 = a[n] + s * q[n - 2];
    var residuoOk = Math.abs(res1) <= 1e-6 * (1 + Math.abs(a[n - 1])) &&
                    Math.abs(res2) <= 1e-6 * (1 + Math.abs(a[n]));
    return { cociente: recortarCerosIniciales(q), residuoOk: residuoOk };
  }

  /* ------------------------------------------------------------------ */
  /* Algoritmo completo                                                  */
  /* ------------------------------------------------------------------ */

  /**
   * @param {number[]} coeficientes  Coeficientes de mayor a menor grado.
   * @param {number} r0              Valor inicial de r.
   * @param {number} s0              Valor inicial de s.
   * @param {number} tolerancia      Tolerancia en % (error aproximado).
   * @param {number} maxIter         Máximo de iteraciones por factor.
   * @returns {{factores: Array, raices: Array, avisos: string[]}}
   */
  function resolver(coeficientes, r0, s0, tolerancia, maxIter) {
    if (!Array.isArray(coeficientes) || coeficientes.length < 2) {
      throw new Error('Se necesitan al menos dos coeficientes (grado 1).');
    }
    var a = recortarCerosIniciales(coeficientes.map(Number));
    if (!a.every(isFinite)) throw new Error('Los coeficientes deben ser números válidos.');
    if (a.length < 2) throw new Error('El polinomio no puede ser una constante. Ingrese al menos 2 coeficientes (grado 1).');
    if (Math.abs(a[0]) < EPS) throw new Error('El coeficiente principal no puede ser cero.');

    var avisos = [];
    var factores = [];
    var raices = [];
    var grado0 = a.length - 1;

    if (grado0 === 1) {
      var root1 = -a[1] / a[0];
      factores.push({ tipo: 'lineal', raices: [{ re: root1, im: 0 }], coefLineal: a.slice() });
      raices.push({ re: root1, im: 0 });
      return { factores: factores, raices: raices, avisos: avisos, grado: grado0 };
    }

    var r = r0, s = s0;
    var iter = 0;

    // Factorización cuadrática mientras quede grado >= 3.
    while (a.length - 1 >= 3) {
      var f = factorCuadratico(a, r, s, tolerancia, maxIter);
      iter++;
      if (!f.convergido) {
        avisos.push(
          'Factor ' + iter + ': el método NO convergió en ' + maxIter +
          ' iteraciones; se usó el último par (r, s) obtenido.'
        );
      }
      f.indice = iter;
      f.coeficientesAntesDeDeflactar = a.slice();
      factores.push(f);
      raices = raices.concat(f.raices);

      // Reutilizar (r, s) como siguiente aproximación inicial.
      r = f.r; s = f.s;
      var defl = deflactar(a, f.r, f.s);
      if (!defl.residuoOk) {
        avisos.push('Factor ' + iter + ': la deflacción presentó un residuo numérico apreciable (error de redondeo).');
      }
      a = defl.cociente;
      if (a.length < 2) {
        throw new Error('Error interno: la deflacción produjo un polinomio inválido.');
      }
    }

    // Caso restante: grado 2 (cuadrática exacta) o grado 1 (lineal).
    if (a.length - 1 === 2) {
      var rr = raicesDeCuadratica(a[0], a[1], a[2]);
      factores.push({
        tipo: 'cuadratico-directo', indice: iter + 1, coeficientesRestantes: a.slice(),
        raices: rr, iteraciones: [], convergido: true, primerPaso: null,
      });
      raices = raices.concat(rr);
      avisos.push('Quedó un polinomio de grado 2: se resolvió con la fórmula cuadrática directamente.');
    } else {
      var rl = -a[1] / a[0];
      factores.push({
        tipo: 'lineal', indice: iter + 1, coeficientesRestantes: a.slice(),
        raices: [{ re: rl, im: 0 }], iteraciones: [], convergido: true, primerPaso: null,
      });
      raices.push({ re: rl, im: 0 });
      avisos.push('Grado impar: quedó un factor lineal x - (' + rl + ') que aporta una raíz real.');
    }

    raices.sort(function (p, q) {
      if (Math.abs(p.re - q.re) > 1e-9) return p.re - q.re;
      return p.im - q.im;
    });

    return { factores: factores, raices: raices, avisos: avisos, grado: grado0 };
  }

  var API = {
    resolver: resolver,
    pasoBairstow: pasoBairstow,
    calcularBC: calcularBC,
    raicesDeCuadratica: raicesDeCuadratica,
    deflactar: deflactar,
    evaluarPolinomio: evaluarPolinomio,
    recortarCerosIniciales: recortarCerosIniciales,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  global.Bairstow = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);

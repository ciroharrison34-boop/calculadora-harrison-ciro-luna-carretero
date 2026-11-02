/**
 * js/ridders.js
 * Método de Ridders — puro, sin dependencias de la interfaz.
 * Encuentra una raíz de f(x) en un intervalo [xl, xu] con cambio de signo.
 *
 * API pública:
 *   Ridders.resolver(f, xl, xu, toleranciaPorcentaje, maxIteraciones)
 *   Ridders.referenciaBiseccion(f, xl, xu)   // raíz de referencia de alta precisión
 */
(function (global) {
  'use strict';

  var EPS = 1e-15;

  function signo(x) {
    if (x > 0) return 1;
    if (x < 0) return -1;
    return 0;
  }

  /**
   * Bisección de alta precisión para obtener una raíz de referencia
   * cuando el usuario no proporciona el valor verdadero.
   */
  function referenciaBiseccion(f, xl, xu) {
    var fl = f(xl), fu = f(xu);
    if (!isFinite(fl) || !isFinite(fu)) throw new Error('f(x) devolvió un valor no válido en los extremos.');
    if (fl * fu > 0) throw new Error('No hay cambio de signo en el intervalo dado.');
    if (fl === 0) return { x: xl, iters: 0 };
    if (fu === 0) return { x: xu, iters: 0 };

    var a = xl, b = xu, fa = fl;
    for (var i = 0; i < 300; i++) {
      var m = 0.5 * (a + b);
      var fm = f(m);
      if (!isFinite(fm)) throw new Error('f(x) devolvió un valor no válido durante la bisección.');
      if (fm === 0 || Math.abs(b - a) < 1e-16 * Math.max(1, Math.abs(m))) {
        return { x: m, iters: i + 1 };
      }
      if (fa * fm < 0) { b = m; } else { a = m; fa = fm; }
    }
    return { x: 0.5 * (a + b), iters: 300 };
  }

  /**
   * Método de Ridders.
   *
   *   xm = (xl + xu)/2
   *   x4 = xm + (xm - xl) · sign(f(xl) - f(xu)) · f(xm) / sqrt( f(xm)^2 - f(xl)·f(xu) )
   *
   * Se actualiza el intervalo conservando siempre el cambio de signo.
   *
   * @param {function(number):number} f
   * @param {number} xl  Extremo inferior.
   * @param {number} xu  Extremo superior.
   * @param {number} tol Tolerancia en % (error aproximado).
   * @param {number} maxIter Máximo de iteraciones.
   * @param {number|null} [valorVerdadero] Si no se conoce, se calcula con bisección.
   * @returns {object} Registro con iteraciones, raíz, etc.
   */
  function resolver(f, xl, xu, tol, maxIter, valorVerdadero) {
    if (typeof f !== 'function') throw new Error('f(x) debe ser una función válida.');
    if (!isFinite(xl) || !isFinite(xu)) throw new Error('El intervalo debe ser numérico.');
    if (xl === xu) throw new Error('Los extremos del intervalo no pueden ser iguales.');
    if (xl > xu) { var t = xl; xl = xu; xu = t; }

    var fl = f(xl), fu = f(xu);
    if (!isFinite(fl)) throw new Error('f(xl) no es un número finito. Revise la función y el intervalo.');
    if (!isFinite(fu)) throw new Error('f(xu) no es un número finito. Revise la función y el intervalo.');
    if (fl === 0) return resultadoInmediato(xl, xl, fl);
    if (fu === 0) return resultadoInmediato(xu, xu, fu);
    if (fl * fu > 0) {
      throw new Error(
        'No hay cambio de signo en [' + xl + ', ' + xu + ']: ' +
        'f(' + xl + ') = ' + fl.toFixed(6) + ' y f(' + xu + ') = ' + fu.toFixed(6) +
        ' tienen el mismo signo. Elija otro intervalo.'
      );
    }

    var vt = null;
    var refInfo = null;
    if (valorVerdadero === null || valorVerdadero === undefined || !isFinite(valorVerdadero)) {
      refInfo = referenciaBiseccion(f, xl, xu);
      vt = refInfo.x;
    } else {
      vt = valorVerdadero;
    }

    var iteraciones = [];
    var xAnterior = null;
    var convergido = false;
    var x4 = null, f4 = null;
    var fa = fl, fb = fu;

    for (var k = 1; k <= maxIter; k++) {
      var xm = (xl + xu) / 2;
      var fxm = f(xm);
      if (!isFinite(fxm)) throw new Error('f(xm) no es un número finito en la iteración ' + k + '.');

      var den = Math.sqrt(fxm * fxm - fa * fb);
      if (!isFinite(den) || den < EPS) {
        throw new Error(
          'División por cero en la iteración ' + k +
          ': la expresión sqrt(f(xm)² - f(xl)·f(xu)) es casi nula. ' +
          'Pruebe con otro intervalo.'
        );
      }

      var sgn = signo(fa - fb) || 1;
      x4 = xm + (xm - xl) * sgn * fxm / den;
      f4 = f(x4);
      if (!isFinite(f4)) throw new Error('f(x4) no es un número finito en la iteración ' + k + '.');

      var ea = null;
      if (xAnterior !== null && Math.abs(x4) > EPS) {
        ea = Math.abs((x4 - xAnterior) / x4) * 100;
      } else if (xAnterior !== null) {
        ea = Math.abs(x4 - xAnterior) * 100;
      }

      var et = vt - x4;
      var etp = Math.abs(vt) > EPS ? Math.abs((et / vt) * 100) : Math.abs(et) * 100;

      iteraciones.push({
        iter: k, xl: xl, xu: xu, xm: xm, fxm: fxm, x4: x4, f4: f4,
        ea: ea, et: et, etp: etp, den: den, sgn: sgn,
        fxl: fa, fxu: fb,
      });

      xAnterior = x4;

      // Conservar el cambio de signo con el nuevo punto.
      if (f4 * fa < 0) { xu = x4; fb = f4; } else { xl = x4; fa = f4; }

      if (ea !== null && ea < tol) { convergido = true; break; }
      if (ea !== null && Math.abs(x4 - iteraciones[iteraciones.length - 2].x4) < EPS) {
        convergido = true; break;
      }
    }

    return {
      tipo: 'ridders',
      convergido: convergido,
      raiz: x4,
      fRaiz: f4,
      iteraciones: iteraciones,
      nIteraciones: iteraciones.length,
      intervaloFinal: [xl, xu],
      valorVerdadero: vt,
      valorVerdaderoCalculado: refInfo !== null,
      precisionRef: refInfo ? 300 : null,
    };
  }

  function resultadoInmediato(x, raiz, fx) {
    return {
      tipo: 'ridders', convergido: true, raiz: raiz, fRaiz: fx,
      iteraciones: [], nIteraciones: 0, intervaloFinal: [x, x],
      valorVerdadero: raiz, valorVerdaderoCalculado: true,
      nota: 'El extremo del intervalo ya era la raíz exacta (f(x) = 0).',
    };
  }

  var API = {
    resolver: resolver,
    referenciaBiseccion: referenciaBiseccion,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  global.Ridders = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);

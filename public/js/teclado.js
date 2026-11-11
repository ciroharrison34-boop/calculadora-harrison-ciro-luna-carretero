/**
 * js/teclado.js
 * Teclado de calculadora en pantalla para escribir funciones, potencias,
 * coeficientes y raíces sin usar el teclado físico.
 *
 * Uso en el HTML:  <div class="teclado" data-form="id-del-formulario"></div>
 * Escribe en el último campo del formulario que tuvo el foco (por defecto,
 * el primero), insertando el texto en la posición del cursor.
 */
(function () {
  'use strict';

  // [etiqueta visible, texto que se inserta | acción especial, clase extra, título]
  var TECLAS = [
    ['sen', 'sen(', 'fn', 'Seno'],
    ['cos', 'cos(', 'fn', 'Coseno'],
    ['tan', 'tan(', 'fn', 'Tangente'],
    ['ln', 'ln(', 'fn', 'Logaritmo natural'],
    ['log', 'log10(', 'fn', 'Logaritmo base 10'],
    ['eˣ', 'exp(', 'fn', 'Exponencial e^x'],

    ['√', 'sqrt(', 'fn', 'Raíz cuadrada'],
    ['|x|', 'abs(', 'fn', 'Valor absoluto'],
    ['π', 'pi', 'fn', 'Pi'],
    ['e', 'e', 'fn', 'Número e'],
    ['x²', '^2', 'fn', 'Al cuadrado'],
    ['xʸ', '^', 'fn', 'Potencia'],

    ['7', '7'], ['8', '8'], ['9', '9'],
    ['(', '('], [')', ')'],
    ['⌫', '@borrar', 'accion', 'Borrar un carácter'],

    ['4', '4'], ['5', '5'], ['6', '6'],
    ['×', '*', 'op', 'Multiplicar'],
    ['÷', '/', 'op', 'Dividir'],
    ['C', '@limpiar', 'peligro', 'Vaciar el campo'],

    ['1', '1'], ['2', '2'], ['3', '3'],
    ['+', '+', 'op', 'Sumar'],
    ['−', '-', 'op', 'Restar / negativo'],
    ['◀', '@izq', 'accion', 'Mover cursor a la izquierda'],

    ['0', '0'], ['.', '.'],
    ['x', 'x', 'var', 'Variable x'],
    [',', ', ', 'op', 'Separar coeficientes o raíces'],
    ['i', 'i', 'var', 'Unidad imaginaria (raíces complejas)'],
    ['▶', '@der', 'accion', 'Mover cursor a la derecha'],
  ];

  function camposDe(form) {
    return Array.prototype.slice.call(
      form.querySelectorAll('input[type="text"], input[type="number"]')
    );
  }

  /** Posición del cursor; los input type=number no la exponen → al final. */
  function cursor(input) {
    try {
      if (typeof input.selectionStart === 'number') {
        return { ini: input.selectionStart, fin: input.selectionEnd };
      }
    } catch (e) { /* type=number */ }
    return { ini: input.value.length, fin: input.value.length };
  }

  function ponerCursor(input, pos) {
    try { input.setSelectionRange(pos, pos); } catch (e) { /* type=number */ }
  }

  function avisarCambio(input) {
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function aplicar(input, valor) {
    var v = input.value;
    var c = cursor(input);
    var pos;

    if (valor === '@limpiar') {
      input.value = '';
      pos = 0;
    } else if (valor === '@borrar') {
      if (c.ini !== c.fin) {
        input.value = v.slice(0, c.ini) + v.slice(c.fin);
        pos = c.ini;
      } else if (c.ini > 0) {
        input.value = v.slice(0, c.ini - 1) + v.slice(c.ini);
        pos = c.ini - 1;
      } else {
        pos = 0;
      }
    } else if (valor === '@izq') {
      pos = Math.max(0, c.ini - 1);
    } else if (valor === '@der') {
      pos = Math.min(v.length, c.fin + 1);
    } else {
      input.value = v.slice(0, c.ini) + valor + v.slice(c.fin);
      pos = c.ini + valor.length;
    }

    input.focus();
    ponerCursor(input, pos);
    if (valor !== '@izq' && valor !== '@der') avisarCambio(input);
  }

  function crearTeclado(contenedor) {
    var form = document.getElementById(contenedor.getAttribute('data-form'));
    if (!form) return;
    var campos = camposDe(form);
    if (!campos.length) return;
    var activo = campos[0];

    var cabecera = document.createElement('div');
    cabecera.className = 'teclado-cabecera';
    var etiqueta = document.createElement('span');
    var btnOcultar = document.createElement('button');
    btnOcultar.type = 'button';
    btnOcultar.className = 'teclado-toggle';
    btnOcultar.textContent = 'Ocultar teclado';
    cabecera.appendChild(etiqueta);
    cabecera.appendChild(btnOcultar);

    var rejilla = document.createElement('div');
    rejilla.className = 'teclado-rejilla';

    function nombreCampo(input) {
      var lbl = form.querySelector('label[for="' + input.id + '"]');
      return lbl ? lbl.textContent : input.id;
    }

    function marcarActivo(input) {
      campos.forEach(function (c) { c.classList.remove('teclado-destino'); });
      activo = input;
      activo.classList.add('teclado-destino');
      etiqueta.innerHTML = '⌨ Escribiendo en: <b></b>';
      etiqueta.querySelector('b').textContent = nombreCampo(activo);
    }

    campos.forEach(function (c) {
      c.addEventListener('focus', function () { marcarActivo(c); });
    });

    TECLAS.forEach(function (t) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'tecla' + (t[2] ? ' tecla-' + t[2] : '');
      b.textContent = t[0];
      if (t[3]) { b.title = t[3]; b.setAttribute('aria-label', t[3]); }
      // mousedown + preventDefault: el campo no pierde el foco ni el cursor.
      b.addEventListener('mousedown', function (e) { e.preventDefault(); });
      b.addEventListener('click', function () { aplicar(activo, t[1]); });
      rejilla.appendChild(b);
    });

    btnOcultar.addEventListener('click', function () {
      var oculto = rejilla.hidden = !rejilla.hidden;
      btnOcultar.textContent = oculto ? 'Mostrar teclado' : 'Ocultar teclado';
    });

    contenedor.appendChild(cabecera);
    contenedor.appendChild(rejilla);
    marcarActivo(activo);
  }

  Array.prototype.forEach.call(document.querySelectorAll('.teclado'), crearTeclado);

  // ---- Efecto visual de "botón hundido" ----
  // En móviles :active no es fiable, así que se añade la clase .presionada
  // al tocar y se mantiene un mínimo de tiempo para que se note aunque el
  // toque sea muy rápido.
  var SELECTOR_PULSABLE = '.tecla, .btn, .tab, .teclado-toggle';
  var DURACION_MINIMA = 140; // ms

  function soltar(el) {
    var restante = DURACION_MINIMA - (Date.now() - (el._inicioPulsacion || 0));
    clearTimeout(el._timerPulsacion);
    el._timerPulsacion = setTimeout(function () {
      el.classList.remove('presionada');
    }, Math.max(0, restante));
  }

  document.addEventListener('pointerdown', function (e) {
    var el = e.target.closest(SELECTOR_PULSABLE);
    if (!el || el.disabled) return;
    clearTimeout(el._timerPulsacion);
    el._inicioPulsacion = Date.now();
    el.classList.add('presionada');

    function fin() {
      soltar(el);
      document.removeEventListener('pointerup', fin);
      document.removeEventListener('pointercancel', fin);
    }
    document.addEventListener('pointerup', fin);
    document.addEventListener('pointercancel', fin);
  });
})();

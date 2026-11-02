# 📐 Calculadora Web de Métodos Numéricos — Raíces

Aplicación **100% estática** (HTML + CSS + JavaScript puro, sin backend ni build step) para encontrar raíces mediante dos métodos numéricos:

| Pestaña | Método | Qué resuelve |
|---|---|---|
| **Bairstow** | Método de Bairstow | Raíces (reales y complejas) de un polinomio de cualquier grado, por factorización sucesiva de factores cuadráticos `x² − r·x − s` |
| **Ridders** | Método de Ridders | La raíz de una función general `f(x)` en un intervalo `[xl, xu]` con cambio de signo |

Interfaz 100% en español, **responsiva** (celular y escritorio), con **modo claro/oscuro**, gráficas interactivas, tablas de iteraciones con errores, exportación a **CSV** y una ayuda **paso a paso** de la primera iteración.

---

## 1. Estructura del proyecto

```
Calculadora/
├── index.html          # Interfaz completa (dos pestañas)
├── style.css           # Diseño responsivo + tema claro/oscuro (variables CSS)
├── README.md           # Este archivo
├── server.js           # Servidor estático local SIN dependencias (npm start)
├── package.json        # Configuración y scripts (no hay dependencias que instalar)
├── .gitignore          # Excluye .env, node_modules, etc. al subir a GitHub
├── .nojekyll           # Para que GitHub Pages sirva los archivos tal cual
├── .vscode/            # Recomendación de extensión Live Server para VS Code
└── js/
    ├── bairstow.js     # Algoritmo de Bairstow (funciones puras, sin DOM)
    ├── ridders.js      # Algoritmo de Ridders + bisección de referencia (puro)
    └── app.js          # Capa de interfaz: validación, tablas, gráficas, CSV
```

> Este proyecto **no tiene dependencias que instalar**: `package.json` existe solo
> para ofrecer el comando `npm start`. Las librerías (math.js y Plotly.js) se
> cargan por CDN desde el navegador.

**Dependencias (solo CDN, sin npm ni build):**

- [math.js](https://cdnjs.cloudflare.com/ajax/libs/mathjs/12.4.0/math.min.js) — interpreta `f(x)` escrita por el usuario (ej. `exp(x) - 3*x`, `sen(x) - x/2`).
- [Plotly.js](https://cdn.plot.ly/plotly-2.35.2.min.js) — gráficas interactivas.

Los algoritmos están **completamente separados de la interfaz**: `js/bairstow.js` y `js/ridders.js` no tocan el DOM y se pueden reutilizar/importar por separado (funcionan también en Node.js).

---

## 2. Ejecutarlo localmente

No hay nada que compilar ni `npm install` que ejecutar. Con internet (las librerías se cargan por CDN) cualquiera de estas opciones sirve:

### Opción A — Servidor incluido (recomendada)
```bash
npm start        # o bien: node server.js
# y abre http://localhost:5173
```

### Opción B — Doble clic
Haz doble clic en `index.html`. ✅ Listo.

### Opción C — Con Live Server en VS Code
1. Abre la carpeta `Calculadora` en VS Code (`File → Open Folder`).
2. Instala la extensión **Live Server** (te la recomendará VS Code al abrir la carpeta).
3. Clic derecho sobre `index.html` → **Open with Live Server**.

### Opción D — Cualquier servidor estático
```bash
npx serve .            # o: python -m http.server 8000
```

---

## 3. Despliegue gratis

Todas las rutas son **relativas** (`style.css`, `js/app.js`), así que la app funciona igual en la raíz del dominio o en un subdirectorio (`https://usuario.github.io/mi-repo/`).

### 3.1 GitHub Pages (gratis)

1. Crea un repositorio en GitHub (público en el plan gratuito) y sube los archivos:
   ```bash
   git init
   git add .
   git commit -m "Calculadora de métodos numéricos"
   git branch -M main
   git remote add origin https://github.com/TU-USUARIO/TU-REPO.git
   git push -u origin main
   ```
2. En GitHub: **Settings → Pages → Build and deployment**.
3. En *Source* selecciona **Deploy from a branch**, rama **main**, carpeta **/ (root)** → **Save**.
4. Espera ~1 minuto. Tu app quedará publicada en:
   `https://TU-USUARIO.github.io/TU-REPO/`

### 3.2 Netlify (gratis, sin cuenta de tarjeta)

**Opción A — arrastrar y soltar (la más rápida):**
1. Entra en [app.netlify.com/drop](https://app.netlify.com/drop).
2. Arrastra la carpeta del proyecto (la que contiene `index.html`).
3. Netlify publica al instante y te da una URL tipo `https://nombre-aleatorio.netlify.app`.

**Opción B — desde Git:**
1. Sube el repo a GitHub.
2. En Netlify: **Add new site → Import an existing project → GitHub**.
3. Elige el repositorio. *Build command*: **vacío**. *Publish directory*: **`/`** → **Deploy**.

### 3.3 Vercel (gratis)

1. Sube el repo a GitHub.
2. En [vercel.com/new](https://vercel.com/new) importa el repositorio.
3. Framework preset: **Other**, sin build command, *Output directory*: `.` → **Deploy**.

### 3.4 Cloudflare Pages (gratis)

1. **Workers & Pages → Create → Pages → Connect to Git**.
2. Elige el repositorio, *Framework preset*: **None**, *Build command*: vacío, *Build output directory*: `/` → **Deploy**.

---

## 4. Cómo usar la app

### 🔷 Pestaña Bairstow

**Entradas**
- `Coeficientes del polinomio` de **mayor a menor grado**, separados por comas.
  - `x⁵ − 3.5x⁴ + 2.75x³ + 2.125x² − 3.875x + 1.25` → `1, -3.5, 2.75, 2.125, -3.875, 1.25`
- `r₀` y `s₀`: aproximaciones iniciales del factor `x² − r·x − s`.
- `Tolerancia de error (%)` y `Máximo de iteraciones`.
- `Raíces verdaderas` (opcional, separadas por coma). Acepta complejas: `0.5, -1, 2, 1+0.5i, 1-0.5i`.

**Salidas**
- Tabla de iteraciones **por cada factor**: `Iteración | r | s | Δr | Δs | εa(r) % | εa(s) %`.
- Lista final de **todas las raíces** (reales y complejas, con etiqueta).
- Si se dieron raíces verdaderas: tabla con **Et** y **εt (%)** por raíz.
- **Procedimiento paso a paso** de la 1ª iteración (valores de `b`, `c`, determinante, incrementos y errores).
- Gráficas: (a) polinomio en el eje real con las raíces reales marcadas, (b) plano complejo con todas las raíces, (c) error aproximado vs. iteración en escala logarítmica.
- Botón **⬇ Exportar CSV** con las iteraciones y las raíces.

**Ejemplo precargado ("Cargar ejemplo"):**
```
Coeficientes : 1, -3.5, 2.75, 2.125, -3.875, 1.25
r0 = s0 = -1 , tolerancia 0.0001 %, máx. 100 iteraciones
Raíces verdaderas: 0.5, -1, 2, 1+0.5i, 1-0.5i
```
> ⚠️ **Nota didáctica:** ese polinomio tiene por raíces exactas **0.5, −1, 2 y 1 ± 0.5i** (se verifica por producto de factores). La idea "1 ± i" que circula en algunos apuntes no coincide con la expansión de ese polinomio; la calculadora muestra siempre las raíces reales del polinomio ingresado y calcula Et/εt contra las raíces verdaderas que tú escribas.

### 🔶 Pestaña Ridders

**Entradas**
- `f(x)` como texto: `x^3 - x - 2`, `exp(x) - 3*x`, `sen(x) - x/2` (también acepta `sin`, `cos`, `tan`, `ln`, `tg`, `arcsen`, `sqrt`, `abs`, `pi`, `e`).
- Intervalo `[xl, xu]` con **cambio de signo**.
- `Tolerancia (%)` y `Máximo de iteraciones`.
- `Valor verdadero` (opcional). Si se deja vacío, la app lo calcula con **bisección de alta precisión** como referencia y lo indica en los avisos.

**Salidas**
- Tabla: `Iteración | xl | xu | xm | f(xm) | x4 | f(x4) | εa (%) | Et | εt (%)`.
- Resumen: raíz, `f(raíz)`, iteraciones, convergencia, valor de referencia, Et y εt.
- **Procedimiento paso a paso** de la 1ª iteración (xm, signo, denominador, x4 y actualización del intervalo).
- Gráficas: (a) `f(x)` con el intervalo sombreado y la raíz marcada, (b) convergencia de εa y εt vs. iteración en escala logarítmica.
- Botón **⬇ Exportar CSV**.

**Ejemplo precargado:**
```
f(x) = x^3 - x - 2   en [1, 2]   →  raíz ≈ 1.5213797068
```

### Fórmulas de error mostradas en la interfaz

```
εa = | (x_nuevo − x_anterior) / x_nuevo | × 100 %
Et  = valor_verdadero − valor_aproximado
εt  | Et / valor_verdadero | × 100 %
```

---

## 5. Algoritmos (implementación)

### Bairstow (`js/bairstow.js`)

1. Para el factor `x² − r·x − s` se obtienen los coeficientes por **doble división sintética**:
   `b₀ = a₀`, `bᵢ = aᵢ + r·bᵢ₋₁ + s·bᵢ₋₂`; `c₀ = b₀`, `cᵢ = bᵢ + r·cᵢ₋₁ + s·cᵢ₋₂`.
2. El residuo de dividir `a` entre el factor es `b(n−1)·x + b(n)`. Su cero (Newton sobre el residuo) da el sistema 2×2:
   ```
   c(n−2)·Δr + c(n−3)·Δs = −b(n−1)
   c(n−1)·Δr + c(n−2)·Δs = −b(n)
   ```
   `det = c(n−2)² − c(n−1)·c(n−3)`; se actualiza `r += Δr`, `s += Δs`.
3. Convergencia por `εa(r)` y `εa(s)` menores que la tolerancia (o por número máximo de iteraciones).
4. Al converger: raíces del factor con la fórmula cuadrática `x = (r ± √(r²+4s))/2` (soporta complejas), **deflacción** del polinomio y repetición hasta grado 1 o 2.
5. Si queda **grado impar**, el factor lineal aporta la última raíz real; si queda grado 2, se resuelve directo.

### Ridders (`js/ridders.js`)

1. Verifica `f(xl)·f(xu) < 0`.
2. `xm = (xl+xu)/2` y
   `x4 = xm + (xm − xl)·sign(f(xl) − f(xu))·f(xm)/√( f(xm)² − f(xl)·f(xu) )`.
3. Actualiza el intervalo **conservando el cambio de signo** y se detiene por tolerancia o por máximo de iteraciones.
4. Si no se da un valor verdadero, se calcula una referencia con **bisección** (hasta ~1e−16 o 300 iteraciones).

### API de las funciones puras

```js
// js/bairstow.js
Bairstow.resolver(coeficientes /*mayor a menor*/, r0, s0, toleranciaPorcentaje, maxIter)
// → { factores: [...], raices: [{re, im}, ...], avisos: [...] }

// js/ridders.js
Ridders.resolver(f, xl, xu, toleranciaPorcentaje, maxIter, valorVerdadero | null)
// → { convergido, raiz, fRaiz, iteraciones: [...], nIteraciones, valorVerdadero, ... }
Ridders.referenciaBiseccion(f, xl, xu) // → { x, iters }
```

---

## 6. Robustez y validaciones

La aplicación **nunca se rompe ni entra en bucles infinitos**. Se validan, entre otros casos:

- Polinomio vacío, con coeficientes no numéricos, todos ceros o grado 0.
- Primer coeficiente igual a cero (grado mal ordenado).
- `r₀`/`s₀` no numéricos, determinante ≈ 0 (sistema singular) → mensaje claro.
- Máximo de iteraciones fuera de rango (1–10000) y tolerancia negativa/no numérica.
- Intervalo sin cambio de signo, intervalo degenerado (`xl = xu`).
- Función vacía, sintaxis incorrecta, funciones desconocidas (`seno(x)`), `f(x)` no finita (`log` de negativo, división por cero).
- Sin bucle infinito: todos los ciclos tienen tope `maxIter` y salida por tolerancia.

---

## 7. Pruebas realizadas

Se verificó con Node.js (`bairstow.js` y `ridders.js` son importables como módulos) y en navegador (sin errores en consola):

**Bairstow**
- Ejemplo `1, -3.5, 2.75, 2.125, -3.875, 1.25` con `r₀ = s₀ = −1` → `−1, 0.5, 1±0.5i, 2` (todos convergen; `max|Et| ≈ 5.6e−17`).
- Polinomio con raíces `0.5, −1, 2, 1±i` → correcto.
- Grado 1 (`2x − 6 → 3`), grado 2 real (`x²−3x+2 → 1, 2`), grado 2 complejo (`x²+1 → ±i`).
- Grado impar (`x³−6x²+11x−6 → 1, 2, 3`, factor lineal final).
- Ceros iniciales en el coeficiente principal, grado 8, iniciales extremos (1000, 1000) → correcto y rápido (<70 ms).

**Ridders**
- `x³ − x − 2` en `[1, 2]` → `1.52137970680457` (6 iteraciones; εa final < tolerancia).
- `sen(x) − x/2` en `[1, 2]` → `1.8954942681`; `exp(x) − 3x` en `[1, 2]` → `1.5121345517`.
- Intervalo sin cambio de signo, `xl = xu`, `f` no finita, `maxIter` pequeño (sin bucle), raíz exacta en un extremo → todos manejados con mensaje.

**Interfaz**: pestañas, tema claro/oscuro (las gráficas se redibujan con el nuevo tema), botones *Calcular*, *Limpiar*, *Cargar ejemplo*, exportación CSV y todas las rutas relativas verificadas.

---

---

## 8. Abrir en VS Code y subir a GitHub

### Visual Studio Code
1. **File → Open Folder…** → selecciona la carpeta `Calculadora`.
2. VS Code recomendará la extensión **Live Server** (acepta la recomendación).
3. Abre `index.html` y usa `Ctrl+Shift+P → Live Server: Open with Live Server`,
   o simplemente `npm start` en la terminal integrada (`Ctrl+` `).
4. Para ejecutar los algoritmos como módulos en Node (opcional):
   `node -e "console.log(require('./js/bairstow.js'))"`.

### Subirlo a GitHub

**Opción 1 — GitHub Desktop (sin terminal, recomendada si no tienes git):**
1. Instala [GitHub Desktop](https://desktop.github.com/) e inicia sesión.
2. **File → Add Local Repository…** → elige la carpeta `Calculadora`.
3. **Publish repository** → marca *Keep this code private* si lo quieres privado → **Publish**.
4. Listo: la rama `main` queda en GitHub.

**Opción 2 — Terminal (si tienes git instalado):**
```bash
cd Calculadora
git init
git add .
git commit -m "Calculadora de métodos numéricos: Bairstow y Ridders"
git branch -M main
git remote add origin https://github.com/TU-USUARIO/TU-REPO.git
git push -u origin main
```
> El `.gitignore` ya excluye `.env`, `node_modules` y archivos privados.
> La calculadora no usa ningún secreto: solo CDN públicos.

**Opción 3 — Subir por la web:**
1. Crea el repositorio en GitHub → **Add file → Upload files**.
2. Arrastra `index.html`, `style.css`, `README.md`, `server.js`, `package.json`
   y la carpeta `js/` → **Commit changes**.
3. Activa **Settings → Pages → main / (root)** para publicarla gratis.

---

## 9. Licencia y autoría

Proyecto académico de estudiante — libre de usar, copiar y modificar con fines educativos.

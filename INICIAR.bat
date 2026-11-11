@echo off
chcp 65001 >nul
title Calculadora de Raices (Bairstow y Ridders)
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  [X] No se encontro Node.js en este PC.
  echo      Instalalo desde https://nodejs.org  ^(version LTS^) y vuelve a abrir este archivo.
  echo.
  pause
  exit /b 1
)

if not exist "node_modules\express" (
  echo Instalando dependencias por primera vez...
  call npm install
  if errorlevel 1 (
    echo  [X] No se pudieron instalar las dependencias. Revisa tu conexion a internet.
    pause
    exit /b 1
  )
)

if not exist ".env" copy ".env.example" ".env" >nul

echo.
echo  Abriendo la calculadora en el navegador: http://localhost:5173
echo  (Deja esta ventana abierta mientras la uses. Cierrala para apagar el servidor.)
echo.
start "" http://localhost:5173
node server.js
pause

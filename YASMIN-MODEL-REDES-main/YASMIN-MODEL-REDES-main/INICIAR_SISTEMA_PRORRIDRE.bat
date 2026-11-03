@echo off
title PRORRIDRE Smart Dashboard - Servidor & Digital Twin
color 0b
echo =========================================================================
echo    PROGRAMA REGIONAL DE RIEGO Y DRENAJE (PRORRIDRE - GORE PUNO)
echo    Sistema de Monitoreo Inteligente & Network Digital Twin 3D
echo =========================================================================
echo.
echo [1/3] Verificando entorno Python...
cd /d "%~dp0\backend"

echo [2/3] Verificando Servidor On-Premise FastAPI (Puerto 8000)...
netstat -ano | findstr :8000 | findstr LISTENING >nul
if %errorlevel% equ 0 (
    echo [OK] Servidor Backend ya se encuentra activo en el puerto 8000.
) else (
    echo Iniciando Servidor FastAPI + WebSockets...
    start /b python run_server.py
    timeout /t 3 /nobreak >nul
)

echo.
echo [3/3] Abriendo Portal de Acceso (Inicio de Sesion) en el navegador...
start http://127.0.0.1:8000

echo.
echo =========================================================================
echo  Sistema PRORRIDRE listo y operativo.
echo  Portal de Acceso (Login): http://127.0.0.1:8000
echo  Documentacion API Swagger: http://127.0.0.1:8000/docs
echo =========================================================================
echo.
pause

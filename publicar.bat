@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ============================================
echo    PUBLICAR CAMBIOS DE LA WEB NAE
echo ============================================
echo.
set /p msg="Descripcion corta del cambio: "
if "%msg%"=="" set msg="Actualizacion"
echo.
git add -A
git commit -m "%msg%"
git push origin main
echo.
echo ============================================
echo  LISTO! Vercel despliega solo en 1-2 min
echo ============================================
pause

@echo off
title DriveHub - Cloud Workspace Server
cd /d "%~dp0"

echo ===================================================
echo             DriveHub Extension System
echo ===================================================
echo.

:: 1. Check if Node.js is installed
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed or not found in PATH!
    echo Please download and install Node.js from: https://nodejs.org/
    echo.
    pause
    exit /b 1
)

:: 2. Check if dependencies are installed
if not exist "node_modules\" (
    echo [INFO] First-time setup detected: Installing required dependencies...
    echo Running npm install...
    call npm install
    if %errorlevel% neq 0 (
        echo [ERROR] Failed to install dependencies.
        pause
        exit /b 1
    )
    echo [OK] Dependencies installed successfully.
    echo.
)

:: 3. Automatically open the browser to the login page after 2 seconds
echo [INFO] Preparing DriveHub Server...
echo [INFO] Opening web browser at http://localhost:3000/login.html ...
start "" cmd /c "timeout /t 2 /nobreak >nul & start http://localhost:3000/login.html"

:: 4. Start the server
echo [INFO] DriveHub is live at http://localhost:3000
echo [INFO] Press Ctrl+C in this window anytime to stop the server.
echo ===================================================
echo.

call npm start

if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Server stopped with an error code.
    pause
)

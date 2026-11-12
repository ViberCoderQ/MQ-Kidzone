@echo off
cd /d "%~dp0"

rem Only start the server if port 8793 isn't already listening (e.g. left running from last time).
netstat -ano | findstr ":8793" | findstr "LISTENING" >nul
if errorlevel 1 (
    start "Kid Zone Server" /min node "%~dp0serve.js"
    timeout /t 1 /nobreak >nul
)

start "" "http://localhost:8793"

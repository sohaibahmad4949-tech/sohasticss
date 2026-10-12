@echo off
cd /d "%~dp0backend"
start "" http://localhost:3000
npm start
pause

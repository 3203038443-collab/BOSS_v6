@echo off
chcp 65001 >nul
"C:\Users\01\AppData\Local\Programs\Python\Python313\python.exe" "C:\Users\01\Desktop\BOSS_v6\boss_agent\launcher.py"
if errorlevel 1 (
    echo.
    echo [ERROR] Failed to launch
    pause
)

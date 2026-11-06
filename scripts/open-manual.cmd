@echo off
rem Double-click to open the Strata user manual in Microsoft Edge.
rem Optional: open-manual.cmd sales   (only pages whose name contains "sales")
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0open-manual.ps1" -Page "%~1"

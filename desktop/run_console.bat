@echo off
chcp 65001 >nul
title MediaForge 调试模式
echo ============================================
echo  图文工坊 - Windows 调试模式
echo  错误信息将显示在此窗口
echo ============================================
echo.
"%~dp0..\dist\MediaForge\MediaForge.exe"
echo.
echo 程序已退出，错误码：%ERRORLEVEL%
echo 请截图此窗口以报告问题
pause

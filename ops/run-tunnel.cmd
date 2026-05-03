@echo off
cd /d C:\Users\user\desktop\luca-ai
cloudflared.exe tunnel --config C:\Users\user\.cloudflared\config.yml run LUCA-AI >> cloudflared-named.log 2>> cloudflared-named.err.log

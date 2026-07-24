$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectRoot

$env:HOST = '127.0.0.1'
$env:PORT = '4242'
$env:ROUTER_BASE_URL = 'http://127.0.0.1:20128/v1'
$env:ROUTER_MODEL = 'cx/gpt-5.6-sol-high'
$env:KAMUI_BASE = 'http://127.0.0.1:1338'
$env:REQUIRE_CLOUDFLARE_ACCESS = 'false'
$env:LUCA_ADMIN_EMAILS = 'lucasplays2000@gmail.com'
$env:LUCA_DATA_DIR = Join-Path $projectRoot '.luca'

& node server/index.js

# Collab MVP — Déploiement one-shot Windows PowerShell.
#
# Usage :
#   .\scripts\deploy.ps1            # déploie back + front
#   .\scripts\deploy.ps1 back       # back seulement
#   .\scripts\deploy.ps1 front      # front seulement

param([string]$Target = 'all')

$ErrorActionPreference = 'Stop'
$Root = Resolve-Path (Join-Path $PSScriptRoot '..')
$BackUrl = 'https://collab-talk.fly.dev'

function Deploy-Back {
  Write-Host "▶ Backend Fly.io" -ForegroundColor Cyan
  Set-Location (Join-Path $Root 'apps/backend')

  if (-not (Get-Command fly -ErrorAction SilentlyContinue)) {
    Write-Host "✗ flyctl introuvable. Installer : iwr https://fly.io/install.ps1 -useb | iex" -ForegroundColor Red
    exit 1
  }

  fly status -a collab-talk *> $null
  if ($LASTEXITCODE -ne 0) {
    Write-Host "ℹ App pas encore créée, lancement de fly launch…" -ForegroundColor Yellow
    fly launch --name collab-talk --region cdg --no-deploy --copy-config --yes
  }

  Write-Host "▶ fly deploy…" -ForegroundColor Cyan
  fly deploy

  Write-Host "▶ Health check $BackUrl/" -ForegroundColor Cyan
  Start-Sleep -Seconds 5
  try {
    $r = Invoke-WebRequest "$BackUrl/" -UseBasicParsing
    Write-Host "✓ Backend OK : $BackUrl" -ForegroundColor Green
  } catch {
    Write-Host "✗ Backend ne répond pas : $_" -ForegroundColor Red
    exit 1
  }
}

function Deploy-Front {
  Write-Host "▶ Frontend Vercel" -ForegroundColor Cyan
  Set-Location (Join-Path $Root 'apps/frontend')

  if (-not (Get-Command vercel -ErrorAction SilentlyContinue)) {
    Write-Host "✗ vercel CLI introuvable. Installer : npm i -g vercel" -ForegroundColor Red
    exit 1
  }

  Write-Host "▶ Build local (sanity check)…" -ForegroundColor Cyan
  npm run build
  if ($LASTEXITCODE -ne 0) { exit 1 }

  Write-Host "▶ vercel --prod…" -ForegroundColor Cyan
  vercel --prod --yes

  Write-Host "✓ Frontend déployé." -ForegroundColor Green
  Write-Host ""
  Write-Host "  ⚠ Pense à set FRONT_ORIGIN côté Fly :" -ForegroundColor Yellow
  Write-Host "    fly secrets set FRONT_ORIGIN=https://collab-talk.vercel.app -a collab-talk"
}

switch ($Target) {
  'back'  { Deploy-Back }
  'front' { Deploy-Front }
  'all'   { Deploy-Back; Deploy-Front }
  default { Write-Host "Usage : .\deploy.ps1 [back|front|all]"; exit 1 }
}

Write-Host ""
Write-Host "════════════════════════════════════════" -ForegroundColor Green
Write-Host " Déploiement terminé." -ForegroundColor Green
Write-Host " Front : https://collab-talk.vercel.app"
Write-Host " Back  : $BackUrl"
Write-Host "════════════════════════════════════════" -ForegroundColor Green

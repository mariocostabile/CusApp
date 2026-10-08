<#
================================================================================
  BUILD APK AUTOMATICO - CUS COSENZA APP
================================================================================

COME AVVIARE QUESTO SCRIPT:
--------------------------------------------------------------------------------
Puoi avviare questo script in 3 modi facilissimi:

MODO 1 (Consigliato - da terminale in CusApp):
    npm run build:apk

MODO 2 (Da PowerShell all'interno della cartella CusApp):
    .\build-apk.ps1

MODO 3 (Da Esplora File di Windows):
    Fai doppio clic sul file "build-apk.bat" che trovi nella cartella CusApp.
--------------------------------------------------------------------------------

COSA FA QUESTO SCRIPT AUTOMATICAMENTE:
1. Rileva dinamicamente l'ambiente (Java 17 e Android SDK) in modo portabile e compatibile con qualsiasi installazione.
2. Esegue "npx expo prebuild -p android" per sincronizzare eventuali modifiche fatte a icona, nome o configurazioni.
3. Entra nella cartella "android" ed esegue ".\gradlew assembleRelease" per compilare l'APK definitivo.
4. Prende l'APK compilato, lo rinomina comodamente in "CusCosenza.apk" e lo copia nella cartella "dist-apk" all'interno di CusApp.
5. Apre in automatico la cartella in Esplora Risorse così puoi inviartelo subito!
================================================================================
#>

# Interrompe l'esecuzione in caso di errore critico
$ErrorActionPreference = "Stop"

# Cartelle di riferimento
$ProjectRoot = $PSScriptRoot
$AndroidDir  = Join-Path $ProjectRoot "android"
$OutputDir   = Join-Path $ProjectRoot "dist-apk"

Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "  AVVIO COMPILAZIONE APK - CUS COSENZA                  " -ForegroundColor Cyan
Write-Host "========================================================" -ForegroundColor Cyan

# 1. Configurazione Dinamica Variabili d'Ambiente
Write-Host "`n[1/4] Rilevamento ambiente Java 17 e Android SDK..." -ForegroundColor Yellow

# Rilevamento dinamico di Android SDK (senza percorsi utente hardcoded)
if (-not $env:ANDROID_HOME) {
    if ($env:LOCALAPPDATA -and (Test-Path "$env:LOCALAPPDATA\Android\Sdk")) {
        $env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
    } elseif ($env:ANDROID_SDK_ROOT -and (Test-Path $env:ANDROID_SDK_ROOT)) {
        $env:ANDROID_HOME = $env:ANDROID_SDK_ROOT
    }
}

# Rilevamento dinamico di Java (JDK 17+)
if (-not $env:JAVA_HOME) {
    $candidateJavas = @(
        "C:\Program Files\Java\jdk-17",
        "C:\Program Files\Eclipse Adoptium\jdk-17*",
        "C:\Program Files\Android\Android Studio\jbr",
        "C:\Program Files\Microsoft\jdk-17*"
    )
    foreach ($candidate in $candidateJavas) {
        $resolved = Resolve-Path $candidate -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Path -First 1
        if ($resolved -and (Test-Path $resolved)) {
            $env:JAVA_HOME = $resolved
            break
        }
    }
}

if ($env:JAVA_HOME) {
    $env:Path = "$env:JAVA_HOME\bin;" + $env:Path
}

# Verifica presenza SDK e JDK
if (-not $env:JAVA_HOME -or -not (Test-Path $env:JAVA_HOME)) {
    Write-Host "[ERRORE] JDK 17 non trovato. Imposta JAVA_HOME oppure installa JDK 17 in 'C:\Program Files\Java\jdk-17'." -ForegroundColor Red
    exit 1
}
if (-not $env:ANDROID_HOME -or -not (Test-Path $env:ANDROID_HOME)) {
    Write-Host "[ERRORE] Android SDK non trovato. Imposta ANDROID_HOME oppure installa Android Studio SDK." -ForegroundColor Red
    exit 1
}

Write-Host "  -> JAVA_HOME:    $env:JAVA_HOME" -ForegroundColor DarkGray
Write-Host "  -> ANDROID_HOME: $env:ANDROID_HOME" -ForegroundColor DarkGray

# 2. Sincronizzazione Prebuild Expo
Write-Host "`n[2/4] Sincronizzazione progetto nativo con Expo..." -ForegroundColor Yellow
Set-Location $ProjectRoot

# Rilascia eventuali processi Gradle daemon attivi che mantengono lock sui file dex/jar in Windows
if (Test-Path "$AndroidDir\gradlew.bat") {
    try {
        & "$AndroidDir\gradlew.bat" --stop | Out-Null
    } catch {}
}
Get-Process -Name java -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Milliseconds 500

cmd.exe /c "npx expo prebuild -p android --clean"
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERRORE] Il prebuild di Expo è fallito." -ForegroundColor Red
    exit $LASTEXITCODE
}

# 3. Compilazione Gradle Release
Write-Host "`n[3/4] Compilazione APK Release con Gradle (richiede pochi minuti)..." -ForegroundColor Yellow
Set-Location $AndroidDir
cmd.exe /c ".\gradlew.bat assembleRelease"
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERRORE] La compilazione di Gradle è fallita." -ForegroundColor Red
    Set-Location $ProjectRoot
    exit $LASTEXITCODE
}

# Ferma il demone Gradle per liberare immediatamente RAM e sbloccare i file
cmd.exe /c ".\gradlew.bat --stop" | Out-Null

# 4. Copia e organizzazione del file APK finale
Write-Host "`n[4/4] Finalizzazione APK..." -ForegroundColor Yellow
$GeneratedApk = Join-Path $AndroidDir "app\build\outputs\apk\release\app-release.apk"

if (Test-Path $GeneratedApk) {
    if (-not (Test-Path $OutputDir)) {
        New-Item -ItemType Directory -Path $OutputDir | Out-Null
    }

    $FinalApk = Join-Path $OutputDir "CusCosenza.apk"
    Copy-Item -Path $GeneratedApk -Destination $FinalApk -Force

    $ApkSizeMb = [math]::Round(((Get-Item $FinalApk).Length / 1MB), 2)

    Write-Host "`n========================================================" -ForegroundColor Green
    Write-Host "  BUILD COMPLETATA CON SUCCESSO! 🎉" -ForegroundColor Green
    Write-Host "========================================================" -ForegroundColor Green
    Write-Host "File pronto:  $FinalApk" -ForegroundColor White
    Write-Host "Dimensione:   $ApkSizeMb MB" -ForegroundColor White
    Write-Host "========================================================" -ForegroundColor Green

    # Torna alla cartella radice del progetto
    Set-Location $ProjectRoot

    # Apre automaticamente la cartella dell'APK in Esplora File
    explorer.exe /select,"$FinalApk"
} else {
    Write-Host "[ERRORE] Non è stato possibile trovare l'APK generato in: $GeneratedApk" -ForegroundColor Red
    Set-Location $ProjectRoot
    exit 1
}

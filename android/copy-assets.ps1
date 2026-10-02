# Isti manifest kao Gradle/Linux; radi iz svakog trenutnog direktorija.
$ErrorActionPreference = 'Stop'
$ProjectDir = Split-Path -Parent $PSScriptRoot
$AssetsDir = Join-Path $PSScriptRoot 'app/src/main/assets'
$Spec = Get-Content (Join-Path $PSScriptRoot 'assets-manifest.json') -Raw | ConvertFrom-Json
foreach ($Name in @($Spec.files) + @($Spec.required)) {
    $Source = Join-Path $ProjectDir $Name
    if (-not (Test-Path $Source -PathType Leaf) -or (Get-Item $Source).Length -eq 0) {
        throw "Nedostaje obavezni web fajl: $Name"
    }
}
$Html = Get-Content (Join-Path $ProjectDir 'index.html') -Raw
$Sw = Get-Content (Join-Path $ProjectDir 'sw.js') -Raw
$Gradle = Get-Content (Join-Path $PSScriptRoot 'app/build.gradle') -Raw
$Hv = [regex]::Match($Html, "APP_VER\s*=\s*'v([0-9.]+)'").Groups[1].Value
$Sv = [regex]::Match($Sw, "APP_VERSION\s*=\s*'([0-9.]+)'").Groups[1].Value
$Gv = [regex]::Match($Gradle, 'versionName\s+"([0-9.]+)"').Groups[1].Value
if (-not $Hv -or $Hv -ne $Sv -or $Hv -ne $Gv) { throw 'Web/SW/Android verzije nisu uskladjene' }
$Stage = Join-Path $PSScriptRoot ('assets-stage-' + [guid]::NewGuid().ToString('N'))
try {
    New-Item -ItemType Directory -Path $Stage | Out-Null
    foreach ($Name in $Spec.files) { Copy-Item (Join-Path $ProjectDir $Name) $Stage -Force }
    foreach ($Name in $Spec.directories) {
        $Source = Join-Path $ProjectDir $Name
        if (Test-Path $Source) { Copy-Item $Source $Stage -Recurse -Force }
    }
    if (Test-Path $AssetsDir) { Remove-Item $AssetsDir -Recurse -Force }
    New-Item -ItemType Directory -Force -Path (Split-Path $AssetsDir -Parent) | Out-Null
    Move-Item $Stage $AssetsDir
    Write-Host "Assets pripremljeni: $Hv"
} finally {
    if (Test-Path $Stage) { Remove-Item $Stage -Recurse -Force }
}

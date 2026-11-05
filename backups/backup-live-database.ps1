param(
  [string]$ProjectRef = 'moevynyglfeebzegttfl',
  [string]$HostName = 'db.moevynyglfeebzegttfl.supabase.co',
  [int]$Port = 5432,
  [string]$Database = 'postgres',
  [string]$Username = 'postgres',
  [string]$Label = 'livedatabase 11-4-2026',
  [string]$OutputDirectory = $PSScriptRoot
)

$ErrorActionPreference = 'Stop'
$dump = Get-Command pg_dump -ErrorAction SilentlyContinue
if (-not $dump) {
  throw 'pg_dump is required on PATH. Install PostgreSQL 17 client tools (or newer) before running this script.'
}

$majorVersion = (& $dump.Source --version) -replace '^.*?(\d+)\..*$', '$1'
if ([int]$majorVersion -lt 17) {
  throw 'pg_dump version 17 or newer is required for this PostgreSQL 17 database.'
}

New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null
$outputPath = Join-Path $OutputDirectory ($Label + '.sql')
if (Test-Path -LiteralPath $outputPath) {
  throw "Backup already exists: $outputPath. Choose another Label to avoid overwriting it."
}

Write-Host "Backing up project $ProjectRef to $outputPath"
$password = Read-Host 'Database password' -AsSecureString
$passwordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($password)
try {
  $env:PGPASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPointer)
  $env:PGSSLMODE = 'require'
  & $dump.Source --host=$HostName --port=$Port --username=$Username --dbname=$Database --format=plain --no-owner --no-acl --encoding=UTF8 --serializable-deferrable --file=$outputPath
  if ($LASTEXITCODE -ne 0) {
    Remove-Item -LiteralPath $outputPath -ErrorAction SilentlyContinue
    throw "pg_dump failed with exit code $LASTEXITCODE. No backup was kept."
  }
}
finally {
  Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
  Remove-Item Env:PGSSLMODE -ErrorAction SilentlyContinue
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPointer)
}

if ((Get-Item -LiteralPath $outputPath).Length -eq 0) {
  Remove-Item -LiteralPath $outputPath
  throw 'The backup was empty and has been removed.'
}
if (-not (Get-Content -LiteralPath $outputPath -Tail 20 | Select-String -Pattern '^-- PostgreSQL database dump complete$')) {
  Remove-Item -LiteralPath $outputPath
  throw 'The backup did not have the pg_dump completion marker and has been removed.'
}

$hash = (Get-FileHash -LiteralPath $outputPath -Algorithm SHA256).Hash.ToLowerInvariant()
Set-Content -LiteralPath ($outputPath + '.sha256') -Value "$hash  $($Label).sql" -Encoding ascii
Write-Host "Backup saved: $outputPath"
Write-Host "SHA-256: $hash"

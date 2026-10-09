param()
$ErrorActionPreference = 'Stop'
$gitBash = Join-Path $env:ProgramFiles 'Git/bin/bash.exe'
if (!(Test-Path -LiteralPath $gitBash)) {
    throw 'Install Git for Windows with Git Bash, or run bash ci/lab/check.sh from Git Bash.'
}
Push-Location (Join-Path $PSScriptRoot '../..')
try {
    & $gitBash 'ci/lab/check.sh'
    if ($LASTEXITCODE -ne 0) { throw "Laboratory check failed (exit $LASTEXITCODE). Inspect FE/test-results/lab-diagnostics." }
} finally { Pop-Location }

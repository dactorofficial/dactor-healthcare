param([string]$FilePath)
if (Test-Path $FilePath) {
    $content = [System.IO.File]::ReadAllText($FilePath)
    $normalized = $content.Replace("`r`n", "`n")
    [System.IO.File]::WriteAllText($FilePath, $normalized, [System.Text.UTF8Encoding]::new($false))
    Write-Host "Normalized $FilePath to LF"
}

Add-Type -AssemblyName System.Drawing

$apps = @("clinic-app", "patient-app")
foreach ($app in $apps) {
    Write-Host "================== $app =================="
    foreach ($file in @("ic_launcher.png", "ic_launcher_round.png")) {
        $p = "$app\app\src\main\res\mipmap-xxxhdpi\$file"
        $bmp = [System.Drawing.Bitmap]::FromFile((Resolve-Path $p).Path)

        $minX = $bmp.Width; $maxX = 0; $minY = $bmp.Height; $maxY = 0
        for ($x = 0; $x -lt $bmp.Width; $x++) {
            for ($y = 0; $y -lt $bmp.Height; $y++) {
                $c = $bmp.GetPixel($x, $y)
                $isWhite = ($c.R -gt 245 -and $c.G -gt 245 -and $c.B -gt 245)
                $isTrans = ($c.A -lt 30)
                if (-not $isWhite -and -not $isTrans) {
                    if ($x -lt $minX) { $minX = $x }
                    if ($x -gt $maxX) { $maxX = $x }
                    if ($y -lt $minY) { $minY = $y }
                    if ($y -gt $maxY) { $maxY = $y }
                }
            }
        }
        $w = $maxX - $minX + 1
        $h = $maxY - $minY + 1
        $rw = [Math]::Round(($w / $bmp.Width) * 100, 1)
        $rh = [Math]::Round(($h / $bmp.Height) * 100, 1)
        Write-Host "$file : Image=$($bmp.Width)x$($bmp.Height), Logo=($minX,$minY)-($maxX,$maxY), W=$w ($rw%), H=$h ($rh%)"
        $bmp.Dispose()
    }
}

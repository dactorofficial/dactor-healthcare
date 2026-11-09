Add-Type -AssemblyName System.Drawing

$p = "clinic-app\app\src\main\res\mipmap-xxxhdpi\ic_launcher_round.png"
$bmp = [System.Drawing.Bitmap]::FromFile((Resolve-Path $p).Path)

# Check pixels along horizontal line through center (y = 96)
Write-Host "Horizontal slice at y=96:"
for ($x = 0; $x -lt 25; $x++) {
    $c = $bmp.GetPixel($x, 96)
    if ($c.A -gt 0) {
        Write-Host "x=$x : rgba($($c.R),$($c.G),$($c.B),$($c.A))"
    }
}

# Check pixels along vertical line through center (x = 96)
Write-Host "Vertical slice at x=96:"
for ($y = 0; $y -lt 25; $y++) {
    $c = $bmp.GetPixel(96, $y)
    if ($c.A -gt 0) {
        Write-Host "y=$y : rgba($($c.R),$($c.G),$($c.B),$($c.A))"
    }
}

$bmp.Dispose()

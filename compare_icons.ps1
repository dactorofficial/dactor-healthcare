Add-Type -AssemblyName System.Drawing

$b1 = [System.Drawing.Bitmap]::FromFile((Resolve-Path "clinic-app\app\src\main\res\mipmap-xxxhdpi\ic_launcher.png").Path)
$b2 = [System.Drawing.Bitmap]::FromFile((Resolve-Path "patient-app\app\src\main\res\mipmap-xxxhdpi\ic_launcher.png").Path)

$diff = 0
for ($x = 0; $x -lt $b1.Width; $x++) {
    for ($y = 0; $y -lt $b1.Height; $y++) {
        $p1 = $b1.GetPixel($x, $y)
        $p2 = $b2.GetPixel($x, $y)
        if ($p1.ToArgb() -ne $p2.ToArgb()) {
            $diff++
        }
    }
}
Write-Host "Total pixel differences between clinic and patient icon: $diff out of $($b1.Width * $b1.Height)"
$b1.Dispose()
$b2.Dispose()

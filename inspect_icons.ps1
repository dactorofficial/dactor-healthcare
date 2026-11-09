Add-Type -AssemblyName System.Drawing

$apps = @("clinic-app", "patient-app")
foreach ($app in $apps) {
    Write-Host "=== $app ==="
    $densities = @("mdpi", "hdpi", "xhdpi", "xxhdpi", "xxxhdpi")
    foreach ($d in $densities) {
        $files = @("ic_launcher.png", "ic_launcher_round.png")
        foreach ($f in $files) {
            $p = "$app\app\src\main\res\mipmap-$d\$f"
            if (Test-Path $p) {
                $bmp = [System.Drawing.Bitmap]::FromFile((Resolve-Path $p).Path)
                # Check corners and center pixel colors
                $c00 = $bmp.GetPixel(0, 0)
                $center = $bmp.GetPixel([int]($bmp.Width / 2), [int]($bmp.Height / 2))
                Write-Host "$d/$f : $($bmp.Width)x$($bmp.Height), (0,0)=rgba($($c00.R),$($c00.G),$($c00.B),$($c00.A)), center=rgba($($center.R),$($center.G),$($center.B),$($center.A))"
                $bmp.Dispose()
            }
        }
    }
}

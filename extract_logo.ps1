Add-Type -AssemblyName System.Drawing

$p = "clinic-app\app\src\main\res\mipmap-xxxhdpi\ic_launcher.png"
$bmp = [System.Drawing.Bitmap]::FromFile((Resolve-Path $p).Path)

# Find bounding box of actual logo
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

$cropW = $maxX - $minX + 1
$cropH = $maxY - $minY + 1

Write-Host "Cropping logo: ($minX, $minY), size ${cropW}x${cropH}"

$rect = New-Object System.Drawing.Rectangle($minX, $minY, $cropW, $cropH)
$cropped = $bmp.Clone($rect, $bmp.PixelFormat)

$cropped.Save("logo_cropped.png", [System.Drawing.Imaging.ImageFormat]::Png)

$cropped.Dispose()
$bmp.Dispose()
Write-Host "Saved logo_cropped.png successfully!"

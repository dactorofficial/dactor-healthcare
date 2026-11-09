Add-Type -AssemblyName System.Drawing

$bmp = [System.Drawing.Bitmap]::FromFile((Resolve-Path "logo_cropped.png").Path)

# Downsample to ~40x46 for ASCII preview
$stepX = [int]($bmp.Width / 38)
$stepY = [int]($bmp.Height / 30)

for ($y = 0; $y -lt $bmp.Height; $y += $stepY) {
    $line = ""
    for ($x = 0; $x -lt $bmp.Width; $x += $stepX) {
        $c = $bmp.GetPixel($x, $y)
        if ($c.R -gt 240 -and $c.G -gt 240 -and $c.B -gt 240) {
            $line += " "
        } else {
            $line += "#"
        }
    }
    Write-Host $line
}

$bmp.Dispose()

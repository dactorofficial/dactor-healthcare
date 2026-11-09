Add-Type -AssemblyName System.Drawing

$p = "logo_cropped.png"
$src = [System.Drawing.Bitmap]::FromFile((Resolve-Path $p).Path)

# Test various target heights in 192x192 canvas
foreach ($targetH in @(130, 138, 144, 150)) {
    $scale = $targetH / $src.Height
    $targetW = [int]($src.Width * $scale)
    $offsetX = [int]((192 - $targetW) / 2)
    $offsetY = [int]((192 - $targetH) / 2)

    # Check max distance from (96, 96) for any non-white pixel
    $maxDist = 0.0
    for ($x = 0; $x -lt $src.Width; $x++) {
        for ($y = 0; $y -lt $src.Height; $y++) {
            $c = $src.GetPixel($x, $y)
            $isWhite = ($c.R -gt 245 -and $c.G -gt 245 -and $c.B -gt 245)
            if (-not $isWhite) {
                $canvasX = $offsetX + ($x * $scale)
                $canvasY = $offsetY + ($y * $scale)
                $dx = $canvasX - 96.0
                $dy = $canvasY - 96.0
                $dist = [Math]::Sqrt($dx * $dx + $dy * $dy)
                if ($dist -gt $maxDist) {
                    $maxDist = $dist
                }
            }
        }
    }
    Write-Host "Target height: ${targetH}px (width: ${targetW}px, zoom: $([Math]::Round($scale, 2))x) -> Max crest distance from center: $([Math]::Round($maxDist, 1))px (Circle radius is 96px)"
}

$src.Dispose()

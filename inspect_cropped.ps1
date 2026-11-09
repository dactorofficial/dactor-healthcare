Add-Type -AssemblyName System.Drawing

$bmp = [System.Drawing.Bitmap]::FromFile((Resolve-Path "logo_cropped.png").Path)
Write-Host "logo_cropped size: $($bmp.Width) x $($bmp.Height)"
$tl = $bmp.GetPixel(0, 0)
$tr = $bmp.GetPixel($bmp.Width - 1, 0)
$bl = $bmp.GetPixel(0, $bmp.Height - 1)
$br = $bmp.GetPixel($bmp.Width - 1, $bmp.Height - 1)
$mid = $bmp.GetPixel([int]($bmp.Width/2), [int]($bmp.Height/2))

Write-Host "TL: rgba($($tl.R),$($tl.G),$($tl.B),$($tl.A))"
Write-Host "TR: rgba($($tr.R),$($tr.G),$($tr.B),$($tr.A))"
Write-Host "BL: rgba($($bl.R),$($bl.G),$($bl.B),$($bl.A))"
Write-Host "BR: rgba($($br.R),$($br.G),$($br.B),$($br.A))"
Write-Host "Center: rgba($($mid.R),$($mid.G),$($mid.B),$($mid.A))"

# Check if there are transparent pixels
$hasTrans = $false
$hasWhite = $false
for ($x = 0; $x -lt $bmp.Width; $x++) {
    for ($y = 0; $y -lt $bmp.Height; $y++) {
        $c = $bmp.GetPixel($x, $y)
        if ($c.A -lt 100) { $hasTrans = $true }
        if ($c.R -gt 245 -and $c.G -gt 245 -and $c.B -gt 245) { $hasWhite = $true }
    }
}
Write-Host "Has transparency: $hasTrans, Has white: $hasWhite"

$bmp.Dispose()

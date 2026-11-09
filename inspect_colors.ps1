Add-Type -AssemblyName System.Drawing

$bmp = [System.Drawing.Bitmap]::FromFile((Resolve-Path "logo_cropped.png").Path)

$colors = @{}
for ($x = 0; $x -lt $bmp.Width; $x++) {
    for ($y = 0; $y -lt $bmp.Height; $y++) {
        $c = $bmp.GetPixel($x, $y)
        if (-not ($c.R -gt 245 -and $c.G -gt 245 -and $c.B -gt 245)) {
            $key = "rgb($($c.R),$($c.G),$($c.B))"
            if ($colors.ContainsKey($key)) {
                $colors[$key]++
            } else {
                $colors[$key] = 1
            }
        }
    }
}

Write-Host "Top colors in logo:"
$colors.GetEnumerator() | Sort-Object Value -Descending | Select-Object -First 10 | ForEach-Object {
    Write-Host "$($_.Key): $($_.Value) pixels"
}

$bmp.Dispose()

Add-Type -AssemblyName System.Drawing

$srcPath = "C:\Users\Harsh Darak\.gemini\antigravity\brain\dc8f957f-726c-4b1c-98eb-f427e83defdd\.user_uploaded\media_1791536879466_f06022a1.jpg"
$src = [System.Drawing.Bitmap]::FromFile($srcPath)

# Bounding box
$minX = 18; $minY = 20; $cropW = 720; $cropH = 851
$rect = New-Object System.Drawing.Rectangle($minX, $minY, $cropW, $cropH)
$cropped = $src.Clone($rect, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)

function Create-SquareIcon($size, $scaleRatio) {
    $bmp = New-Object System.Drawing.Bitmap($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.Clear([System.Drawing.Color]::White)
    
    $drawH = [int]($size * $scaleRatio)
    $scale = $drawH / $cropped.Height
    $drawW = [int]($cropped.Width * $scale)
    $drawX = [int](($size - $drawW) / 2)
    $drawY = [int](($size - $drawH) / 2)
    
    $g.DrawImage($cropped, $drawX, $drawY, $drawW, $drawH)
    $g.Dispose()
    return $bmp
}

function Create-RoundIcon($size, $scaleRatio) {
    $bmp = New-Object System.Drawing.Bitmap($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.Clear([System.Drawing.Color]::Transparent)
    
    $brush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
    $g.FillEllipse($brush, 0, 0, $size, $size)
    $brush.Dispose()
    
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $path.AddEllipse(0, 0, $size, $size)
    $g.SetClip($path)
    
    $drawH = [int]($size * $scaleRatio)
    $scale = $drawH / $cropped.Height
    $drawW = [int]($cropped.Width * $scale)
    $drawX = [int](($size - $drawW) / 2)
    $drawY = [int](($size - $drawH) / 2)
    
    $g.DrawImage($cropped, $drawX, $drawY, $drawW, $drawH)
    $path.Dispose()
    $g.Dispose()
    return $bmp
}

function Create-ForegroundIcon($size, $scaleRatio) {
    $bmp = New-Object System.Drawing.Bitmap($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.Clear([System.Drawing.Color]::Transparent)
    
    $drawH = [int]($size * $scaleRatio)
    $scale = $drawH / $cropped.Height
    $drawW = [int]($cropped.Width * $scale)
    $drawX = [int](($size - $drawW) / 2)
    $drawY = [int](($size - $drawH) / 2)
    
    $g.DrawImage($cropped, $drawX, $drawY, $drawW, $drawH)
    $g.Dispose()
    return $bmp
}

$densities = @(
    @{ name = "mipmap-mdpi";    legacySize = 48;  adaptiveSize = 108 },
    @{ name = "mipmap-hdpi";    legacySize = 72;  adaptiveSize = 162 },
    @{ name = "mipmap-xhdpi";   legacySize = 96;  adaptiveSize = 216 },
    @{ name = "mipmap-xxhdpi";  legacySize = 144; adaptiveSize = 324 },
    @{ name = "mipmap-xxxhdpi"; legacySize = 192; adaptiveSize = 432 }
)

$targetApps = @(
    "G:\My Drive\New folder\clinic-app\app\src\main\res",
    "G:\My Drive\New folder\patient-app\app\src\main\res"
)

$adaptiveXml = @"
<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background" />
    <foreground android:drawable="@mipmap/ic_launcher_foreground" />
</adaptive-icon>
"@

$backgroundXml = @"
<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">#FFFFFF</color>
</resources>
"@

foreach ($resDir in $targetApps) {
    Write-Host "Applying icons to: $resDir"
    
    # Ensure mipmap-anydpi-v26 exists
    $anydpiDir = Join-Path $resDir "mipmap-anydpi-v26"
    if (-not (Test-Path $anydpiDir)) { New-Item -ItemType Directory -Path $anydpiDir -Force | Out-Null }
    
    # Save adaptive xmls
    [System.IO.File]::WriteAllText((Join-Path $anydpiDir "ic_launcher.xml"), $adaptiveXml)
    [System.IO.File]::WriteAllText((Join-Path $anydpiDir "ic_launcher_round.xml"), $adaptiveXml)
    
    # Ensure values exists and save background color
    $valuesDir = Join-Path $resDir "values"
    if (-not (Test-Path $valuesDir)) { New-Item -ItemType Directory -Path $valuesDir -Force | Out-Null }
    [System.IO.File]::WriteAllText((Join-Path $valuesDir "ic_launcher_background.xml"), $backgroundXml)
    
    # Ensure drawable exists and save app_logo.png
    $drawableDir = Join-Path $resDir "drawable"
    if (-not (Test-Path $drawableDir)) { New-Item -ItemType Directory -Path $drawableDir -Force | Out-Null }
    $appLogo = Create-SquareIcon 512 0.96
    $appLogo.Save((Join-Path $drawableDir "app_logo.png"), [System.Drawing.Imaging.ImageFormat]::Png)
    $appLogo.Dispose()

    # Generate each density
    foreach ($d in $densities) {
        $folder = Join-Path $resDir $d.name
        if (-not (Test-Path $folder)) { New-Item -ItemType Directory -Path $folder -Force | Out-Null }
        
        # 1. Square icon
        $sq = Create-SquareIcon $d.legacySize 0.92
        $sq.Save((Join-Path $folder "ic_launcher.png"), [System.Drawing.Imaging.ImageFormat]::Png)
        $sq.Dispose()
        
        # 2. Round icon
        $rd = Create-RoundIcon $d.legacySize 0.86
        $rd.Save((Join-Path $folder "ic_launcher_round.png"), [System.Drawing.Imaging.ImageFormat]::Png)
        $rd.Dispose()
        
        # 3. Adaptive Foreground
        $fg = Create-ForegroundIcon $d.adaptiveSize 0.80
        $fg.Save((Join-Path $folder "ic_launcher_foreground.png"), [System.Drawing.Imaging.ImageFormat]::Png)
        $fg.Dispose()
        
        Write-Host "  -> Generated $($d.name): legacy=$($d.legacySize)px, adaptive=$($d.adaptiveSize)px"
    }
}

$cropped.Dispose()
$src.Dispose()
Write-Host "All launcher and adaptive icons successfully deployed to clinic-app and patient-app!"

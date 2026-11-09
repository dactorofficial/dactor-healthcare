Add-Type -AssemblyName System.Drawing

$srcFile = "temp_extracted.png"
if (-not (Test-Path $srcFile)) {
    Write-Error "Source image not found: $srcFile"
    exit 1
}

function Resize-Image {
    param($srcImg, $destPath, $newW, $newH, [switch]$Round, [switch]$WhiteBg)
    $dest = New-Object System.Drawing.Bitmap($newW, $newH, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($dest)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    
    if ($WhiteBg) {
        $g.Clear([System.Drawing.Color]::White)
    } else {
        $g.Clear([System.Drawing.Color]::Transparent)
    }

    if ($Round) {
        # Create circular path
        $path = New-Object System.Drawing.Drawing2D.GraphicsPath
        $path.AddEllipse(0, 0, $newW, $newH)
        $g.SetClip($path)
        $g.Clear([System.Drawing.Color]::White)
    }

    if ($WhiteBg -or $Round) {
        # When drawing inside an app icon, inset the logo slightly (e.g. 15%)
        $insetX = [int]($newW * 0.15)
        $insetY = [int]($newH * 0.15)
        $targetW = $newW - (2 * $insetX)
        $targetH = $newH - (2 * $insetY)
        $g.DrawImage($srcImg, $insetX, $insetY, $targetW, $targetH)
    } else {
        $g.DrawImage($srcImg, 0, 0, $newW, $newH)
    }

    $dest.Save($destPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose()
    $dest.Dispose()
}

function Crop-Image {
    param($srcImg, $destPath, $minX, $minY, $cropW, $cropH)
    $dest = New-Object System.Drawing.Bitmap($cropW, $cropH, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($dest)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $g.Clear([System.Drawing.Color]::Transparent)
    
    $srcRect = New-Object System.Drawing.Rectangle($minX, $minY, $cropW, $cropH)
    $destRect = New-Object System.Drawing.Rectangle(0, 0, $cropW, $cropH)
    $g.DrawImage($srcImg, $destRect, $srcRect, [System.Drawing.GraphicsUnit]::Pixel)
    
    $dest.Save($destPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose()
    $dest.Dispose()
}

$masterImg = [System.Drawing.Image]::FromFile((Resolve-Path $srcFile))

# 1. Base sizes
Resize-Image $masterImg "logo_512.png" 512 512
Resize-Image $masterImg "logo_1024.png" 1024 1024
# Bounding box is roughly X: 220 to 1024, Y: 140 to 1150
Crop-Image $masterImg "logo_cropped.png" 220 140 810 1010

# 2. Build SVG with 1024 embedded image
$b64 = [Convert]::ToBase64String([System.IO.File]::ReadAllBytes("logo_1024.png"))
$svgContent = @"
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 1024 1024" width="100%" height="100%">
  <title>Dactor Logo</title>
  <image width="1024" height="1024" href="data:image/png;base64,$b64" xlink:href="data:image/png;base64,$b64"/>
</svg>
"@
[System.IO.File]::WriteAllText("logo.svg", $svgContent, [System.Text.Encoding]::UTF8)

Write-Output "Generated master assets: logo_512.png, logo_1024.png, logo_cropped.png, logo.svg"

# 3. Copy to web-app
$webAppTargets = @(
    @{ Src = "logo.svg"; Dest = "web-app/public/logo.svg" },
    @{ Src = "logo.svg"; Dest = "web-app/public/app_logo.svg" },
    @{ Src = "logo_512.png"; Dest = "web-app/public/logo.png" },
    @{ Src = "logo_512.png"; Dest = "web-app/public/app_logo.png" },
    @{ Src = "logo_512.png"; Dest = "web-app/public/favicon.png" },
    @{ Src = "logo_cropped.png"; Dest = "web-app/public/logo_cropped.png" },
    @{ Src = "logo.svg"; Dest = "web-app/src/assets/logo.svg" },
    @{ Src = "logo.svg"; Dest = "web-app/src/assets/app_logo.svg" },
    @{ Src = "logo_512.png"; Dest = "web-app/src/assets/logo.png" },
    @{ Src = "logo_cropped.png"; Dest = "web-app/src/assets/logo_cropped.png" }
)

foreach ($t in $webAppTargets) {
    Copy-Item $t.Src $t.Dest -Force
    Write-Output "Copied $($t.Src) -> $($t.Dest)"
}

# 4. Copy to admin-panel
$adminTargets = @(
    @{ Src = "logo.svg"; Dest = "admin-panel/public/logo.svg" },
    @{ Src = "logo.svg"; Dest = "admin-panel/public/app_logo.svg" },
    @{ Src = "logo_512.png"; Dest = "admin-panel/public/app-icon.png" },
    @{ Src = "logo_512.png"; Dest = "admin-panel/public/app_logo.png" },
    @{ Src = "logo_512.png"; Dest = "admin-panel/public/favicon.png" },
    @{ Src = "logo.svg"; Dest = "admin-panel/src/assets/logo.svg" },
    @{ Src = "logo.svg"; Dest = "admin-panel/src/assets/app_logo.svg" },
    @{ Src = "logo_512.png"; Dest = "admin-panel/src/assets/logo.png" }
)

foreach ($t in $adminTargets) {
    Copy-Item $t.Src $t.Dest -Force
    Write-Output "Copied $($t.Src) -> $($t.Dest)"
}

# 5. Copy to Android apps
$androidDensityMap = @{
    "mdpi" = 48
    "hdpi" = 72
    "xhdpi" = 96
    "xxhdpi" = 144
    "xxxhdpi" = 192
}

@("clinic-app", "patient-app") | ForEach-Object {
    $app = $_
    $resDir = "$app/app/src/main/res"

    # Copy app_logo.png (512x512) to drawable/
    $drawableDir = "$resDir/drawable"
    Copy-Item "logo_512.png" "$drawableDir/app_logo.png" -Force
    Write-Output "Copied logo_512.png -> $drawableDir/app_logo.png"

    # Backup and remove app_logo.xml if it exists to avoid resource collision
    $xmlPath = "$drawableDir/app_logo.xml"
    if (Test-Path $xmlPath) {
        Remove-Item $xmlPath -Force
        Write-Output "Removed $xmlPath to allow $drawableDir/app_logo.png"
    }

    # Generate mipmap icons for legacy
    foreach ($entry in $androidDensityMap.GetEnumerator()) {
        $density = $entry.Key
        $size = $entry.Value
        $mipmapDir = "$resDir/mipmap-$density"
        if (Test-Path $mipmapDir) {
            Resize-Image $masterImg "$mipmapDir/ic_launcher.png" $size $size -WhiteBg
            Resize-Image $masterImg "$mipmapDir/ic_launcher_round.png" $size $size -Round
            Write-Output "Generated $mipmapDir ic_launcher ($size x $size)"
        }
    }
}

$masterImg.Dispose()
Write-Output "ALL LOGO ASSETS SUCCESSFULLY GENERATED AND PLACED!"

Add-Type -AssemblyName System.Drawing

$srcPath = "C:\Users\Harsh Darak\.gemini\antigravity\brain\dc8f957f-726c-4b1c-98eb-f427e83defdd\.user_uploaded\media_1791536879466_f06022a1.jpg"
$src = [System.Drawing.Bitmap]::FromFile($srcPath)

# Bounding box
$minX = 18; $minY = 20; $cropW = 720; $cropH = 851
$rect = New-Object System.Drawing.Rectangle($minX, $minY, $cropW, $cropH)
$cropped = $src.Clone($rect, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)

Write-Host "Cropped size: $($cropped.Width) x $($cropped.Height)"

# Function to render square launcher icon
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

# Function to render round launcher icon
function Create-RoundIcon($size, $scaleRatio) {
    $bmp = New-Object System.Drawing.Bitmap($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    
    $g.Clear([System.Drawing.Color]::Transparent)
    
    # Fill circle with white
    $brush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
    $g.FillEllipse($brush, 0, 0, $size, $size)
    $brush.Dispose()
    
    # Clip to circle
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

# Function to render adaptive icon foreground (108dp canvas)
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

$sq = Create-SquareIcon 192 0.82
$sq.Save("test_sq_192.png", [System.Drawing.Imaging.ImageFormat]::Png)
$sq.Dispose()

$rd = Create-RoundIcon 192 0.78
$rd.Save("test_rd_192.png", [System.Drawing.Imaging.ImageFormat]::Png)
$rd.Dispose()

$fg = Create-ForegroundIcon 432 0.65
$fg.Save("test_fg_432.png", [System.Drawing.Imaging.ImageFormat]::Png)
$fg.Dispose()

$cropped.Dispose()
$src.Dispose()
Write-Host "Test icons generated successfully!"

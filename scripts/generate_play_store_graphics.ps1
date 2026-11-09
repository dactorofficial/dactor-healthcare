Add-Type -AssemblyName System.Drawing

$srcLogoPath = "web-app/public/app_logo.png"
if (-not (Test-Path $srcLogoPath)) {
    Write-Error "Logo asset not found: $srcLogoPath"
    exit 1
}

$logoImg = [System.Drawing.Image]::FromFile((Resolve-Path $srcLogoPath))

# ============================================================
# 1. GENERATE PLAY STORE ICONS (512 x 512, Solid Background)
# ============================================================
function Generate-PlayStoreIcon {
    param($outputPath, $isClinic)
    $bmp = New-Object System.Drawing.Bitmap(512, 512, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit

    # Google Play requires solid/opaque background
    $g.Clear([System.Drawing.Color]::White)

    # Subtle modern border glow
    $pen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(20, 13, 148, 136), 4)
    $g.DrawRectangle($pen, 2, 2, 508, 508)
    $pen.Dispose()

    # Draw centered logo with safe margin (e.g. 78% size -> 400x400)
    $logoSize = 400
    $logoX = [int]((512 - $logoSize) / 2)
    $logoY = [int]((512 - $logoSize) / 2)
    $g.DrawImage($logoImg, $logoX, $logoY, $logoSize, $logoSize)

    $bmp.Save($outputPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose()
    $bmp.Dispose()
    Write-Output "Generated Play Store Icon: $outputPath"
}

Generate-PlayStoreIcon "PlayStore/patient-app/icon_512x512.png" $false
Generate-PlayStoreIcon "PlayStore/clinic-app/icon_512x512.png" $true

# ============================================================
# 2. GENERATE FEATURE GRAPHICS (1024 x 500, JPEG or 24-bit PNG)
# ============================================================
function Generate-FeatureGraphic {
    param($outputPath, $isClinic)
    $bmp = New-Object System.Drawing.Bitmap(1024, 500, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit

    # Background gradient: Dark Slate to Deep Midnight Navy
    $rect = New-Object System.Drawing.Rectangle(0, 0, 1024, 500)
    $bgBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush($rect, 
        [System.Drawing.Color]::FromArgb(255, 7, 11, 20), 
        [System.Drawing.Color]::FromArgb(255, 15, 23, 42), 
        45.0)
    $g.FillRectangle($bgBrush, $rect)
    $bgBrush.Dispose()

    # Ambient radial teal glow on the right
    $glowPath = New-Object System.Drawing.Drawing2D.GraphicsPath
    $glowPath.AddEllipse(620, 20, 460, 460)
    $glowBrush = New-Object System.Drawing.Drawing2D.PathGradientBrush($glowPath)
    $glowBrush.CenterColor = [System.Drawing.Color]::FromArgb(45, 13, 148, 136)
    $glowBrush.SurroundColors = @([System.Drawing.Color]::FromArgb(0, 7, 11, 20))
    $g.FillPath($glowBrush, $glowPath)
    $glowBrush.Dispose()
    $glowPath.Dispose()

    # Draw Brand Logo on Right (340 x 340)
    $logoSize = 340
    $logoX = 660
    $logoY = [int]((500 - $logoSize) / 2)
    $g.DrawImage($logoImg, $logoX, $logoY, $logoSize, $logoSize)

    # --- LEFT SIDE TYPOGRAPHY & BADGES ---

    # Category Pill
    $pillText = if ($isClinic) { "CLINIC & HOSPITAL OPERATING SYSTEM" } else { "OPD QUEUE TRANSPARENCY & CARE" }
    $pillFont = New-Object System.Drawing.Font("Arial", 10, [System.Drawing.FontStyle]::Bold)
    $pillBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 20, 184, 166))
    $g.DrawString($pillText, $pillFont, $pillBrush, 60, 65)
    $pillFont.Dispose()
    $pillBrush.Dispose()

    # Main Brand Heading
    $titleFont = New-Object System.Drawing.Font("Arial", 46, [System.Drawing.FontStyle]::Bold)
    $titleBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
    $appName = if ($isClinic) { "Dactor Clinic" } else { "Dactor" }
    $g.DrawString($appName, $titleFont, $titleBrush, 56, 95)
    $titleFont.Dispose()
    $titleBrush.Dispose()

    # Subheading
    $subFont = New-Object System.Drawing.Font("Arial", 18, [System.Drawing.FontStyle]::Regular)
    $subBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 203, 213, 225))
    $subText = if ($isClinic) { 
        "Live OPD Queue Management & Counter Billing" 
    } else { 
        "Live Doctor Queue Tracking & Appointments" 
    }
    $g.DrawString($subText, $subFont, $subBrush, 60, 180)
    $subFont.Dispose()
    $subBrush.Dispose()

    # Bullet Points / Key Features
    $features = if ($isClinic) {
        @(
            "Live Doctor Cabin Token Calling",
            "Multi-Counter Offline-Ready Billing",
            "Real-Time OPD Queue Broadcasting"
        )
    } else {
        @(
            "Real-Time OPD Waiting Token Counter",
            "Book Verified Clinics & Specialist Doctors",
            "Digital Diagnostic Lab Reports & Tracking"
        )
    }

    $bulletFont = New-Object System.Drawing.Font("Arial", 13.5, [System.Drawing.FontStyle]::Regular)
    $bulletBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 148, 163, 184))
    $checkBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 16, 185, 129))

    $yPos = 245
    foreach ($feat in $features) {
        $g.DrawString([char]0x2714, $bulletFont, $checkBrush, 60, $yPos)
        $g.DrawString("  $feat", $bulletFont, $bulletBrush, 80, $yPos)
        $yPos += 36
    }
    $bulletFont.Dispose()
    $bulletBrush.Dispose()
    $checkBrush.Dispose()

    # Bottom Trust Badge
    $trustFont = New-Object System.Drawing.Font("Arial", 10.5, [System.Drawing.FontStyle]::Bold)
    $trustBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 100, 116, 139))
    $g.DrawString("NEPAL DIGITAL HEALTHCARE NETWORK &bull; ZERO DATA SELLING", $trustFont, $trustBrush, 60, 420)
    $trustFont.Dispose()
    $trustBrush.Dispose()

    # Border frame
    $framePen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(40, 255, 255, 255), 1)
    $g.DrawRectangle($framePen, 0, 0, 1023, 499)
    $framePen.Dispose()

    $bmp.Save($outputPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose()
    $bmp.Dispose()
    Write-Output "Generated Play Store Feature Graphic: $outputPath"
}

Generate-FeatureGraphic "PlayStore/patient-app/feature_graphic_1024x500.png" $false
Generate-FeatureGraphic "PlayStore/clinic-app/feature_graphic_1024x500.png" $true

$logoImg.Dispose()
Write-Output "ALL PLAY STORE GRAPHICS GENERATED SUCCESSFULLY!"

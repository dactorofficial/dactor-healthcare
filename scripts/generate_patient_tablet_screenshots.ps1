Add-Type -AssemblyName System.Drawing

Add-Type -ReferencedAssemblies "System.Drawing" -TypeDefinition @"
using System.Drawing;
using System.Drawing.Drawing2D;

public class Gfx {
    public static GraphicsPath Round(float x, float y, float w, float h, float r) {
        GraphicsPath p = new GraphicsPath();
        float d = r * 2;
        if (d > w) d = w;
        if (d > h) d = h;
        p.AddArc(x, y, d, d, 180, 90);
        p.AddArc(x + w - d, y, d, d, 270, 90);
        p.AddArc(x + w - d, y + h - d, d, d, 0, 90);
        p.AddArc(x, y + h - d, d, d, 90, 90);
        p.CloseFigure();
        return p;
    }
}
"@

$logoPath = "web-app/public/app_logo.png"
if (-not (Test-Path $logoPath)) {
    $logoPath = "PlayStore/patient-app/icon_512x512.png"
}
$logoImg = [System.Drawing.Image]::FromFile((Resolve-Path $logoPath))

function Draw-BottomNav {
    param($g, [float]$screenX, [float]$screenY, [float]$screenW, [float]$screenH, [float]$scale, [int]$activeTab)
    $navH = 74 * $scale
    $navY = $screenY + $screenH - $navH
    $navPath = [Gfx]::Round($screenX, $navY, $screenW, $navH, (12 * $scale))
    $navBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
    $g.FillPath($navBrush, $navPath)
    $navBrush.Dispose()

    $navBorderPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(255, 226, 232, 240), [float](1.5 * $scale))
    $g.DrawLine($navBorderPen, [float]$screenX, [float]$navY, [float]($screenX + $screenW), [float]$navY)
    $navBorderPen.Dispose()
    $navPath.Dispose()

    $tabs = @("Home", "Discover", "Live Queue", "Records", "Profile")
    $tabW = $screenW / 5.0
    for ($i = 0; $i -lt 5; $i++) {
        $tabX = $screenX + ($i * $tabW)
        $tabCenterFormat = New-Object System.Drawing.StringFormat
        $tabCenterFormat.Alignment = [System.Drawing.StringAlignment]::Center
        $tabCenterFormat.LineAlignment = [System.Drawing.StringAlignment]::Center

        $isActive = ($i -eq $activeTab)
        $color = if ($isActive) { [System.Drawing.Color]::FromArgb(255, 0, 121, 107) } else { [System.Drawing.Color]::FromArgb(255, 148, 163, 184) }
        $fStyle = if ($isActive) { [System.Drawing.FontStyle]::Bold } else { [System.Drawing.FontStyle]::Regular }
        $font = New-Object System.Drawing.Font("Arial", [float](12.5 * $scale), $fStyle)
        $brush = New-Object System.Drawing.SolidBrush($color)

        if ($isActive) {
            $indicatorW = 38 * $scale
            $indicatorH = 4 * $scale
            $indPath = [Gfx]::Round(($tabX + ($tabW - $indicatorW) / 2.0), $navY, $indicatorW, $indicatorH, (2 * $scale))
            $indBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 0, 121, 107))
            $g.FillPath($indBrush, $indPath)
            $indBrush.Dispose()
            $indPath.Dispose()
        }

        $rect = New-Object System.Drawing.RectangleF([float]$tabX, [float]($navY + (22 * $scale)), [float]$tabW, [float](30 * $scale))
        $g.DrawString($tabs[$i], $font, $brush, $rect, $tabCenterFormat)
        $font.Dispose()
        $brush.Dispose()
        $tabCenterFormat.Dispose()
    }
}

function Render-PatientTabletScreenshot {
    param(
        [string]$outputPath,
        [int]$canvasWidth,
        [int]$canvasHeight,
        [string]$headline,
        [string]$subheadline,
        [int]$screenIndex
    )

    $scale = $canvasWidth / 1200.0

    $bmp = New-Object System.Drawing.Bitmap($canvasWidth, $canvasHeight, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit

    # 1. Background: Deep Teal Slate Gradient
    $bgRect = New-Object System.Drawing.Rectangle(0, 0, $canvasWidth, $canvasHeight)
    $bgBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
        $bgRect,
        [System.Drawing.Color]::FromArgb(255, 6, 26, 24),
        [System.Drawing.Color]::FromArgb(255, 12, 43, 39),
        90.0
    )
    $g.FillRectangle($bgBrush, $bgRect)
    $bgBrush.Dispose()

    # Ambient Radial Glow
    $glowPath = New-Object System.Drawing.Drawing2D.GraphicsPath
    $glowPath.AddEllipse([float](150 * $scale), [float](40 * $scale), [float](900 * $scale), [float](450 * $scale))
    $glowBrush = New-Object System.Drawing.Drawing2D.PathGradientBrush($glowPath)
    $glowBrush.CenterColor = [System.Drawing.Color]::FromArgb(45, 20, 184, 166)
    $glowBrush.SurroundColors = @([System.Drawing.Color]::FromArgb(0, 6, 26, 24))
    $g.FillPath($glowBrush, $glowPath)
    $glowBrush.Dispose()
    $glowPath.Dispose()

    # 2. Header Typography (Centered)
    $centerFormat = New-Object System.Drawing.StringFormat
    $centerFormat.Alignment = [System.Drawing.StringAlignment]::Center
    $centerFormat.LineAlignment = [System.Drawing.StringAlignment]::Center

    $headFontSize = [float](33 * $scale)
    $headFont = New-Object System.Drawing.Font("Arial", $headFontSize, [System.Drawing.FontStyle]::Bold)
    $headBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
    $headRect = New-Object System.Drawing.RectangleF([float](40 * $scale), [float](38 * $scale), [float]($canvasWidth - (80 * $scale)), [float](85 * $scale))
    $g.DrawString($headline, $headFont, $headBrush, $headRect, $centerFormat)
    $headFont.Dispose()
    $headBrush.Dispose()

    $subFontSize = [float](16.5 * $scale)
    $subFont = New-Object System.Drawing.Font("Arial", $subFontSize, [System.Drawing.FontStyle]::Regular)
    $subBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 153, 246, 228))
    $subRect = New-Object System.Drawing.RectangleF([float](40 * $scale), [float](128 * $scale), [float]($canvasWidth - (80 * $scale)), [float](46 * $scale))
    $g.DrawString($subheadline, $subFont, $subBrush, $subRect, $centerFormat)
    $subFont.Dispose()
    $subBrush.Dispose()

    # 3. Tablet Device Mockup Frame
    $deviceX = [float](90 * $scale)
    $deviceY = [float](190 * $scale)
    $deviceW = [float]($canvasWidth - (180 * $scale))
    $deviceH = [float]($canvasHeight - $deviceY)
    $cornerRad = [float](32 * $scale)

    # Device Shadow
    $shadowPath = [Gfx]::Round(($deviceX - 4 * $scale), ($deviceY + 8 * $scale), ($deviceW + 8 * $scale), $deviceH, $cornerRad)
    $shadowBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(70, 0, 0, 0))
    $g.FillPath($shadowBrush, $shadowPath)
    $shadowBrush.Dispose()
    $shadowPath.Dispose()

    # Device Bezel
    $bezelPath = [Gfx]::Round($deviceX, $deviceY, $deviceW, $deviceH, $cornerRad)
    $bezelBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 241, 245, 249))
    $g.FillPath($bezelBrush, $bezelPath)
    $bezelBrush.Dispose()

    $bezelPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(255, 203, 213, 225), [float](3 * $scale))
    $g.DrawPath($bezelPen, $bezelPath)
    $bezelPen.Dispose()
    $bezelPath.Dispose()

    # App Screen Interior
    $pad = [float](16 * $scale)
    $screenX = $deviceX + $pad
    $screenY = $deviceY + $pad
    $screenW = $deviceW - ($pad * 2)
    $screenH = $deviceH - $pad
    $screenRad = [float](20 * $scale)

    $screenPath = [Gfx]::Round($screenX, $screenY, $screenW, $screenH, $screenRad)
    $screenBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 248, 250, 252))
    $g.FillPath($screenBrush, $screenPath)
    $screenBrush.Dispose()
    $screenPath.Dispose()

    # Top Appbar (Logo + Title + Location Pill)
    $appBarY = $screenY + (14 * $scale)
    $logoSize = [float](42 * $scale)
    $g.DrawImage($logoImg, ($screenX + (24 * $scale)), $appBarY, $logoSize, $logoSize)

    $appNameFont = New-Object System.Drawing.Font("Arial", [float](18 * $scale), [System.Drawing.FontStyle]::Bold)
    $appNameBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 15, 23, 42))
    $g.DrawString("Dactor", $appNameFont, $appNameBrush, [float]($screenX + (74 * $scale)), [float]($appBarY + (3 * $scale)))
    $appNameFont.Dispose()
    $appNameBrush.Dispose()

    $appSubFont = New-Object System.Drawing.Font("Arial", [float](11 * $scale), [System.Drawing.FontStyle]::Regular)
    $appSubBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 100, 116, 139))
    $g.DrawString("Verified Healthcare Nepal", $appSubFont, $appSubBrush, [float]($screenX + (74 * $scale)), [float]($appBarY + (24 * $scale)))
    $appSubFont.Dispose()
    $appSubBrush.Dispose()

    # Location pill
    $locPillX = $screenX + $screenW - (210 * $scale)
    $locPillPath = [Gfx]::Round($locPillX, $appBarY, (186 * $scale), (36 * $scale), (18 * $scale))
    $locPillBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 204, 251, 241))
    $g.FillPath($locPillBrush, $locPillPath)
    $locPillBrush.Dispose()
    $locPillPath.Dispose()

    $locFont = New-Object System.Drawing.Font("Arial", [float](11 * $scale), [System.Drawing.FontStyle]::Bold)
    $locBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 13, 148, 136))
    $g.DrawString("Janakpur, Nepal", $locFont, $locBrush, [float]($locPillX + (18 * $scale)), [float]($appBarY + (10 * $scale)))
    $locFont.Dispose()
    $locBrush.Dispose()

    $contentY = $appBarY + (56 * $scale)

    # ============================================================
    # SCREEN 1: HOME DASHBOARD & OPD BOOKING
    # ============================================================
    if ($screenIndex -eq 1) {
        Draw-BottomNav $g $screenX $screenY $screenW $screenH $scale 0

        # Search Bar
        $searchBoxW = $screenW - (48 * $scale)
        $searchPath = [Gfx]::Round(($screenX + (24 * $scale)), $contentY, $searchBoxW, (46 * $scale), (23 * $scale))
        $searchBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
        $g.FillPath($searchBrush, $searchPath)
        $searchBrush.Dispose()
        $searchPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(255, 203, 213, 225), [float](1.5 * $scale))
        $g.DrawPath($searchPen, $searchPath)
        $searchPen.Dispose()
        $searchPath.Dispose()

        $searchFont = New-Object System.Drawing.Font("Arial", [float](13 * $scale), [System.Drawing.FontStyle]::Regular)
        $searchBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 148, 163, 184))
        $g.DrawString("Search specialty, symptom, doctor, clinic...", $searchFont, $searchBrush, [float]($screenX + (44 * $scale)), [float]($contentY + (13 * $scale)))
        $searchFont.Dispose()
        $searchBrush.Dispose()

        # Status Bar Pill
        $statPillY = $contentY + (56 * $scale)
        $statPillPath = [Gfx]::Round(($screenX + (24 * $scale)), $statPillY, $searchBoxW, (32 * $scale), (10 * $scale))
        $statPillBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 240, 253, 250))
        $g.FillPath($statPillBrush, $statPillPath)
        $statPillBrush.Dispose()
        $statPillPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(255, 153, 246, 228), [float](1 * $scale))
        $g.DrawPath($statPillPen, $statPillPath)
        $statPillPen.Dispose()
        $statPillPath.Dispose()

        $stFont = New-Object System.Drawing.Font("Arial", [float](11 * $scale), [System.Drawing.FontStyle]::Bold)
        $stBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 13, 148, 136))
        $g.DrawString("Janakpur OPDs Open Now: 14 Clinics Active | 42 Doctors Consulting in Cabin", $stFont, $stBrush, [float]($screenX + (40 * $scale)), [float]($statPillY + (8 * $scale)))
        $stFont.Dispose()
        $stBrush.Dispose()

        # Featured Nobel Healthcare Card
        $cardY = $statPillY + (44 * $scale)
        $cardW = $screenW - (48 * $scale)
        $cardH = [float](390 * $scale)
        $cardPath = [Gfx]::Round(($screenX + (24 * $scale)), $cardY, $cardW, $cardH, (18 * $scale))
        $cardBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
        $g.FillPath($cardBrush, $cardPath)
        $cardBrush.Dispose()
        $cardPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(255, 226, 232, 240), [float](1.5 * $scale))
        $g.DrawPath($cardPen, $cardPath)
        $cardPen.Dispose()
        $cardPath.Dispose()

        # Doctor Inside Badge
        $badgeY = $cardY + (16 * $scale)
        $badgePath = [Gfx]::Round(($screenX + (40 * $scale)), $badgeY, ($cardW - (32 * $scale)), (36 * $scale), (10 * $scale))
        $badgeBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 220, 252, 231))
        $g.FillPath($badgeBrush, $badgePath)
        $badgeBrush.Dispose()
        $badgePath.Dispose()

        $badgeFont = New-Object System.Drawing.Font("Arial", [float](11.5 * $scale), [System.Drawing.FontStyle]::Bold)
        $badgeTextBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 21, 128, 61))
        $g.DrawString("Doctor is Physically Inside Clinic Now", $badgeFont, $badgeTextBrush, [float]($screenX + (54 * $scale)), [float]($badgeY + (9 * $scale)))
        $badgeFont.Dispose()
        $badgeTextBrush.Dispose()

        $cNameY = $badgeY + (48 * $scale)
        $cNameFont = New-Object System.Drawing.Font("Arial", [float](22 * $scale), [System.Drawing.FontStyle]::Bold)
        $cNameBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 15, 23, 42))
        $g.DrawString("Nobel Healthcare", $cNameFont, $cNameBrush, [float]($screenX + (40 * $scale)), [float]$cNameY)
        $cNameFont.Dispose()
        $cNameBrush.Dispose()

        $cLocFont = New-Object System.Drawing.Font("Arial", [float](12 * $scale), [System.Drawing.FontStyle]::Regular)
        $cLocBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 100, 116, 139))
        $g.DrawString("Address: PW98+VJ3, Janakpur, Dhanusa, Madhesh Province | Rating: 4.9 / 5.0", $cLocFont, $cLocBrush, [float]($screenX + (40 * $scale)), [float]($cNameY + (30 * $scale)))
        $cLocFont.Dispose()
        $cLocBrush.Dispose()

        $pillsY = $cNameY + (60 * $scale)
        $spec1Path = [Gfx]::Round(($screenX + (40 * $scale)), $pillsY, (190 * $scale), (32 * $scale), (12 * $scale))
        $spec1Brush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 230, 244, 241))
        $g.FillPath($spec1Brush, $spec1Path)
        $spec1Brush.Dispose()
        $spec1Path.Dispose()

        $specFont = New-Object System.Drawing.Font("Arial", [float](11 * $scale), [System.Drawing.FontStyle]::Bold)
        $specBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 0, 121, 107))
        $g.DrawString("Dermatology & Skin Care", $specFont, $specBrush, [float]($screenX + (52 * $scale)), [float]($pillsY + (7 * $scale)))

        $spec2Path = [Gfx]::Round(($screenX + (240 * $scale)), $pillsY, (180 * $scale), (32 * $scale), (12 * $scale))
        $spec2Brush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 230, 244, 241))
        $g.FillPath($spec2Brush, $spec2Path)
        $spec2Brush.Dispose()
        $spec2Path.Dispose()
        $g.DrawString("Cardiology (Heart Care)", $specFont, $specBrush, [float]($screenX + (252 * $scale)), [float]($pillsY + (7 * $scale)))
        $specFont.Dispose()
        $specBrush.Dispose()

        $docY = $pillsY + (46 * $scale)
        $docTitleFont = New-Object System.Drawing.Font("Arial", [float](11 * $scale), [System.Drawing.FontStyle]::Bold)
        $docTitleBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 100, 116, 139))
        $g.DrawString("CONSULTING DOCTOR", $docTitleFont, $docTitleBrush, [float]($screenX + (40 * $scale)), [float]$docY)
        $docTitleFont.Dispose()
        $docTitleBrush.Dispose()

        $docNameFont = New-Object System.Drawing.Font("Arial", [float](16.5 * $scale), [System.Drawing.FontStyle]::Bold)
        $docNameBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 15, 23, 42))
        $g.DrawString("Dr. Ankit Jha - Cardiologist (MBBS, MD)", $docNameFont, $docNameBrush, [float]($screenX + (40 * $scale)), [float]($docY + (18 * $scale)))
        $docNameFont.Dispose()
        $docNameBrush.Dispose()

        $qY = $docY + (54 * $scale)
        $qFont = New-Object System.Drawing.Font("Arial", [float](12.5 * $scale), [System.Drawing.FontStyle]::Bold)
        $qBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 217, 119, 6))
        $g.DrawString("Waiting Queue: 3 Patients Ahead", $qFont, $qBrush, [float]($screenX + (40 * $scale)), [float]$qY)
        $qFont.Dispose()
        $qBrush.Dispose()

        $feeFont = New-Object System.Drawing.Font("Arial", [float](12.5 * $scale), [System.Drawing.FontStyle]::Bold)
        $feeBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 15, 23, 42))
        $g.DrawString("Consultation Fee: Rs. 500 (Pay at Desk or eSewa)", $feeFont, $feeBrush, [float]($screenX + (40 * $scale)), [float]($qY + (22 * $scale)))
        $feeFont.Dispose()
        $feeBrush.Dispose()

        $btnY = $cardY + $cardH - (58 * $scale)
        $bookBtnPath = [Gfx]::Round(($screenX + (40 * $scale)), $btnY, ($cardW - (32 * $scale)), (44 * $scale), (12 * $scale))
        $bookBtnBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 0, 121, 107))
        $g.FillPath($bookBtnBrush, $bookBtnPath)
        $bookBtnBrush.Dispose()
        $bookBtnPath.Dispose()

        $btnFont = New-Object System.Drawing.Font("Arial", [float](13.5 * $scale), [System.Drawing.FontStyle]::Bold)
        $btnBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
        $btnRect = New-Object System.Drawing.RectangleF([float]($screenX + (40 * $scale)), [float]$btnY, [float]($cardW - (32 * $scale)), [float](44 * $scale))
        $g.DrawString("Book OPD Appointment", $btnFont, $btnBrush, $btnRect, $centerFormat)
        $btnFont.Dispose()
        $btnBrush.Dispose()

        # Active Queue Tracker Banner
        $trackY = $cardY + $cardH + (16 * $scale)
        $trackH = [float](140 * $scale)
        $trackPath = [Gfx]::Round(($screenX + (24 * $scale)), $trackY, $cardW, $trackH, (16 * $scale))
        $trackBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 240, 253, 250))
        $g.FillPath($trackBrush, $trackPath)
        $trackBrush.Dispose()
        $trackPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(255, 153, 246, 228), [float](1.5 * $scale))
        $g.DrawPath($trackPen, $trackPath)
        $trackPen.Dispose()
        $trackPath.Dispose()

        $tBadgeX = $screenX + (44 * $scale)
        $tBadgeY = $trackY + (20 * $scale)
        $tBadgeSize = [float](100 * $scale)
        $tCirclePath = [Gfx]::Round($tBadgeX, $tBadgeY, $tBadgeSize, $tBadgeSize, ($tBadgeSize / 2.0))
        $tCircleBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 0, 121, 107))
        $g.FillPath($tCircleBrush, $tCirclePath)
        $tCircleBrush.Dispose()
        $tCirclePath.Dispose()

        $tNumFont = New-Object System.Drawing.Font("Arial", [float](26 * $scale), [System.Drawing.FontStyle]::Bold)
        $tNumBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
        $tNumRect = New-Object System.Drawing.RectangleF($tBadgeX, [float]($tBadgeY + (14 * $scale)), $tBadgeSize, [float](38 * $scale))
        $g.DrawString("14", $tNumFont, $tNumBrush, $tNumRect, $centerFormat)
        $tNumFont.Dispose()
        $tNumBrush.Dispose()

        $tSubNumFont = New-Object System.Drawing.Font("Arial", [float](9.5 * $scale), [System.Drawing.FontStyle]::Bold)
        $tSubNumBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 204, 251, 241))
        $tSubRect = New-Object System.Drawing.RectangleF($tBadgeX, [float]($tBadgeY + (56 * $scale)), $tBadgeSize, [float](22 * $scale))
        $g.DrawString("YOUR TOKEN", $tSubNumFont, $tSubNumBrush, $tSubRect, $centerFormat)
        $tSubNumFont.Dispose()
        $tSubNumBrush.Dispose()

        $tTextX = $tBadgeX + $tBadgeSize + (22 * $scale)
        $tHeadFont = New-Object System.Drawing.Font("Arial", [float](15 * $scale), [System.Drawing.FontStyle]::Bold)
        $tHeadBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 15, 23, 42))
        $g.DrawString("Nobel Healthcare (Room 102 - Cardiology)", $tHeadFont, $tHeadBrush, [float]$tTextX, [float]($trackY + (20 * $scale)))
        $tHeadFont.Dispose()
        $tHeadBrush.Dispose()

        $tStatusFont = New-Object System.Drawing.Font("Arial", [float](12.5 * $scale), [System.Drawing.FontStyle]::Bold)
        $tStatusBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 13, 148, 136))
        $g.DrawString("Serving Token #11 | Estimated Call in 18 Mins", $tStatusFont, $tStatusBrush, [float]$tTextX, [float]($trackY + (50 * $scale)))
        $tStatusFont.Dispose()
        $tStatusBrush.Dispose()

        $tSubTextFont = New-Object System.Drawing.Font("Arial", [float](11 * $scale), [System.Drawing.FontStyle]::Regular)
        $tSubTextBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 100, 116, 139))
        $g.DrawString("Real-time audio alert & push notification enabled when called.", $tSubTextFont, $tSubTextBrush, [float]$tTextX, [float]($trackY + (76 * $scale)))
        $tSubTextFont.Dispose()
        $tSubTextBrush.Dispose()

        # Section: Explore Specialties
        $secY = $trackY + $trackH + (18 * $scale)
        $secHeadFont = New-Object System.Drawing.Font("Arial", [float](14 * $scale), [System.Drawing.FontStyle]::Bold)
        $secHeadBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 15, 23, 42))
        $g.DrawString("FIND CLINICS BY MEDICAL SPECIALTY", $secHeadFont, $secHeadBrush, [float]($screenX + (28 * $scale)), [float]$secY)
        $secHeadFont.Dispose()
        $secHeadBrush.Dispose()

        $specs = @("Cardiology", "Dermatology", "Pediatrics", "Orthopedics", "General OPD", "Gynecology")
        $specPillW = ($cardW - (50 * $scale)) / 6.0
        for ($i = 0; $i -lt 6; $i++) {
            $spX = ($screenX + (24 * $scale)) + ($i * ($specPillW + (10 * $scale)))
            $spY = $secY + (28 * $scale)
            $spPath = [Gfx]::Round($spX, $spY, $specPillW, (36 * $scale), (10 * $scale))
            $spBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
            $g.FillPath($spBrush, $spPath)
            $spBrush.Dispose()
            $spPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(255, 203, 213, 225), [float](1 * $scale))
            $g.DrawPath($spPen, $spPath)
            $spPen.Dispose()
            $spPath.Dispose()

            $spFont = New-Object System.Drawing.Font("Arial", [float](11 * $scale), [System.Drawing.FontStyle]::Bold)
            $spTextBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 15, 23, 42))
            $spRect = New-Object System.Drawing.RectangleF([float]$spX, [float]$spY, [float]$specPillW, [float](36 * $scale))
            $g.DrawString($specs[$i], $spFont, $spTextBrush, $spRect, $centerFormat)
            $spFont.Dispose()
            $spTextBrush.Dispose()
        }

        # Second Clinic Card (Janakpur City Hospital)
        $c2Y = $secY + (80 * $scale)
        $c2H = [float](180 * $scale)
        $c2Path = [Gfx]::Round(($screenX + (24 * $scale)), $c2Y, $cardW, $c2H, (16 * $scale))
        $c2Brush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
        $g.FillPath($c2Brush, $c2Path)
        $c2Brush.Dispose()
        $c2Pen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(255, 226, 232, 240), [float](1.5 * $scale))
        $g.DrawPath($c2Pen, $c2Path)
        $c2Pen.Dispose()
        $c2Path.Dispose()

        $c2NameFont = New-Object System.Drawing.Font("Arial", [float](17.5 * $scale), [System.Drawing.FontStyle]::Bold)
        $c2NameBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 15, 23, 42))
        $g.DrawString("Janakpur City Hospital & Emergency Center", $c2NameFont, $c2NameBrush, [float]($screenX + (44 * $scale)), [float]($c2Y + (16 * $scale)))
        $c2NameFont.Dispose()
        $c2NameBrush.Dispose()

        $c2AddrFont = New-Object System.Drawing.Font("Arial", [float](12 * $scale), [System.Drawing.FontStyle]::Regular)
        $c2AddrBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 100, 116, 139))
        $g.DrawString("Bhanu Chowk, Janakpur | Rating: 4.8 / 5.0 (180 reviews) | 0.8 km away", $c2AddrFont, $c2AddrBrush, [float]($screenX + (44 * $scale)), [float]($c2Y + (44 * $scale)))
        $c2AddrFont.Dispose()
        $c2AddrBrush.Dispose()

        $c2DocFont = New-Object System.Drawing.Font("Arial", [float](13 * $scale), [System.Drawing.FontStyle]::Bold)
        $c2DocBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 0, 121, 107))
        $g.DrawString("Dr. Priya Sharma (Consultant Dermatologist) | Waiting: 2 Patients Ahead", $c2DocFont, $c2DocBrush, [float]($screenX + (44 * $scale)), [float]($c2Y + (74 * $scale)))
        $c2DocFont.Dispose()
        $c2DocBrush.Dispose()

        $c2BtnY = $c2Y + (116 * $scale)
        $c2BtnW = 190 * $scale
        $c2BtnPath = [Gfx]::Round(($screenX + (44 * $scale)), $c2BtnY, $c2BtnW, (40 * $scale), (10 * $scale))
        $c2BtnBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 0, 121, 107))
        $g.FillPath($c2BtnBrush, $c2BtnPath)
        $c2BtnBrush.Dispose()
        $c2BtnPath.Dispose()

        $c2BtnFont = New-Object System.Drawing.Font("Arial", [float](12 * $scale), [System.Drawing.FontStyle]::Bold)
        $c2BtnTextBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
        $c2BtnRect = New-Object System.Drawing.RectangleF([float]($screenX + (44 * $scale)), [float]$c2BtnY, [float]$c2BtnW, [float](40 * $scale))
        $g.DrawString("Book OPD Token", $c2BtnFont, $c2BtnTextBrush, $c2BtnRect, $centerFormat)
        $c2BtnFont.Dispose()
        $c2BtnTextBrush.Dispose()

        # Quick Health Services Bar
        $srvY = $c2Y + $c2H + (16 * $scale)
        $srvH = [float](120 * $scale)
        $srvPath = [Gfx]::Round(($screenX + (24 * $scale)), $srvY, $cardW, $srvH, (14 * $scale))
        $srvBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
        $g.FillPath($srvBrush, $srvPath)
        $srvBrush.Dispose()
        $srvPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(255, 226, 232, 240), [float](1.5 * $scale))
        $g.DrawPath($srvPen, $srvPath)
        $srvPen.Dispose()
        $srvPath.Dispose()

        $srvHeadFont = New-Object System.Drawing.Font("Arial", [float](13 * $scale), [System.Drawing.FontStyle]::Bold)
        $srvHeadBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 15, 23, 42))
        $g.DrawString("PATIENT HEALTHCARE SERVICES & EMERGENCY CONTACTS", $srvHeadFont, $srvHeadBrush, [float]($screenX + (44 * $scale)), [float]($srvY + (16 * $scale)))
        $srvHeadFont.Dispose()
        $srvHeadBrush.Dispose()

        $srvItems = @("Certified Lab Reports", "Video Consultation", "24/7 Ambulance Service", "Emergency OPD Helpline")
        $srvItemW = ($cardW - (50 * $scale)) / 4.0
        for ($k = 0; $k -lt 4; $k++) {
            $siX = ($screenX + (36 * $scale)) + ($k * ($srvItemW + (8 * $scale)))
            $siY = $srvY + (48 * $scale)
            $siPath = [Gfx]::Round($siX, $siY, $srvItemW, (46 * $scale), (8 * $scale))
            $siBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 248, 250, 252))
            $g.FillPath($siBrush, $siPath)
            $siBrush.Dispose()
            $siPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(255, 226, 232, 240), [float](1 * $scale))
            $g.DrawPath($siPen, $siPath)
            $siPen.Dispose()
            $siPath.Dispose()

            $siFont = New-Object System.Drawing.Font("Arial", [float](10.5 * $scale), [System.Drawing.FontStyle]::Bold)
            $siTextBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 0, 121, 107))
            $siRect = New-Object System.Drawing.RectangleF([float]$siX, [float]$siY, [float]$srvItemW, [float](46 * $scale))
            $g.DrawString($srvItems[$k], $siFont, $siTextBrush, $siRect, $centerFormat)
            $siFont.Dispose()
            $siTextBrush.Dispose()
        }
    }

    # ============================================================
    # SCREEN 2: CLINIC PROFILE & DIRECTIONS
    # ============================================================
    elseif ($screenIndex -eq 2) {
        Draw-BottomNav $g $screenX $screenY $screenW $screenH $scale 1

        $cardW = $screenW - (48 * $scale)
        $cardY = $contentY
        $cardH = [float](360 * $scale)
        $cardPath = [Gfx]::Round(($screenX + (24 * $scale)), $cardY, $cardW, $cardH, (18 * $scale))
        $cardBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
        $g.FillPath($cardBrush, $cardPath)
        $cardBrush.Dispose()
        $cardPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(255, 226, 232, 240), [float](1.5 * $scale))
        $g.DrawPath($cardPen, $cardPath)
        $cardPen.Dispose()
        $cardPath.Dispose()

        $hY = $cardY + (18 * $scale)
        $cNameFont = New-Object System.Drawing.Font("Arial", [float](22 * $scale), [System.Drawing.FontStyle]::Bold)
        $cNameBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 15, 23, 42))
        $g.DrawString("NOBEL HEALTHCARE", $cNameFont, $cNameBrush, [float]($screenX + (40 * $scale)), [float]$hY)
        $cNameFont.Dispose()
        $cNameBrush.Dispose()

        $subHeadFont = New-Object System.Drawing.Font("Arial", [float](12 * $scale), [System.Drawing.FontStyle]::Regular)
        $subHeadBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 100, 116, 139))
        $g.DrawString("Verified Multi-Specialty Clinic | Rating: 4.9 / 5.0 (248 reviews)", $subHeadFont, $subHeadBrush, [float]($screenX + (40 * $scale)), [float]($hY + (28 * $scale)))
        $subHeadFont.Dispose()
        $subHeadBrush.Dispose()

        $callBtnX = $screenX + $cardW - (150 * $scale)
        $callBtnPath = [Gfx]::Round($callBtnX, $hY, (134 * $scale), (42 * $scale), (12 * $scale))
        $callBtnBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 230, 244, 241))
        $g.FillPath($callBtnBrush, $callBtnPath)
        $callBtnBrush.Dispose()
        $callBtnPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(255, 0, 121, 107), [float](1 * $scale))
        $g.DrawPath($callBtnPen, $callBtnPath)
        $callBtnPen.Dispose()
        $callBtnPath.Dispose()

        $callFont = New-Object System.Drawing.Font("Arial", [float](11.5 * $scale), [System.Drawing.FontStyle]::Bold)
        $callBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 0, 121, 107))
        $g.DrawString("Call Clinic", $callFont, $callBrush, [float]($callBtnX + (26 * $scale)), [float]($hY + (12 * $scale)))
        $callFont.Dispose()
        $callBrush.Dispose()

        # Specialty chips (Full unclipped row)
        $pillsY = $hY + (56 * $scale)
        $spec1Path = [Gfx]::Round(($screenX + (40 * $scale)), $pillsY, (190 * $scale), (32 * $scale), (12 * $scale))
        $spec1Brush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 230, 244, 241))
        $g.FillPath($spec1Brush, $spec1Path)
        $spec1Brush.Dispose()
        $spec1Path.Dispose()

        $specFont = New-Object System.Drawing.Font("Arial", [float](11 * $scale), [System.Drawing.FontStyle]::Bold)
        $specBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 0, 121, 107))
        $g.DrawString("Dermatology & Skin Care", $specFont, $specBrush, [float]($screenX + (52 * $scale)), [float]($pillsY + (7 * $scale)))

        $spec2Path = [Gfx]::Round(($screenX + (240 * $scale)), $pillsY, (180 * $scale), (32 * $scale), (12 * $scale))
        $spec2Brush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 230, 244, 241))
        $g.FillPath($spec2Brush, $spec2Path)
        $spec2Brush.Dispose()
        $spec2Path.Dispose()
        $g.DrawString("Cardiology (Heart Care)", $specFont, $specBrush, [float]($screenX + (252 * $scale)), [float]($pillsY + (7 * $scale)))

        $spec3Path = [Gfx]::Round(($screenX + (430 * $scale)), $pillsY, (130 * $scale), (32 * $scale), (12 * $scale))
        $spec3Brush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 230, 244, 241))
        $g.FillPath($spec3Brush, $spec3Path)
        $spec3Brush.Dispose()
        $spec3Path.Dispose()
        $g.DrawString("General OPD", $specFont, $specBrush, [float]($screenX + (444 * $scale)), [float]($pillsY + (7 * $scale)))
        $specFont.Dispose()
        $specBrush.Dispose()

        # Contact & Location box
        $infoBoxY = $pillsY + (46 * $scale)
        $infoBoxW = $cardW - (32 * $scale)
        $infoBoxH = [float](176 * $scale)
        $infoBoxPath = [Gfx]::Round(($screenX + (40 * $scale)), $infoBoxY, $infoBoxW, $infoBoxH, (14 * $scale))
        $infoBoxBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 248, 250, 252))
        $g.FillPath($infoBoxBrush, $infoBoxPath)
        $infoBoxBrush.Dispose()
        $infoBoxPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(255, 226, 232, 240), [float](1 * $scale))
        $g.DrawPath($infoBoxPen, $infoBoxPath)
        $infoBoxPen.Dispose()
        $infoBoxPath.Dispose()

        $contactHeadFont = New-Object System.Drawing.Font("Arial", [float](13 * $scale), [System.Drawing.FontStyle]::Bold)
        $contactHeadBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 15, 23, 42))
        $g.DrawString("Contact & Location Details", $contactHeadFont, $contactHeadBrush, [float]($screenX + (56 * $scale)), [float]($infoBoxY + (16 * $scale)))
        $contactHeadFont.Dispose()
        $contactHeadBrush.Dispose()

        $addrY = $infoBoxY + (46 * $scale)
        $addrFont = New-Object System.Drawing.Font("Arial", [float](12.5 * $scale), [System.Drawing.FontStyle]::Regular)
        $addrBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 51, 65, 85))
        $g.DrawString("PW98+VJ3, Janakpur, Dhanusa, Madhesh Province", $addrFont, $addrBrush, [float]($screenX + (56 * $scale)), [float]$addrY)
        $addrFont.Dispose()
        $addrBrush.Dispose()

        # Get Directions Pill
        $dirBtnX = $screenX + $infoBoxW - (134 * $scale)
        $dirBtnY = $addrY - (4 * $scale)
        $dirBtnPath = [Gfx]::Round($dirBtnX, $dirBtnY, (140 * $scale), (36 * $scale), (10 * $scale))
        $dirBtnBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 230, 244, 241))
        $g.FillPath($dirBtnBrush, $dirBtnPath)
        $dirBtnBrush.Dispose()
        $dirBtnPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(255, 0, 121, 107), [float](1 * $scale))
        $g.DrawPath($dirBtnPen, $dirBtnPath)
        $dirBtnPen.Dispose()
        $dirBtnPath.Dispose()

        $dirFont = New-Object System.Drawing.Font("Arial", [float](11.5 * $scale), [System.Drawing.FontStyle]::Bold)
        $dirBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 0, 121, 107))
        $g.DrawString("Get Directions", $dirFont, $dirBrush, [float]($dirBtnX + (18 * $scale)), [float]($dirBtnY + (9 * $scale)))
        $dirFont.Dispose()
        $dirBrush.Dispose()

        $mapY = $infoBoxY + (94 * $scale)
        $mapW = $infoBoxW - (32 * $scale)
        $mapH = [float](62 * $scale)
        $mapPath = [Gfx]::Round(($screenX + (56 * $scale)), $mapY, $mapW, $mapH, (8 * $scale))
        $mapBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 224, 242, 254))
        $g.FillPath($mapBrush, $mapPath)
        $mapBrush.Dispose()
        $mapPath.Dispose()

        $mapFont = New-Object System.Drawing.Font("Arial", [float](11.5 * $scale), [System.Drawing.FontStyle]::Bold)
        $mapBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 3, 105, 161))
        $g.DrawString("Live MapLibre & OpenStreetMap Interactive Navigation (1.2 km away)", $mapFont, $mapBrush, [float]($screenX + (74 * $scale)), [float]($mapY + (20 * $scale)))
        $mapFont.Dispose()
        $mapBrush.Dispose()

        # Section: Available Specialists Today
        $docSecY = $cardY + $cardH + (18 * $scale)
        $docSecFont = New-Object System.Drawing.Font("Arial", [float](14 * $scale), [System.Drawing.FontStyle]::Bold)
        $docSecBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 15, 23, 42))
        $g.DrawString("AVAILABLE CONSULTING DOCTORS TODAY", $docSecFont, $docSecBrush, [float]($screenX + (28 * $scale)), [float]$docSecY)
        $docSecFont.Dispose()
        $docSecBrush.Dispose()

        $dBtnFont = New-Object System.Drawing.Font("Arial", [float](12 * $scale), [System.Drawing.FontStyle]::Bold)
        $dBtnTextBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)

        # Doctor Card 1: Dr. Ankit Jha
        $d1Y = $docSecY + (28 * $scale)
        $d1H = [float](130 * $scale)
        $d1Path = [Gfx]::Round(($screenX + (24 * $scale)), $d1Y, $cardW, $d1H, (14 * $scale))
        $d1Brush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
        $g.FillPath($d1Brush, $d1Path)
        $d1Brush.Dispose()
        $d1Pen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(255, 226, 232, 240), [float](1.5 * $scale))
        $g.DrawPath($d1Pen, $d1Path)
        $d1Pen.Dispose()
        $d1Path.Dispose()

        $dNameFont = New-Object System.Drawing.Font("Arial", [float](16 * $scale), [System.Drawing.FontStyle]::Bold)
        $dNameBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 15, 23, 42))
        $g.DrawString("Dr. Ankit Jha - Senior Cardiologist (MBBS, MD)", $dNameFont, $dNameBrush, [float]($screenX + (44 * $scale)), [float]($d1Y + (16 * $scale)))
        $dNameFont.Dispose()
        $dNameBrush.Dispose()

        $dStatFont = New-Object System.Drawing.Font("Arial", [float](12 * $scale), [System.Drawing.FontStyle]::Bold)
        $dStatBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 21, 128, 61))
        $g.DrawString("Room 102 | Currently in Cabin | Next Token: #15 | OPD Fee: Rs. 500", $dStatFont, $dStatBrush, [float]($screenX + (44 * $scale)), [float]($d1Y + (44 * $scale)))
        $dStatFont.Dispose()
        $dStatBrush.Dispose()

        $d1BtnX = $screenX + $cardW - (170 * $scale)
        $d1BtnY = $d1Y + (72 * $scale)
        $d1BtnPath = [Gfx]::Round($d1BtnX, $d1BtnY, (150 * $scale), (40 * $scale), (10 * $scale))
        $d1BtnBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 0, 121, 107))
        $g.FillPath($d1BtnBrush, $d1BtnPath)
        $d1Brush.Dispose()
        $d1BtnPath.Dispose()

        $d1BtnRect = New-Object System.Drawing.RectangleF([float]$d1BtnX, [float]$d1BtnY, [float](150 * $scale), [float](40 * $scale))
        $g.DrawString("Book Token", $dBtnFont, $dBtnTextBrush, $d1BtnRect, $centerFormat)

        # Doctor Card 2: Dr. Priya Sharma
        $d2Y = $d1Y + $d1H + (14 * $scale)
        $d2Path = [Gfx]::Round(($screenX + (24 * $scale)), $d2Y, $cardW, $d1H, (14 * $scale))
        $d2Brush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
        $g.FillPath($d2Brush, $d2Path)
        $d2Brush.Dispose()
        $d2Pen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(255, 226, 232, 240), [float](1.5 * $scale))
        $g.DrawPath($d2Pen, $d2Path)
        $d2Pen.Dispose()
        $d2Path.Dispose()

        $d2NameFont = New-Object System.Drawing.Font("Arial", [float](16 * $scale), [System.Drawing.FontStyle]::Bold)
        $d2NameBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 15, 23, 42))
        $g.DrawString("Dr. Priya Sharma - Consultant Dermatologist (MD)", $d2NameFont, $d2NameBrush, [float]($screenX + (44 * $scale)), [float]($d2Y + (16 * $scale)))
        $d2NameFont.Dispose()
        $d2NameBrush.Dispose()

        $d2StatFont = New-Object System.Drawing.Font("Arial", [float](12 * $scale), [System.Drawing.FontStyle]::Bold)
        $d2StatBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 217, 119, 6))
        $g.DrawString("Room 105 | Starts at 2:00 PM | Pre-Booking Open | OPD Fee: Rs. 600", $d2StatFont, $d2StatBrush, [float]($screenX + (44 * $scale)), [float]($d2Y + (44 * $scale)))
        $d2StatFont.Dispose()
        $d2StatBrush.Dispose()

        $d2BtnY = $d2Y + (72 * $scale)
        $d2BtnPath = [Gfx]::Round($d1BtnX, $d2BtnY, (150 * $scale), (40 * $scale), (10 * $scale))
        $d2BtnBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 0, 121, 107))
        $g.FillPath($d2BtnBrush, $d2BtnPath)
        $d2BtnBrush.Dispose()
        $d2BtnPath.Dispose()

        $d2BtnRect = New-Object System.Drawing.RectangleF([float]$d1BtnX, [float]$d2BtnY, [float](150 * $scale), [float](40 * $scale))
        $g.DrawString("Pre-Book", $dBtnFont, $dBtnTextBrush, $d2BtnRect, $centerFormat)

        # Doctor Card 3: Dr. Rajesh Kumar Yadav
        $d3Y = $d2Y + $d1H + (14 * $scale)
        $d3Path = [Gfx]::Round(($screenX + (24 * $scale)), $d3Y, $cardW, $d1H, (14 * $scale))
        $d3Brush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
        $g.FillPath($d3Brush, $d3Path)
        $d3Brush.Dispose()
        $d3Pen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(255, 226, 232, 240), [float](1.5 * $scale))
        $g.DrawPath($d3Pen, $d3Path)
        $d3Pen.Dispose()
        $d3Path.Dispose()

        $d3NameFont = New-Object System.Drawing.Font("Arial", [float](16 * $scale), [System.Drawing.FontStyle]::Bold)
        $d3NameBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 15, 23, 42))
        $g.DrawString("Dr. Rajesh Kumar Yadav - General OPD & Internal Medicine", $d3NameFont, $d3NameBrush, [float]($screenX + (44 * $scale)), [float]($d3Y + (16 * $scale)))
        $d3NameFont.Dispose()
        $d3NameBrush.Dispose()

        $d3StatFont = New-Object System.Drawing.Font("Arial", [float](12 * $scale), [System.Drawing.FontStyle]::Bold)
        $d3StatBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 21, 128, 61))
        $g.DrawString("Room 101 | Available Now | Queue: 1 Patient Ahead | OPD Fee: Rs. 400", $d3StatFont, $d3StatBrush, [float]($screenX + (44 * $scale)), [float]($d3Y + (44 * $scale)))
        $d3StatFont.Dispose()
        $d3StatBrush.Dispose()

        $d3BtnY = $d3Y + (72 * $scale)
        $d3BtnPath = [Gfx]::Round($d1BtnX, $d3BtnY, (150 * $scale), (40 * $scale), (10 * $scale))
        $d3BtnBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 0, 121, 107))
        $g.FillPath($d3BtnBrush, $d3BtnPath)
        $d3BtnBrush.Dispose()
        $d3BtnPath.Dispose()

        $d3BtnRect = New-Object System.Drawing.RectangleF([float]$d1BtnX, [float]$d3BtnY, [float](150 * $scale), [float](40 * $scale))
        $g.DrawString("Book Token", $dBtnFont, $dBtnTextBrush, $d3BtnRect, $centerFormat)

        $dBtnFont.Dispose()
        $dBtnTextBrush.Dispose()

        # Section: Clinic Amenities
        $amenY = $d3Y + $d1H + (18 * $scale)
        $amenH = [float](110 * $scale)
        $amenPath = [Gfx]::Round(($screenX + (24 * $scale)), $amenY, $cardW, $amenH, (14 * $scale))
        $amenBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
        $g.FillPath($amenBrush, $amenPath)
        $amenBrush.Dispose()
        $amenPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(255, 226, 232, 240), [float](1.5 * $scale))
        $g.DrawPath($amenPen, $amenPath)
        $amenPen.Dispose()
        $amenPath.Dispose()

        $amenHeadFont = New-Object System.Drawing.Font("Arial", [float](13 * $scale), [System.Drawing.FontStyle]::Bold)
        $amenHeadBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 15, 23, 42))
        $g.DrawString("CLINIC AMENITIES & DIAGNOSTIC SERVICES", $amenHeadFont, $amenHeadBrush, [float]($screenX + (44 * $scale)), [float]($amenY + (16 * $scale)))
        $amenHeadFont.Dispose()
        $amenHeadBrush.Dispose()

        $amenItems = @("24/7 Counter Pharmacy", "Digital Ultrasound & X-Ray", "Certified Pathology Lab", "eSewa & Fonepay Cashless")
        $amenItemW = ($cardW - (50 * $scale)) / 4.0
        for ($m = 0; $m -lt 4; $m++) {
            $amX = ($screenX + (36 * $scale)) + ($m * ($amenItemW + (8 * $scale)))
            $amY = $amenY + (46 * $scale)
            $amPath = [Gfx]::Round($amX, $amY, $amenItemW, (44 * $scale), (8 * $scale))
            $amBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 248, 250, 252))
            $g.FillPath($amBrush, $amPath)
            $amBrush.Dispose()
            $amPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(255, 226, 232, 240), [float](1 * $scale))
            $g.DrawPath($amPen, $amPath)
            $amPen.Dispose()
            $amPath.Dispose()

            $amFont = New-Object System.Drawing.Font("Arial", [float](10.5 * $scale), [System.Drawing.FontStyle]::Bold)
            $amTextBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 0, 121, 107))
            $amRect = New-Object System.Drawing.RectangleF([float]$amX, [float]$amY, [float]$amenItemW, [float](44 * $scale))
            $g.DrawString($amenItems[$m], $amFont, $amTextBrush, $amRect, $centerFormat)
            $amFont.Dispose()
            $amTextBrush.Dispose()
        }
    }

    # ============================================================
    # SCREEN 3: REAL-TIME LIVE QUEUE TRACKER
    # ============================================================
    elseif ($screenIndex -eq 3) {
        Draw-BottomNav $g $screenX $screenY $screenW $screenH $scale 2

        $cardW = $screenW - (48 * $scale)
        $cardY = $contentY
        $cardH = [float](450 * $scale)
        $cardPath = [Gfx]::Round(($screenX + (24 * $scale)), $cardY, $cardW, $cardH, (18 * $scale))
        $cardBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
        $g.FillPath($cardBrush, $cardPath)
        $cardBrush.Dispose()
        $cardPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(255, 226, 232, 240), [float](1.5 * $scale))
        $g.DrawPath($cardPen, $cardPath)
        $cardPen.Dispose()
        $cardPath.Dispose()

        $headY = $cardY + (18 * $scale)
        $trackTitleFont = New-Object System.Drawing.Font("Arial", [float](13 * $scale), [System.Drawing.FontStyle]::Bold)
        $trackTitleBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 0, 121, 107))
        $g.DrawString("LIVE OPD QUEUE MONITOR", $trackTitleFont, $trackTitleBrush, [float]($screenX + (44 * $scale)), [float]$headY)
        $trackTitleFont.Dispose()
        $trackTitleBrush.Dispose()

        $clinicFont = New-Object System.Drawing.Font("Arial", [float](20 * $scale), [System.Drawing.FontStyle]::Bold)
        $clinicBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 15, 23, 42))
        $g.DrawString("Nobel Healthcare - Room 102 (Cardiology)", $clinicFont, $clinicBrush, [float]($screenX + (44 * $scale)), [float]($headY + (24 * $scale)))
        $clinicFont.Dispose()
        $clinicBrush.Dispose()

        $circleY = $headY + (68 * $scale)
        $circleSize = [float](130 * $scale)
        $circleX = $screenX + [float](($screenW - $circleSize) / 2.0)

        $outerCirclePen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(255, 204, 251, 241), [float](8 * $scale))
        $g.DrawEllipse($outerCirclePen, $circleX, $circleY, $circleSize, $circleSize)
        $outerCirclePen.Dispose()

        $innerCircleBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 0, 121, 107))
        $g.FillEllipse($innerCircleBrush, ($circleX + (10 * $scale)), ($circleY + (10 * $scale)), ($circleSize - (20 * $scale)), ($circleSize - (20 * $scale)))
        $innerCircleBrush.Dispose()

        $tokenNumFont = New-Object System.Drawing.Font("Arial", [float](32 * $scale), [System.Drawing.FontStyle]::Bold)
        $tokenNumBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
        $tokenRect = New-Object System.Drawing.RectangleF([float]$circleX, [float]($circleY + (22 * $scale)), [float]$circleSize, [float](46 * $scale))
        $g.DrawString("14", $tokenNumFont, $tokenNumBrush, $tokenRect, $centerFormat)
        $tokenNumFont.Dispose()
        $tokenNumBrush.Dispose()

        $tokenLabelFont = New-Object System.Drawing.Font("Arial", [float](10.5 * $scale), [System.Drawing.FontStyle]::Bold)
        $tokenLabelBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 204, 251, 241))
        $tokenLblRect = New-Object System.Drawing.RectangleF([float]$circleX, [float]($circleY + (72 * $scale)), [float]$circleSize, [float](28 * $scale))
        $g.DrawString("YOUR TOKEN", $tokenLabelFont, $tokenLabelBrush, $tokenLblRect, $centerFormat)
        $tokenLabelFont.Dispose()
        $tokenLabelBrush.Dispose()

        $statY = $circleY + $circleSize + (18 * $scale)
        $statFont = New-Object System.Drawing.Font("Arial", [float](15.5 * $scale), [System.Drawing.FontStyle]::Bold)
        $statBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 15, 23, 42))
        $statRect = New-Object System.Drawing.RectangleF([float]($screenX + (40 * $scale)), [float]$statY, [float]($cardW - (32 * $scale)), [float](30 * $scale))
        $g.DrawString("Now Serving: Token #11 (Dr. Ankit Jha Cabin)", $statFont, $statBrush, $statRect, $centerFormat)
        $statFont.Dispose()
        $statBrush.Dispose()

        $subStatFont = New-Object System.Drawing.Font("Arial", [float](13 * $scale), [System.Drawing.FontStyle]::Bold)
        $subStatBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 217, 119, 6))
        $subStatRect = New-Object System.Drawing.RectangleF([float]($screenX + (40 * $scale)), [float]($statY + (28 * $scale)), [float]($cardW - (32 * $scale)), [float](28 * $scale))
        $g.DrawString("3 Patients Ahead - Estimated Call in 18 Mins", $subStatFont, $subStatBrush, $subStatRect, $centerFormat)
        $subStatFont.Dispose()
        $subStatBrush.Dispose()

        $stepY = $statY + (68 * $scale)
        $stepW = $cardW - (60 * $scale)
        $stepX = $screenX + (54 * $scale)

        $linePen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(255, 0, 121, 107), [float](4 * $scale))
        $g.DrawLine($linePen, $stepX, ($stepY + (10 * $scale)), ($stepX + $stepW), ($stepY + (10 * $scale)))
        $linePen.Dispose()

        $stepFont = New-Object System.Drawing.Font("Arial", [float](11.5 * $scale), [System.Drawing.FontStyle]::Bold)
        $stepBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 0, 121, 107))
        $g.DrawString("1. Waiting", $stepFont, $stepBrush, [float]$stepX, [float]($stepY + (22 * $scale)))
        $g.DrawString("2. Up Next (Token 13)", $stepFont, $stepBrush, [float]($stepX + ($stepW / 2.0) - (50 * $scale)), [float]($stepY + (22 * $scale)))
        $g.DrawString("3. In Cabin (Token 14)", $stepFont, $stepBrush, [float]($stepX + $stepW - (90 * $scale)), [float]($stepY + (22 * $scale)))
        $stepFont.Dispose()
        $stepBrush.Dispose()

        # Real-Time Queue Order Table
        $tblY = $cardY + $cardH + (18 * $scale)
        $tblH = [float](350 * $scale)
        $tblPath = [Gfx]::Round(($screenX + (24 * $scale)), $tblY, $cardW, $tblH, (16 * $scale))
        $tblBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
        $g.FillPath($tblBrush, $tblPath)
        $tblBrush.Dispose()
        $tblPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(255, 226, 232, 240), [float](1.5 * $scale))
        $g.DrawPath($tblPen, $tblPath)
        $tblPen.Dispose()
        $tblPath.Dispose()

        $tblHeadFont = New-Object System.Drawing.Font("Arial", [float](14 * $scale), [System.Drawing.FontStyle]::Bold)
        $tblHeadBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 15, 23, 42))
        $g.DrawString("REAL-TIME OPD CABIN QUEUE STATUS", $tblHeadFont, $tblHeadBrush, [float]($screenX + (44 * $scale)), [float]($tblY + (16 * $scale)))
        $tblHeadFont.Dispose()
        $tblHeadBrush.Dispose()

        $rows = @(
            @{ Token = "Token #11"; Status = "Currently Inside Doctor Cabin (Consultation In Progress)"; Badge = "IN CABIN"; Color = [System.Drawing.Color]::FromArgb(255, 21, 128, 61); Bg = [System.Drawing.Color]::FromArgb(255, 220, 252, 231) },
            @{ Token = "Token #12"; Status = "Waiting in Lobby | Arrived & Checked In at Reception"; Badge = "WAITING"; Color = [System.Drawing.Color]::FromArgb(255, 100, 116, 139); Bg = [System.Drawing.Color]::FromArgb(255, 241, 245, 249) },
            @{ Token = "Token #13"; Status = "Waiting in Lobby | Please Arrive Near Cabin Door"; Badge = "UP NEXT"; Color = [System.Drawing.Color]::FromArgb(255, 217, 119, 6); Bg = [System.Drawing.Color]::FromArgb(255, 254, 243, 199) },
            @{ Token = "Token #14"; Status = "YOUR TOKEN | Dr. Ankit Jha Room 102 | Estimated in 18 Mins"; Badge = "YOUR TURN"; Color = [System.Drawing.Color]::FromArgb(255, 0, 121, 107); Bg = [System.Drawing.Color]::FromArgb(255, 204, 251, 241) },
            @{ Token = "Token #15"; Status = "Confirmed OPD Appointment | Arriving at Clinic"; Badge = "SCHEDULED"; Color = [System.Drawing.Color]::FromArgb(255, 100, 116, 139); Bg = [System.Drawing.Color]::FromArgb(255, 241, 245, 249) }
        )

        $rowStartY = $tblY + (48 * $scale)
        $rowH = 58 * $scale
        for ($r = 0; $r -lt 5; $r++) {
            $currY = $rowStartY + ($r * $rowH)
            $isYourTurn = ($r -eq 3)

            if ($isYourTurn) {
                $hlPath = [Gfx]::Round(($screenX + (36 * $scale)), $currY, ($cardW - (24 * $scale)), (52 * $scale), (10 * $scale))
                $hlBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 240, 253, 250))
                $g.FillPath($hlBrush, $hlPath)
                $hlBrush.Dispose()
                $hlPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(255, 13, 148, 136), [float](1.5 * $scale))
                $g.DrawPath($hlPen, $hlPath)
                $hlPen.Dispose()
                $hlPath.Dispose()
            }

            $tNameFont = New-Object System.Drawing.Font("Arial", [float](13.5 * $scale), [System.Drawing.FontStyle]::Bold)
            $tNameBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 15, 23, 42))
            $g.DrawString($rows[$r].Token, $tNameFont, $tNameBrush, [float]($screenX + (48 * $scale)), [float]($currY + (8 * $scale)))
            $tNameFont.Dispose()
            $tNameBrush.Dispose()

            $tStatFont = New-Object System.Drawing.Font("Arial", [float](11 * $scale), [System.Drawing.FontStyle]::Regular)
            $tStatBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 100, 116, 139))
            $g.DrawString($rows[$r].Status, $tStatFont, $tStatBrush, [float]($screenX + (48 * $scale)), [float]($currY + (28 * $scale)))
            $tStatFont.Dispose()
            $tStatBrush.Dispose()

            # Status Badge Pill
            $bW = 92 * $scale
            $bX = $screenX + $cardW - $bW - (20 * $scale)
            $bY = $currY + (12 * $scale)
            $bPath = [Gfx]::Round($bX, $bY, $bW, (26 * $scale), (8 * $scale))
            $bBrush = New-Object System.Drawing.SolidBrush($rows[$r].Bg)
            $g.FillPath($bBrush, $bPath)
            $bBrush.Dispose()
            $bPath.Dispose()

            $bFont = New-Object System.Drawing.Font("Arial", [float](9.5 * $scale), [System.Drawing.FontStyle]::Bold)
            $bTextBrush = New-Object System.Drawing.SolidBrush($rows[$r].Color)
            $bRect = New-Object System.Drawing.RectangleF([float]$bX, [float]$bY, [float]$bW, [float](26 * $scale))
            $g.DrawString($rows[$r].Badge, $bFont, $bTextBrush, $bRect, $centerFormat)
            $bFont.Dispose()
            $bTextBrush.Dispose()
        }

        # Notification Info Card
        $infoCardY = $tblY + $tblH + (16 * $scale)
        $infoCardH = [float](105 * $scale)
        $infoCardPath = [Gfx]::Round(($screenX + (24 * $scale)), $infoCardY, $cardW, $infoCardH, (14 * $scale))
        $infoCardBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 248, 250, 252))
        $g.FillPath($infoCardBrush, $infoCardPath)
        $infoCardBrush.Dispose()
        $infoCardPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(255, 226, 232, 240), [float](1 * $scale))
        $g.DrawPath($infoCardPen, $infoCardPath)
        $infoCardPen.Dispose()
        $infoCardPath.Dispose()

        $ntFont = New-Object System.Drawing.Font("Arial", [float](12.5 * $scale), [System.Drawing.FontStyle]::Bold)
        $ntBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 0, 121, 107))
        $g.DrawString("Real-Time Turn Notifications & Smart Audio Alerts", $ntFont, $ntBrush, [float]($screenX + (44 * $scale)), [float]($infoCardY + (16 * $scale)))
        $ntFont.Dispose()
        $ntBrush.Dispose()

        $ntSubFont = New-Object System.Drawing.Font("Arial", [float](11 * $scale), [System.Drawing.FontStyle]::Regular)
        $ntSubBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 100, 116, 139))
        $g.DrawString("Your phone will receive an instant chime & SMS alert when Token #12 enters the doctor cabin.`nYou can arrive exactly on time without waiting in the crowded clinic lobby.", $ntSubFont, $ntSubBrush, [float]($screenX + (44 * $scale)), [float]($infoCardY + (42 * $scale)))
        $ntSubFont.Dispose()
        $ntSubBrush.Dispose()
    }

    # ============================================================
    # SCREEN 4: CERTIFIED LAB REPORTS & COUNTER BILLING
    # ============================================================
    elseif ($screenIndex -eq 4) {
        Draw-BottomNav $g $screenX $screenY $screenW $screenH $scale 3

        $cardW = $screenW - (48 * $scale)
        $cardY = $contentY
        $cardH = [float](115 * $scale)
        $cardPath = [Gfx]::Round(($screenX + (24 * $scale)), $cardY, $cardW, $cardH, (16 * $scale))
        $cardBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
        $g.FillPath($cardBrush, $cardPath)
        $cardBrush.Dispose()
        $cardPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(255, 226, 232, 240), [float](1.5 * $scale))
        $g.DrawPath($cardPen, $cardPath)
        $cardPen.Dispose()
        $cardPath.Dispose()

        $recHeadY = $cardY + (18 * $scale)
        $recTitleFont = New-Object System.Drawing.Font("Arial", [float](12.5 * $scale), [System.Drawing.FontStyle]::Bold)
        $recTitleBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 0, 121, 107))
        $g.DrawString("SECURE DIAGNOSTIC HEALTH RECORDS", $recTitleFont, $recTitleBrush, [float]($screenX + (44 * $scale)), [float]$recHeadY)
        $recTitleFont.Dispose()
        $recTitleBrush.Dispose()

        $recSubFont = New-Object System.Drawing.Font("Arial", [float](18 * $scale), [System.Drawing.FontStyle]::Bold)
        $recSubBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 15, 23, 42))
        $g.DrawString("Verified Patient Lab Reports & OPD Receipts", $recSubFont, $recSubBrush, [float]($screenX + (44 * $scale)), [float]($recHeadY + (22 * $scale)))
        $recSubFont.Dispose()
        $recSubBrush.Dispose()

        $recNoteFont = New-Object System.Drawing.Font("Arial", [float](11 * $scale), [System.Drawing.FontStyle]::Regular)
        $recNoteBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 100, 116, 139))
        $g.DrawString("Stage 1: Sample Collected -> Stage 2: Analyzed in Lab -> Stage 3: Official Certified PDF Delivery", $recNoteFont, $recNoteBrush, [float]($screenX + (44 * $scale)), [float]($recHeadY + (50 * $scale)))
        $recNoteFont.Dispose()
        $recNoteBrush.Dispose()

        # Vitals Overview Box
        $vitY = $cardY + $cardH + (14 * $scale)
        $vitH = [float](75 * $scale)
        $vitPath = [Gfx]::Round(($screenX + (24 * $scale)), $vitY, $cardW, $vitH, (14 * $scale))
        $vitBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 240, 253, 250))
        $g.FillPath($vitBrush, $vitPath)
        $vitBrush.Dispose()
        $vitPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(255, 153, 246, 228), [float](1.5 * $scale))
        $g.DrawPath($vitPen, $vitPath)
        $vitPen.Dispose()
        $vitPath.Dispose()

        $vitals = @("BP: 120/80 mmHg (Normal)", "Heart Rate: 72 bpm (Resting)", "Blood Sugar: 95 mg/dL (Fasting)", "Oxygen: 99% SpO2 (Healthy)")
        $vitItemW = $cardW / 4.0
        for ($v = 0; $v -lt 4; $v++) {
            $vx = ($screenX + (24 * $scale)) + ($v * $vitItemW)
            $vFont = New-Object System.Drawing.Font("Arial", [float](11 * $scale), [System.Drawing.FontStyle]::Bold)
            $vBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 13, 148, 136))
            $vRect = New-Object System.Drawing.RectangleF([float]$vx, [float]($vitY + (24 * $scale)), [float]$vitItemW, [float](30 * $scale))
            $g.DrawString($vitals[$v], $vFont, $vBrush, $vRect, $centerFormat)
            $vFont.Dispose()
            $vBrush.Dispose()
        }

        # Reports list
        $reports = @(
            @{ Title = "Complete Blood Count (CBC) with ESR"; Lab = "Nobel Diagnostic Laboratory | Dr. S. Shrestha (Pathologist)"; Status = "Stage 3: Verified Lab Report (Digitally Signed PDF Ready)"; Action = "Signed PDF" },
            @{ Title = "Comprehensive Lipid & Cholesterol Profile"; Lab = "Nobel Diagnostic Center | Chief Biochemist Approved"; Status = "Stage 3: Certified Diagnostic Report Ready for Review"; Action = "Signed PDF" },
            @{ Title = "Thyroid Function Panel (TSH, Free T3, Free T4)"; Lab = "Nobel Diagnostic Center | Lab Director Approved"; Status = "Stage 3: Signed Laboratory Certificate (Normal Limits)"; Action = "Signed PDF" },
            @{ Title = "Digital OPD Consultation Receipt & Rx"; Lab = "Nobel Healthcare | Dr. Ankit Jha (Cardiologist)"; Status = "Paid: Rs. 500 via eSewa | Official Clinic Invoice #NH-9481"; Action = "View Receipt" },
            @{ Title = "Digital Chest X-Ray (PA View) Report"; Lab = "Nobel Imaging & Radiology | Verified Radiologist"; Status = "Stage 3: Certified Radiology DICOM & PDF Delivery"; Action = "View Report" }
        )

        $repStartY = $vitY + $vitH + (16 * $scale)
        $repH = 115 * $scale
        $dlFont = New-Object System.Drawing.Font("Arial", [float](11.5 * $scale), [System.Drawing.FontStyle]::Bold)
        $dlTextBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)

        for ($idx = 0; $idx -lt 5; $idx++) {
            $rY = $repStartY + ($idx * ($repH + (12 * $scale)))
            $rPath = [Gfx]::Round(($screenX + (24 * $scale)), $rY, $cardW, $repH, (14 * $scale))
            $rBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
            $g.FillPath($rBrush, $rPath)
            $rBrush.Dispose()
            $rPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(255, 226, 232, 240), [float](1.5 * $scale))
            $g.DrawPath($rPen, $rPath)
            $rPen.Dispose()
            $rPath.Dispose()

            $rNameFont = New-Object System.Drawing.Font("Arial", [float](15 * $scale), [System.Drawing.FontStyle]::Bold)
            $rNameBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 15, 23, 42))
            $g.DrawString($reports[$idx].Title, $rNameFont, $rNameBrush, [float]($screenX + (44 * $scale)), [float]($rY + (14 * $scale)))
            $rNameFont.Dispose()
            $rNameBrush.Dispose()

            $rLabFont = New-Object System.Drawing.Font("Arial", [float](11 * $scale), [System.Drawing.FontStyle]::Regular)
            $rLabBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 100, 116, 139))
            $g.DrawString($reports[$idx].Lab, $rLabFont, $rLabBrush, [float]($screenX + (44 * $scale)), [float]($rY + (38 * $scale)))
            $rLabFont.Dispose()
            $rLabBrush.Dispose()

            $rStatFont = New-Object System.Drawing.Font("Arial", [float](11.5 * $scale), [System.Drawing.FontStyle]::Bold)
            $rStatBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 21, 128, 61))
            $g.DrawString($reports[$idx].Status, $rStatFont, $rStatBrush, [float]($screenX + (44 * $scale)), [float]($rY + (62 * $scale)))
            $rStatFont.Dispose()
            $rStatBrush.Dispose()

            $dlX = $screenX + $cardW - (150 * $scale)
            $dlY = $rY + (36 * $scale)
            $dlPath = [Gfx]::Round($dlX, $dlY, (134 * $scale), (38 * $scale), (10 * $scale))
            $dlBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 0, 121, 107))
            $g.FillPath($dlBrush, $dlPath)
            $dlBrush.Dispose()
            $dlPath.Dispose()

            $dlRect = New-Object System.Drawing.RectangleF([float]$dlX, [float]$dlY, [float](134 * $scale), [float](38 * $scale))
            $g.DrawString($reports[$idx].Action, $dlFont, $dlTextBrush, $dlRect, $centerFormat)
        }

        $dlFont.Dispose()
        $dlTextBrush.Dispose()

        # Security Card Note
        $secNoteY = $repStartY + (5 * ($repH + (12 * $scale))) + (8 * $scale)
        $secNoteH = [float](80 * $scale)
        $secNotePath = [Gfx]::Round(($screenX + (24 * $scale)), $secNoteY, $cardW, $secNoteH, (12 * $scale))
        $secNoteBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 240, 253, 250))
        $g.FillPath($secNoteBrush, $secNotePath)
        $secNoteBrush.Dispose()
        $secNotePen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(255, 153, 246, 228), [float](1 * $scale))
        $g.DrawPath($secNotePen, $secNotePath)
        $secNotePen.Dispose()
        $secNotePath.Dispose()

        $snTitleFont = New-Object System.Drawing.Font("Arial", [float](12 * $scale), [System.Drawing.FontStyle]::Bold)
        $snTitleBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 0, 121, 107))
        $g.DrawString("256-bit Encrypted Health Locker | Verified Diagnostic Delivery", $snTitleFont, $snTitleBrush, [float]($screenX + (44 * $scale)), [float]($secNoteY + (14 * $scale)))
        $snTitleFont.Dispose()
        $snTitleBrush.Dispose()

        $snTextFont = New-Object System.Drawing.Font("Arial", [float](10.5 * $scale), [System.Drawing.FontStyle]::Regular)
        $snTextBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 100, 116, 139))
        $g.DrawString("All diagnostic lab reports and medical invoices are digitally signed by certified laboratories and can only be unlocked by your verified mobile phone number.", $snTextFont, $snTextBrush, [float]($screenX + (44 * $scale)), [float]($secNoteY + (36 * $scale)))
        $snTextFont.Dispose()
        $snTextBrush.Dispose()
    }

    $dir = Split-Path $outputPath -Parent
    if (-not (Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
    }
    $bmp.Save($outputPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose()
    $bmp.Dispose()
    Write-Host "Generated: $outputPath ($canvasWidth x $canvasHeight)"
}

$screens = @(
    @{
        File = "01_home_dashboard.png"
        Headline = "Live OPD Waiting Queue & Instant Doctor Booking"
        Subheadline = "Track queue token status in real-time and arrive right on schedule"
        Index = 1
    },
    @{
        File = "02_clinic_discovery.png"
        Headline = "Discover Verified Clinics & Specialists Across Nepal"
        Subheadline = "Smart symptom & specialty taxonomy with live map navigation"
        Index = 2
    },
    @{
        File = "03_live_queue_tracker.png"
        Headline = "Real-Time Cabin Token Counter & Live Updates"
        Subheadline = "Instant turn notification when your consultation token is called"
        Index = 3
    },
    @{
        File = "04_medical_records.png"
        Headline = "Certified Lab Results & OPD Consultation Invoices"
        Subheadline = "Sample Collected -> Tested in Lab -> Official PDF Report Delivery"
        Index = 4
    }
)

Write-Host "Generating 7-Inch Tablet Screenshots (1200 x 1920)..."
foreach ($s in $screens) {
    $out = "PlayStore/patient-app/tablet_7inch_1200x1920/$($s.File)"
    Render-PatientTabletScreenshot $out 1200 1920 $s.Headline $s.Subheadline $s.Index
}

Write-Host "Generating 10-Inch Tablet Screenshots (1600 x 2560)..."
foreach ($s in $screens) {
    $out = "PlayStore/patient-app/tablet_10inch_1600x2560/$($s.File)"
    Render-PatientTabletScreenshot $out 1600 2560 $s.Headline $s.Subheadline $s.Index
}

$logoImg.Dispose()
Write-Host "ALL TABLET SCREENSHOTS GENERATED SUCCESSFULLY!"

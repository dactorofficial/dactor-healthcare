Add-Type -AssemblyName System.Drawing

if (-not ([System.Management.Automation.PSTypeName]'GfxClinic').Type) {
    Add-Type -ReferencedAssemblies "System.Drawing" -TypeDefinition @"
using System.Drawing;
using System.Drawing.Drawing2D;

public class GfxClinic {
    public static GraphicsPath Round(float x, float y, float w, float h, float r) {
        GraphicsPath p = new GraphicsPath();
        float d = r * 2;
        p.AddArc(x, y, d, d, 180, 90);
        p.AddArc(x + w - d, y, d, d, 270, 90);
        p.AddArc(x + w - d, y + h - d, d, d, 0, 90);
        p.AddArc(x, y + h - d, d, d, 90, 90);
        p.CloseFigure();
        return p;
    }
}
"@
}

$logoPath = "web-app/public/app_logo.png"
if (-not (Test-Path $logoPath)) {
    $logoPath = "PlayStore/clinic-app/icon_512x512.png"
}
$logoImg = [System.Drawing.Image]::FromFile((Resolve-Path $logoPath))

function Render-ClinicTabletScreenshot {
    param(
        [string]$outputPath,
        [int]$canvasWidth,
        [int]$canvasHeight,
        [string]$headline,
        [string]$subheadline,
        [int]$screenIndex
    )

    $scale = [float]($canvasWidth / 1200.0)

    $bmp = New-Object System.Drawing.Bitmap($canvasWidth, $canvasHeight, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit

    # 1. Background: Deep Executive Slate & Navy Gradient
    $bgRect = New-Object System.Drawing.Rectangle(0, 0, $canvasWidth, $canvasHeight)
    $bgBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
        $bgRect,
        [System.Drawing.Color]::FromArgb(255, 11, 20, 36),
        [System.Drawing.Color]::FromArgb(255, 15, 30, 54),
        90.0
    )
    $g.FillRectangle($bgBrush, $bgRect)
    $bgBrush.Dispose()

    # Ambient Teal Glow
    $glowPath = New-Object System.Drawing.Drawing2D.GraphicsPath
    $glowPath.AddEllipse([float](200 * $scale), [float](50 * $scale), [float](800 * $scale), [float](500 * $scale))
    $glowBrush = New-Object System.Drawing.Drawing2D.PathGradientBrush($glowPath)
    $glowBrush.CenterColor = [System.Drawing.Color]::FromArgb(45, 13, 148, 136)
    $glowBrush.SurroundColors = @([System.Drawing.Color]::FromArgb(0, 11, 20, 36))
    $g.FillPath($glowBrush, $glowPath)
    $glowBrush.Dispose()
    $glowPath.Dispose()

    # 2. Header Typography
    $centerFormat = New-Object System.Drawing.StringFormat
    $centerFormat.Alignment = [System.Drawing.StringAlignment]::Center
    $centerFormat.LineAlignment = [System.Drawing.StringAlignment]::Center

    $headFontSize = [int](35 * $scale)
    $headFont = New-Object System.Drawing.Font("Arial", $headFontSize, [System.Drawing.FontStyle]::Bold)
    $headBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
    $headRect = New-Object System.Drawing.RectangleF([float](40 * $scale), [float](50 * $scale), [float]($canvasWidth - (80 * $scale)), [float](90 * $scale))
    $g.DrawString($headline, $headFont, $headBrush, $headRect, $centerFormat)
    $headFont.Dispose()
    $headBrush.Dispose()

    $subFontSize = [int](18 * $scale)
    $subFont = New-Object System.Drawing.Font("Arial", $subFontSize, [System.Drawing.FontStyle]::Regular)
    $subBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 148, 163, 184))
    $subRect = New-Object System.Drawing.RectangleF([float](40 * $scale), [float](140 * $scale), [float]($canvasWidth - (80 * $scale)), [float](50 * $scale))
    $g.DrawString($subheadline, $subFont, $subBrush, $subRect, $centerFormat)
    $subFont.Dispose()
    $subBrush.Dispose()

    # 3. Tablet Device Mockup Frame
    $deviceX = [float](100 * $scale)
    $deviceY = [float](220 * $scale)
    $deviceW = [float]($canvasWidth - (200 * $scale))
    $deviceH = [float]($canvasHeight - $deviceY)
    $cornerRad = [float](32 * $scale)

    # Device Shadow
    $shadowPath = [GfxClinic]::Round(($deviceX - 4 * $scale), ($deviceY + 8 * $scale), ($deviceW + 8 * $scale), $deviceH, $cornerRad)
    $shadowBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(70, 0, 0, 0))
    $g.FillPath($shadowBrush, $shadowPath)
    $shadowBrush.Dispose()
    $shadowPath.Dispose()

    # Device Bezel
    $bezelPath = [GfxClinic]::Round($deviceX, $deviceY, $deviceW, $deviceH, $cornerRad)
    $bezelBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 241, 245, 249))
    $g.FillPath($bezelBrush, $bezelPath)
    $bezelBrush.Dispose()

    # Device Border Stroke
    $bezelPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(255, 203, 213, 225), [float](3 * $scale))
    $g.DrawPath($bezelPen, $bezelPath)
    $bezelPen.Dispose()
    $bezelPath.Dispose()

    # App Screen Interior
    $pad = [float](18 * $scale)
    $screenX = [float]($deviceX + $pad)
    $screenY = [float]($deviceY + $pad)
    $screenW = [float]($deviceW - ($pad * 2))
    $screenH = [float]($deviceH - $pad)
    $screenRad = [float](22 * $scale)

    $screenPath = [GfxClinic]::Round($screenX, $screenY, $screenW, $screenH, $screenRad)
    $screenBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 248, 250, 252))
    $g.FillPath($screenBrush, $screenPath)
    $screenBrush.Dispose()
    $screenPath.Dispose()

    # Top App Bar
    $appBarY = [float]($screenY + (14 * $scale))
    $logoSize = [float](44 * $scale)
    $g.DrawImage($logoImg, [float]($screenX + (24 * $scale)), $appBarY, $logoSize, $logoSize)

    $cTitleFont = New-Object System.Drawing.Font("Arial", [int](18 * $scale), [System.Drawing.FontStyle]::Bold)
    $cTitleBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 15, 23, 42))
    $g.DrawString("Nobel Healthcare", $cTitleFont, $cTitleBrush, [float]($screenX + (76 * $scale)), [float]($appBarY + (4 * $scale)))
    $cTitleFont.Dispose()
    $cTitleBrush.Dispose()

    $cRoleFont = New-Object System.Drawing.Font("Arial", [int](11.5 * $scale), [System.Drawing.FontStyle]::Regular)
    $cRoleBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 100, 116, 139))
    $g.DrawString("Clinic Operating Console - Reception Counter 01", $cRoleFont, $cRoleBrush, [float]($screenX + (76 * $scale)), [float]($appBarY + (26 * $scale)))
    $cRoleFont.Dispose()
    $cRoleBrush.Dispose()

    # Live Cloud & Offline Sync Pill
    $syncPillW = [float](170 * $scale)
    $syncPillX = [float]($screenX + $screenW - $syncPillW - (24 * $scale))
    $syncPillPath = [GfxClinic]::Round($syncPillX, $appBarY, $syncPillW, [float](36 * $scale), [float](18 * $scale))
    $syncPillBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 220, 252, 231))
    $g.FillPath($syncPillBrush, $syncPillPath)
    $syncPillBrush.Dispose()
    $syncPillPath.Dispose()

    $syncFont = New-Object System.Drawing.Font("Arial", [int](11 * $scale), [System.Drawing.FontStyle]::Bold)
    $syncBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 22, 101, 52))
    $g.DrawString("[LIVE] Cloud Sync", $syncFont, $syncBrush, [float]($syncPillX + (16 * $scale)), [float]($appBarY + (10 * $scale)))
    $syncFont.Dispose()
    $syncBrush.Dispose()

    $contentY = [float]($appBarY + (66 * $scale))

    # ============================================================
    # SCREEN 1: CLINIC DASHBOARD & REAL-TIME REVENUE
    # ============================================================
    if ($screenIndex -eq 1) {
        $cardGap = [float](16 * $scale)
        $cardW = [float](($screenW - (48 * $scale) - ($cardGap * 3)) / 4.0)
        $cardH = [float](130 * $scale)

        $metrics = @(
            @{ Label = "TODAY'S PATIENTS"; Val = "48"; Sub = "+12% vs yesterday"; Color = [System.Drawing.Color]::FromArgb(255, 15, 23, 42) },
            @{ Label = "CABINS ACTIVE"; Val = "3 / 4"; Sub = "Doctors in clinic"; Color = [System.Drawing.Color]::FromArgb(255, 13, 148, 136) },
            @{ Label = "WAITING QUEUE"; Val = "14"; Sub = "Avg wait: 12 min"; Color = [System.Drawing.Color]::FromArgb(255, 217, 119, 6) },
            @{ Label = "COUNTER BILLING"; Val = "Rs. 24,500"; Sub = "42 receipts issued"; Color = [System.Drawing.Color]::FromArgb(255, 16, 185, 129) }
        )

        for ($i = 0; $i -lt 4; $i++) {
            $m = $metrics[$i]
            $mX = [float]($screenX + (24 * $scale) + ($i * ($cardW + $cardGap)))
            $mPath = [GfxClinic]::Round($mX, $contentY, $cardW, $cardH, [float](16 * $scale))
            $mBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
            $g.FillPath($mBrush, $mPath)
            $mBrush.Dispose()
            $mPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(255, 226, 232, 240), [float](1.5 * $scale))
            $g.DrawPath($mPen, $mPath)
            $mPen.Dispose()
            $mPath.Dispose()

            $lblFont = New-Object System.Drawing.Font("Arial", [int](10.5 * $scale), [System.Drawing.FontStyle]::Bold)
            $lblBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 100, 116, 139))
            $g.DrawString($m.Label, $lblFont, $lblBrush, [float]($mX + (16 * $scale)), [float]($contentY + (16 * $scale)))
            $lblFont.Dispose()
            $lblBrush.Dispose()

            $valFont = New-Object System.Drawing.Font("Arial", [int](22 * $scale), [System.Drawing.FontStyle]::Bold)
            $valBrush = New-Object System.Drawing.SolidBrush($m.Color)
            $g.DrawString($m.Val, $valFont, $valBrush, [float]($mX + (16 * $scale)), [float]($contentY + (42 * $scale)))
            $valFont.Dispose()
            $valBrush.Dispose()

            $subMFont = New-Object System.Drawing.Font("Arial", [int](11 * $scale), [System.Drawing.FontStyle]::Regular)
            $subMBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 148, 163, 184))
            $g.DrawString($m.Sub, $subMFont, $subMBrush, [float]($mX + (16 * $scale)), [float]($contentY + (92 * $scale)))
            $subMFont.Dispose()
            $subMBrush.Dispose()
        }

        # Quick Actions Row
        $qaY = [float]($contentY + $cardH + (24 * $scale))
        $qaH = [float](70 * $scale)
        $qaW = [float]($screenW - (48 * $scale))
        $qaPath = [GfxClinic]::Round([float]($screenX + (24 * $scale)), $qaY, $qaW, $qaH, [float](16 * $scale))
        $qaBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 240, 253, 250))
        $g.FillPath($qaBrush, $qaPath)
        $qaBrush.Dispose()
        $qaPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(255, 153, 246, 228), [float](1.5 * $scale))
        $g.DrawPath($qaPen, $qaPath)
        $qaPen.Dispose()
        $qaPath.Dispose()

        $qaTitleFont = New-Object System.Drawing.Font("Arial", [int](13 * $scale), [System.Drawing.FontStyle]::Bold)
        $qaTitleBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 15, 23, 42))
        $g.DrawString("Counter Shortcuts:", $qaTitleFont, $qaTitleBrush, [float]($screenX + (44 * $scale)), [float]($qaY + (24 * $scale)))
        $qaTitleFont.Dispose()
        $qaTitleBrush.Dispose()

        $actions = @("+ New Walk-in Token", "Call Next Patient", "Manage Doctor Shifts", "Counter Billing")
        $btnX = [float]($screenX + (240 * $scale))
        $btnFont = New-Object System.Drawing.Font("Arial", [int](11 * $scale), [System.Drawing.FontStyle]::Bold)
        foreach ($btnText in $actions) {
            $btnW = [float](160 * $scale)
            $btnPath = [GfxClinic]::Round($btnX, [float]($qaY + (14 * $scale)), $btnW, [float](42 * $scale), [float](10 * $scale))
            $btnBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
            $g.FillPath($btnBrush, $btnPath)
            $btnBrush.Dispose()
            $btnPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(255, 204, 251, 241), [float](1.5 * $scale))
            $g.DrawPath($btnPen, $btnPath)
            $btnPen.Dispose()
            $btnPath.Dispose()

            $btnTextBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 13, 148, 136))
            $g.DrawString($btnText, $btnFont, $btnTextBrush, [float]($btnX + (12 * $scale)), [float]($qaY + (26 * $scale)))
            $btnTextBrush.Dispose()
            $btnX += $btnW + [float](14 * $scale)
        }
        $btnFont.Dispose()

        # Doctor Cabins Table
        $tblY = [float]($qaY + $qaH + (24 * $scale))
        $tblW = [float]($screenW - (48 * $scale))
        $tblH = [float](420 * $scale)
        $tblPath = [GfxClinic]::Round([float]($screenX + (24 * $scale)), $tblY, $tblW, $tblH, [float](18 * $scale))
        $tblBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
        $g.FillPath($tblBrush, $tblPath)
        $tblBrush.Dispose()
        $tblPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(255, 226, 232, 240), [float](1.5 * $scale))
        $g.DrawPath($tblPen, $tblPath)
        $tblPen.Dispose()
        $tblPath.Dispose()

        $thFont = New-Object System.Drawing.Font("Arial", [int](13 * $scale), [System.Drawing.FontStyle]::Bold)
        $thBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 15, 23, 42))
        $g.DrawString("Active Doctor Cabins & Live Queue Status", $thFont, $thBrush, [float]($screenX + (44 * $scale)), [float]($tblY + (20 * $scale)))
        $thFont.Dispose()
        $thBrush.Dispose()

        $rooms = @(
            @{ Doc = "Dr. Ankit Jha"; Spec = "Dermatology & Skin"; Cabin = "Cabin 101"; Token = "#14 (Serving)"; Wait = "5 Waiting"; Status = "Inside Cabin"; SColor = [System.Drawing.Color]::FromArgb(255, 22, 101, 52) },
            @{ Doc = "Dr. Sunita Sharma"; Spec = "Pediatrics (Child Care)"; Cabin = "Cabin 102"; Token = "#09 (Serving)"; Wait = "4 Waiting"; Status = "Inside Cabin"; SColor = [System.Drawing.Color]::FromArgb(255, 22, 101, 52) },
            @{ Doc = "Dr. Prakash Thapa"; Spec = "General Medicine"; Cabin = "Cabin 103"; Token = "#22 (Serving)"; Wait = "3 Waiting"; Status = "Inside Cabin"; SColor = [System.Drawing.Color]::FromArgb(255, 22, 101, 52) },
            @{ Doc = "Dr. R. K. Mahato"; Spec = "Orthopedics & Spine"; Cabin = "Cabin 104"; Token = "Shift at 03:00 PM"; Wait = "2 Pre-booked"; Status = "Arriving Soon"; SColor = [System.Drawing.Color]::FromArgb(255, 180, 83, 9) }
        )

        $rowY = [float]($tblY + (64 * $scale))
        $rowFont = New-Object System.Drawing.Font("Arial", [int](12.5 * $scale), [System.Drawing.FontStyle]::Bold)
        $rowSubFont = New-Object System.Drawing.Font("Arial", [int](11 * $scale), [System.Drawing.FontStyle]::Regular)
        $badgeFont = New-Object System.Drawing.Font("Arial", [int](10.5 * $scale), [System.Drawing.FontStyle]::Bold)

        foreach ($r in $rooms) {
            $divPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(255, 241, 245, 249), [float](1 * $scale))
            $g.DrawLine($divPen, [float]($screenX + (44 * $scale)), [float]$rowY, [float]($screenX + $tblW - (44 * $scale)), [float]$rowY)
            $divPen.Dispose()

            $g.DrawString($r.Doc, $rowFont, [System.Drawing.Brushes]::Black, [float]($screenX + (44 * $scale)), [float]($rowY + (14 * $scale)))
            $specBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 100, 116, 139))
            $g.DrawString($r.Spec, $rowSubFont, $specBrush, [float]($screenX + (44 * $scale)), [float]($rowY + (36 * $scale)))
            $specBrush.Dispose()

            $cabinBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 15, 23, 42))
            $g.DrawString($r.Cabin, $rowFont, $cabinBrush, [float]($screenX + (340 * $scale)), [float]($rowY + (14 * $scale)))
            $tokenBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 13, 148, 136))
            $g.DrawString($r.Token, $rowSubFont, $tokenBrush, [float]($screenX + (340 * $scale)), [float]($rowY + (36 * $scale)))
            $cabinBrush.Dispose()
            $tokenBrush.Dispose()

            $waitBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 217, 119, 6))
            $g.DrawString($r.Wait, $rowFont, $waitBrush, [float]($screenX + (560 * $scale)), [float]($rowY + (22 * $scale)))
            $waitBrush.Dispose()

            $bW = [float](150 * $scale)
            $bX = [float]($screenX + $tblW - $bW - (44 * $scale))
            $bPath = [GfxClinic]::Round($bX, [float]($rowY + (18 * $scale)), $bW, [float](32 * $scale), [float](16 * $scale))
            $bFill = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 240, 253, 244))
            $g.FillPath($bFill, $bPath)
            $bFill.Dispose()
            $bPath.Dispose()

            $bTextBrush = New-Object System.Drawing.SolidBrush($r.SColor)
            $g.DrawString($r.Status, $badgeFont, $bTextBrush, [float]($bX + (18 * $scale)), [float]($rowY + (24 * $scale)))
            $bTextBrush.Dispose()

            $rowY += [float](76 * $scale)
        }
        $rowFont.Dispose()
        $rowSubFont.Dispose()
        $badgeFont.Dispose()
    }

    # ============================================================
    # SCREEN 2: LIVE OPD QUEUE CALLING & CABIN CONSOLE
    # ============================================================
    elseif ($screenIndex -eq 2) {
        $bannerW = [float]($screenW - (48 * $scale))
        $bannerH = [float](100 * $scale)
        $bannerPath = [GfxClinic]::Round([float]($screenX + (24 * $scale)), $contentY, $bannerW, $bannerH, [float](18 * $scale))
        $bannerBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
        $g.FillPath($bannerBrush, $bannerPath)
        $bannerBrush.Dispose()
        $bannerPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(255, 226, 232, 240), [float](1.5 * $scale))
        $g.DrawPath($bannerPen, $bannerPath)
        $bannerPen.Dispose()
        $bannerPath.Dispose()

        $bDocFont = New-Object System.Drawing.Font("Arial", [int](18 * $scale), [System.Drawing.FontStyle]::Bold)
        $g.DrawString("Dr. Ankit Jha, MBBS, MD", $bDocFont, [System.Drawing.Brushes]::Black, [float]($screenX + (48 * $scale)), [float]($contentY + (22 * $scale)))
        $bDocFont.Dispose()

        $bSpecFont = New-Object System.Drawing.Font("Arial", [int](12 * $scale), [System.Drawing.FontStyle]::Regular)
        $bSpecBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 100, 116, 139))
        $g.DrawString("Dermatology & Aesthetic Skin Specialist - Cabin 101", $bSpecFont, $bSpecBrush, [float]($screenX + (48 * $scale)), [float]($contentY + (52 * $scale)))
        $bSpecFont.Dispose()
        $bSpecBrush.Dispose()

        # Presence Switch
        $swW = [float](230 * $scale)
        $swX = [float]($screenX + $bannerW - $swW - (24 * $scale))
        $swPath = [GfxClinic]::Round($swX, [float]($contentY + (26 * $scale)), $swW, [float](46 * $scale), [float](23 * $scale))
        $swBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 220, 252, 231))
        $g.FillPath($swBrush, $swPath)
        $swBrush.Dispose()
        $swPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(255, 187, 247, 208), [float](1.5 * $scale))
        $g.DrawPath($swPen, $swPath)
        $swPen.Dispose()
        $swPath.Dispose()

        $swFont = New-Object System.Drawing.Font("Arial", [int](11.5 * $scale), [System.Drawing.FontStyle]::Bold)
        $swTextBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 22, 101, 52))
        $g.DrawString("Doctor Physically Inside", $swFont, $swTextBrush, [float]($swX + (24 * $scale)), [float]($contentY + (38 * $scale)))
        $swFont.Dispose()
        $swTextBrush.Dispose()

        # Giant Token Calling Card
        $callCardY = [float]($contentY + $bannerH + (24 * $scale))
        $callCardW = [float]($screenW - (48 * $scale))
        $callCardH = [float](360 * $scale)
        $callPath = [GfxClinic]::Round([float]($screenX + (24 * $scale)), $callCardY, $callCardW, $callCardH, [float](20 * $scale))
        $callBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 240, 253, 250))
        $g.FillPath($callBrush, $callPath)
        $callBrush.Dispose()
        $callPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(255, 153, 246, 228), [float](2 * $scale))
        $g.DrawPath($callPen, $callPath)
        $callPen.Dispose()
        $callPath.Dispose()

        $nowPillPath = [GfxClinic]::Round([float]($screenX + (48 * $scale)), [float]($callCardY + (24 * $scale)), [float](180 * $scale), [float](36 * $scale), [float](18 * $scale))
        $nowBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 13, 148, 136))
        $g.FillPath($nowBrush, $nowPillPath)
        $nowBrush.Dispose()
        $nowPillPath.Dispose()

        $nowFont = New-Object System.Drawing.Font("Arial", [int](11.5 * $scale), [System.Drawing.FontStyle]::Bold)
        $g.DrawString("NOW CONSULTING", $nowFont, [System.Drawing.Brushes]::White, [float]($screenX + (66 * $scale)), [float]($callCardY + (33 * $scale)))
        $nowFont.Dispose()

        $timerFont = New-Object System.Drawing.Font("Arial", [int](12 * $scale), [System.Drawing.FontStyle]::Bold)
        $timerBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 100, 116, 139))
        $g.DrawString("Consultation Active: 08m 42s", $timerFont, $timerBrush, [float]($screenX + $callCardW - (270 * $scale)), [float]($callCardY + (33 * $scale)))
        $timerFont.Dispose()
        $timerBrush.Dispose()

        $tokNumFont = New-Object System.Drawing.Font("Arial", [int](64 * $scale), [System.Drawing.FontStyle]::Bold)
        $tokNumBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 15, 23, 42))
        $g.DrawString("TOKEN #14", $tokNumFont, $tokNumBrush, [float]($screenX + (48 * $scale)), [float]($callCardY + (76 * $scale)))
        $tokNumFont.Dispose()
        $tokNumBrush.Dispose()

        $pNameFont = New-Object System.Drawing.Font("Arial", [int](22 * $scale), [System.Drawing.FontStyle]::Bold)
        $g.DrawString("Ramesh Karki", $pNameFont, [System.Drawing.Brushes]::Black, [float]($screenX + (48 * $scale)), [float]($callCardY + (170 * $scale)))
        $pNameFont.Dispose()

        $pSubFont = New-Object System.Drawing.Font("Arial", [int](13 * $scale), [System.Drawing.FontStyle]::Regular)
        $pSubBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 71, 85, 105))
        $g.DrawString("Tracking Code: 9841203841 - Phone: +977 9841****12 - Male, 38 Yrs - OPD Routine", $pSubFont, $pSubBrush, [float]($screenX + (48 * $scale)), [float]($callCardY + (206 * $scale)))
        $pSubFont.Dispose()
        $pSubBrush.Dispose()

        # Action Buttons
        $btnY = [float]($callCardY + (260 * $scale))
        $btn1W = [float](230 * $scale)
        $btn1Path = [GfxClinic]::Round([float]($screenX + (48 * $scale)), $btnY, $btn1W, [float](60 * $scale), [float](14 * $scale))
        $btn1Brush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 13, 148, 136))
        $g.FillPath($btn1Brush, $btn1Path)
        $btn1Brush.Dispose()
        $btn1Path.Dispose()

        $actFont = New-Object System.Drawing.Font("Arial", [int](13.5 * $scale), [System.Drawing.FontStyle]::Bold)
        $g.DrawString("Audio Token Call", $actFont, [System.Drawing.Brushes]::White, [float]($screenX + (80 * $scale)), [float]($btnY + (18 * $scale)))

        $btn2W = [float](230 * $scale)
        $btn2X = [float]($screenX + (48 * $scale) + $btn1W + (20 * $scale))
        $btn2Path = [GfxClinic]::Round($btn2X, $btnY, $btn2W, [float](60 * $scale), [float](14 * $scale))
        $btn2Brush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 16, 185, 129))
        $g.FillPath($btn2Brush, $btn2Path)
        $btn2Brush.Dispose()
        $btn2Path.Dispose()
        $g.DrawString("Complete and Next", $actFont, [System.Drawing.Brushes]::White, [float]($btn2X + (36 * $scale)), [float]($btnY + (18 * $scale)))

        $btn3W = [float](170 * $scale)
        $btn3X = [float]($btn2X + $btn2W + (20 * $scale))
        $btn3Path = [GfxClinic]::Round($btn3X, $btnY, $btn3W, [float](60 * $scale), [float](14 * $scale))
        $btn3Brush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
        $g.FillPath($btn3Brush, $btn3Path)
        $btn3Brush.Dispose()
        $btn3Pen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(255, 203, 213, 225), [float](1.5 * $scale))
        $g.DrawPath($btn3Pen, $btn3Path)
        $btn3Pen.Dispose()
        $btn3Path.Dispose()

        $skipBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 100, 116, 139))
        $g.DrawString("Skip Token", $actFont, $skipBrush, [float]($btn3X + (36 * $scale)), [float]($btnY + (18 * $scale)))
        $skipBrush.Dispose()
        $actFont.Dispose()

        # Upcoming Waiting List
        $upY = [float]($callCardY + $callCardH + (24 * $scale))
        $upW = [float]($screenW - (48 * $scale))
        $upH = [float](220 * $scale)
        $upPath = [GfxClinic]::Round([float]($screenX + (24 * $scale)), $upY, $upW, $upH, [float](18 * $scale))
        $upBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
        $g.FillPath($upBrush, $upPath)
        $upBrush.Dispose()
        $upPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(255, 226, 232, 240), [float](1.5 * $scale))
        $g.DrawPath($upPen, $upPath)
        $upPen.Dispose()
        $upPath.Dispose()

        $upTitleFont = New-Object System.Drawing.Font("Arial", [int](13 * $scale), [System.Drawing.FontStyle]::Bold)
        $g.DrawString("Next Patients in Waiting Queue", $upTitleFont, [System.Drawing.Brushes]::Black, [float]($screenX + (48 * $scale)), [float]($upY + (20 * $scale)))
        $upTitleFont.Dispose()

        $upList = @(
            @{ Tok = "#15"; Name = "Sunita Shrestha"; Loc = "Waiting Lounge"; Time = "Est. 11:30 AM" },
            @{ Tok = "#16"; Name = "Bishal Thapa"; Loc = "Arrived at Counter"; Time = "Est. 11:45 AM" },
            @{ Tok = "#17"; Name = "Gita Adhikari"; Loc = "Mobile App Check-in"; Time = "Est. 12:00 PM" }
        )

        $uRowY = [float]($upY + (60 * $scale))
        $uTokFont = New-Object System.Drawing.Font("Arial", [int](13 * $scale), [System.Drawing.FontStyle]::Bold)
        $uTokBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 13, 148, 136))
        $uTextFont = New-Object System.Drawing.Font("Arial", [int](12 * $scale), [System.Drawing.FontStyle]::Regular)

        foreach ($item in $upList) {
            $g.DrawString($item.Tok, $uTokFont, $uTokBrush, [float]($screenX + (48 * $scale)), [float]$uRowY)
            $g.DrawString($item.Name, $uTokFont, [System.Drawing.Brushes]::Black, [float]($screenX + (130 * $scale)), [float]$uRowY)
            
            $locB = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 100, 116, 139))
            $g.DrawString($item.Loc, $uTextFont, $locB, [float]($screenX + (380 * $scale)), [float]$uRowY)
            $g.DrawString($item.Time, $uTextFont, $locB, [float]($screenX + $upW - (160 * $scale)), [float]$uRowY)
            $locB.Dispose()

            $uRowY += [float](46 * $scale)
        }
        $uTokFont.Dispose()
        $uTokBrush.Dispose()
        $uTextFont.Dispose()
    }

    # ============================================================
    # SCREEN 3: WALKIN RECEPTION & COUNTER BILLING
    # ============================================================
    elseif ($screenIndex -eq 3) {
        $colGap = [float](20 * $scale)
        $leftW = [float](($screenW - (48 * $scale) - $colGap) * 0.55)
        $rightW = [float](($screenW - (48 * $scale) - $colGap) * 0.45)
        $splitH = [float](680 * $scale)

        # Left Card
        $leftX = [float]($screenX + (24 * $scale))
        $leftPath = [GfxClinic]::Round($leftX, $contentY, $leftW, $splitH, [float](18 * $scale))
        $leftBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
        $g.FillPath($leftBrush, $leftPath)
        $leftBrush.Dispose()
        $leftPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(255, 226, 232, 240), [float](1.5 * $scale))
        $g.DrawPath($leftPen, $leftPath)
        $leftPen.Dispose()
        $leftPath.Dispose()

        $formTitleFont = New-Object System.Drawing.Font("Arial", [int](15 * $scale), [System.Drawing.FontStyle]::Bold)
        $g.DrawString("Walk-in Patient Counter Check-in", $formTitleFont, [System.Drawing.Brushes]::Black, [float]($leftX + (24 * $scale)), [float]($contentY + (22 * $scale)))
        $formTitleFont.Dispose()

        $fields = @(
            @{ Label = "Full Patient Name"; Val = "Ram Chandra Yadav" },
            @{ Label = "Mobile Number (For SMS Tracking)"; Val = "+977 9841203841" },
            @{ Label = "Age & Gender"; Val = "34 Yrs / Male" },
            @{ Label = "Assigned Doctor"; Val = "Dr. Ankit Jha - Dermatology (Cabin 101)" },
            @{ Label = "Consultation Type"; Val = "First OPD Visit (Rs. 600)" }
        )

        $fldY = [float]($contentY + (66 * $scale))
        $fLblFont = New-Object System.Drawing.Font("Arial", [int](10.5 * $scale), [System.Drawing.FontStyle]::Bold)
        $fLblBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 100, 116, 139))
        $fValFont = New-Object System.Drawing.Font("Arial", [int](12.5 * $scale), [System.Drawing.FontStyle]::Regular)

        foreach ($f in $fields) {
            $g.DrawString($f.Label, $fLblFont, $fLblBrush, [float]($leftX + (24 * $scale)), [float]$fldY)
            
            $inputPath = [GfxClinic]::Round([float]($leftX + (24 * $scale)), [float]($fldY + (22 * $scale)), [float]($leftW - (48 * $scale)), [float](46 * $scale), [float](10 * $scale))
            $inputBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 248, 250, 252))
            $g.FillPath($inputBrush, $inputPath)
            $inputBrush.Dispose()
            $inputPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(255, 226, 232, 240), [float](1.5 * $scale))
            $g.DrawPath($inputPen, $inputPath)
            $inputPen.Dispose()
            $inputPath.Dispose()

            $g.DrawString($f.Val, $fValFont, [System.Drawing.Brushes]::Black, [float]($leftX + (38 * $scale)), [float]($fldY + (34 * $scale)))
            $fldY += [float](82 * $scale)
        }
        $fLblFont.Dispose()
        $fLblBrush.Dispose()
        $fValFont.Dispose()

        # Generate Token Button
        $genPath = [GfxClinic]::Round([float]($leftX + (24 * $scale)), [float]($contentY + $splitH - (80 * $scale)), [float]($leftW - (48 * $scale)), [float](56 * $scale), [float](14 * $scale))
        $genBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 13, 148, 136))
        $g.FillPath($genBrush, $genPath)
        $genBrush.Dispose()
        $genPath.Dispose()

        $genFont = New-Object System.Drawing.Font("Arial", [int](13.5 * $scale), [System.Drawing.FontStyle]::Bold)
        $g.DrawString("Issue Walk-in Token & Send SMS", $genFont, [System.Drawing.Brushes]::White, [float]($leftX + (90 * $scale)), [float]($contentY + $splitH - (62 * $scale)))
        $genFont.Dispose()

        # Right Card: Instant Billing Invoice
        $rightX = [float]($leftX + $leftW + $colGap)
        $rightPath = [GfxClinic]::Round($rightX, $contentY, $rightW, $splitH, [float](18 * $scale))
        $rightBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
        $g.FillPath($rightBrush, $rightPath)
        $rightBrush.Dispose()
        $rightPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(255, 226, 232, 240), [float](1.5 * $scale))
        $g.DrawPath($rightPen, $rightPath)
        $rightPen.Dispose()
        $rightPath.Dispose()

        $recTitleFont = New-Object System.Drawing.Font("Arial", [int](14 * $scale), [System.Drawing.FontStyle]::Bold)
        $g.DrawString("Invoice #INV-2026-0842", $recTitleFont, [System.Drawing.Brushes]::Black, [float]($rightX + (24 * $scale)), [float]($contentY + (22 * $scale)))
        $recTitleFont.Dispose()

        $tcBoxY = [float]($contentY + (60 * $scale))
        $tcPath = [GfxClinic]::Round([float]($rightX + (24 * $scale)), $tcBoxY, [float]($rightW - (48 * $scale)), [float](64 * $scale), [float](12 * $scale))
        $tcBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 240, 253, 250))
        $g.FillPath($tcBrush, $tcPath)
        $tcBrush.Dispose()
        $tcPath.Dispose()

        $tcLblFont = New-Object System.Drawing.Font("Arial", [int](10 * $scale), [System.Drawing.FontStyle]::Bold)
        $tcLblBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 13, 148, 136))
        $g.DrawString("10-DIGIT UNIVERSAL TRACKING CODE", $tcLblFont, $tcLblBrush, [float]($rightX + (36 * $scale)), [float]($tcBoxY + (12 * $scale)))
        $tcLblFont.Dispose()
        $tcLblBrush.Dispose()

        $tcCodeFont = New-Object System.Drawing.Font("Arial", [int](18 * $scale), [System.Drawing.FontStyle]::Bold)
        $g.DrawString("9841 2038 41", $tcCodeFont, [System.Drawing.Brushes]::Black, [float]($rightX + (36 * $scale)), [float]($tcBoxY + (30 * $scale)))
        $tcCodeFont.Dispose()

        $itemsY = [float]($tcBoxY + (86 * $scale))
        $items = @(
            @{ Desc = "OPD Doctor Consultation"; Amt = "Rs. 600.00" },
            @{ Desc = "Dermatology Allergy Screen"; Amt = "Rs. 1,200.00" },
            @{ Desc = "Hospital Maintenance Charge"; Amt = "Rs. 50.00" },
            @{ Desc = "Clinic Loyalty Discount (10%)"; Amt = "- Rs. 185.00" }
        )

        $iFont = New-Object System.Drawing.Font("Arial", [int](11.5 * $scale), [System.Drawing.FontStyle]::Regular)
        $iAmtFont = New-Object System.Drawing.Font("Arial", [int](11.5 * $scale), [System.Drawing.FontStyle]::Bold)

        foreach ($it in $items) {
            $g.DrawString($it.Desc, $iFont, [System.Drawing.Brushes]::Black, [float]($rightX + (24 * $scale)), [float]$itemsY)
            $amtB = if ($it.Amt.StartsWith("-")) { [System.Drawing.Brushes]::ForestGreen } else { [System.Drawing.Brushes]::Black }
            $g.DrawString($it.Amt, $iAmtFont, $amtB, [float]($rightX + $rightW - (140 * $scale)), [float]$itemsY)
            $itemsY += [float](40 * $scale)
        }
        $iFont.Dispose()
        $iAmtFont.Dispose()

        $totY = [float]($itemsY + (20 * $scale))
        $totPath = [GfxClinic]::Round([float]($rightX + (24 * $scale)), $totY, [float]($rightW - (48 * $scale)), [float](60 * $scale), [float](12 * $scale))
        $totBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 241, 245, 249))
        $g.FillPath($totBrush, $totPath)
        $totBrush.Dispose()
        $totPath.Dispose()

        $totLblFont = New-Object System.Drawing.Font("Arial", [int](12 * $scale), [System.Drawing.FontStyle]::Bold)
        $g.DrawString("Total Payable:", $totLblFont, [System.Drawing.Brushes]::Black, [float]($rightX + (36 * $scale)), [float]($totY + (20 * $scale)))
        $totLblFont.Dispose()

        $totAmtFont = New-Object System.Drawing.Font("Arial", [int](18 * $scale), [System.Drawing.FontStyle]::Bold)
        $totAmtBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 13, 148, 136))
        $g.DrawString("Rs. 1,665.00", $totAmtFont, $totAmtBrush, [float]($rightX + $rightW - (180 * $scale)), [float]($totY + (16 * $scale)))
        $totAmtFont.Dispose()
        $totAmtBrush.Dispose()

        $payY = [float]($totY + (80 * $scale))
        $payLblFont = New-Object System.Drawing.Font("Arial", [int](11 * $scale), [System.Drawing.FontStyle]::Bold)
        $g.DrawString("Select Counter Payment Method:", $payLblFont, [System.Drawing.Brushes]::Black, [float]($rightX + (24 * $scale)), [float]$payY)
        $payLblFont.Dispose()

        $pMethods = @("Cash", "Fonepay QR", "eSewa", "Khalti")
        $pX = [float]($rightX + (24 * $scale))
        $pFont = New-Object System.Drawing.Font("Arial", [int](10 * $scale), [System.Drawing.FontStyle]::Bold)
        foreach ($pm in $pMethods) {
            $pmW = [float](84 * $scale)
            $pmPath = [GfxClinic]::Round($pX, [float]($payY + (22 * $scale)), $pmW, [float](38 * $scale), [float](8 * $scale))
            $pmBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 248, 250, 252))
            $g.FillPath($pmBrush, $pmPath)
            $pmBrush.Dispose()
            $pmPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(255, 203, 213, 225), [float](1.5 * $scale))
            $g.DrawPath($pmPen, $pmPath)
            $pmPen.Dispose()
            $pmPath.Dispose()

            $g.DrawString($pm, $pFont, [System.Drawing.Brushes]::Black, [float]($pX + (12 * $scale)), [float]($payY + (32 * $scale)))
            $pX += $pmW + [float](8 * $scale)
        }
        $pFont.Dispose()
    }

    # ============================================================
    # SCREEN 4: DOCTOR OPD SCHEDULE & SHIFT PLANNER
    # ============================================================
    elseif ($screenIndex -eq 4) {
        $tabW = [float]($screenW - (48 * $scale))
        $tabH = [float](60 * $scale)
        $tabPath = [GfxClinic]::Round([float]($screenX + (24 * $scale)), $contentY, $tabW, $tabH, [float](16 * $scale))
        $tabBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
        $g.FillPath($tabBrush, $tabPath)
        $tabBrush.Dispose()
        $tabPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(255, 226, 232, 240), [float](1.5 * $scale))
        $g.DrawPath($tabPen, $tabPath)
        $tabPen.Dispose()
        $tabPath.Dispose()

        $days = @(
            @{ Day = "Today, Oct 24"; Active = $true },
            @{ Day = "Sunday, Oct 25"; Active = $false },
            @{ Day = "Monday, Oct 26"; Active = $false },
            @{ Day = "Tuesday, Oct 27"; Active = $false },
            @{ Day = "Wednesday, Oct 28"; Active = $false }
        )

        $tX = [float]($screenX + (34 * $scale))
        $tFont = New-Object System.Drawing.Font("Arial", [int](11.5 * $scale), [System.Drawing.FontStyle]::Bold)
        foreach ($d in $days) {
            $dW = [float](170 * $scale)
            $dPath = [GfxClinic]::Round($tX, [float]($contentY + (10 * $scale)), $dW, [float](40 * $scale), [float](10 * $scale))
            $dFill = if ($d.Active) { New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 13, 148, 136)) } else { New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 248, 250, 252)) }
            $g.FillPath($dFill, $dPath)
            $dFill.Dispose()
            $dPath.Dispose()

            $dTextColor = if ($d.Active) { [System.Drawing.Brushes]::White } else { New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 71, 85, 105)) }
            $g.DrawString($d.Day, $tFont, $dTextColor, [float]($tX + (20 * $scale)), [float]($contentY + (22 * $scale)))
            $tX += $dW + [float](12 * $scale)
        }
        $tFont.Dispose()

        $shifts = @(
            @{
                Doc = "Dr. Ankit Jha"; Spec = "Dermatology & Skin Care"; Cabin = "Cabin 101";
                Time = "10:00 AM - 02:00 PM (Morning OPD)";
                Quota = "22 / 25 Tokens Filled"; Pct = 0.88;
                Fee = "Rs. 600"; Status = "PUBLISHED & LIVE ON PATIENT APP"
            },
            @{
                Doc = "Dr. Sunita Sharma"; Spec = "Pediatrics & Neonatal Care"; Cabin = "Cabin 102";
                Time = "02:30 PM - 06:30 PM (Evening OPD)";
                Quota = "16 / 20 Tokens Filled"; Pct = 0.80;
                Fee = "Rs. 500"; Status = "PUBLISHED & LIVE ON PATIENT APP"
            },
            @{
                Doc = "Dr. Prakash Thapa"; Spec = "Internal Medicine & Diabetes"; Cabin = "Cabin 103";
                Time = "04:00 PM - 08:00 PM (Evening OPD)";
                Quota = "8 / 15 Tokens Filled"; Pct = 0.53;
                Fee = "Rs. 550"; Status = "PUBLISHED & LIVE ON PATIENT APP"
            }
        )

        $sCardY = [float]($contentY + $tabH + (24 * $scale))
        $sCardW = [float]($screenW - (48 * $scale))
        $sCardH = [float](180 * $scale)

        $sDocFont = New-Object System.Drawing.Font("Arial", [int](16 * $scale), [System.Drawing.FontStyle]::Bold)
        $sSubFont = New-Object System.Drawing.Font("Arial", [int](12 * $scale), [System.Drawing.FontStyle]::Regular)
        $sBadgeFont = New-Object System.Drawing.Font("Arial", [int](10.5 * $scale), [System.Drawing.FontStyle]::Bold)

        foreach ($sh in $shifts) {
            $scPath = [GfxClinic]::Round([float]($screenX + (24 * $scale)), $sCardY, $sCardW, $sCardH, [float](18 * $scale))
            $scBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
            $g.FillPath($scBrush, $scPath)
            $scBrush.Dispose()
            $scPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(255, 226, 232, 240), [float](1.5 * $scale))
            $g.DrawPath($scPen, $scPath)
            $scPen.Dispose()
            $scPath.Dispose()

            # Status Badge
            $sbW = [float](270 * $scale)
            $sbX = [float]($screenX + $sCardW - $sbW)
            $sbPath = [GfxClinic]::Round($sbX, [float]($sCardY + (16 * $scale)), $sbW, [float](32 * $scale), [float](16 * $scale))
            $sbFill = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 220, 252, 231))
            $g.FillPath($sbFill, $sbPath)
            $sbFill.Dispose()
            $sbPath.Dispose()

            $sbTextBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 22, 101, 52))
            $g.DrawString($sh.Status, $sBadgeFont, $sbTextBrush, [float]($sbX + (12 * $scale)), [float]($sCardY + (22 * $scale)))
            $sbTextBrush.Dispose()

            # Doctor & Spec
            $g.DrawString($sh.Doc, $sDocFont, [System.Drawing.Brushes]::Black, [float]($screenX + (44 * $scale)), [float]($sCardY + (18 * $scale)))
            $specB = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 100, 116, 139))
            $g.DrawString("$($sh.Spec) - $($sh.Cabin)", $sSubFont, $specB, [float]($screenX + (44 * $scale)), [float]($sCardY + (44 * $scale)))
            $specB.Dispose()

            # Time & Fee
            $timeB = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 15, 23, 42))
            $g.DrawString("$($sh.Time)   |   Fee: $($sh.Fee)", $sDocFont, $timeB, [float]($screenX + (44 * $scale)), [float]($sCardY + (76 * $scale)))
            $timeB.Dispose()

            # Quota Progress Bar
            $barW = [float]($sCardW - (88 * $scale))
            $barH = [float](12 * $scale)
            $barY = [float]($sCardY + (116 * $scale))

            $barBgPath = [GfxClinic]::Round([float]($screenX + (44 * $scale)), $barY, $barW, $barH, [float](6 * $scale))
            $barBgBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 226, 232, 240))
            $g.FillPath($barBgBrush, $barBgPath)
            $barBgBrush.Dispose()
            $barBgPath.Dispose()

            $fillW = [float]($barW * $sh.Pct)
            $barFillPath = [GfxClinic]::Round([float]($screenX + (44 * $scale)), $barY, $fillW, $barH, [float](6 * $scale))
            $barFillBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 13, 148, 136))
            $g.FillPath($barFillBrush, $barFillPath)
            $barFillBrush.Dispose()
            $barFillPath.Dispose()

            # Quota Text
            $qFont = New-Object System.Drawing.Font("Arial", [int](11 * $scale), [System.Drawing.FontStyle]::Bold)
            $qBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 71, 85, 105))
            $g.DrawString("OPD Token Capacity: $($sh.Quota) ($([int]($sh.Pct * 100))% Capacity)", $qFont, $qBrush, [float]($screenX + (44 * $scale)), [float]($sCardY + (136 * $scale)))
            $qFont.Dispose()
            $qBrush.Dispose()

            $sCardY += $sCardH + [float](20 * $scale)
        }
        $sDocFont.Dispose()
        $sSubFont.Dispose()
        $sBadgeFont.Dispose()
    }

    # Save Bitmap
    $parentDir = [System.IO.Path]::GetDirectoryName($outputPath)
    if (-not (Test-Path $parentDir)) {
        New-Item -ItemType Directory -Path $parentDir -Force | Out-Null
    }
    $bmp.Save($outputPath, [System.Drawing.Imaging.ImageFormat]::Png)

    $g.Dispose()
    $bmp.Dispose()
    Write-Host "Generated: $outputPath ($canvasWidth x $canvasHeight)" -ForegroundColor Green
}

# ============================================================
# DEFINITION OF 4 CLINIC SCREENS
# ============================================================
$screens = @(
    @{
        File = "01_dashboard.png"
        Headline = "Centralized Clinic OPD & Patient Management"
        Subheadline = "Real-time patient volumes, active doctors, and counter revenue overview"
        Index = 1
    },
    @{
        File = "02_live_queue_board.png"
        Headline = "Real-Time Cabin Token Calling & Live Queue Board"
        Subheadline = "Multi-doctor cabin calling, audio voice announcements, and physical presence control"
        Index = 2
    },
    @{
        File = "03_walkin_billing.png"
        Headline = "Fast Walk-In Registration & Multi-Counter Invoicing"
        Subheadline = "Instant 10-digit tracking code generation with QR, Cash & Fonepay billing"
        Index = 3
    },
    @{
        File = "04_slot_schedule.png"
        Headline = "Doctor OPD Shift Scheduling & Slot Quota Manager"
        Subheadline = "Publish morning and evening shifts, set patient quotas, and configure fees"
        Index = 4
    }
)

Write-Host "=== Generating 7-Inch Tablet Screenshots for Clinic App (1200 x 1920) ===" -ForegroundColor Cyan
foreach ($s in $screens) {
    $out = "PlayStore/clinic-app/tablet_7inch_1200x1920/$($s.File)"
    Render-ClinicTabletScreenshot $out 1200 1920 $s.Headline $s.Subheadline $s.Index
}

Write-Host "=== Generating 10-Inch Tablet Screenshots for Clinic App (1600 x 2560) ===" -ForegroundColor Cyan
foreach ($s in $screens) {
    $out = "PlayStore/clinic-app/tablet_10inch_1600x2560/$($s.File)"
    Render-ClinicTabletScreenshot $out 1600 2560 $s.Headline $s.Subheadline $s.Index
}

$logoImg.Dispose()
Write-Host "ALL CLINIC TABLET SCREENSHOTS GENERATED SUCCESSFULLY!" -ForegroundColor Green

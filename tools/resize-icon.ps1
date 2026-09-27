# Resizes desktop/assets/icon-source.png and dumps raw BGRA pixel data for ICO assembly.
# Called by tools/generate-icons.mjs (which builds the final .ico). Do not run directly.
# Output (in -OutDir): raw-<size>.bin (top-down 32bpp BGRA) for BMP sizes, png-256.png.
param(
    [string]$Source,
    [string]$OutDir
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$src = [System.Drawing.Image]::FromFile($Source)
try {
    foreach ($size in 16, 24, 32, 48, 64, 128) {
        $bmp = New-Object System.Drawing.Bitmap($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
        $g = [System.Drawing.Graphics]::FromImage($bmp)
        $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
        $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
        $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
        $g.DrawImage($src, 0, 0, $size, $size)
        $g.Dispose()
        $rect = New-Object System.Drawing.Rectangle(0, 0, $size, $size)
        $data = $bmp.LockBits($rect, [System.Drawing.Imaging.ImageLockMode]::ReadOnly, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
        try {
            $bytes = New-Object byte[] ($data.Stride * $size)
            [System.Runtime.InteropServices.Marshal]::Copy($data.Scan0, $bytes, 0, $bytes.Length)
            [System.IO.File]::WriteAllBytes((Join-Path $OutDir "raw-$size.bin"), $bytes)
        } finally { $bmp.UnlockBits($data); $bmp.Dispose() }
    }
    $bmp256 = New-Object System.Drawing.Bitmap(256, 256, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($bmp256)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $g.DrawImage($src, 0, 0, 256, 256)
    $g.Dispose()
    $bmp256.Save((Join-Path $OutDir 'png-256.png'), [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp256.Dispose()
} finally { $src.Dispose() }
Write-Host 'resize done'

<#
.SYNOPSIS
    Genera los iconos de launcher y el splash de Android a partir de la marca
    de Biblioshare.

.DESCRIPTION
    La marca del icono vive en `src/lib/app-icon.tsx` como componente React, que
    Next renderiza a PNG en runtime (`/icon`, `/icon-192`) para la PWA. Android
    no puede consumir eso: necesita PNG y vectores en el árbol `res/`. Este
    script reproduce la MISMA geometría — los tres lomos sobre terracota — con
    System.Drawing, sin añadir dependencias al proyecto.

    Si cambias los colores o proporciones en `src/lib/app-icon.tsx`, cambia las
    constantes de aquí y vuelve a ejecutar el script.

    Genera dos rutas, porque `minSdkVersion = 24` y los adaptive icons existen
    a partir de la API 26:

      - API 26+ : adaptive icon = color de fondo (`values/ic_launcher_background.xml`)
                  + vector de primer plano (`drawable/ic_launcher_foreground.xml`).
      - API 24-25: PNG legacy en `mipmap-{m,h,xh,xxh,xxx}dpi/` (normal y round).

.NOTES
    Ejecutar desde la raíz del repo:
        powershell -ExecutionPolicy Bypass -File scripts/generate-android-icons.ps1
#>

[CmdletBinding()]
param(
    [string]$ResDir = "android/app/src/main/res"
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

# --- Marca: espejo de src/lib/app-icon.tsx -----------------------------------
# Los colores van en crudo a propósito (allí es porque Satori no resuelve CSS
# vars; aquí porque Android tampoco lee globals.css).
$Accent = "#b0542f"

# Proporciones del mockup: icono 120 -> marca de 66 de alto, lomos de 18 de
# ancho y 9 de hueco; alturas 46 / 66 / 34.
$MarkRatio       = 66.0 / 120.0
$SpineWidthRatio = 18.0 / 66.0   # relativo al alto de la marca
$GapRatio        =  9.0 / 66.0   # relativo al alto de la marca
$CornerRatio     = 0.4           # radio = ancho del lomo * 0.4

$Spines = @(
    @{ Color = "#e8b06a"; Height = 46.0 / 66.0 },  # libro
    @{ Color = "#7fc6c9"; Height = 66.0 / 66.0 },  # pelicula
    @{ Color = "#caa2d0"; Height = 34.0 / 66.0 }   # serie
)

function ConvertFrom-HexColor([string]$hex) {
    [System.Drawing.ColorTranslator]::FromHtml($hex)
}

# `Set-Content -Encoding utf8` escribe BOM en Windows PowerShell 5.1, y el BOM
# ensucia el diff de unos XML que ya venian sin el. Escribimos UTF-8 pelado.
function Write-Utf8NoBom([string]$path, [string[]]$lines) {
    $full = [System.IO.Path]::GetFullPath((Join-Path (Get-Location) $path))
    $utf8 = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($full, (($lines -join "`n") + "`n"), $utf8)
}

# Devuelve la geometria de los lomos para un alto de marca dado, centrada en
# una caja de $canvas x $canvas. Coordenadas en unidades del canvas.
#
# Ojo: el componente web alinea los lomos al borde INFERIOR (`alignItems:
# flex-end` sobre un contenedor de alto 100%). Aqui se centran verticalmente.
# No es un descuido: un adaptive icon puede recortarse con cualquier mascara,
# asi que el contenido debe caber en la zona segura central o el sistema lo
# corta. Ver docs/requirements/decisiones.md.
function Get-SpineRects([double]$canvas, [double]$markHeight) {
    $spineWidth = $markHeight * $SpineWidthRatio
    $gap        = $markHeight * $GapRatio
    $totalWidth = ($Spines.Count * $spineWidth) + (($Spines.Count - 1) * $gap)

    $left   = ($canvas - $totalWidth) / 2.0
    $bottom = ($canvas + $markHeight) / 2.0   # linea de base comun

    $rects = @()
    for ($i = 0; $i -lt $Spines.Count; $i++) {
        $h = $markHeight * $Spines[$i].Height
        $x = $left + $i * ($spineWidth + $gap)
        $rects += [pscustomobject]@{
            X      = $x
            Y      = $bottom - $h
            Width  = $spineWidth
            Height = $h
            Radius = $spineWidth * $CornerRatio
            Color  = $Spines[$i].Color
        }
    }
    return $rects
}

function New-RoundedPath([double]$x, [double]$y, [double]$w, [double]$h, [double]$r) {
    # Un radio mayor que la mitad del lado menor produce arcos solapados.
    $r = [Math]::Min($r, [Math]::Min($w, $h) / 2.0)
    $d = $r * 2.0
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $path.AddArc($x,           $y,           $d, $d, 180, 90)
    $path.AddArc($x + $w - $d, $y,           $d, $d, 270, 90)
    $path.AddArc($x + $w - $d, $y + $h - $d, $d, $d,   0, 90)
    $path.AddArc($x,           $y + $h - $d, $d, $d,  90, 90)
    $path.CloseFigure()
    return $path
}

# --- PNG legacy (API 24-25) --------------------------------------------------
function New-LauncherPng([int]$size, [string]$path, [bool]$round) {
    $bmp = New-Object System.Drawing.Bitmap($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g   = [System.Drawing.Graphics]::FromImage($bmp)
    try {
        $g.SmoothingMode     = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
        $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $g.Clear([System.Drawing.Color]::Transparent)

        # El icono redondo lo recorta la propia app: el launcher no aplica
        # mascara a `roundIcon`, la espera ya recortada.
        if ($round) {
            $clip = New-Object System.Drawing.Drawing2D.GraphicsPath
            $clip.AddEllipse(0, 0, $size, $size)
            $g.SetClip($clip)
            $clip.Dispose()
        }

        $bg = New-Object System.Drawing.SolidBrush(ConvertFrom-HexColor $Accent)
        $g.FillRectangle($bg, 0, 0, $size, $size)
        $bg.Dispose()

        foreach ($r in Get-SpineRects -canvas $size -markHeight ($size * $MarkRatio)) {
            $p     = New-RoundedPath $r.X $r.Y $r.Width $r.Height $r.Radius
            $brush = New-Object System.Drawing.SolidBrush(ConvertFrom-HexColor $r.Color)
            $g.FillPath($brush, $p)
            $brush.Dispose()
            $p.Dispose()
        }

        $full = Join-Path (Get-Location) $path
        $bmp.Save($full, [System.Drawing.Imaging.ImageFormat]::Png)
        Write-Host "  $path  ($size x $size)"
    }
    finally {
        $g.Dispose()
        $bmp.Dispose()
    }
}

# --- Vector de primer plano (API 26+) ---------------------------------------
function Get-RoundedPathData([double]$x, [double]$y, [double]$w, [double]$h, [double]$r) {
    $r = [Math]::Min($r, [Math]::Min($w, $h) / 2.0)
    $f = { param($n) ([Math]::Round($n, 2)).ToString([System.Globalization.CultureInfo]::InvariantCulture) }
    $sb = New-Object System.Text.StringBuilder
    [void]$sb.Append("M$(& $f ($x + $r)),$(& $f $y)")
    [void]$sb.Append("h$(& $f ($w - 2 * $r))")
    [void]$sb.Append("a$(& $f $r),$(& $f $r) 0 0 1 $(& $f $r),$(& $f $r)")
    [void]$sb.Append("v$(& $f ($h - 2 * $r))")
    [void]$sb.Append("a$(& $f $r),$(& $f $r) 0 0 1 $(& $f (-$r)),$(& $f $r)")
    [void]$sb.Append("h$(& $f (-($w - 2 * $r)))")
    [void]$sb.Append("a$(& $f $r),$(& $f $r) 0 0 1 $(& $f (-$r)),$(& $f (-$r))")
    [void]$sb.Append("v$(& $f (-($h - 2 * $r)))")
    [void]$sb.Append("a$(& $f $r),$(& $f $r) 0 0 1 $(& $f $r),$(& $f (-$r))")
    [void]$sb.Append("z")
    return $sb.ToString()
}

function New-ForegroundVector([string]$path) {
    # Canvas de 108dp. Solo los 72dp centrales estan garantizados, y el launcher
    # puede aplicar una mascara circular inscrita en ellos. Con alto de marca 48
    # la caja de los lomos mide 52.4 x 48 y su diagonal es 71.0dp: cabe entera
    # en el circulo de 72dp, asi que ninguna mascara la recorta.
    $canvas     = 108.0
    $markHeight = 48.0

    $lines = @(
        '<?xml version="1.0" encoding="utf-8"?>',
        '<!-- Generado por scripts/generate-android-icons.ps1 a partir de src/lib/app-icon.tsx. No editar a mano. -->',
        '<vector xmlns:android="http://schemas.android.com/apk/res/android"',
        '    android:width="108dp"',
        '    android:height="108dp"',
        '    android:viewportWidth="108"',
        '    android:viewportHeight="108">'
    )
    foreach ($r in Get-SpineRects -canvas $canvas -markHeight $markHeight) {
        $d = Get-RoundedPathData $r.X $r.Y $r.Width $r.Height $r.Radius
        $lines += '    <path'
        $lines += "        android:fillColor=`"$($r.Color)`""
        $lines += "        android:pathData=`"$d`" />"
    }
    $lines += '</vector>'

    Write-Utf8NoBom $path $lines
    Write-Host "  $path"
}

function New-BackgroundColor([string]$path) {
    Write-Utf8NoBom $path @(
        '<?xml version="1.0" encoding="utf-8"?>',
        '<!-- Generado por scripts/generate-android-icons.ps1. El terracota de la marca (el token accent de globals.css). -->',
        '<!-- Ojo: XML prohibe la secuencia de dos guiones dentro de un comentario, asi que el token no se escribe con su prefijo. -->',
        '<resources>',
        "    <color name=`"ic_launcher_background`">$Accent</color>",
        "    <color name=`"splash_background`">$Accent</color>",
        '</resources>'
    )
    Write-Host "  $path"
}

# --- Splash de arranque ------------------------------------------------------
# El template de Capacitor trae 11 `splash.png` con SU logo (la cruz azul sobre
# blanco) a pantalla completa. Se sustituyen por vectores: un PNG a pantalla
# completa se estira o se recorta en cuanto la relacion de aspecto del
# dispositivo no coincide con la suya, y ademas obligaria a mantener once
# ficheros binarios.
function New-SplashMarkVector([string]$path) {
    # Viewport ajustado a la marca, sin margen: quien lo coloca decide el tamano.
    $markHeight = 100.0
    $spineWidth = $markHeight * $SpineWidthRatio
    $gap        = $markHeight * $GapRatio
    $totalWidth = ($Spines.Count * $spineWidth) + (($Spines.Count - 1) * $gap)

    $fmt = { param($n) ([Math]::Round($n, 2)).ToString([System.Globalization.CultureInfo]::InvariantCulture) }

    $lines = @(
        '<?xml version="1.0" encoding="utf-8"?>',
        '<!-- Generado por scripts/generate-android-icons.ps1 a partir de src/lib/app-icon.tsx. No editar a mano. -->',
        '<vector xmlns:android="http://schemas.android.com/apk/res/android"',
        "    android:width=`"$(& $fmt $totalWidth)dp`"",
        "    android:height=`"$(& $fmt $markHeight)dp`"",
        "    android:viewportWidth=`"$(& $fmt $totalWidth)`"",
        "    android:viewportHeight=`"$(& $fmt $markHeight)`">"
    )
    for ($i = 0; $i -lt $Spines.Count; $i++) {
        $h = $markHeight * $Spines[$i].Height
        $x = $i * ($spineWidth + $gap)
        $y = $markHeight - $h          # linea de base comun, abajo del viewport
        $d = Get-RoundedPathData $x $y $spineWidth $h ($spineWidth * $CornerRatio)
        $lines += '    <path'
        $lines += "        android:fillColor=`"$($Spines[$i].Color)`""
        $lines += "        android:pathData=`"$d`" />"
    }
    $lines += '</vector>'

    Write-Utf8NoBom $path $lines
    Write-Host "  $path"
}

function New-SplashLayerList([string]$path) {
    # `android:width/height` dentro de un <item> exige API 23; minSdk es 24.
    Write-Utf8NoBom $path @(
        '<?xml version="1.0" encoding="utf-8"?>',
        '<!-- Generado por scripts/generate-android-icons.ps1. No editar a mano. -->',
        '<layer-list xmlns:android="http://schemas.android.com/apk/res/android">',
        '    <item android:drawable="@color/splash_background" />',
        '    <item',
        '        android:gravity="center"',
        '        android:width="132dp"',
        '        android:height="121dp"',
        '        android:drawable="@drawable/splash_mark" />',
        '</layer-list>'
    )
    Write-Host "  $path"
}

# --- Ejecucion ---------------------------------------------------------------
if (-not (Test-Path $ResDir)) {
    throw "No encuentro '$ResDir'. Ejecuta el script desde la raiz del repo."
}

$densities = [ordered]@{
    "mdpi"    =  48
    "hdpi"    =  72
    "xhdpi"   =  96
    "xxhdpi"  = 144
    "xxxhdpi" = 192
}

Write-Host "Adaptive icon (API 26+):"
New-BackgroundColor  (Join-Path $ResDir "values/ic_launcher_background.xml")
New-ForegroundVector (Join-Path $ResDir "drawable/ic_launcher_foreground.xml")

Write-Host "PNG legacy (API 24-25):"
foreach ($d in $densities.Keys) {
    $dir = Join-Path $ResDir "mipmap-$d"
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
    New-LauncherPng -size $densities[$d] -path (Join-Path $dir "ic_launcher.png")       -round $false
    New-LauncherPng -size $densities[$d] -path (Join-Path $dir "ic_launcher_round.png") -round $true
}

Write-Host "Splash de arranque:"
New-SplashMarkVector (Join-Path $ResDir "drawable/splash_mark.xml")
New-SplashLayerList  (Join-Path $ResDir "drawable/splash.xml")

# Los `splash.png` del template conviven con `splash.xml` bajo el mismo nombre
# de recurso, y aapt2 aborta por recurso duplicado. Hay que quitarlos.
$stale = Get-ChildItem -Path $ResDir -Recurse -Filter "splash.png" -ErrorAction SilentlyContinue
foreach ($f in $stale) {
    Remove-Item $f.FullName -Force
    Write-Host "  eliminado $($f.Directory.Name)/$($f.Name)"
}

Write-Host ""
Write-Host "Listo. Recompila con: .\android\gradlew.bat -p android assembleDebug --no-daemon"

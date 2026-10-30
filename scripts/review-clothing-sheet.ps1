Add-Type -AssemblyName System.Drawing
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$dir = Join-Path $root 'artifacts/clothing-ai-20260921'
$manifest = Get-Content -Raw -LiteralPath (Join-Path $dir 'source-manifest.json') | ConvertFrom-Json
$sheet = [System.Drawing.Bitmap]::new(1280,1545)
$g = [System.Drawing.Graphics]::FromImage($sheet)
$g.Clear([System.Drawing.Color]::White)
$font = [System.Drawing.Font]::new('Arial',13)
$i=0
foreach($asset in $manifest.assets) {
  $x=($i%4)*320; $y=[Math]::Floor($i/4)*515
  $img=[System.Drawing.Bitmap]::new((Join-Path $dir ($asset.id + '-composite.png')))
  $g.DrawImage($img,[System.Drawing.Rectangle]::new($x,$y+30,320,480))
  $g.DrawString($asset.id,$font,[System.Drawing.Brushes]::Black,$x+5,$y+5)
  $img.Dispose(); $i++
}
$sheet.Save((Join-Path $dir 'review-sheet.png'),[System.Drawing.Imaging.ImageFormat]::Png)
$font.Dispose(); $g.Dispose(); $sheet.Dispose()

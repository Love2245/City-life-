$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Drawing
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$dir=Join-Path $root 'artifacts/clothing-ai-20260921'
$manifest=Get-Content -Raw -LiteralPath (Join-Path $dir 'source-manifest.json') | ConvertFrom-Json
$audit=@()
foreach($a in $manifest.assets) {
  $path=Join-Path $root $a.target
  $b=[System.Drawing.Bitmap]::new($path)
  if($b.Width -ne 1024 -or $b.Height -ne 1536) { throw "Wrong canvas: $($a.id)" }
  if($b.GetPixel(0,0).A -ne 0 -or $b.GetPixel(500,100).A -ne 0 -or $b.GetPixel(500,1500).A -ne 0) { throw "Non-garment pixels: $($a.id)" }
  $transparent=0; $visible=0
  for($y=0;$y -lt 1536;$y+=8) { for($x=0;$x -lt 1024;$x+=8) {
    if($b.GetPixel($x,$y).A -eq 0) {$transparent++} else {$visible++}
  }}
  if($visible -lt 100 -or $transparent -lt 1000) { throw "Invalid alpha: $($a.id)" }
  $audit += [PSCustomObject]@{id=$a.id;canvas=@($b.Width,$b.Height);transparentSamples=$transparent;visibleSamples=$visible;sha256=(Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash;sourceSha256=(Get-FileHash -LiteralPath (Join-Path $root $a.archivedSource) -Algorithm SHA256).Hash}
  $b.Dispose()
}
# These previews use the same actual installed PNG stacking order as the resolver.
$combinations=@(
  @('suit','plain_gray_pants','underlayer_white','baseball_cap'),
  @('luxury_coat','jeans','underlayer_black',''),
  @('shirt','khaki_pants','underlayer_white',''),
  @('plain_black_tee','plain_gray_pants','underlayer_white','baseball_cap'),
  @('pinstripe_shirt','plain_gray_pants','underlayer_black',''),
  @('cable_knit_sweater','black_pants','blue_collared_shirt',''),
  @('taupe_double_suit','taupe_suit_trousers','underlayer_white',''),
  @('cream_relaxed_shirt','sage_wide_trousers','underlayer_gray','')
)
$sheet=[System.Drawing.Bitmap]::new(1280,1030)
$g=[System.Drawing.Graphics]::FromImage($sheet)
$g.Clear([System.Drawing.Color]::White)
$font=[System.Drawing.Font]::new('Arial',12)
$i=0
foreach($combo in $combinations) {
  $b=[System.Drawing.Bitmap]::new(1024,1536)
  $cg=[System.Drawing.Graphics]::FromImage($b)
  $cg.Clear([System.Drawing.Color]::FromArgb(224,229,235))
  $paths=@('src/assets/portraits/player/base/default.png')
  foreach($id in @($combo[1],$combo[2],$combo[0],$combo[3])) {
    if($id) { $paths += "src/assets/portraits/player/layers/$id/default.png" }
  }
  foreach($path in $paths) {
    $layer=[System.Drawing.Bitmap]::new((Join-Path $root $path))
    $cg.DrawImageUnscaled($layer,0,0)
    $layer.Dispose()
  }
  $x=($i%4)*320; $y=[Math]::Floor($i/4)*515
  $g.DrawString(($combo[0] + ' + ' + $combo[1]),$font,[System.Drawing.Brushes]::Black,$x+3,$y+5)
  $g.DrawImage($b,[System.Drawing.Rectangle]::new($x,$y+30,320,480))
  $b.Save((Join-Path $dir ('outfit-' + $i + '.png')),[System.Drawing.Imaging.ImageFormat]::Png)
  $cg.Dispose(); $b.Dispose(); $i++
}
$sheet.Save((Join-Path $dir 'installed-outfits.png'),[System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $sheet.Dispose(); $font.Dispose()
$audit | ConvertTo-Json -Depth 5 | Set-Content -Encoding utf8 -LiteralPath (Join-Path $dir 'installed-audit.json')
$audit | Format-Table id,transparentSamples,visibleSamples

param([switch]$Install)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
Add-Type -ReferencedAssemblies System.Drawing.Common,System.Drawing.Primitives -TypeDefinition @'
using System.Drawing;
public static class ClothingAlphaBounds {
  public static Rectangle Find(Bitmap b) {
    int x0=b.Width,y0=b.Height,x1=-1,y1=-1;
    for(int y=0;y<b.Height;y++) for(int x=0;x<b.Width;x++) {
      if(b.GetPixel(x,y).A <= 8) continue;
      x0=System.Math.Min(x0,x); y0=System.Math.Min(y0,y);
      x1=System.Math.Max(x1,x); y1=System.Math.Max(y1,y);
    }
    if(x1<0) throw new System.Exception("Empty alpha");
    return new Rectangle(x0,y0,x1-x0+1,y1-y0+1);
  }
}
'@
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$manifest = Get-Content -Raw -LiteralPath (Join-Path $root 'artifacts/clothing-ai-20260921/source-manifest.json') | ConvertFrom-Json
$archive = [IO.Path]::GetFullPath((Join-Path $root $manifest.archive))
if (-not $archive.StartsWith($root + [IO.Path]::DirectorySeparatorChar)) { throw 'Archive outside project' }
$previewDir = Join-Path $root 'artifacts/clothing-ai-20260921'
$layersRoot = [IO.Path]::GetFullPath((Join-Path $root 'src/assets/portraits/player/layers'))
if($Install) {
  # Resolve every target before moving anything; refuse to overwrite existing backups.
  foreach($asset in $manifest.assets) {
    if($asset.id -notmatch '^[a-z0-9_]+$') { throw 'Invalid asset id' }
    if(-not (Test-Path -LiteralPath $asset.source)) { throw "Missing AI source: $($asset.source)" }
    $target = [IO.Path]::GetFullPath((Join-Path $root $asset.target))
    if(-not $target.StartsWith($layersRoot + [IO.Path]::DirectorySeparatorChar)) { throw 'Invalid layer target' }
    $previous = [IO.Path]::GetFullPath((Join-Path $archive ('previous/' + $asset.id)))
    if(-not $previous.StartsWith($archive + [IO.Path]::DirectorySeparatorChar)) { throw 'Invalid archive target' }
    if((Test-Path -LiteralPath $previous) -and (Get-ChildItem -LiteralPath $previous -File).Count -gt 0) {
      throw "Archive already populated: $previous"
    }
  }
}
foreach($asset in $manifest.assets) {
  $id = $asset.id
  $sourcePath = if(Test-Path -LiteralPath $asset.source) { $asset.source } else { Join-Path $root $asset.archivedSource }
  $source = [System.Drawing.Bitmap]::new($sourcePath)
  $bounds = [ClothingAlphaBounds]::Find($source)
  $layer = [System.Drawing.Bitmap]::new(1024,1536,[System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $graphics = [System.Drawing.Graphics]::FromImage($layer)
  $graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $r = $asset.targetBounds
  $dest = [System.Drawing.Rectangle]::new($r[0],$r[1],$r[2],$r[3])
  # Registration only: copy existing AI pixels with scale/translation. No color or mask edits.
  $graphics.DrawImage($source,$dest,$bounds,[System.Drawing.GraphicsUnit]::Pixel)
  $graphics.Dispose()
  $candidate = Join-Path $previewDir ($id + '-registered.png')
  $layer.Save($candidate,[System.Drawing.Imaging.ImageFormat]::Png)
  $composite = [System.Drawing.Bitmap]::new(1024,1536)
  $g = [System.Drawing.Graphics]::FromImage($composite)
  $g.Clear([System.Drawing.Color]::FromArgb(224,229,235))
  $body = [System.Drawing.Bitmap]::new((Join-Path $root $manifest.bodyReference))
  $g.DrawImageUnscaled($body,0,0)
  $g.DrawImageUnscaled($layer,0,0)
  $composite.Save((Join-Path $previewDir ($id + '-composite.png')),[System.Drawing.Imaging.ImageFormat]::Png)
  $body.Dispose(); $g.Dispose(); $composite.Dispose(); $layer.Dispose(); $source.Dispose()
  if($Install) {
    $target = [IO.Path]::GetFullPath((Join-Path $root $asset.target))
    if (-not $target.StartsWith($layersRoot + [IO.Path]::DirectorySeparatorChar)) { throw 'Invalid layer target' }
    $previous = Join-Path $archive ('previous/' + $id)
    New-Item -ItemType Directory -Force -Path $previous,(Join-Path $archive 'sources'),(Split-Path $target) | Out-Null
    foreach($old in Get-ChildItem -LiteralPath (Split-Path $target) -Filter '*.png' -File) {
      $backup = Join-Path $previous $old.Name
      if(Test-Path -LiteralPath $backup) { throw "Archive already contains $backup; refusing overwrite" }
      Move-Item -LiteralPath $old.FullName -Destination $backup
    }
    Copy-Item -LiteralPath $asset.source -Destination (Join-Path $archive ('sources/' + $id + '.png'))
    if($asset.initialSource) {
      Copy-Item -LiteralPath $asset.initialSource -Destination (Join-Path $archive ('sources/' + $id + '-initial.png'))
    }
    Copy-Item -LiteralPath $candidate -Destination $target
  }
  [PSCustomObject]@{Id=$id;SourceBounds=$bounds.ToString();TargetBounds=$dest.ToString();Installed=[bool]$Install}
}

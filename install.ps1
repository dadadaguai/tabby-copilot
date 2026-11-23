param(
    [switch]$SkipBuild
)

# 一键安装：build → npm pack → npm install 进 Tabby 的 plugins 目录
# 用法：  .\install.ps1            （构建 + 打包 + 安装）
#         .\install.ps1 -SkipBuild （跳过构建，直接用已有的 .tgz）
$ErrorActionPreference = 'Stop'

if (-not $SkipBuild) {
    Write-Host '[1/3] build...'
    npm run build
    if ($LASTEXITCODE -ne 0) { throw 'build 失败' }

    Write-Host '[2/3] pack...'
    npm pack
    if ($LASTEXITCODE -ne 0) { throw 'npm pack 失败' }
}

$version = (Get-Content -LiteralPath (Join-Path $PSScriptRoot 'package.json') -Raw -Encoding UTF8 | ConvertFrom-Json).version
$archive = Join-Path $PSScriptRoot "tabby-copilot-$version.tgz"
if (-not (Test-Path -LiteralPath $archive -PathType Leaf)) {
    throw "缺少安装包：$archive（先运行 .\install.ps1，或先 npm run build && npm pack）"
}

# Tabby 的用户插件目录（与内置插件 resources/builtin-plugins 区分开）
$pluginRoot = Join-Path $env:APPDATA 'tabby\plugins'
New-Item -ItemType Directory -Path $pluginRoot -Force | Out-Null

Write-Host "[3/3] install into $pluginRoot ..."
Push-Location -LiteralPath $pluginRoot
try {
    npm install $archive --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) { throw "npm install 失败：$archive" }
} finally {
    Pop-Location
}

Write-Host "已安装 tabby-copilot $version，重启 Tabby 后生效。"

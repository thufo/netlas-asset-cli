# Netlas Asset

简体中文 · [English](README.md) · [Русский](README.ru.md)

Netlas Asset 是使用 Netlas 官方 API 进行专注、合规资产查询的多语言桌面端和命令行客户端。`desk-cli` 分支为 Node.js/Electron 版本，原 Python 版本保留在 `main`。

## 主要功能

- 查询 IP 地址和完整域名的主机摘要。
- 搜索公共响应数据，自动分页，本地最多返回 200 条。
- 桌面端支持表格/JSON 查看、JSON/JSONL/CSV 导出、查询历史和收藏。
- 自动识别语言，并可在中文、英文、俄文之间手动切换。
- 可选择使用操作系统安全凭据服务保存 API 密钥。
- 提供 Windows、Linux 的 x64 和 ARM64 版本。

只能查询您拥有或已明确获得调查授权的资产。

## 桌面端

从 [GitHub Releases](https://github.com/thufo/netlas-asset-cli/releases) 下载对应安装包或便携版。进入“设置”填写 Netlas API 密钥。默认仅在本次运行中保存；启用“安全保存”后使用系统凭据服务。Linux 缺少安全密钥服务时会禁止持久化。

查询结果可以导出 JSON、JSONL 或 CSV。历史记录只保存查询条件，不保存 API 密钥和返回结果。

## 命令行

```text
netlas-asset host TARGET [--timeout 秒] [--retries 次数] [--format json|jsonl|csv] [--output 文件]
netlas-asset search QUERY [--limit 1..200] [--timeout 秒] [--retries 次数] [--format json|jsonl|csv] [--output 文件]
```

```powershell
$env:NETLAS_API_KEY = "替换为您的密钥"
netlas-asset --lang zh-CN host example.com
netlas-asset search 'port:443' --limit 40 --format csv --output results.csv
```

需要 Node.js 22 或更高版本进行开发：`npm ci`、`npm run check`、`npm run dev`。本项目使用 MIT License。

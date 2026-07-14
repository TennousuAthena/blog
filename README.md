# 奇异果网络日志 · Kiwi's web log

个人博客 —— 随记、记录与沉淀。站点：[blog.kiwi.moe](https://blog.kiwi.moe)。

文字核心由自己编写，句子上的润色大多借助生成式人工智能。

## 特性

- Astro 7 + Content Collections + MDX + RSS + Sitemap
- **i18n**：中文（默认 `/`）与英文（`/en/`）
- **日间 / 夜间**主题
- **CWD 评论**、**LaTeX**、**Mermaid**、**TradingView** K 线嵌入

## 快速开始

```bash
npm install
cp .env.example .env
npm run dev
```

## 环境变量

```bash
SITE=https://blog.kiwi.moe
PUBLIC_CWD_API_BASE_URL=
PUBLIC_CWD_SITE_ID=kiwi
```

本地测评论：`npm run cwd:mock`，并将 `PUBLIC_CWD_API_BASE_URL` 设为 `http://127.0.0.1:8787`。

## Notion 内容同步

本主题内置 Notion → MDX 单向同步：一个 Notion 数据库中的 **Published** 页面会被物化为 `src/content/blog/notion/` 下的本地 MDX 与图片，再随 Astro 静态构建发布。同步脚本只写受管根 `src/content/blog/notion/`，不会删除手写文章或 `src/assets/`。

### Notion 数据源契约（属性名/类型必须精确匹配）

| 属性 | 类型 | 说明 |
|------|------|------|
| `Name` | title | 文章标题 |
| `Slug` | rich_text | 小写 ASCII kebab-case（`^[a-z0-9]+(?:-[a-z0-9]+)*$`） |
| `Status` | status | 必须包含精确选项 `Published`；仅导出 `Published` |
| `Description` | rich_text | 摘要 |
| `Publish Date` | date | 发布时间（`start`） |
| `Tags` | multi_select | 标签 |
| `Language` | select | 仅 `zh` / `en` |
| `Featured` | checkbox | 精选 |
| `Translation Key` | rich_text | 可空；非空时也需 kebab-case，同 key 每语言最多一篇 |

页面 `cover` 用作 hero，`last_edited_time` 用作 `updatedDate`。同步开始会校验 schema：缺字段、错类型或缺选项时一次性报告全部差异并失败，绝不猜测映射。

### 创建 Notion 连接并获取 Data Source ID

1. 在 Notion 创建一个 **internal integration**，勾选 *Read content* 权限，得到 token（形如 `ntn_xxx`）。
2. 打开博客数据库 → `...` → *Connections* → 添加该 integration。
3. 数据库 ID 即 **data source ID**（32 位 hex UUID，带或不带连字符均可）。

### 本地同步与构建

```bash
cp .env.example .env
# 填入未提交的 .env（绝不入库）：
#   NOTION_TOKEN=ntn_xxx
#   NOTION_DATA_SOURCE_ID=<32-hex>
npm run sync:notion        # Notion -> src/content/blog/notion/（原子交换）
npm run build              # 纯 Astro 静态构建
npm run build:content      # sync:notion && astro build（CI/本地完整链路）
```

`sync:notion` 在仓库根的 `.notion-sync-<pid>/` 构建完整候选树，校验通过后才原子替换 `src/content/blog/notion/`；任何 API/属性/转换/下载错误都使本次同步失败、旧内容保持不变。中断残留的临时目录会在下次启动时按 `journal.json` 恢复或清理。

> 环境变量缺失时脚本以非零码退出并只打印缺失变量名（`Missing required environment variables: NOTION_TOKEN`）；日志不会输出 token、签名 URL 或 Deploy Hook URL。

## 部署

采用 **CNB 云原生构建**（[cnb.cool](https://cnb.cool)）+ `wrangler pages deploy` CLI，Astro 保持静态输出，不安装 Cloudflare adapter。

### CNB 构建流水线

配置文件 `.cnb.yml` 定义两条流水线（均在 `main` 分支触发）：

| 事件 | 触发方式 | 流程 |
|------|----------|------|
| `push` | push 到 main | install → build:admin → astro build → wrangler deploy |
| `api_trigger_notion` | Notion webhook → Pages Function → CNB OpenAPI | install → sync:notion → build:admin → astro build → wrangler deploy |

密钥通过 CNB 密钥仓库 `.cnb/secrets.yml` 导入（`imports`），包含 `CLOUDFLARE_API_TOKEN`、`NOTION_TOKEN` 等。模板见 `.cnb/secrets.yml.example`。

### Cloudflare Pages 配置

- **项目名**：`blog-kiwi-moe`
- **Function compatibility date**：`2026-07-13`
- **加密 secret**：`CNB_API_TOKEN`、`NOTION_WEBHOOK_VERIFICATION_SECRET`
- **变量**：`NOTION_DATA_SOURCE_ID`、`SITE`（正式域名）

仅 `/notion-webhook` 这一条路由运行 Pages Function（`functions/notion-webhook.ts`），用于验证 Notion webhook 签名后调用 CNB OpenAPI 触发构建；它不参与页面渲染。Function 类型契约由 `npm run generate:function-types` 生成并提交为 `functions/types.d.ts`。

### 自动发布：Notion webhook → CNB 构建

1. 在 CNB 创建[访问令牌](https://docs.cnb.cool/zh/guide/access-token.html)（需 `repo-cnb-trigger:rw` 权限），存为 Cloudflare Pages 加密变量 `CNB_API_TOKEN`。
2. Notion webhook 发送到 `https://blog.kiwi.moe/notion-webhook`，Function 验签后调用 `POST https://api.cnb.cool/kiwimoe/blog/-/build/start`，触发 `api_trigger_notion` 事件。

Function 只接受四类事件并按 data source ID 过滤后触发 CNB 构建：

| 事件 | 含义 |
|------|------|
| `data_source.entry_created` | 新建已发布页 |
| `data_source.entry_updated` | 正文/属性改动 |
| `data_source.entry_deleted` | 删除/移出 data source |
| `data_source.entry_restored` | 恢复 |

每次事件都触发**同一全量幂等同步**（不增量合并），因此取消发布、归档、删除或移出 data source 都会在下一次构建中清除对应内容。

### 一次性验证 bootstrap（精确流程）

1. 生成一次性高熵 nonce 与 10 分钟截止时间戳：

   ```bash
   node -e "const c=require('crypto'); console.log('NONCE='+c.randomBytes(24).toString('hex')); console.log('SETUP_UNTIL='+Date.now()+600000)"
   ```

2. 把 `BOOTSTRAP_NONCE=<nonce>` 与 `SETUP_UNTIL=<ms>` 作为**临时加密变量**部署（保持 `NOTION_WEBHOOK_VERIFICATION_SECRET` 为空）。
3. 打开实时日志，在 Notion 用**最终永久 URL** 创建 subscription：`https://<正式域名>/notion-webhook?setup=<nonce>`，验证后保留该 URL（**不要删除/重建 subscription**，新 subscription 会产生新的 verification token）。
4. 在实时日志中捕获 Notion 回传的 verification token，立即加密保存为 `NOTION_WEBHOOK_VERIFICATION_SECRET`，**删除** `BOOTSTRAP_NONCE` 与 `SETUP_UNTIL` 两个 bootstrap 变量，停止日志并重新部署。此后 handler 忽略仍存在的 `setup` query 并正常验签。

> subscription URL 不入库；验证后不重建 subscription。错误的 `setup` nonce 或过期时间不会产生日志；伪造签名返回 401 且不部署。CNB API 返回 2xx → 202；网络/408/429/5xx → 502；其它 4xx → 204 且不部署。
## 写文章

在 `src/content/blog/`（英文在 `en/`）新增 Markdown / MDX，填写 `lang` 与可选的 `translationKey`。

## LLM 友好输出（构建时自动生成）

`npm run build` 会根据 Content Collections **自动**产出，无需手改：

| 产物 | 说明 |
|------|------|
| `/llms.txt` | 站点索引，列出全部文章 Markdown 链接 |
| `/blog/<slug>.md`、`/en/blog/<slug>.md` | 各博文原文 Markdown |
| 博文 `<head>` 中的 `rel="alternate" type="text/markdown"` | 指向对应 `.md` |

构建末尾会跑 `scripts/verify-llm-artifacts.mjs`，缺文件则失败。

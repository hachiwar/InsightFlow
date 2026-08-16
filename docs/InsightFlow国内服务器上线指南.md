# InsightFlow 国内服务器上线指南

本文面向第一次部署 Web 项目的开发者，说明如何将 InsightFlow 部署到国内云厂商提供的 Linux 服务器。文档以单机 Docker Compose 演示环境为目标，不覆盖多节点高可用、自动扩缩容和生产数据库容灾。

文档核对日期：2026 年 8 月 6 日。

## 0. 首次上线总清单

当前部署代码位于 [GitHub Draft PR #1](https://github.com/hachiwar/InsightFlow/pull/1)，CI 已通过，但尚未合并到 `main`。在服务器上克隆 `main` 之前，必须先完成第 0.1 节。

### 0.1 合并部署代码

1. 打开 [Deploy InsightFlow with Docker Compose](https://github.com/hachiwar/InsightFlow/pull/1)。
2. 确认页面中的 `verify` 检查为绿色通过状态。
3. 单击 `Ready for review`，将 Draft PR 转为可审查状态。
4. 单击 `Merge pull request`，将 PR 合并到 `main`。
5. 打开仓库 `main` 分支，确认根目录已出现 `compose.yaml` 和 `.env.example`。

如果暂时不想合并，可以仅用于临时测试的分支克隆命令：

```bash
git clone --branch agent/add-project-documentation --single-branch https://github.com/hachiwar/InsightFlow.git .
```

正式部署建议使用已合并的 `main`，不要长期从功能分支运行。

### 0.2 准备上线资源

| 资源 | 是否必须 | 用途 |
|---|---|---|
| 腾讯云或阿里云账号 | 必须 | 购买和管理 Linux 服务器 |
| 4 核 8 GB Linux 服务器 | 推荐 | 构建并运行 Java、Python、Redis 和 Caddy |
| DeepSeek 或 Anthropic API Key | 必须 | MindAgent 意图识别和对话 |
| DashScope API Key | 正式数据问答必须 | DataAgent 查询规划和 SQL 生成 |
| 3 个随机密钥 | 必须 | 公开 API、内部 DataAgent 和 Redis 鉴权 |
| 域名 | 可选 | 通过 HTTPS 和固定地址访问 |
| ICP 备案 | 中国大陆服务器域名接入时必须 | 中国大陆服务器上的公开网站接入 |

第一次演示建议选择中国香港地域，先使用公网 IP 完成 HTTP 验证，再决定是否购买域名。

### 0.3 执行上线流程

| 顺序 | 操作 | 完成标准 | 对应章节 |
|---:|---|---|---:|
| 1 | 合并 Draft PR #1 | `main` 包含 `compose.yaml` | 0.1 |
| 2 | 购买服务器 | 获得公网 IP 和 SSH 登录方式 | 2～4 |
| 3 | 配置安全组 | 仅开放 `22`、`80` 和 `443` | 5 |
| 4 | 检查 Docker 环境 | Docker、Compose 和 Git 均可用 | 6 |
| 5 | 克隆代码 | 服务器上存在 `/opt/insightflow/compose.yaml` | 7 |
| 6 | 填写 `.env` | 密钥已替换，文件权限为 `600` | 8 |
| 7 | 构建并启动 | 4 个服务均为 `running` 或 `healthy` | 9 |
| 8 | 运行冒烟测试 | `/health` 和 `/chat` 通过 | 10 |
| 9 | 配置域名和 HTTPS | 证书有效，HTTPS 健康检查通过 | 11 |
| 10 | 完成公开检查 | 第 12 节清单全部确认 | 12 |

如果只需要首次技术验证，完成第 8 步即可。在此之前不需要购买域名。

### 0.4 选择 DataAgent 运行模式

| 模式 | `DASHSCOPE_API_KEY` | `DATAAGENT_ALLOW_MOCK` | 适用场景 |
|---|---|---|---|
| 真实模型调用 | 填写有效密钥 | `false` | 公开演示，当前仍仅使用 SQLite 演示数据 |
| 内置演示 | 可为空 | `true` | 仅验证文档中的交易笔数与利率问题 |

内置演示模式不是通用 Text2SQL。公开分享服务前，必须配置真实 DashScope API Key，将 `DATAAGENT_ALLOW_MOCK` 恢复为 `false`，并重建服务。

## 1. 阅读前说明

InsightFlow 由多个服务组成，不能只上传一个 JAR 文件完成部署：

```text
互联网用户
    ↓ HTTP/HTTPS
Caddy
    ↓
MindAgent Java 服务
    ├── Redis：会话记忆
    └── DataAgent Python 服务
            ↓
        SQLite 演示数据库
```

部署时只应公开反向代理的 `80` 和 `443` 端口。MindAgent、DataAgent 和 Redis 应通过 Docker 内部网络通信。

### 1.1 当前仓库状态

截至文档核对日期，仓库已包含单机部署所需的容器、网络、持久化、反向代理和鉴权配置。

| 项目 | 状态 | 说明 |
|---|---|---|
| MindAgent Dockerfile | 已实现 | 位于 `mindagent/MindAgentJava/MindAgentJava/Dockerfile` |
| DataAgent HTTP 服务 | 已有 | 提供 `/health` 和 `/query` |
| DataAgent Dockerfile | 已实现 | 使用最小运行依赖和非 root 用户 |
| 根级 `compose.yaml` | 已实现 | 统一启动 Redis、DataAgent、MindAgent 和 Caddy |
| 反向代理 | 已实现 | 仅 Caddy 向主机映射端口 |
| HTTPS | 已配置 | 使用域名时由 Caddy 自动申请和续期证书 |
| API 鉴权 | 已实现 | 公开 API 和 DataAgent 内部 API 使用不同密钥 |

### 1.2 演示环境边界

首次上线建议只使用仓库自带的 SQLite 演示数据。容器配置默认禁用 Mock；仅在受 API Key 保护的首次技术验证中，才可以临时将 `DATAAGENT_ALLOW_MOCK` 设为 `true`。Mock 只接受文档中的演示查询，其他查询会失败关闭。

## 2. 选择部署区域

### 2.1 快速演示

如果目标是面试展示或短期演示，建议选择腾讯云或阿里云的中国香港地域：

- 可以较快获得公网地址；
- 不需要先完成中国大陆 ICP 备案；
- 适合验证 Docker、域名和 HTTPS 流程。

### 2.2 中国大陆长期运行

如果主要用户位于中国大陆，可以选择广州、上海、杭州或北京等靠近用户的地域。根据工业和信息化部现行规定，在中华人民共和国境内通过域名或 IP 地址公开提供非经营性互联网信息服务，应依法履行备案手续。具体要求以服务器接入商和通信管理部门的审核为准。

参考资料：

- [工业和信息化部：非经营性互联网信息服务备案管理办法](https://www.miit.gov.cn/zcfg/xxtxl/art/2024/art_7e48434c08c24131b4b7eecfca5b2b6c.html)
- [腾讯云：是否需要备案](https://cloud.tencent.com/document/faq/243/19630)

## 3. 准备账号和资料

部署前需要准备以下内容：

- 一个腾讯云或阿里云账号；
- 一台 Linux 云服务器；
- 可访问 `hachiwar/InsightFlow` 的 GitHub 网络环境；
- DeepSeek 或 Anthropic API Key，用于 MindAgent；
- DashScope API Key，用于 DataAgent 的规划、SQL 生成和可选检索服务；
- 一个域名，可在基础服务验证成功后再购买。

所有 API Key 和密码必须配置在服务器的 `.env` 文件中，不得提交到 GitHub、写入截图或发送到公开聊天记录。

## 4. 购买云服务器

### 4.1 推荐配置

以下配置是单机演示环境的建议值，不是性能承诺：

| 配置项 | 最低演示配置 | 推荐演示配置 |
|---|---:|---:|
| CPU | 2 核 | 4 核 |
| 内存 | 4 GB | 8 GB |
| 系统盘 | 40 GB | 80 GB |
| 操作系统 | Ubuntu 22.04 LTS | Ubuntu 24.04 LTS |
| 购买周期 | 1 个月 | 1 个月 |

Java Maven 构建、Python 服务和 Redis 同时运行时会占用一定内存。首次部署建议按月购买 4 核 8 GB 实例，验证实际资源消耗后再决定续费或降配。

### 4.2 选择 Docker 镜像

腾讯云轻量应用服务器可以直接选择 Docker CE 应用模板。该模板已预装 Docker，并配置腾讯云镜像源，适合第一次部署。

参考资料：

- [腾讯云：使用应用模板搭建 Docker 容器环境](https://cloud.tencent.com/document/product/1207/60423)
- [阿里云：安装并使用 Docker 和 Docker Compose](https://help.aliyun.com/zh/ecs/user-guide/install-and-use-docker)

## 5. 配置防火墙

在云服务器控制台的防火墙或安全组中，只添加必要的入站规则：

| 端口 | 协议 | 来源 | 用途 |
|---:|---|---|---|
| `22` | TCP | 建议限制为管理员 IP | SSH 登录 |
| `80` | TCP | `0.0.0.0/0` | HTTP 和证书验证 |
| `443` | TCP | `0.0.0.0/0` | HTTPS |

不得向公网开放以下端口：

| 端口 | 服务 | 原因 |
|---:|---|---|
| `6379` | Redis | 数据和会话服务不应直接暴露公网 |
| `8090` | DataAgent | 数据查询服务只允许 MindAgent 内部调用 |
| `8080` | MindAgent | 应通过反向代理统一接入 |
| `9090` | Prometheus | 监控数据只允许管理员访问 |

## 6. 登录服务器并检查环境

第一次操作可以使用云厂商控制台提供的网页终端。熟悉后再使用本地 SSH 客户端。

登录服务器后执行：

```bash
docker --version
docker compose version
git --version
```

三条命令都应输出版本号。如果 Docker 或 Compose 不存在，请按照云厂商官方教程安装，不要混用多个第三方安装脚本。

检查 Docker 服务：

```bash
sudo systemctl status docker
```

如果状态不是 `active (running)`，执行：

```bash
sudo systemctl enable --now docker
```

## 7. 下载项目源码

创建固定部署目录：

```bash
sudo mkdir -p /opt/insightflow
sudo chown "$USER":"$USER" /opt/insightflow
cd /opt/insightflow
```

完成第 0.1 节的 PR 合并后，克隆 `main` 分支：

```bash
git clone --branch main --single-branch https://github.com/hachiwar/InsightFlow.git .
```

确认当前提交：

```bash
git status --short --branch
git log -1 --oneline
test -f compose.yaml
test -f .env.example
```

如果后两条命令任意一条失败，表示部署代码尚未进入当前分支，不要继续配置服务器。

如果中国大陆服务器无法稳定访问 GitHub，可以将仓库同步到自己的 Gitee 仓库，再从 Gitee 克隆。不要从不明网盘下载源码压缩包。

参考资料：[阿里云：部署业务代码至 ECS](https://help.aliyun.com/zh/ecs/user-guide/deploy-applications)

## 8. 配置环境变量

以下步骤以仓库根目录已经存在 `.env.example` 为前提：

```bash
cp .env.example .env
nano .env
```

先在服务器生成 3 个不同的随机密钥：

```bash
openssl rand -hex 32
openssl rand -hex 32
openssl rand -hex 32
```

将 3 行输出分别用于 `MINDAGENT_API_KEY`、`DATAAGENT_API_KEY` 和 `REDIS_PASSWORD`。推荐使用 DeepSeek 作为 MindAgent 的初始模型配置：

```dotenv
SITE_ADDRESS=:80
HTTP_PORT=80
HTTPS_PORT=443

MINDAGENT_API_KEY=<第 1 个随机密钥>
DATAAGENT_API_KEY=<第 2 个随机密钥>
REDIS_PASSWORD=<第 3 个随机密钥>

SPRING_PROFILES_ACTIVE=deepseek
DEEPSEEK_API_KEY=<填写 DeepSeek API Key>
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-v4-flash

DASHSCOPE_API_KEY=<填写 DashScope API Key>
DATAAGENT_TIMEOUT_MS=30000
DATAAGENT_ALLOW_MOCK=false
LLM_FALLBACK_ENABLED=false
```

如果尚未申请 DashScope API Key，进行首次技术验证时可以临时将 `DATAAGENT_ALLOW_MOCK` 改为 `true`。此模式只支持本文的演示数据问题，不得将其宣传为真实数据问答能力。

模型密钥申请和计费说明以官方页面为准：

- [DeepSeek API 首次调用指南](https://api-docs.deepseek.com/zh-cn/guides/reasoning_model)；
- [阿里云百炼：获取 API Key](https://help.aliyun.com/zh/model-studio/get-api-key)；
- [Anthropic：当前 Claude 模型](https://platform.claude.com/docs/en/about-claude/models/overview)。

保存后限制文件权限：

```bash
chmod 600 .env
```

检查 Git 不会跟踪密钥文件：

```bash
git status --short
```

输出中不应出现 `.env`。

## 9. 构建并启动服务

### 9.1 校验 Compose 配置

先确认根目录存在以下文件：

```bash
test -f compose.yaml
test -f .env
```

校验解析结果：

```bash
docker compose config --quiet
```

如果命令返回错误，必须先修复变量或 YAML 格式，不能继续启动。

### 9.2 构建镜像

```bash
docker compose build
```

第一次构建需要下载 Maven、Java 和 Python 基础镜像，耗时取决于服务器网络。构建失败时，先查看最后一段错误，不要反复执行命令。

### 9.3 启动容器

```bash
docker compose up -d
docker compose ps
```

预期至少看到以下服务处于 `running` 或 `healthy` 状态：

```text
redis
dataagent
mindagent
proxy
```

服务名称以最终 `compose.yaml` 为准。

## 10. 验证服务

### 10.1 查看启动日志

```bash
docker compose logs --tail=100 redis
docker compose logs --tail=100 dataagent
docker compose logs --tail=100 mindagent
docker compose logs --tail=100 proxy
```

日志中不得出现以下信息：

- Redis 身份验证失败；
- DataAgent 无法监听端口；
- MindAgent 无法连接 Redis；
- MindAgent 无法连接 DataAgent；
- Java JAR 不存在；
- API Key 被打印到日志。

### 10.2 验证健康检查

通过反向代理测试 MindAgent：

```bash
curl --fail --show-error http://127.0.0.1/health
```

在 DataAgent 容器内测试其健康接口：

```bash
docker compose exec dataagent python -c "import urllib.request; print(urllib.request.urlopen('http://127.0.0.1:8090/health').read().decode())"
```

预期 DataAgent 返回：

```json
{"status":"ok"}
```

### 10.3 验证统一对话接口

```bash
set -a
. ./.env
set +a

curl --fail --show-error \
  --request POST \
  --header 'Content-Type: application/json; charset=utf-8' \
  --header "X-API-Key: $MINDAGENT_API_KEY" \
  --data '{"message":"查询总交易笔数大于 50000 的用户利率","user_id":"demo-user","conversation_id":"demo-conversation"}' \
  http://127.0.0.1/chat
```

也可以使用仓库内的冒烟测试脚本：

```bash
python3 scripts/smoke_test.py --base-url http://127.0.0.1 --api-key "$MINDAGENT_API_KEY"
```

验收时应检查：

- HTTP 状态码为 `200`；
- 响应包含实际 Agent 类型；
- 数据问题被路由到 DataAgent；
- 响应包含 SQL 和查询结果；
- 无关问题不会返回演示 SQL；
- DataAgent 执行失败时，Java 不会把失败结果包装为成功。

## 11. 配置域名和 HTTPS

### 11.1 配置 DNS

在域名服务商控制台增加 `A` 记录：

```text
记录类型：A
主机记录：api
记录值：服务器公网 IP
```

配置完成后，访问地址为：

```text
api.example.com
```

将 `example.com` 替换为自己的域名。

### 11.2 启用 HTTPS

将 `.env` 中的 `SITE_ADDRESS` 从 `:80` 改为自己的域名：

```dotenv
SITE_ADDRESS=api.example.com
```

然后重建 Caddy 容器：

```bash
docker compose up -d --force-recreate proxy
docker compose logs --tail=100 proxy
```

Caddy 会自动申请和续期证书。也可以使用 1Panel 创建反向代理网站并申请证书。

参考资料：

- [1Panel：创建反向代理网站](https://1panel.cn/docs/v2/user_manual/websites/website_create/)
- [1Panel：配置 HTTPS 和反向代理](https://1panel.cn/docs/v2/user_manual/websites/website_config_basic/)

启用后验证：

```bash
curl --fail --show-error https://api.example.com/health
```

除了在服务器上执行验证，还应在自己的电脑上执行同一命令，确认 DNS、云安全组和公网 HTTPS 链路均正常。

浏览器地址栏应显示有效 HTTPS 证书，不应通过关闭证书校验绕过错误。

## 12. 公开访问前检查

公开分享地址前必须完成以下检查：

- [ ] 只开放 `22`、`80` 和 `443` 端口；
- [ ] `.env` 权限为 `600`，且未提交 Git；
- [ ] Redis、DataAgent 和 MindAgent 不直接暴露公网；
- [ ] 调用 `/chat` 时已使用 `X-API-Key`；
- [ ] `/knowledge/add`、`/knowledge/upload`、`/eval/run`、`/monitor` 和 `/metrics` 不允许匿名访问；
- [ ] DataAgent 仅使用只读连接，并已限制超时和最大返回行数；
- [ ] 接入真实数据库前，已增加数据源、表和字段白名单；
- [ ] 没有模型密钥时，数据查询采用失败关闭而非 Mock 回答；
- [ ] 当前数据库只包含演示数据；
- [ ] 已设置云服务器和模型 API 的费用提醒；
- [ ] 中国大陆公开服务已经按要求完成备案。

## 13. 更新版本

每次更新前先记录当前提交：

```bash
cd /opt/insightflow
git rev-parse HEAD
```

拉取 `main` 最新代码：

```bash
git fetch origin
git pull --ff-only origin main
```

重新构建并启动：

```bash
docker compose build
docker compose up -d
docker compose ps
```

更新后重复第 10 节的健康检查和对话接口测试。

## 14. 回滚版本

如果新版本不能正常运行，先从部署记录中找到上一个可用提交 ID，然后执行：

```bash
cd /opt/insightflow
git switch --detach <上一个可用提交 ID>
docker compose build
docker compose up -d
```

恢复正常后，不要长期停留在 detached HEAD 状态。修复代码并合并到 `main` 后执行：

```bash
git switch main
git pull --ff-only origin main
docker compose up -d --build
```

## 15. 数据备份

演示环境至少需要备份：

- MindAgent 的 `knowledge-store.json`；
- MindAgent 的 `memory-store.json`；
- Redis 持久化数据卷；
- 服务器上的 `.env`，应使用受控的密钥管理或加密备份；
- 将来接入的真实数据库备份。

当前 DataAgent 会在 Pipeline 初始化时重新创建 SQLite 演示数据库，因此该数据库不应被视为可靠持久化数据源。接入真实数据库前，应改为独立只读账号和正式备份策略。

## 16. 停止服务

临时停止全部服务：

```bash
cd /opt/insightflow
docker compose stop
```

重新启动：

```bash
docker compose start
```

停止并删除容器、保留命名数据卷：

```bash
docker compose down
```

不要执行 `docker compose down -v`。参数 `-v` 会删除 Compose 管理的数据卷，可能导致 Redis、知识库和记忆数据丢失。

## 17. 常见问题

### 17.1 `docker compose` 命令不存在

服务器可能只安装了旧版 `docker-compose`，或未安装 Compose 插件。应按照云厂商教程安装 `docker-compose-plugin`，不要同时维护两套 Compose。

### 17.2 Docker 镜像下载失败

中国大陆服务器可能无法稳定访问 Docker Hub。应在云厂商容器镜像服务中获取专属镜像加速地址，并配置 Docker 镜像加速器。

### 17.3 Java 镜像构建失败

依次检查：

1. 服务器剩余内存和磁盘；
2. Maven Central 网络访问；
3. `pom.xml` 依赖解析错误；
4. Java 编译错误；
5. 最终 JAR 名称是否与 Dockerfile 一致。

不能使用仓库中损坏的 `mvnw.cmd` 证明构建成功。部署验收应以 Linux Dockerfile 中的 Maven 构建结果为准。

### 17.4 MindAgent 无法连接 DataAgent

检查：

```bash
docker compose ps
docker compose logs --tail=100 dataagent
docker compose logs --tail=100 mindagent
```

环境变量应使用 Docker 服务名：

```env
DATAAGENT_BASE_URL=http://dataagent:8090
```

容器中不能使用 `localhost:8090` 访问另一个容器。

### 17.5 MindAgent 无法连接 Redis

Redis 主机名应使用 Compose 服务名，而不是 `localhost`：

```env
REDIS_HOST=redis
REDIS_PORT=6379
```

同时确认 MindAgent 与 Redis 使用相同密码。

### 17.6 公网 IP 无法访问

依次检查：

1. `docker compose ps` 中服务是否运行；
2. `curl http://127.0.0.1/health` 是否成功；
3. 云服务器防火墙是否开放 `80` 和 `443`；
4. Linux 主机防火墙是否允许对应端口；
5. 反向代理是否监听公网接口；
6. 中国大陆服务器是否满足接入和备案要求。

### 17.7 修改 `.env` 后没有生效

重新创建相关容器：

```bash
docker compose up -d --force-recreate
```

执行后再次查看日志，确认程序读取了正确的非敏感配置。不要通过打印完整环境变量检查密钥。

## 18. 部署验收记录

建议每次部署保留以下记录：

| 字段 | 示例 |
|---|---|
| 部署时间 | `2026-08-06 20:00 CST` |
| Git 提交 | `abcdef1` |
| 服务器地域 | 中国香港 |
| 服务器配置 | 4 核 8 GB |
| MindAgent 健康检查 | 通过/失败 |
| DataAgent 健康检查 | 通过/失败 |
| 示例数据查询 | 通过/失败 |
| 无关查询拒答 | 通过/失败 |
| HTTPS | 通过/失败 |
| 回滚提交 | 无或具体提交 ID |

## 19. 官方参考资料

- [腾讯云轻量应用服务器新手指引](https://cloud.tencent.com/document/product/1207/47147/)
- [腾讯云 Docker CE 环境搭建](https://cloud.tencent.com/document/product/1207/60423)
- [阿里云 Docker 和 Docker Compose 指南](https://help.aliyun.com/zh/ecs/user-guide/install-and-use-docker)
- [阿里云 ECS 代码部署指南](https://help.aliyun.com/zh/ecs/user-guide/deploy-applications)
- [1Panel Docker Compose 编排指南](https://1panel.cn/docs/v2/user_manual/containers/compose/)
- [工业和信息化部备案管理办法](https://www.miit.gov.cn/zcfg/xxtxl/art/2024/art_7e48434c08c24131b4b7eecfca5b2b6c.html)

## 20. 下一步

当前代码已通过 Linux 容器构建和单机端到端冒烟测试，可以按照本文第 4～12 节执行首次演示上线。

如果后续要接入真实业务数据，必须先完成数据源白名单、表字段权限、SQL 审计、正式备份和隐私审查。这些生产化工作不属于当前 SQLite 演示环境。

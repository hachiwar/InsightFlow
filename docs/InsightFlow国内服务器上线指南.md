# InsightFlow 国内服务器上线指南

本文面向第一次部署项目的开发者，目标是把 InsightFlow 的 Caddy、MindAgent、DataAgent 和 Redis 部署到一台 Linux 云服务器。命令以 Ubuntu 24.04 LTS 和 Docker Compose 为例。

## 1. 上线后是什么样

```text
浏览器 / 调用方
      │ 80 / 443
      ▼
    Caddy
      │ Docker 内部网络
      ▼
  MindAgent ── Redis
      │
      ▼
  DataAgent ── SQLite 演示库
```

公网只开放 Caddy 的 `80/443`。MindAgent、DataAgent 和 Redis 不映射公网端口。

## 2. 准备清单

| 项目 | 建议 |
|---|---|
| 云服务器 | 腾讯云轻量应用服务器或阿里云 ECS，Ubuntu 24.04 LTS |
| 配置 | 演示环境建议 4 核、8 GB 内存、40 GB 系统盘 |
| 地域 | 面试或短期演示可选中国香港；中国大陆地域按接入商要求完成备案 |
| 模型 | MindAgent 使用 DeepSeek 或 Anthropic；DataAgent 使用 DashScope |
| 密钥 | 公开 API、内部 DataAgent、Redis 各使用一个不同的随机密钥 |
| 域名 | IP 验证可不买；公开 HTTPS 建议准备域名 |

不要把 API Key 发到聊天、截图或 GitHub Issue。此前用于测试的 Key 应在模型服务商控制台撤销并重新创建。

## 3. 购买并登录服务器

购买 Ubuntu 24.04 LTS 实例后，记录公网 IP。优先使用 SSH 密钥登录：

```bash
ssh root@<服务器公网IP>
```

首次登录后更新系统：

```bash
apt update
apt upgrade -y
apt install -y ca-certificates curl git
```

## 4. 配置云防火墙

保留以下入站规则：

| 端口 | 协议 | 来源 | 用途 |
|---:|---|---|---|
| 22 | TCP | 优先限制为自己的公网 IP | SSH |
| 80 | TCP | `0.0.0.0/0` | HTTP 与证书校验 |
| 443 | TCP/UDP | `0.0.0.0/0` | HTTPS / HTTP3 |

不要开放 `6379`、`8080`、`8090`。腾讯云轻量服务器的防火墙设置可参考[官方文档](https://cloud.tencent.com/document/product/1207/44577/)，规则应遵循最小授权原则。

如果启用了 Ubuntu UFW：

```bash
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 443/udp
ufw enable
ufw status
```

启用 UFW 前必须先允许 SSH，防止把自己锁在服务器外。

## 5. 安装 Docker

使用 Docker 官方 APT 仓库：

```bash
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" > /etc/apt/sources.list.d/docker.list
apt update
apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```

验证：

```bash
docker --version
docker compose version
docker run --rm hello-world
```

阿里云 ECS 用户也可参考[阿里云官方 Docker 指南](https://help.aliyun.com/zh/ecs/user-guide/install-and-use-docker)。

## 6. 下载项目

```bash
install -d /opt/insightflow
git clone https://github.com/hachiwar/InsightFlow.git /opt/insightflow
cd /opt/insightflow
git branch --show-current
```

输出应为 `main`。

## 7. 创建配置

```bash
cd /opt/insightflow
cp .env.example .env
chmod 600 .env
openssl rand -hex 32
openssl rand -hex 32
openssl rand -hex 32
nano .env
```

把三次随机输出分别填入：

```env
MINDAGENT_API_KEY=<公开接口密钥>
DATAAGENT_API_KEY=<内部服务密钥>
REDIS_PASSWORD=<Redis 密码>
```

### 7.1 IP 方式首次验证

```env
SITE_ADDRESS=:80
HTTP_PORT=80
HTTPS_PORT=443
```

### 7.2 MindAgent 模型

DeepSeek：

```env
SPRING_PROFILES_ACTIVE=deepseek
DEEPSEEK_API_KEY=<新建的模型密钥>
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-v4-flash
LLM_FALLBACK_ENABLED=false
```

### 7.3 DataAgent 模型

```env
DASHSCOPE_API_KEY=<DashScope 密钥>
DASHSCOPE_WORKSPACE_ID=
DATAAGENT_ALLOW_MOCK=false
```

`DATAAGENT_ALLOW_MOCK=true` 只用于本机验证内置交易查询；公开地址始终使用 `false`。

检查配置文件中没有示例密码：

```bash
grep -n "replace-with" .env
```

没有输出才继续。

## 8. 构建并启动

```bash
cd /opt/insightflow
docker compose config --quiet
docker compose pull
docker compose build
docker compose up -d
docker compose ps
```

首次构建会下载 Java、Python、Node 和服务镜像，耗时取决于服务器网络。`docker compose ps` 中四个服务应为 `running`，带健康检查的服务随后变为 `healthy`。

查看启动日志：

```bash
docker compose logs --tail=100 dataagent
docker compose logs --tail=100 mindagent
docker compose logs --tail=100 proxy
```

日志中不要打印或搜索完整密钥。

## 9. 验证上线

### 9.1 健康检查

在服务器上：

```bash
curl --fail --show-error http://127.0.0.1/health
```

在自己的电脑上：

```bash
curl --fail --show-error http://<服务器公网IP>/health
```

预期返回：

```json
{"status":"ok"}
```

### 9.2 鉴权检查

不带密钥调用 `/chat`：

```bash
curl -i -X POST http://127.0.0.1/chat \
  -H 'Content-Type: application/json' \
  -d '{"message":"你好","user_id":"deploy-check"}'
```

预期为 `401 Unauthorized`。

### 9.3 完整冒烟测试

```bash
cd /opt/insightflow
python3 scripts/smoke_test.py \
  --base-url http://127.0.0.1 \
  --api-key '<MINDAGENT_API_KEY>'
```

预期输出包含：

```text
health: ok
chat: ok (data)
```

这证明 Caddy → MindAgent → DataAgent → SQLite 的数据链路可用。

## 10. 配置域名与 HTTPS

在域名 DNS 控制台添加 `A` 记录，例如：

```text
主机记录：api
记录值：<服务器公网IP>
```

等待 DNS 生效：

```bash
nslookup api.example.com
```

修改 `.env`：

```env
SITE_ADDRESS=api.example.com
```

重建 Caddy：

```bash
cd /opt/insightflow
docker compose up -d --force-recreate proxy
docker compose logs --tail=100 proxy
```

Caddy 会自动申请和续期证书。验证：

```bash
curl --fail --show-error https://api.example.com/health
```

中国大陆服务器的域名接入与备案要求，以接入商和[工业和信息化部备案系统](https://beian.miit.gov.cn/)为准。

## 11. 发布前安全检查

- [ ] `.env` 权限为 `600`，且 `git status` 不显示该文件；
- [ ] 三个密钥随机、互不相同，测试期间暴露的旧 Key 已撤销；
- [ ] 云防火墙只开放 `22/80/443`；
- [ ] Redis、MindAgent 和 DataAgent 没有公网端口；
- [ ] 未授权 `/chat` 返回 `401`；
- [ ] `DATAAGENT_ALLOW_MOCK=false`；
- [ ] 数据库账号或 SQLite 连接为只读；
- [ ] 表白名单只包含允许查询的业务表；
- [ ] 冒烟测试通过；
- [ ] 云服务器与模型服务均设置费用提醒；
- [ ] 对外域名按所在地域完成必要的备案手续。

## 12. 更新

```bash
cd /opt/insightflow
git fetch origin
git pull --ff-only origin main
docker compose build
docker compose up -d
docker compose ps
python3 scripts/smoke_test.py \
  --base-url http://127.0.0.1 \
  --api-key '<MINDAGENT_API_KEY>'
```

每次更新前记录当前提交：

```bash
git rev-parse HEAD
```

## 13. 回滚

使用上一次记录的可用提交：

```bash
cd /opt/insightflow
git switch --detach <上一个可用提交ID>
docker compose up -d --build
```

修复版本进入 `main` 后返回主分支：

```bash
git switch main
git pull --ff-only origin main
docker compose up -d --build
```

## 14. 备份与停止

需要备份的持久化内容：MindAgent 知识库与记忆数据、Redis 数据卷、Caddy 证书数据，以及使用密钥管理工具加密保存的 `.env`。

停止但保留容器：

```bash
docker compose stop
```

停止并删除容器、保留命名卷：

```bash
docker compose down
```

不要执行 `docker compose down -v`，它会删除命名数据卷。

## 15. 常见问题

### 镜像下载慢

在云厂商容器镜像服务中获取账号专属镜像加速地址，然后按控制台说明配置 Docker daemon。不要复制来源不明的公共镜像地址。

### MindAgent 连不上 DataAgent

```bash
docker compose ps
docker compose logs --tail=100 dataagent
docker compose logs --tail=100 mindagent
```

容器间地址必须是 `http://dataagent:8090`，不能使用 `localhost:8090`。

### MindAgent 连不上 Redis

容器内 Redis 主机名是 `redis`；同时确认 `REDIS_PASSWORD` 在 Compose 两侧一致。

### 公网 IP 无法访问

依次检查：容器状态、`curl http://127.0.0.1/health`、云防火墙、UFW、Caddy 日志和 DNS。

### 修改 `.env` 没生效

```bash
docker compose up -d --force-recreate
```

完成第 9 节后，服务已经可通过公网 IP 演示；完成第 10 节后，可通过 HTTPS 域名对外访问。

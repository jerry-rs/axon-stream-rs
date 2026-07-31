# ---------------------------------------------------------------------------
# 构建阶段：前端 (pnpm/Vite) + 后端 (cargo release)
# build.rs 在 cargo build 时自动执行 `pnpm build`，dist/ 经 rust-embed
# 嵌入最终二进制，因此构建镜像需要同时具备 Rust 与 Node/pnpm 工具链。
# ---------------------------------------------------------------------------

# rust 镜像不含 Node.js，从官方 node 镜像拷贝工具链（随构建平台自动匹配架构）
FROM node:24-bookworm-slim AS node

FROM rust:1-bookworm AS builder
WORKDIR /build

COPY --from=node /usr/local /usr/local

# aws-lc-rs (jsonwebtoken 的 crypto 后端) 编译需要 cmake + clang
RUN apt-get update \
    && apt-get install -y --no-install-recommends cmake clang \
    && rm -rf /var/lib/apt/lists/* \
    && npm install -g pnpm@latest

# RUN npm install -g pnpm@latest

# 先拷贝依赖清单单独安装，源码变化不触发重新安装（层缓存）
COPY web/package.json web/pnpm-lock.yaml web/
RUN pnpm --dir web install --frozen-lockfile

# 拷贝全部源码，一次性完成：前端 Vite 构建 → rust-embed 嵌入 → cargo release
COPY Cargo.toml Cargo.lock build.rs ./
COPY src ./src
COPY web ./web
RUN cargo build --release --locked

# ---------------------------------------------------------------------------
# 运行阶段：无工具链的精简镜像
#  - /app  ：工作目录，axon.db（账号数据库）运行时在此处创建
#  - /data ：用户文件根目录（APP_SERVER_DATA_DIR）
# ---------------------------------------------------------------------------
FROM debian:bookworm-slim

# RUN useradd --create-home --uid 10001 axon
WORKDIR /app

COPY --from=builder /build/target/release/axons /usr/local/bin/axons

#RUN mkdir -p /data && chown -R axon:axon /app /data
RUN mkdir -p /data /app/db
# USER axon

ENV APP_SERVER_IP=0.0.0.0 \
    APP_SERVER_PORT=1000 \
    APP_SERVER_DATA_DIR=/data \
    APP_SERVER_DATABASE_URL=turso:/app/db/axon.db
# 生产环境请务必显式覆盖 JWT_SECRET（代码默认值仅供开发）：
#   docker run -e JWT_SECRET=<random-string> ...

EXPOSE 1000

# 数据持久化示例：
#   docker build -t axon-stream-rs .
#   docker run -d -p 1000:1000 \
#     -e JWT_SECRET=<random-string> \
#     -v axon-files:/data \
#     -v axon-db:/app \
#     axon-stream-rs
CMD ["/usr/local/bin/axons"]

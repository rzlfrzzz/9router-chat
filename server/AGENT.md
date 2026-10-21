# Workspace agent

Requires Node 22.13+ for built-in SQLite. Node 22 may show an experimental warning.

## API

Retains local Host/Origin restrictions. POST requires `X-9Router-Client: chat`.

- GET `/api/conversations` and `/api/conversations/:id`: persisted history.
- PUT `/api/conversations/:id`: `{id,title,messages:[{id,role,content,attachments?}],createdAt?,updatedAt?}` replaces messages in a transaction.
- DELETE `/api/conversations/:id`: removes history/metadata; physical files remain as recovery archives. Administrators must manage retention/disk capacity.
- POST `/api/conversations/:id/uploads`: multipart field `files`, up to 5 files, 20 MiB each. Returns generated `name` and `originalName`.
- GET `/api/conversations/:id/files`: file metadata.
- POST `/api/conversations/:id/files/:fileId/approval`: `{status:"approved"|"rejected"}`.
- GET `/api/conversations/:id/files/:fileId/download`: approved files only.
- POST `/api/agent`: `{conversationId,model,messages:[{role,content}]}`; text messages reference uploaded generated filenames.

Agent SSE frames are `data: {type,...}`: `text` (text fragment), `tool_start` (id/name), `tool_result` (id/name/ok/result or error), `file` (pending artifact metadata/preview), `done`, and `[DONE]`. Errors use `{error:{message,code}}`. Tool deltas are assembled per index; argument JSON is parsed only after model completion. Requires a provider supporting streamed function calls.

## Data and preview

`workspaces/history.sqlite` stores conversations, ordered messages and files. Sources reside in `workspaces/<id>/uploads`; candidate artifacts in `outputs`. Each Python call gets fresh outputs; copied artifacts cannot be changed by a later run. Download requires preview approval. Preview text is model-generated, not an independently verified cell diff. The separate local Excel panel retains its structured diff workflow.

Chat now uses SQLite and multipart uploads. Old localStorage history is not automatically migrated or deleted. Model/theme preferences remain local. Image/PDF base64 input is no longer sent to chat models: document reading requires sandbox libraries. The bundled image supports Excel via pandas/openpyxl, not OCR/PDF/Word extraction.

## Sandbox deployment

Build `server/sandbox.Dockerfile` as local image `9router-python:local`. After reviewing isolation, set `ENABLE_PYTHON_SANDBOX=true` and restart. There is no automatic image pull or host-Python fallback. Docker daemon must support bind mounts from the server filesystem; WSL requires Docker integration. Output mounts must be writable by UID 65534; Windows ACLs may need configuration.

Containers run with no network, non-root UID, read-only root filesystem, no capabilities, no-new-privileges, 1 CPU, 512 MiB RAM, 64 PIDs and a 30-second timeout. Only conversation uploads (read-only) and fresh run outputs (writable) are mounted. Output names/types/sizes are checked. Bind mounts have no enforced disk quota: provision filesystem quotas/a dedicated volume for untrusted files. Containers are not a guarantee against kernel exploits; this remains a local-only application, not a multi-tenant service.

Limits: 15 model calls, 20 tool calls per response, 30 seconds per tool, REQUEST_TIMEOUT_MS per model, 10 minutes total. Handlers must validate arguments and honor cancellation. Cancellation removes the container. Only server-owned tools may be registered. Do not expose the Docker socket or host shell to a container.
# Workspace agent

## Extended workflow

Image now includes LibreOffice, matplotlib, python-docx, python-pptx, pypdf and markitdown. Rebuild the image before enabling Python. The container runner recalculates formula-containing XLSX, checks cached error cells and rejects external workbook links. Unsupported LibreOffice formulas may fail; recalculation is not proof of business correctness. Total container runtime remains 30 seconds, including verification.

Approved artifacts are copied into a fresh read-only `/workspace/previous` mount each run. Skills are mounted unchanged at `/skills`; `read_skill` loads an allowlisted SKILL.md, with relevant instructions included automatically. Do not install packages from within the offline sandbox.

Every agent request includes a fresh file inventory with IDs and mounted paths. Set `sourceFileId` for workbook revisions; server independently computes a limited XLSX cell/formula/basic-style diff before registering the pending artifact. Samples contain up to 100 changes. Charts, pivot structures and other complex features are not exhaustively compared. Non-XLSX output still requires manual review. The source is selected by the agent and should be checked in the preview.

Tool result context is capped near 10,000 characters with a truncation hint. Tool lifecycle cards are saved with assistant messages in SQLite. Model selection triggers a cached capability probe (one model call, potentially billable); a successful function call does not guarantee streaming compatibility. Inconclusive/failed probes show a warning and link to the local Excel fallback.

Docker build was blocked by socket permissions in the development environment. ENABLE_PYTHON_SANDBOX remains false until the administrator builds and tests the new image. No permission escalation or host-Python fallback is performed.

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
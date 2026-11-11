# Deploying the v2 stack

How to release `api/`, `functions/`, `transcoder/`, `web/` and the Cloudflare Worker to
`staging` or `prod`. This is the routine procedure. The two other files in this folder are
one-off runbooks: `cutover.md` (v1 → v2, done 2026-11-04) and `cdn-to-b.md` (CloudFront moved
from account A to account B).

**CI does not deploy.** `.github/workflows/ci.yml` and `security-scan.yml` only lint, test,
build, smoke-test the transcoder image, validate Terraform and scan. No workflow holds AWS
credentials. Every release is run by the operator from their machine with the commands below.

## 1. What gets deployed where

```
                 operator machine (Git Bash, AWS profile default = account B 749680934725)
                         │
   npm run build ────────┼──► api/dist, functions/dist ──► terraform apply ──► Lambda (API + 7)
   docker build/push ────┼──► ECR zelos-transcoder:<sha> ─► terraform apply ──► Batch job definitions
   terraform apply ──────┼──► S3, SQS, EventBridge, Step Functions, Batch, CloudFront, Cloudflare DNS
   wrangler deploy ──────┼──► Cloudflare Worker zelos-api-gateway-<env>  (api host → Function URL)
   deploy-web.sh ────────┴──► S3 zelos-<env>-web-<account> + CloudFront invalidation
```

| Unit | Becomes | Built by |
|---|---|---|
| `api/` | Lambda `zelos-<env>-api` (Node 22, Function URL, no API Gateway) | `npm run build -w @zelos/api` → `api/dist/api/index.mjs` |
| `functions/` | Lambdas starter, probe, status, stitch (module `workflow`) and notifier, rollup, reconciler (module `app`) | `npm run build -w @zelos/functions` → `functions/dist/<name>/`; ffprobe layer: `npm run layer:ffprobe -w @zelos/functions` (needs Docker) |
| `transcoder/` | Image run by AWS Batch on Fargate Spot, On-Demand on overflow | `docker build -f transcoder/Dockerfile .` |
| `web/` | Vite SPA in a private S3 bucket behind CloudFront | `scripts/deploy-web.sh` |
| `infra/cloudflare-worker/` | Worker `zelos-api-gateway-<env>` on the API host | `npx wrangler deploy --env <env>` |
| `infra/envs/{shared,staging,prod}` | Terraform roots using the 11 modules in `infra/modules/` | `terraform apply` |

Terraform zips the Lambda code from the `dist` folders during `plan`/`apply` (`archive_file`),
so the code must be built **before** Terraform runs. A Lambda changes only when its zip hash
changes.

State: S3 bucket `dacntt-terraform-state` (`ap-southeast-1`), lock table
`dacntt-terraform-locks`, keys `zelos/<root>/terraform.tfstate`. `staging` and `prod` read the
outputs of `shared` (VPC, subnets, ECR URL, artifacts bucket).

## 2. Environments

| | staging | prod |
|---|---|---|
| Web | `https://v2-staging.zelostech.site` | `https://zelostech.site` (`www` redirects) |
| API | `https://api-v2-staging.zelostech.site` | `https://api.zelostech.site` |
| CDN | `https://cdn-v2-staging.zelostech.site` | `https://cdn.zelostech.site` |
| Database | `zelos_staging` | `zelos_prod` (own Atlas cluster) |
| Batch vCPU ceiling (Spot / On-Demand) | 8 / 8 | 24 / 24 |
| Parallel chunk slots | 4 | 6 |
| API reserved concurrency | 20 | 80 |
| `transcoder_image_tag` | defaults to `bootstrap` | **required on every plan/apply** |
| `moderation_enabled` variable | not present | default `true` |
| Buckets `force_destroy` | true | false |

Both environments share the Fargate quota of account B (64 vCPU). Staging and prod together
stay below it; another project running in account B must be stopped first.

## 3. Prerequisites

Tools:

- Node 22 (`.nvmrc`).
- Terraform 1.9 or newer. CI uses 1.14.8.
- AWS CLI v2. It is also called by a `local-exec` in `infra/modules/app/main.tf`, so
  `terraform apply` needs `bash` and `aws` on the PATH.
- Docker, for the transcoder image and the ffprobe layer.
- Git Bash on Windows.
- Wrangler, run through `npx` (not a dependency, so the version is whatever npx fetches).

Configuration:

- AWS profile `default` = account B (`749680934725`), region `ap-southeast-1`. Nothing in v2
  runs in account A.
- Before any Terraform run:

  ```bash
  export MSYS_NO_PATHCONV=1
  export CLOUDFLARE_API_TOKEN="$(aws secretsmanager get-secret-value --secret-id dacntt-dev/cloudflare-api-token --query SecretString --output text)"
  ```

- `web/.env.local` must contain `VITE_GOOGLE_CLIENT_ID`. `deploy-web.sh` only sets
  `VITE_API_BASE_URL`, so without this file the Google sign-in button disappears from the build.
- `infra/envs/<env>/cdn-signing-public.pem` must keep LF line endings (`.gitattributes` has
  `*.pem eol=lf`).
- Wrangler logged in to the Cloudflare account that owns `zelostech.site` (`npx wrangler login`).

Run every command from the repository root unless a step says otherwise.

## 4. First-time setup of an environment

Only needed when building an environment from nothing. `cutover.md` shows the prod case in full.

1. State bucket and lock table, once per account: `scripts/bootstrap-terraform-state.sh`.
   Its closing message mentions the old `infrastructure/` path; ignore it.
2. Shared resources:

   ```bash
   terraform -chdir=infra/envs/shared init
   terraform -chdir=infra/envs/shared apply
   ```

3. Build and push a transcoder image (§5.2), then apply the environment (§5.3).
4. Fill the two secrets that Terraform creates empty:
   - `zelos-<env>/api`, a JSON object with `mongodbUri`, `jwtSecret`, `originSecret`,
     `googleClientId`, `cloudfrontKeyPairId` (`terraform output cdn_key_pair_id`),
     `cloudfrontPrivateKey` (the private half of `cdn-signing-public.pem`, kept outside the
     repository), `smtpUser`, `smtpPassword`.
   - `zelos-<env>/mongodb-uri`, the same connection string, for the workflow functions.
5. MongoDB Atlas: one cluster per environment, network access `0.0.0.0/0` (the functions run
   outside a VPC). Atlas is not managed by Terraform.
6. Worker secret, from `infra/cloudflare-worker/`:

   ```bash
   npx wrangler secret put ORIGIN_VERIFY_SECRET --env <env>   # the originSecret of zelos-<env>/api
   ```

7. Continue with the routine release (§5), then seed (§5.7).

## 5. Routine release

Run the steps in order and skip those that the change does not touch:

| What changed | Steps |
|---|---|
| `web/` only | 5.6 |
| `api/`, `functions/` or `shared/` | 5.1, 5.3, 5.5, then 5.6 if the web uses a new endpoint |
| `transcoder/` | 5.2, 5.3 |
| `infra/` | 5.1, 5.3 (always build first: plan zips the `dist` folders) |
| `infra/cloudflare-worker/` | 5.4 |

Release to `staging` first, check it (§6), then repeat for `prod` with the same commit and the
same image tag.

### 5.1 Build the Lambda code

```bash
npm ci
npm run build -w @zelos/shared
npm run build -w @zelos/api
npm run build -w @zelos/functions
npm run layer:ffprobe -w @zelos/functions   # only when functions/dist/layers/ffprobe is missing
```

### 5.2 Build and push the transcoder image

The ECR repository `zelos-transcoder` has **immutable tags** and keeps the last 30 images. Tag
each image with the full commit SHA. Never use `latest`, because the second push would be
refused. Build from a clean checkout of the commit you release, so the tag matches the code.

```bash
SHA=$(git rev-parse HEAD)
REPO=$(terraform -chdir=infra/envs/shared output -raw transcoder_repository_url)
aws ecr get-login-password | docker login --username AWS --password-stdin "${REPO%%/*}"
docker build -f transcoder/Dockerfile -t "$REPO:$SHA" .
docker push "$REPO:$SHA"
```

The default target is `runtime`. The `smoke` stage is only for CI, where
`docker build --target smoke` followed by `docker run` checks ffmpeg and the job bundle.

### 5.3 Apply Terraform

```bash
ENV=staging   # or prod
TAG=<sha>     # the image to run

terraform -chdir=infra/envs/$ENV init
terraform -chdir=infra/envs/$ENV plan -var transcoder_image_tag=$TAG -out release.tfplan
terraform -chdir=infra/envs/$ENV apply release.tfplan
rm infra/envs/$ENV/release.tfplan   # holds secret values; *.tfplan is git-ignored
```

- Read the plan before applying. A release normally changes only Lambda code and, with a new
  tag, the four Batch job definitions (`-analyse`, `-encode`, `-audio`, `-chunk`).
- Releasing without a new image means you must pass the tag that is running now, or Terraform
  rolls the job definitions back. Find it with:

  ```bash
  aws batch describe-job-definitions --status ACTIVE \
    --query "jobDefinitions[?jobDefinitionName=='zelos-$ENV-encode'] | [-1].containerProperties.image" --output text
  ```

- Staging falls back to the `bootstrap` tag when `-var transcoder_image_tag` is left out, which
  is not a real image. Always pass the tag.
- Batch jobs already running keep their old job definition revision. New jobs use the new one.

### 5.4 Cloudflare Worker (only when it changes)

The Worker forwards the API host to the Lambda Function URL and adds the `x-origin-verify`
header. `TARGET_HOST` in `infra/cloudflare-worker/wrangler.toml` is hard-coded per
environment. Update it only if the API function was replaced and
`terraform output api_function_url` changed.

```bash
cd infra/cloudflare-worker
npx wrangler deploy --env <env>
```

### 5.5 Database indexes

Cold starts do not create indexes. After every apply that ships API code:

```bash
scripts/ensure-indexes.sh <env>
```

It invokes `zelos-<env>-api` with `{"action":"ensure-indexes"}` and fails if the function
reports an error. It creates the MongoDB indexes and the three Atlas Search indexes
(`videos_search`, `channels_search`, `playlists_search`) **only if they are missing**. A change
to a search index definition must be applied by hand in Atlas, or by deleting the index and
running the script again. The free M0 tier allows only three search indexes per cluster.

### 5.6 Web

```bash
scripts/deploy-web.sh <env>
```

The script:

1. Reads `web_bucket` and `web_distribution_id` from `terraform output`.
2. Builds `web/` with `VITE_API_BASE_URL` set for the environment.
3. Uploads `assets/*` with a cache lifetime of one year (immutable), then the other files with
   `max-age=0, must-revalidate`. Source maps are not uploaded.
4. Invalidates `/*`.

Old hashed assets are not deleted, so tabs opened before the deploy keep working.

### 5.7 Seed (new environment or on demand)

`scripts/seed.mjs` reads `mongodbUri` from `zelos-<env>/api`:

```bash
node scripts/seed.mjs role --env <env> --email <account email> --role admin
node scripts/seed.mjs demo --env <env> --manifest .local-notes/demo-videos.json
node scripts/seed.mjs e2e  --env <env>
```

Run it only once the API host answers. The transcoder writes the API host into every key URI,
so videos processed earlier would point at a dead host.

## 6. Verify

1. Check the API:
   - `curl -s https://<api host>/health` returns `{"ok":true}`.
   - Calling `/v1/health` on the Function URL directly returns 403. Through the API host it
     returns 200.
2. Open the site. Play an existing video, open the quality menu, and check that the CDN
   requests return 200.
3. When a change touches the pipeline, upload a short clip and wait for `READY` in Studio.
   Staging has no moderation switch. In prod, apply with `-var moderation_enabled=false` before
   test uploads and apply again without it afterwards.
4. End-to-end tests:

   ```bash
   E2E_BASE_URL=https://<web host> E2E_API_URL=https://<api host> \
   E2E_ACCOUNTS=.local-notes/<env>-e2e-accounts.json npm run test:e2e -w @zelos/e2e
   ```

   Add `E2E_PIPELINE=1` to include the upload test.
5. Watch these alarms, which send email to SNS topic `zelos-<env>-alerts`:
   - `zelos-<env>-api-errors`
   - `zelos-<env>-ingest-dlq-not-empty`
   - `zelos-<env>-transcode-failed`

## 7. Roll back

| Part | How |
|---|---|
| Transcoder | Apply again with the previous `transcoder_image_tag`. ECR keeps the last 30 images. |
| Lambda code | Check out the previous commit, rebuild (§5.1), apply (§5.3) with the current image tag. |
| Infrastructure | Same as Lambda code: apply the previous commit. Read the plan for destroys first. |
| Web | Run `deploy-web.sh` from the previous commit. Alternatively, restore the earlier versions of `index.html` and the other non-asset files: the bucket keeps old versions for 30 days. Then invalidate `/*`. |
| Worker | `npx wrangler rollback --env <env>` from `infra/cloudflare-worker/`, or deploy the previous commit. |
| Secrets | Restore the previous version in Secrets Manager. Then make the API reload it (below). |

The API reads its secret once per instance. After changing `zelos-<env>/api`, upload the same
code again so that every instance starts fresh:

```bash
curl -s -o api.zip "$(aws lambda get-function --function-name zelos-<env>-api --query Code.Location --output text)"
aws lambda update-function-code --function-name zelos-<env>-api --zip-file fileb://api.zip
aws lambda wait function-updated --function-name zelos-<env>-api
rm api.zip
```

## 8. Troubleshooting

- **Paths like `C:/Program Files/Git/...` in an error.** Git Bash rewrote an argument that
  starts with `/`. Export `MSYS_NO_PATHCONV=1`.
- **Playback returns 403 from the CDN after an apply.** Check that `cloudfrontKeyPairId` in
  `zelos-<env>/api` equals `terraform output cdn_key_pair_id`. Check also that the PEM still has
  LF endings: a CRLF file changes the public key.
- **Batch jobs stay `RUNNABLE`.** The Fargate quota is used up. Check that no other project is
  running in account B, and run `python ~/.claude/aws-quota-report.py`.
- **`terraform apply` fails in `terraform_data.api_url_invoke`.** `bash` or `aws` is not on the
  PATH of the shell that runs Terraform.
- **The API answers 503 from the Worker.** `TARGET_HOST` or the `ORIGIN_VERIFY_SECRET` secret is
  missing in that Worker environment.
- **The API answers 403 through the Worker.** `ORIGIN_VERIFY_SECRET` differs from
  `originSecret`, or the API still holds the old secret (reload it, §7).
- **Search returns nothing on a new environment.** `ensure-indexes.sh` was not run, or the Atlas
  Search index is still building (see its status in Atlas).

## 9. Known gaps

- There is no CD. Some comments still describe one: `ci.yml:2`, `infra/modules/ecr/main.tf:1`
  ("CI pushes one image per commit") and `infra/envs/staging/variables.tf:2`.
- These files still describe v1 (EC2, `dacntt-dev-*`, `infrastructure/`, OIDC deploy
  workflows): `docs/REBUILD_ON_NEW_AWS_ACCOUNT.md`, and the
  scripts `staging-up.sh`, `start-backend.sh`, `stop-backend.sh`, `ec2-userdata.sh`,
  `package-backend-lambda.js`, `invoke-lambda.py`, `next-job-definition.py`. Do not use them
  for v2.
- `cutover.md` still mentions the account A certificate and `--profile dacntt-a`. Since
  `cdn-to-b.md`, certificates are issued in account B.
- Diagrams in `docs/ARCHITECTURE.md` still draw CloudFront in account A.
- Wrangler is not pinned, and `VITE_GOOGLE_CLIENT_ID` exists only in the operator's
  `web/.env.local`.

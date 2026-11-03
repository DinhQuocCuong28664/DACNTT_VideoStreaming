# Production cutover: v1 → v2

How `zelostech.site`, `www.zelostech.site`, `cdn.zelostech.site` and `api.zelostech.site` move
from the old stack (`dacntt-dev-*`) to `infra/envs/prod`. The old stack keeps running untouched
until the end, so every step can be rolled back by pointing the names back.

Decisions (owner, 2026-11-03): no data migration (a new database, then a seed); a separate free
Atlas cluster for production (M0 allows three search indexes and staging uses all three); the
old certificate is reused and the hosts are moved with `associate-alias`; Batch ceilings 24 Spot +
24 On-Demand.

Commands run from the repository root in Git Bash, with `MSYS_NO_PATHCONV=1` and
`CLOUDFLARE_API_TOKEN` exported from Secrets Manager `dacntt-dev/cloudflare-api-token`.
`IMAGE` is the transcoder image tag that passed staging.

## 1. Build the environment without its hosts

```bash
npm run build -w @zelos/api && npm run build -w @zelos/functions
terraform -chdir=infra/envs/prod init
terraform -chdir=infra/envs/prod apply -var transcoder_image_tag=$IMAGE   # attach_hosts = false
```

The two distributions come up on their `*.cloudfront.net` names with the old certificate
already attached, which `associate-alias` needs later.

## 2. Secrets

- `zelos-prod/api`: `mongodbUri` (production cluster), new random `jwtSecret` and
  `originSecret`, `cloudfrontKeyPairId` (`terraform output cdn_key_pair_id`),
  `cloudfrontPrivateKey` (private half of `infra/envs/prod/cdn-signing-public.pem`, kept outside
  the repository), and `googleClientId`, `smtpUser`, `smtpPassword` as in staging.
- `zelos-prod/mongodb-uri`: the same connection string, for the workflow functions.
- Atlas network access must allow `0.0.0.0/0`: the functions run outside a VPC.
- The Google OAuth client must list `https://zelostech.site` as an authorised JavaScript origin.

Check before going on: the function URL answers `/health` with 200 (the API connects to the
database and builds its indexes during start-up) and `/v1/health` with 403 (no origin secret).

## 3. Web files

```bash
scripts/deploy-web.sh prod
```

## 4. API host (a few minutes without API)

1. Delete the proxied CNAME `api.zelostech.site` on Cloudflare (a Custom Domain cannot be
   created over an existing CNAME).
2. Put the host of `terraform output api_function_url` into `TARGET_HOST` of `[env.prod.vars]`
   in `infra/cloudflare-worker/wrangler.toml`, then from that folder:

   ```bash
   npx wrangler secret put ORIGIN_VERIFY_SECRET --env prod   # originSecret of zelos-prod/api
   npx wrangler deploy --env prod
   ```

3. Remove the old route `api.zelostech.site/*` in the zone's Workers Routes page (dashboard →
   zelostech.site → Workers Routes → Edit → Remove). While it exists it wins over the Custom
   Domain and the old API keeps answering; `wrangler triggers deploy` with no routes does not
   remove it, and the DNS token has no Workers permission.
4. `https://api.zelostech.site/v1/health` answers `{"ok":true,"env":"prod"}`.

## 5. Web and CDN hosts

1. Prove ownership to CloudFront: TXT records `_www.zelostech.site` with the value of
   `terraform output web_distribution_domain`, and `_cdn.zelostech.site` with
   `terraform output cdn_distribution_domain`.
2. Move the two subdomains (account A):

   ```bash
   aws cloudfront associate-alias --profile dacntt-a --target-distribution-id <web id> --alias www.zelostech.site
   aws cloudfront associate-alias --profile dacntt-a --target-distribution-id <cdn id> --alias cdn.zelostech.site
   ```

   The apex cannot move this way: its proof record `_zelostech.site` would sit in the `.site`
   zone, not in ours (Cloudflare turns the name into `_zelostech.site.zelostech.site`). Remove
   `zelostech.site` from the aliases of the old web distribution instead
   (`get-distribution-config`, empty `Aliases`, `update-distribution --if-match <ETag>`); the
   apply below then adds it to the new one.

3. Bring the existing Cloudflare records under the production state instead of deleting them
   (no gap in DNS), then let Terraform point them at the new distributions, DNS only:

   ```bash
   T="terraform -chdir=infra/envs/prod"
   Z=d2ade2da1df8b663763db24000786b3a
   $T import -var transcoder_image_tag=$IMAGE -var attach_hosts=true 'module.web.cloudflare_dns_record.host[0]' $Z/<record id of zelostech.site>
   $T import -var transcoder_image_tag=$IMAGE -var attach_hosts=true 'module.web.cloudflare_dns_record.redirect["www.zelostech.site"]' $Z/<record id of www>
   $T import -var transcoder_image_tag=$IMAGE -var attach_hosts=true 'module.cdn.cloudflare_dns_record.host[0]' $Z/<record id of cdn>
   $T apply -var transcoder_image_tag=$IMAGE -var attach_hosts=true
   ```

   Then set `attach_hosts` to `true` by default in `infra/envs/prod/variables.tf` and delete the
   TXT records.

   The public key file must keep LF line ends (`.gitattributes`): with CRLF the plan replaces
   the CloudFront public key, which changes the key pair id stored in `zelos-prod/api`.

## 6. Seed

```bash
node scripts/seed.mjs role --env prod --email <owner e-mail> --role admin   # after the owner signs up
node scripts/seed.mjs demo --env prod --manifest .local-notes/demo-videos.json
```

No video may be processed before step 4: the transcoder writes the API host into every key URI.

## 7. Checks

- `api.zelostech.site/health` 200; the function URL without the Worker 403 on `/v1/*`.
- A seeded video plays from `cdn.zelostech.site` with a signed policy; the key is 16 bytes.
- Search finds a title typed without accents and with one typo.
- `/embed/<id>` plays inside a page on another origin.
- `www.zelostech.site/watch/<id>` answers 301 to `zelostech.site/watch/<id>`.
- E2E smoke against production (`E2E_BASE_URL`, `E2E_API_URL`) including the pipeline test.
- One Batch job per upload; no errors in the CloudWatch logs of the functions and the API.

## Rollback

The old distributions, Worker and Lambda keep running. Move the names back the same way
(`associate-alias` to the old distribution IDs with TXT records pointing at their domains for
www and cdn; for the apex remove it from the new distribution and add it back to
`E2XCGWPL9BDVKL`), the DNS records back to their old targets and proxied, and the old Worker
route back on `api.zelostech.site/*`.

Done on 2026-11-04: the API first, the web and CDN hosts a few minutes later.

## Retiring the old stack (after the submission, owner approval)

The certificate `f17a029c…` belongs to the old Terraform state
(`infrastructure/environments/dev`, `aws_acm_certificate.frontend`). Remove it and its
validation from that state (`terraform state rm`) before destroying the old stack, otherwise
the destroy tries to delete a certificate production uses.

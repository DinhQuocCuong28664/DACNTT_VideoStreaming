# Moving CloudFront from account A to account B

CloudFront of every v2 environment (the web and the media distribution, their certificates,
signing key groups, OAC, policies and the SPA function) was created in account A
(`911707244328`) because account B (`749680934725`) could not create distributions. On
2026-11-05 account B created a test distribution, so the restriction is gone. The code on this
branch points both modules at account B; this runbook moves a live environment over without
losing access to the buckets and with a few minutes of downtime on the apex host only.

Rehearse on staging first. Every step that changes something is approved on its own.

Commands run from the repository root in Git Bash with `MSYS_NO_PATHCONV=1`, the default AWS
profile (account B) and `CLOUDFLARE_API_TOKEN` exported from Secrets Manager
`dacntt-dev/cloudflare-api-token`. `IMAGE` is the transcoder image tag the environment runs
(`aws batch describe-job-definitions` shows it); `ENV` is `staging` or `prod`.

```bash
T="terraform -chdir=infra/envs/$ENV"
VARS="-var transcoder_image_tag=$IMAGE"
```

## Why the order matters

- The resources in account A cannot be refreshed with account B credentials (plan fails with
  `AccessDenied`), so Terraform has to forget them first. They keep serving until they are
  deleted at the end.
- A host can belong to one distribution only. The new distributions are built without hosts
  (`attach_hosts=false`), and the hosts move afterwards.
- The bucket policies name the distribution allowed to read. `cdn_transition_reader_arns` and
  `web_transition_reader_arns` keep the old distributions in the policies until the hosts have
  moved, so both serve at the same time.
- The API signs playback policies with the Key-Pair-Id of the media distribution. The new key
  group holds the same public key, but its id is new. A viewer with an old policy gets one 403
  and the player asks for a new grant.
- On staging the first apply also brings the job definitions and the state machine up to the
  code of `feat/bench-v2` (task sizes, `MODERATION_ENABLED`), which so far only prod runs.

## 1. Note the old distributions

```bash
$T output -raw web_distribution_id; echo
aws cloudfront list-distributions --profile dacntt-a \
  --query "DistributionList.Items[].[Id,ARN,DomainName,join(',',Aliases.Items||\`[]\`)]" --output text
```

Keep the web and media ARNs and domain names of `$ENV` for the transition variables and for a
rollback.

## 2. Forget the account A resources and the host records

```bash
$T state rm \
  'module.cdn.aws_cloudfront_distribution.this' 'module.cdn.aws_cloudfront_key_group.signing' \
  'module.cdn.aws_cloudfront_public_key.signing' 'module.cdn.aws_cloudfront_origin_access_control.processed' \
  'module.cdn.aws_cloudfront_cache_policy.media' 'module.cdn.aws_cloudfront_response_headers_policy.cors' \
  'module.cdn.cloudflare_dns_record.host[0]' \
  'module.web.aws_cloudfront_distribution.web' 'module.web.aws_cloudfront_function.spa' \
  'module.web.aws_cloudfront_origin_access_control.web' 'module.web.aws_cloudfront_cache_policy.short' \
  'module.web.aws_cloudfront_response_headers_policy.app' 'module.web.aws_cloudfront_response_headers_policy.embed' \
  'module.web.cloudflare_dns_record.host[0]'
# staging only: its certificates were issued in account A by the modules
$T state rm 'module.cdn.aws_acm_certificate.cdn[0]' 'module.cdn.aws_acm_certificate_validation.cdn[0]' \
  'module.web.aws_acm_certificate.web[0]' 'module.web.aws_acm_certificate_validation.web[0]'
# prod only: the www record
$T state rm 'module.web.cloudflare_dns_record.redirect["www.zelostech.site"]'
```

Back up the state first (`$T state pull > .local-notes/cdn-move-$ENV-before.tfstate`). Nothing
changes in AWS or Cloudflare in this step.

## 3. Build the new distributions in account B

```bash
$T plan $VARS -var attach_hosts=false \
  -var 'cdn_transition_reader_arns=["<old media ARN>"]' \
  -var 'web_transition_reader_arns=["<old web ARN>"]' -out cdn-move.tfplan
$T apply cdn-move.tfplan && rm infra/envs/$ENV/cdn-move.tfplan
```

Expected: two distributions, two certificates (validated on Cloudflare, new record names because
the account differs), OAC, key group, policies and the SPA function created in account B; both
bucket policies updated to list the old and the new distribution; no host and no DNS change.
Prod: if a validation record collides with one left by the old certificate, import it instead
of creating it.

## 4. Check the new distributions on their own domains

```bash
$T output -raw cdn_key_pair_id; echo    # new Key-Pair-Id
$T output -raw web_distribution_domain; echo
$T output -raw cdn_distribution_domain; echo
```

- `https://<new web domain>/` and an app route such as `/watch/<id>` answer 200.
- An unsigned request to `https://<new cdn domain>/videos/<id>/...` answers 403; with a policy
  signed with the new Key-Pair-Id it answers 200, as does `images/...` without a policy.

## 5. Move the media host and the signing key

1. TXT record `_cdn<suffix>` (`_cdn.zelostech.site` or `_cdn-v2-staging.zelostech.site`) with
   the new media domain as its value.
2. `aws cloudfront associate-alias --target-distribution-id <new media id> --alias <cdn host>`
3. Write the new Key-Pair-Id to `cloudfrontKeyPairId` in `zelos-$ENV/api`, then upload the same
   API zip again so that every instance reads the secret anew
   (`aws lambda update-function-code --function-name zelos-$ENV-api --zip-file fileb://infra/modules/app/.build/api.zip`).
4. Play a video on the site: segments and the key load from the CDN host.

## 6. Move the web hosts

- Subdomains (`v2-staging`, `www`): TXT record `_<host>` with the new web domain, then
  `aws cloudfront associate-alias --target-distribution-id <new web id> --alias <host>`.
- Apex (`zelostech.site`, prod only): `associate-alias` cannot move it, because its proof
  record would sit in the `.site` zone. Remove it from the old web distribution
  (`get-distribution-config --profile dacntt-a`, empty `Aliases`, `update-distribution
  --profile dacntt-a --if-match <ETag>`); step 7 adds it to the new one. The apex is down
  until CloudFront has deployed the change, a few minutes.

## 7. Point DNS at account B and attach the hosts

```bash
Z=d2ade2da1df8b663763db24000786b3a
$T import $VARS 'module.cdn.cloudflare_dns_record.host[0]' $Z/<record id of the cdn host>
$T import $VARS 'module.web.cloudflare_dns_record.host[0]' $Z/<record id of the web host>
# prod only
$T import $VARS 'module.web.cloudflare_dns_record.redirect["www.zelostech.site"]' $Z/<record id of www>
$T apply $VARS \
  -var 'cdn_transition_reader_arns=["<old media ARN>"]' -var 'web_transition_reader_arns=["<old web ARN>"]'
```

The CNAMEs now name the new distributions and the hosts sit on them. Delete the TXT records.
Then `scripts/deploy-web.sh $ENV` and `scripts/ensure-indexes.sh $ENV` are not needed (no
API code changed), but run the end-to-end suite:

```bash
E2E_BASE_URL=<web origin> E2E_API_URL=<api origin> E2E_ACCOUNTS=<accounts file> npx playwright test -c e2e/playwright.config.ts
```

## 8. Drop the old readers

```bash
$T apply $VARS
```

Both bucket policies name only the new distributions. The old ones now answer 403.

## 9. Delete the account A resources (ask first)

Disable each old distribution, wait until it is `Deployed`, then delete it, followed by its
key group, public key, OAC, policies, SPA function and, once no distribution uses it, the
certificate (`f17a029c` for prod). Remove the Cloudflare validation records of the deleted
certificates. Delete the probe distribution `E3IJBGBHLBZW77` in account B as well.

## Rollback

Until step 9, every old resource still works:

- `associate-alias --profile dacntt-a` moves a subdomain back to its old distribution; the
  apex is added back with `update-distribution --profile dacntt-a`.
- Put the old Key-Pair-Id back into `zelos-$ENV/api` and upload the API zip again.
- Point the CNAMEs back at the old domains in Cloudflare.
- Keep the transition variables set so both distributions can read the buckets.

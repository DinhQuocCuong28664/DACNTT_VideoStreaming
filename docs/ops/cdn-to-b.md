# Moving CloudFront from account A to account B

CloudFront of every v2 environment (the web and the media distribution, their certificates,
signing key groups, OAC, policies and the SPA function) was created in account A
(`911707244328`) because account B (`749680934725`) could not create distributions. On
2026-11-05 account B created a test distribution, so the restriction is gone. The code on this
branch points both modules at account B; this runbook moves a live environment over without
losing access to the buckets. Every host is down for a few minutes while it moves (measured on
staging, 2026-11-05).

Staging was moved first with this procedure. Every step that changes something is approved on
its own.

Commands run from the repository root in Git Bash with `MSYS_NO_PATHCONV=1`, the default AWS
profile (account B) and `CLOUDFLARE_API_TOKEN` exported from Secrets Manager
`dacntt-dev/cloudflare-api-token`. `IMAGE` is the transcoder image tag the environment runs
(`aws batch describe-job-definitions` shows it); `ENV` is `staging` or `prod`;
`Z=d2ade2da1df8b663763db24000786b3a` is the Cloudflare zone.

```bash
T="terraform -chdir=infra/envs/$ENV"
VARS="-var transcoder_image_tag=$IMAGE"
OLD="-var cdn_transition_reader_arns=[\"<old media ARN>\"] -var web_transition_reader_arns=[\"<old web ARN>\"]"
```

Run `plan -out` and read it before every `apply` of the saved plan.

## What constrains the order

- The resources in account A cannot be refreshed with account B credentials (plan fails with
  `AccessDenied`), so Terraform has to forget them first. They keep serving until they are
  deleted at the end.
- A host can belong to one distribution only, and `associate-alias` refuses to move a host to
  another account while the source distribution is enabled. The host is therefore removed from
  the old distribution and added to the new one, which costs a few minutes of downtime.
- CloudFront refuses to add a host whose CNAME still points at another distribution
  (`CNAMEAlreadyExists`). The CNAME must point at the new distribution first. Terraform cannot
  do that alone, because the record depends on the distribution change (`-target` pulls the
  distribution in), so the record is changed through the Cloudflare API to the value Terraform
  wants, and Terraform then finds it in place.
- The bucket policies name the distribution allowed to read. `cdn_transition_reader_arns` and
  `web_transition_reader_arns` keep the old distributions in the policies until the hosts have
  moved.
- The API signs playback policies with the Key-Pair-Id of the media distribution, and the
  policy names the CDN host. The new key group holds the same public key, but its id is new:
  playback fails with 403 from the moment the media host moves until the API signs with the
  new id. Move the media host and switch the id in one sitting.
- On staging the first apply also brought the job definitions and the state machine up to the
  code of `feat/bench-v2` (task sizes, `MODERATION_ENABLED`), which only prod ran before.

## 1. Note the old distributions and back up the state

```bash
aws cloudfront list-distributions --profile dacntt-a \
  --query "DistributionList.Items[].[Id,ARN,DomainName,join(',',Aliases.Items||\`[]\`)]" --output text
$T output -raw cdn_key_pair_id; echo          # old Key-Pair-Id, for a rollback
$T state pull > .local-notes/cdn-move-$ENV-before.tfstate
```

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

Nothing changes in AWS or Cloudflare in this step.

## 3. Build the new distributions in account B

```bash
$T plan $VARS $OLD -var attach_hosts=false -out cdn-move.tfplan
$T apply cdn-move.tfplan
```

Expected: two distributions without hosts, two certificates validated on Cloudflare, OAC, key
group, policies and the SPA function created in account B; both bucket policies list the old
and the new distribution; the validation records of the old certificates are replaced. Staging:
18 added, 8 changed, 2 destroyed. Prod: if a validation record collides with one left by the old
certificate, import it instead of creating it.

## 4. Check the new distributions on their own domains

```bash
$T output -raw cdn_key_pair_id; echo          # new Key-Pair-Id
$T output -raw web_distribution_domain; echo
$T output -raw cdn_distribution_domain; echo
```

- The web domain answers 200 on `/`, an app route and `/embed/<id>`, with the security headers.
- The playback grant of the API cannot be used on the media domain, because its policy names
  the CDN host. Sign a policy for the `*.cloudfront.net` name with the private key of the API
  secret and the new Key-Pair-Id instead: master, rendition playlist and first segment answer
  200; unsigned, and signed for another video, they answer 403.

## 5. Move the hosts (downtime starts)

1. Remove every alias from the old web and media distributions in account A
   (`get-distribution-config --profile dacntt-a`, `Aliases = {Quantity: 0}`,
   `update-distribution --profile dacntt-a --if-match <ETag>`).
2. Point each host CNAME at its new distribution through the Cloudflare API
   (`PATCH zones/$Z/dns_records/<id>` with `{"content": "<new domain>"}`), for the media host,
   the web host and, on prod, `www`. Wait until `nslookup <host> 1.1.1.1` and `8.8.8.8` return
   the new domain.
3. Bring the records under the state and attach the hosts:

   ```bash
   $T import $VARS $OLD 'module.cdn.cloudflare_dns_record.host[0]' $Z/<record id of the cdn host>
   $T import $VARS $OLD 'module.web.cloudflare_dns_record.host[0]' $Z/<record id of the web host>
   # prod only
   $T import $VARS $OLD 'module.web.cloudflare_dns_record.redirect["www.zelostech.site"]' $Z/<record id of www>
   $T plan $VARS $OLD -out cdn-move.tfplan     # only aliases on the two distributions
   $T apply cdn-move.tfplan
   ```

The web host serves again as soon as the change is deployed.

## 6. Switch the signing key (playback is down until this is done)

1. Set `cloudfrontKeyPairId` in `zelos-$ENV/api` to the new id, leaving every other field as
   it is.
2. Upload the code the function already runs, so that every instance reads the secret anew:

   ```bash
   curl -s -o api.zip "$(aws lambda get-function --function-name zelos-$ENV-api --query Code.Location --output text)"
   aws lambda update-function-code --function-name zelos-$ENV-api --zip-file fileb://api.zip
   aws lambda wait function-updated --function-name zelos-$ENV-api
   ```

   The code hash stays the same.
3. A grant from the API plays through the CDN host: master, playlist and segment 200.

## 7. Check the site

- Guest: `/watch/<id>` and `/embed/<id>` play in a browser with every CDN response 200, and the
  thumbnails of the home page load.
- The end-to-end suite needs test accounts of that environment (`E2E_ACCOUNTS`); prod has
  them in `.local-notes/prod-e2e-accounts.json`. The pipeline test uploads a video, so switch
  screening off first (`-var moderation_enabled=false`) and on again afterwards.

## 8. Drop the old readers

```bash
$T plan $VARS -out cdn-move.tfplan     # only the two bucket policies lose the account A ARNs
$T apply cdn-move.tfplan
```

The old distributions now answer 403. A plan without variables shows no changes.

## 9. Delete the account A resources (ask first)

Disable each old distribution, wait until it is `Deployed`, then delete it, followed by its
key group, public key, OAC, policies, SPA function and, once no distribution uses it, the
certificate (`f17a029c` for prod). Remove the Cloudflare validation records of the deleted
certificates that are not managed by Terraform. Delete the probe distribution
`E3IJBGBHLBZW77` in account B as well.

## Rollback

Until step 9, every old resource still works:

- Remove the hosts from the new distributions, point the CNAMEs back at the old domains, and
  add the hosts back to the old distributions (`update-distribution --profile dacntt-a`).
- Put the old Key-Pair-Id back into `zelos-$ENV/api` and upload the function code again.
- Keep the transition variables set so both distributions can read the buckets.

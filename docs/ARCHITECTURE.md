# Architecture — Video Sharing Platform v2

Status: **approved by the owner on 2026-10-28 (S0)**: TypeScript everywhere, resource prefix
`zelos-{env}`, chunk fan-out as one Batch array job, playback authorised by a CloudFront
signed query policy instead of cookies. Branch: `rebuild/v2`.

This document is the design baseline of the rewrite. Code, infrastructure, tests and the
report follow it; when they disagree, this document is fixed first.

## 1. Scope

The platform is a video sharing service in the spirit of YouTube and Vimeo, built on an
event-driven, serverless-container transcoding pipeline. Every feature below is part of the
product; none is optional.

| # | Area | Features |
|---|---|---|
| F1 | Accounts | Register (username, email, password ≥ 8 chars, blocklist, breached-password check), sign in, Google sign-in and account linking, email verification with throttled resend, forgot/reset/change password, sign out, JWT in the `Authorization` header, rate-limited auth routes |
| F2 | Channels | Public profile with subscriber count, `@handle`, avatar (moderated), banner, channel sections, sorted video list |
| F3 | Upload | Direct-to-S3 upload: presigned POST up to 5 GiB, multipart (32 MiB parts, completed by the API) up to 20 GiB, progress/speed/ETA/cancel, custom thumbnail |
| F4 | Processing | Event-driven pipeline, six-rung Capped-CRF HLS ladder bounded by the source, 6 s segments, AES-128 per video, thumbnail, seek-preview sprite, long videos split into parallel chunks, moderation and violence labels, per-step progress |
| F5 | Watching | Home feed, Atlas Search (relevance, typo tolerance, diacritic-insensitive, autocomplete), categories, related videos, custom hls.js player (quality/ABR, speed, PiP, fullscreen, captions, chapters, seek preview), resume position, 30-second view rule with dedupe, like/dislike |
| F6 | Sharing & access | Public, unlisted, private, password-protected; members-only audience; embed player `/embed/:id`; share with timestamp; scheduled publishing |
| F7 | Community | Comments, replies (cursor paging), pin, delete, report comment, report video |
| F8 | Subscriptions | Subscribe/unsubscribe, subscription feed, in-app notifications for new uploads (optional email) |
| F9 | Memberships | Tiers per channel, join/cancel (sandbox payment), member roster, members-only videos, member badge |
| F10 | Library | Watch history, watch later, playlists (ordered, public/unlisted/private) |
| F11 | Creator studio | Edit metadata, captions (VTT upload), chapters, thumbnail, visibility, schedule; analytics: views per day, watch time, audience retention |
| F12 | Trust & safety | Automatic screening (Rekognition), review queue, decisions with reason codes, appeals, audit sampling with FP/FN metrics, event log, user/role admin; roles `user`, `operator`, `auditor`, `admin` |
| F13 | UI | Light/dark theme, Vietnamese/English, 403/404 pages, design system in vanilla CSS (no Tailwind) |

Not in scope (owner, 2026-10-28): age restriction, owner download toggle, replace-file-keep-link,
autoplay/up-next queue.

## 2. Constraints

| Constraint | Value (measured 2026-10-28) | Consequence |
|---|---|---|
| AWS account B (`749680934725`, `ap-southeast-1`) | All compute and storage | Credits; Fargate only, no always-on instances |
| AWS account A (`911707244328`) | CloudFront + ACM only (B may not create CloudFront) | Cross-account OAC/bucket policy; new paid resources need the owner's OK |
| Fargate quota | 8 vCPU Spot + 8 vCPU On-Demand (Spot 12 requested) | Transcoding ceiling 16 vCPU |
| Fargate quota is per account | Old stack (dev + staging) and new stack share the same 8 + 8 vCPU | Measurements run only while the other stack's queues are idle |
| Lambda concurrency | 400 per account (1000 requested); at least 100 must stay unreserved | Reserved concurrency per function (§5.8) |
| Batch `SubmitJob` | 50 TPS | Chunk fan-out uses one array job, not one call per chunk |
| MongoDB Atlas | Free tier, MongoDB 8.0: **500 connections**, **100 operations/s** (throttled above), **10 GB in + 10 GB out per 7 days**, 0.5 GB storage, **3 search indexes**, no private networking | Connection budget (§5.8); hot write paths kept off MongoDB (ADR-17); three search indexes (§5.9); access list open to Lambda egress with strong credentials |
| Cloudflare | DNS and the API gateway Worker for `zelostech.site` | API host rewrite, origin-verify secret |
| Email | Gmail SMTP (SES account still in sandbox), about 500 recipients per day | Recipient throttle; never block registration on mail failure; new-upload emails are opt-in and capped |
| Old stack `dacntt-dev-*` | Keeps serving until cutover | New resources use a new prefix and never touch it |

## 3. Architecture overview

```mermaid
flowchart LR
  subgraph Client
    W[React SPA + hls.js]
  end
  subgraph Cloudflare
    CW[Worker api.zelostech.site<br/>host rewrite + x-origin-verify]
  end
  subgraph AccountA[AWS account A]
    CF[CloudFront<br/>OAC + signed requests]
  end
  subgraph AccountB[AWS account B]
    API[Lambda: api]
    RAW[(S3 raw)]
    SQS[[SQS ingest + DLQ]]
    ST[Lambda: starter]
    SFN{{Step Functions<br/>transcode workflow}}
    PR[Lambda: probe]
    BQ[[Batch queues<br/>main / bulk]]
    FG[Fargate Spot → On-Demand<br/>FFmpeg containers]
    OUT[(S3 processed)]
    KEYS[(S3 keys, private)]
    DDB[(DynamoDB<br/>hot key-value data)]
    STS[Lambda: status]
    EB((EventBridge bus))
    SCH[EventBridge Scheduler]
    NOT[Lambda: notifier]
    SNS[[SNS alerts]]
  end
  DB[(MongoDB Atlas<br/>+ Atlas Search)]

  W -- REST --> CW --> API --> DB
  API --> DDB
  API -- read key --> KEYS
  STS -- create key --> KEYS
  FG -- read key --> KEYS
  W -- presigned POST / multipart parts --> RAW
  RAW -- ObjectCreated --> SQS --> ST -- StartExecution name=videoId:version --> SFN
  SFN --> PR
  SFN -- submitJob.sync --> BQ --> FG
  FG -- read --> RAW
  FG -- write --> OUT
  FG -- progress events --> EB --> STS --> DB
  SFN -- state changes --> STS
  SFN -- Catch --> SNS
  STS -- VideoPublished --> EB --> NOT --> DB
  API -- schedule publish --> SCH --> STS
  W -- playlists + segments, signed query --> CF --> OUT
  W -- key with playback token --> CW
```

Principles taken from the AWS Well-Architected Serverless Lens (event sources, routers and
destinations; durable queues; data contracts; tracing) and the AWS "Video on Demand on AWS"
solution (a Step Functions workflow owns the job, every step reports state, failures notify).

## 4. Transcoding workflow

### 4.1 Ingest and idempotency

1. `POST /v1/uploads` creates the video in state `UPLOADING` and returns either a presigned
   POST (≤ 5 GiB) whose policy pins the key `raw/{videoId}/{uploadVersion}/source`, the size cap
   and the metadata `x-amz-meta-video-id`, `x-amz-meta-upload-version`, `x-amz-meta-owner-id`;
   or a multipart session that the API opened with `CreateMultipartUpload` carrying the same key
   and metadata, so the client only uploads parts and the API completes it server-side.
2. S3 `ObjectCreated` on `raw/` (fired by the POST or by `CompleteMultipartUpload`) goes to the
   ingest SQS queue (DLQ after 3 receives; visibility timeout ≥ 6 × the starter timeout). No
   client "confirm" call is needed: the event starts processing.
3. Lambda `starter` reads the object metadata with `HeadObject` (S3 events carry no user
   metadata, and the key is never parsed), validates it against the shared schema, and calls
   `StartExecution` with `name = {videoId}-{uploadVersion}`. Step Functions keeps names unique
   per state machine for 90 days, so `ExecutionAlreadyExists` counts as success and duplicate
   S3 events start nothing new. It reports failures with SQS partial batch responses.

### 4.2 State machine

```mermaid
stateDiagram-v2
  [*] --> MarkProcessing
  MarkProcessing --> Probe
  Probe --> Fork
  state Fork <<fork>>
  Fork --> Analyse
  Fork --> EncodeChoice
  state EncodeChoice <<choice>>
  EncodeChoice --> EncodeSingle: under 5 min, VFR, unknown duration or A/V offset
  EncodeChoice --> EncodeChunked: otherwise
  state EncodeChunked {
    [*] --> AudioAndChunks
    AudioAndChunks --> Stitch: audio job + chunk array job (.sync)
    Stitch --> [*]
  }
  EncodeSingle --> Join
  EncodeChunked --> Join
  Analyse --> Join
  state Join <<join>>
  Join --> Publish
  Publish --> [*]
  MarkProcessing --> MarkFailed: Catch
  Probe --> MarkFailed: Catch
  Join --> MarkFailed: Catch
  Publish --> MarkFailed: Catch
  MarkFailed --> [*]
```

`Fork`/`Join` is one Step Functions `Parallel` state with two branches: analysis and encoding.

| State | Runs on | Output |
|---|---|---|
| MarkProcessing | Lambda `status` | Video → `PROCESSING`, step `probe`; creates the AES key and IV (§5.5) |
| Probe | Lambda `probe` (static ffprobe in a layer published from S3, reads the source over a presigned HTTPS URL) | Streams, display size (rotation, SAR), fps from `avg_frame_rate`, VFR flag, A/V start offset, duration, rendition plan, chunk plan |
| Analyse | Batch job `analyse` (1 vCPU) | One pass of sampled frames: Rekognition `DetectModerationLabels` → decision and violence labels; seek-preview sprite sheets + `thumbnails.vtt`; default thumbnail |
| EncodeSingle | Batch job `encode` (1–4 vCPU by duration) | All renditions, HLS, AES-128, CODECS, measured BANDWIDTH; uploads `master.m3u8` after everything else |
| EncodeChunked | Batch job `audio` + array job `chunk` (4 vCPU, bulk queue) + Lambda `stitch` | Same outputs assembled from chunks; `stitch` uploads `master.m3u8` last |
| Publish | Lambda `status` | Checks the master exists; video → `READY` (or `SCHEDULED`, §4.4) with the moderation result; event `VideoPublished` |
| MarkFailed | Lambda `status` | Video → `ERROR` with reason, owner notified once, SNS alert, temporary files removed |

The chunk threshold is 5 minutes (measured on v1 on 2026-10-11: a 5-minute video took
26.7 minutes as one 1-vCPU job and 11.9 minutes on the chunked path). The single-job path above 20 minutes, which only happens on a
fallback, keeps the 360p/720p/1080p subset (§5.3).

Retries: every Batch job has `attempts = 3` and retries unconditionally, because a Fargate
Spot reclaim must not fail the video (as measured on v1); application errors that a retry
cannot fix exit with a code the workflow maps to `MarkFailed`. Lambda tasks retry
`Lambda.ServiceException`, `Lambda.TooManyRequestsException` and throttling with backoff. A
workflow `TimeoutSeconds` of 24 h (queue wait included) replaces the hourly "stuck
PROCESSING" sweep.

Early stop for chunks: an array job only finishes when every child has finished, so a chunk
whose last attempt fails writes `work/{videoId}/{uploadVersion}/abort` to S3; the other chunks
check that marker before starting and between segments, and exit at once.

Progress: the `encode` job publishes a `TranscodeProgress` event at most every 10 s; each chunk
publishes one event when it finishes; `status` stores `processingProgress` and the step. This
keeps database writes to a few per minute per video.

### 4.4 Scheduled publishing

The API creates, moves or deletes one EventBridge Scheduler one-time schedule whenever
`publishAt` changes. `Publish` sets `SCHEDULED` when `publishAt` is still in the future and
`READY` otherwise. When the schedule fires, `status` publishes the video only if it is
`SCHEDULED`; a schedule that fires before processing has finished does nothing, and
`Publish` then sets `READY` directly. Schedules delete themselves after running.

### 4.3 Compute

- One container image, one job definition per role (`analyse`, `encode`, `audio`, `chunk`),
  `node:22-slim` plus a pinned static FFmpeg, built for `linux/amd64`.
- Compute environments: Fargate Spot (max 8 vCPU) first, Fargate On-Demand (max 8 vCPU) second,
  shared by two queues: `main` (priority 10: `analyse`, `encode`, `audio`) and `bulk`
  (priority 1: chunk arrays), so short videos overtake long ones.
- Network: tasks run in public subnets with a public IP, so there is no NAT gateway to pay for
  while idle; S3 traffic goes through a free gateway endpoint.
- Containers only read from S3 raw and keys, and write to S3 processed and work. They have **no
  database credentials**; their role allows `s3:GetObject` on raw and on the keys bucket,
  `s3:PutObject` on processed and work, `events:PutEvents` on the bus and
  `rekognition:DetectModerationLabels`.

## 5. Media design

### 5.1 HLS output

Everything of one upload lives under `videos/{videoId}/v{uploadVersion}/` in the processed
bucket, so a retry never mixes files of two runs and one signed policy covers the video.

```mermaid
flowchart TD
  M[master.m3u8<br/>EXT-X-STREAM-INF BANDWIDTH / AVERAGE-BANDWIDTH /<br/>RESOLUTION / CODECS / FRAME-RATE]
  M --> R1[1080p/index.m3u8]
  M --> R2[720p/index.m3u8]
  M --> R3[... 144p/index.m3u8]
  R1 --> K[EXT-X-KEY METHOD=AES-128<br/>URI=API base of the environment + /v1/videos/:id/key, IV=0x...]
  R1 --> S1[seg_00000.ts ... 6 s each]
  X[side files, not in the master] --> T[preview/thumbnails.vtt + sprite_N.jpg]
  X --> C[captions/vi.vtt, en.vtt]
```

- Segment target 6 s, `EXT-X-TARGETDURATION` = rounded longest segment, `EXT-X-INDEPENDENT-SEGMENTS`.
- `BANDWIDTH` is the measured peak segment bitrate rounded up; `AVERAGE-BANDWIDTH` is total
  bytes over total seconds (RFC 8216 §4.3.4.2).
- `CODECS` comes from the SPS of the first real segment (`avc1.PPCCLL`) plus `mp4a.40.2`; the
  attribute is omitted rather than guessed when it cannot be read.
- The key URI uses the API base URL of the environment that transcoded the video (staging
  videos call the staging API), which is a required setting of the transcoder.
- Captions are side-loaded WebVTT files that the player adds as text tracks, so uploading or
  removing a caption never rewrites a published playlist. Chapters are stored on the video and
  drawn by the player.

### 5.2 FFmpeg filter graph (single job)

```mermaid
flowchart LR
  IN[source over HTTPS] --> D[decode]
  D --> SPLIT[split=N]
  SPLIT --> S1[scale 1920:1080] --> E1[libx264 crf 22 maxrate 4500k bufsize 9000k]
  SPLIT --> S2[scale 1280:720] --> E2[libx264 crf 23 maxrate 2200k bufsize 4400k]
  SPLIT --> S3[...] --> E3[...]
  D --> A[aac 128k / 64k]
  E1 & E2 & E3 & A --> MUX[hls muxer: hls_time 6,<br/>hls_key_info_file, var_stream_map]
  MUX --> OUT[(S3 processed)]
```

Rules every rendition shares (so ABR switches never break): forced keyframes at absolute 6 s
marks, `-g` from the real frame rate and `-keyint_min` equal to it (closed GOP),
`-sc_threshold 0`, 8-bit 4:2:0 (`yuv420p`), `profile` set but no `-level`, even dimensions,
source read once.

### 5.3 Bitrate ladder

| Rung | CRF | maxrate | bufsize | Audio |
|---|---|---|---|---|
| 144p | 28 | 180k | 360k | 64k |
| 240p | 26 | 350k | 700k | 64k |
| 360p | 25 | 600k | 1200k | 64k |
| 480p | 24 | 1100k | 2200k | 64k |
| 720p | 23 | 2200k | 4400k | 128k |
| 1080p | 22 | 4500k | 9000k | 128k |

Rungs are bounded by the source: no upscaling, a source between rungs gets a rung at its own
size, portrait sources use portrait frames without padding, rotation flags and non-square SAR
are applied before planning. Videos over the long-video threshold use the 360p/720p/1080p
subset on the single-job path; the chunked path always gets the full ladder. The rationale and
references (Apple HLS Authoring Specification, x264 CRF/VBV, FFmpeg HLS muxer) belong in
ADR-09.

### 5.4 Long videos (chunked path)

```mermaid
flowchart LR
  P[probe plan:<br/>chunks of whole GOPs] --> AJ[audio job: encode each used bitrate once]
  P --> CA[chunk array job size K:<br/>chunk i encodes frames of window i]
  AJ --> ST[stitch Lambda]
  CA --> ST
  ST --> PL[media playlists per rung,<br/>master last, one EXT-X-KEY + explicit IV]
```

Invariants (from the measured design): chunk windows meet exactly; seek half a frame before the
first frame; chunk 0 never seeks negative; the last chunk is open-ended; audio windows match to
the microsecond; a remainder shorter than one GOP joins the previous chunk; segment boundaries
must align across rungs (RFC 8216 §6.2.4) and a chunk that differs from plan by more than
0.25 s or 3 frames fails the stitch. Chunk size adapts to capacity (about three chunks per
available slot, never below the minimum); a 4-hour video stays at 48 chunks of 5 minutes.
Fallback to the single job: VFR source, unknown duration, A/V start offset > 0.25 s, fewer
than two chunks.

### 5.5 Encryption and playback

```mermaid
sequenceDiagram
  participant P as Player (hls.js)
  participant A as API (Lambda)
  participant C as CloudFront (A)
  participant S as S3 processed
  P->>A: GET /v1/videos/:id/playback (JWT optional, unlock token optional)
  A-->>P: master URL, signed query policy (/videos/:id/*, 2 h), playback token (2 h)
  P->>C: GET master.m3u8?Policy&Signature&Key-Pair-Id
  C->>S: OAC fetch
  P->>A: GET /v1/videos/:id/key with the playback token
  A-->>P: 16 raw bytes
  P->>C: GET seg_*.ts?Policy... (appended by the loader)
  P->>P: decrypt AES-128, ABR picks the rung
```

- Key: `MarkProcessing` creates one random 16-byte key and an explicit IV per upload version and
  stores the key in a private, encrypted `keys` bucket that only the transcoder and API roles can
  read. Only a reference travels through the workflow, so keys never appear in execution
  history or logs.
- `/playback` applies the access rule (owner, visibility, unlock, membership, moderation) once
  and returns a playback token: a short JWT scoped to that video. The key endpoint accepts only
  that token. The key request therefore needs no login session, which matters inside an embed.
- Access to processed files uses a CloudFront **custom policy with a wildcard path**, sent as
  query parameters that the hls.js `xhrSetup` hook appends to requests for the CDN host only
  (never to the API). The CDN cache policy excludes query strings from the cache key, so every
  viewer shares the same cached segments. Cookies are not used, so the embed player works inside
  third-party iframes where browsers block third-party cookies.
- Embeds play only public and unlisted videos; private, password and members-only videos show
  a "watch on the site" card, because an iframe cannot reach the viewer's login.
- AES-128 is not DRM: a viewer who may play the video can also reassemble it. Widevine/FairPlay
  is the documented next step.

### 5.6 Adaptive bitrate in the player

hls.js estimates bandwidth (EWMA of segment downloads) and selects the highest rung whose
`BANDWIDTH` fits under the estimate with a safety factor, dropping early when the buffer
falls below its threshold. The player exposes manual quality, stats (bandwidth, buffer,
dropped frames), captions, chapters and the sprite preview.

### 5.7 Moderation

The `analyse` job samples frames once. For moderation it keeps one frame per interval (widened
for long videos up to a frame cap) and checks each with `DetectModerationLabels`. A shared label
policy maps labels to `block`, `review` or `allow` and sets the violence warning; fictional
content lowers severity. Avatars, banners and custom thumbnails go through the same policy
before they are published. If Rekognition is unavailable, the video goes to `review` (fail
closed). The same pass writes the seek-preview sprite sheets and the default thumbnail.

### 5.8 Concurrency and connection budget

| Function | Reserved concurrency | Mongo pool per instance | Max connections |
|---|---|---|---|
| api (prod) | 80 | 3 | 240 |
| status (prod) | 10 | 2 | 20 |
| notifier, scheduler hooks (prod) | 5 | 2 | 10 |
| api (staging) | 20 | 3 | 60 |
| status/notifier (staging) | 5 | 2 | 10 |
| old stack until cutover (4 open when measured) | — | — | ≤ 100 |
| **Total** | | | **≤ 440 of 500** |

`starter`, `probe` and `stitch` do not open database connections. The api uses
`maxIdleTimeMS` so idle instances release connections. Reserved concurrency adds up to 120 of
the account's 400, leaving 280 unreserved (AWS requires at least 100).

### 5.8a Staying under 100 MongoDB operations per second

The free cluster throttles above 100 operations per second, shared by both environments and
the old stack. Every request of v1 wrote its rate-limit counter to MongoDB, and the player's
analytics and the view rule add more writes. v2 keeps MongoDB for domain documents and search,
and moves the hot, short-lived key-value writes to DynamoDB on-demand tables (ADR-17, waiting
for the owner's approval):

| Data | Store | Why |
|---|---|---|
| Rate-limit windows | DynamoDB, TTL | One write per API request |
| View-dedupe marks (30-second rule) | DynamoDB, TTL, conditional put | One write per counted view |
| Watch progress (resume) and analytics heartbeats | DynamoDB, aggregated into MongoDB `analyticsDaily` once per hour by a scheduled function | Players report every 60 s and on pause/unload (`sendBeacon`) |
| Notifications | DynamoDB, partition = user, TTL 90 days | One write per subscriber per upload |
| Users, videos, comments, channels, memberships, playlists, reports | MongoDB | Relational queries, Atlas Search, `countDocuments` reconciliation |

Without DynamoDB the alternative is Atlas Flex (base about 8 USD per month, capped at 30 USD,
billed by MongoDB and not covered by the AWS credits).

Counters: relationship counters (subscribers, reactions, comments, members) are recomputed with
`countDocuments` on change, as before. View and watch-time totals are aggregates of counted
events and are increased with `$inc`, because recounting them would itself cost operations.

### 5.9 Search

Three Atlas Search indexes (the free-tier maximum):

- `videos_search` on `videos`: `title`, `description`, `tags`, `channelName` (denormalised),
  with a custom analyzer: a `mapping` character filter `đ→d`, `Đ→D` (base letters that
  Unicode folding leaves alone), the standard tokenizer, `lowercase` and `icuFolding`, so
  "nhac" matches "nhạc" and "do" matches "đỏ". `title` also has an `autocomplete` (edgeGram)
  mapping. `visibility`, `status`, `moderation.status` and `audience` are mapped as `token` for
  filtering.
- `channels_search` on `users`: `displayName`, `handle`.
- `playlists_search` on `playlists`: `title`, `visibility` (token).

Queries use `compound` with `text` (`fuzzy.maxEdits` 1–2) plus a `filter` on visibility,
status and moderation, so private, unlisted, unready or removed videos never appear.

## 6. Architecture decisions (ADR)

| # | Decision | Alternatives considered | Reason |
|---|---|---|---|
| 01 | Step Functions Standard orchestrates each video | Containers submitting their own jobs; Batch `dependsOn` chains; EventBridge Pipes | One place holds state, retries and failure handling; `.sync` waits for Batch; visible per-step history; cost ≈ $0.025 per 1000 transitions |
| 02 | Only the `status` Lambda writes processing state (status, step, progress, renditions, moderation result); the API writes the fields owners edit; containers have no DB access | Containers write to MongoDB | Least privilege, one writer per field group, no credentials in long-running containers |
| 03 | Idempotency by execution name `{videoId}-{uploadVersion}` | Idempotency table; job-name dedupe | Step Functions rejects duplicate names; no extra store |
| 04 | Event contract via object metadata + JSON schema in `shared/` | Parsing the S3 key | Explicit, versioned contract between producer and consumer |
| 05 | One Lambda (Express) behind a Function URL, fronted by a Cloudflare Worker with an origin secret | API Gateway HTTP API; one function per route | No API Gateway cost; one cold-start profile; Worker already holds DNS/TLS |
| 06 | Fargate Spot then On-Demand; `main` and `bulk` queues | Spot only; EC2 compute environments | Cheapest first with overflow; no idle instances (project rule) |
| 07 | Probe in Lambda with a static ffprobe layer (published from S3 because the zip exceeds 50 MB) | Probe as a Batch job | Seconds instead of a container start; result returned directly to the workflow |
| 08 | Chunk fan-out as one Batch array job (`.sync`) | Step Functions Map with one job per chunk | One `SubmitJob` call (50 TPS limit), native per-child retry |
| 09 | Six-rung Capped-CRF ladder with VBV and aligned GOPs | Fixed-bitrate ladder; per-title encoding | Constant quality with a delivery cap; complex scenes do not starve, static scenes do not waste bits |
| 10 | AES-128 + CloudFront signed query policy | Signed cookies; DRM | Works inside iframes; DRM out of budget (documented limit) |
| 11 | Atlas Search | Elasticsearch/OpenSearch | Same Lucene engine, managed, no always-on cluster |
| 12 | EventBridge Scheduler one-time schedule per scheduled video, deleted after it fires | Polling cron | Exact time, no idle polling |
| 13 | Powertools logger/tracer/metrics, X-Ray, structured English logs | Free-form logs | Correlate by `videoId` and execution ARN across Lambda, Step Functions and Batch |
| 14 | Environments `prod` and `staging`, prefix `zelos-{env}`, state per environment with DynamoDB locking | Reusing `dacntt-dev-*` | Names match their role; the old stack stays untouched until cutover |
| 15 | CloudFront in account A, origins in B | Everything in B | B is not allowed to create CloudFront distributions |
| 16 | Email through Gmail SMTP with a per-recipient throttle | SES | SES account is in sandbox |
| 17 | **Proposed, waiting for the owner:** DynamoDB on-demand for rate limits, view marks, watch progress, analytics heartbeats and notifications | Everything in MongoDB (free cluster throttles at 100 ops/s); Atlas Flex (8–30 USD per month outside AWS credits); Redis (rejected earlier) | Serverless, pay per request, TTL built in, covered by AWS credits; keeps MongoDB for documents and search |
| 18 | AES key in a private keys bucket, referenced by the workflow; key endpoint takes a per-video playback token | Key in MongoDB passed through the workflow; key endpoint behind the user JWT | Keys stay out of execution history and logs; embeds can fetch keys without a login session |
| 19 | Captions as side-loaded WebVTT text tracks | Subtitle renditions in the master playlist | Adding a caption never rewrites a published playlist |

## 7. Data model

```mermaid
erDiagram
  USER ||--o{ VIDEO : owns
  USER ||--o{ SUBSCRIPTION : follows
  USER ||--o{ MEMBERSHIP : joins
  USER ||--o{ MEMBERSHIP_TIER : offers
  USER ||--o{ PLAYLIST : creates
  USER ||--o{ WATCH_HISTORY : records
  USER ||--o{ NOTIFICATION : receives
  VIDEO ||--o{ COMMENT : has
  VIDEO ||--o{ REACTION : has
  VIDEO ||--o{ REPORT : receives
  VIDEO ||--o{ APPEAL : has
  VIDEO ||--o{ ANALYTICS_DAILY : aggregates
  PLAYLIST }o--o{ VIDEO : lists
  MEMBERSHIP }o--|| MEMBERSHIP_TIER : of
```

| Collection | Key fields | Notes |
|---|---|---|
| users | email (unique), handle (unique), passwordHash, googleId, emailVerified, role, avatar, banner, sections, subscriberCount | Channel = user |
| videos | owner, title, description, tags, category, status, step, processingProgress, uploadVersion, visibility (`public`/`unlisted`/`private`/`password`), passwordHash, audience (`public`/`members`), publishAt, scheduleName, renditions, duration, hlsPath, keyRef, thumbnail, previewPath, captions[], chapters[], moderation{}, hasViolence, counters | Relationship counters reconciled with `countDocuments`; view totals with `$inc` (§5.8a) |
| comments | video, author, parent, body, pinned, replyCount | Replies one level deep |
| reactions | video, user, kind | Unique (video, user) |
| subscriptions | subscriber, channel | Unique pair |
| membershipTiers / memberships | channel, name, price / member, tier, expiresAt | Sandbox payment |
| playlists | owner, title, visibility, items[{video, addedAt}] | Watch later = system playlist |
| analyticsDaily | video, date, views, watchSeconds, retention[20] | Hourly roll-up of heartbeats |
| reports, appeals, auditSamples, moderationEvents, roleChanges | as in the current console | |

Key-value data (DynamoDB if ADR-17 is approved, otherwise MongoDB collections with TTL indexes):

| Table | Key | Attributes | TTL |
|---|---|---|---|
| rateLimits | `key` (account id or IP /56) + window | count | end of window |
| viewMarks | `viewerKey#videoId` | expiresAt | view window |
| watchProgress | user, `videoId` | position, updatedAt (history = newest first) | none |
| heartbeats | `videoId#hour` | watchSeconds, retention buckets | 7 days after roll-up |
| notifications | user, `createdAt#id` | type, video, read | 90 days |

## 8. API contract (outline)

Base path `/v1`. JSON, errors as `{ "error": { "code": "...", "message": "..." } }`, cursor
paging `?cursor=&limit=`.

- `auth`: register, login, google, link-google, verify-email, resend-verification,
  forgot-password, reset-password, change-password, logout, me
- `uploads`: create (POST or multipart), parts, complete, abort
- `videos`: list/search/suggest, get, related, update, delete, playback, key, view,
  heartbeat (analytics), reactions, report, appeal, captions (upload/delete), chapters,
  thumbnail, unlock (password)
- `comments`: list, replies, create, delete, pin, report
- `channels`: get by id or `@handle`, videos, sections, banner, subscribe, subscription status
- `memberships`: tiers CRUD, join, cancel, status, roster
- `me`: profile, avatar, history (list, delete), watch-later, playlists CRUD + items,
  notifications (list, mark read), subscriptions feed, studio analytics
- `admin`: moderation queue, decisions, comment reports, appeals, audit samples, metrics,
  events, users and roles

The full reference with request/response schemas becomes Appendix A of the report.

## 9. Acceptance checklist (edge cases carried over)

Each line becomes at least one automated test in the new code.

**Upload**
- [ ] Files ≤ 5 GiB use presigned POST; larger files use multipart; one byte over the
      threshold switches to multipart; the POST policy enforces the size cap.
- [ ] Part size 32 MiB stored with the video; part URLs signed with the exact part size; a part
      with a different size, extra parts or gaps → `400`; missing parts → `UPLOAD_INCOMPLETE`.
- [ ] Complete is idempotent (already past `UPLOADING` → current state); an object assembled
      before the DB write is detected; abort on draft delete; abort failure still deletes.
- [ ] Hard cap 20 GiB; invalid config falls back to the default, never widens.
- [ ] Non-video MIME types and disguised files are refused.

**Probe and planning**
- [ ] Frame rate from `avg_frame_rate`, ignore implausible `r_frame_rate` (VFR phones report
      90000/1), NTSC fractions, never 0.
- [ ] Rotation flags (side data and legacy tag) swap width/height; SAR applied.
- [ ] Cover art streams ignored; audio stream = most channels; silent sources supported.
- [ ] VFR, unknown duration, A/V offset > 0.25 s or < 2 chunks → single job.

**Encoding**
- [ ] Forced keyframes at absolute times; closed GOP; scene cut off; same expression on every
      rung; source read once; 8-bit 4:2:0; no `-level`.
- [ ] Ladder bounded by source; no duplicate sizes; portrait without padding; even sizes;
      sources below 144p get one rung at source size.
- [ ] Encode guard stops runs that cannot finish within the budget (projected from progress,
      sustained, not during start-up).
- [ ] ffmpeg errors keep the stderr tail; signal kills (Spot, OOM) are reported as such.

**Packaging**
- [ ] BANDWIDTH = measured peak rounded up; average from bytes/seconds; config fallback only
      when nothing is measurable; ladder stays ascending.
- [ ] CODECS from the SPS of the first existing segment; omitted when unreadable; quoted.
- [ ] TARGETDURATION ≥ every rounded EXTINF; master written last.
- [ ] One EXT-X-KEY with an explicit IV before the first segment; no key file left in output.

**Chunked path**
- [ ] Plan invariants of §5.4; a 4-hour video at 30 fps gives 48 chunks × 50 segments; a 48-hour
      video stays under the 10 000-element array limit.
- [ ] Stitch refuses missing chunk results, empty middle chunks, misaligned rungs and chunk
      length drift; accepts an empty last chunk.
- [ ] Any child retries on Spot reclaim; the last failed attempt fails the workflow once and
      notifies once; other chunks stop early.

**Workflow**
- [ ] Duplicate S3 event → one execution; killed job → `ERROR` within minutes; deleted video
      during processing → workflow ends quietly and cleans up; publishing twice sends one email.

**Access and playback**
- [ ] Private → `404` for strangers (no existence leak); removed → `403 VIDEO_REMOVED`; under
      review → `403 VIDEO_UNDER_REVIEW`; owner can open but not play a removed video; admins can
      review; members-only locked for non-members (no playlist URL); password unlock per video.
- [ ] Key endpoint applies the same rule; returns 16 raw bytes (binary, not base64) with CORS
      only for allowed origins; disallowed origin → `403`, not `500`.
- [ ] Signed policy scoped to `/videos/{id}/*`, never another video; expiry from config.
- [ ] Views: not the owner, not unready or removed videos, once per viewer per window, guests
      by IP (/56 for IPv6), decided from the shared store.

**Accounts and abuse**
- [ ] Password 8–72 bytes counted in UTF-8, blocklist, breached-password check.
- [ ] Verification token stored hashed, single use, expires; mail failure never blocks
      registration; resend throttled per recipient (case-insensitive, 1-hour window).
- [ ] Google: unverified local account is claimed by the mailbox owner (password removed,
      sessions revoked); verified account → `409`; audience checked against the client id.
- [ ] Rate-limit key = account id or IP; trust only Cloudflare hops for the client IP; the
      origin secret is compared in constant time; health routes stay open.

**Community, channels, memberships, moderation**
- [ ] Comment cursors, pinned first, replies one level deep, counts reconciled on delete.
- [ ] Subscribe: not self, idempotent, counts from `countDocuments`.
- [ ] Tiers: owner only; joining own channel refused; two concurrent creates read the winner.
- [ ] Reports: reason list, ≤ 500 chars, not own video, not invisible videos, repeats not
      counted; decisions require reason codes; machine verdict kept before overrides.
- [ ] Avatar screening fails closed when Rekognition is down.

**Operations**
- [ ] Lambda key response stays binary; Cloudflare Worker rewrites Host/SNI and dedupes CORS.
- [ ] Health check needs no secret; scheduled events never run on HTTP requests.

**New in v2 (no v1 test to carry over)**
- [ ] Keys never appear in Step Functions history, logs or API responses other than `/key`.
- [ ] The CDN cache key ignores query strings: two viewers with different signatures hit the
      same cached segment; the signed parameters are never appended to API requests.
- [ ] Search: "nhac" finds "nhạc", "do" finds "đỏ", one typo still matches, private, unlisted,
      unready and removed videos never appear, autocomplete answers after two characters.
- [ ] Playlists: order kept, duplicates refused, private playlists hidden, deleted or private
      videos shown as unavailable rather than leaking their title.
- [ ] Captions: only valid WebVTT up to a size cap; language code checked; served through the
      same signed policy.
- [ ] Scheduled publishing: moving or cancelling `publishAt` moves or deletes the schedule; a
      schedule that fires before processing ends does nothing; publishing notifies once.
- [ ] Password videos: wrong password does not reveal the title; unlock rate-limited; the
      unlock token is scoped to one video.
- [ ] Embed: public and unlisted videos play inside a third-party iframe without cookies;
      other visibilities show the "watch on the site" card.
- [ ] Notifications and email: one notification per subscriber per upload; email only for
      subscribers who opted in, within the daily mail cap.
- [ ] Analytics: heartbeats from one viewer cannot inflate watch time beyond real time; the
      hourly roll-up is idempotent.
- [ ] Load: a 50-viewer burst stays under 100 MongoDB operations per second.
- [ ] SQS visibility timeout ≥ 6 × starter timeout; DLQ alarm fires on the first message.

## 10. Repository layout

```
api/            Lambda API (TypeScript, Express adapter, esbuild bundle)
functions/      starter, probe, status, stitch, notifier (TypeScript)
transcoder/     container image: analyse, encode, audio, chunk (TypeScript, FFmpeg)
web/            React SPA (TypeScript, Vite, hls.js, vanilla CSS)
shared/         schemas (zod), video states, event contracts, label policy
infra/          Terraform: modules/ and envs/{prod,staging}
e2e/            Playwright tests
docs/           this document, diagrams, results
report/         LaTeX report
```

The old `backend/`, `frontend/`, `transcoder/` and `infrastructure/` folders were removed from
`rebuild/v2` on 2026-10-28. They stay on `master`, and the old stack keeps serving from them,
until the cutover merge; `git show master:<path>` reads them for reference.

## 11. Schedule

| Day | Work | Exit check |
|---|---|---|
| 28–29/10 | S0: this document, repo skeleton, CI for the new layout | Owner approves |
| 30/10 | Terraform modules: network, S3 (raw, processed, work, keys), SQS, bus, Batch (Spot + On-Demand, two queues), ECR, IAM, DynamoDB tables (if ADR-17) | `terraform plan` clean on staging |
| 31/10 | Transcoder roles (analyse, encode, audio, chunk) + probe/stitch Lambdas | Unit tests; local encode of sample sources |
| 01/11 | State machine, starter, status; deploy to staging | Short clip and 25-minute video reach `READY`; duplicate event; killed job → `ERROR` |
| 02/11 | API: auth, uploads, videos, playback/key, comments, channels, subscriptions | Tests green against staging |
| 03/11 | API: memberships, library, notifications, analytics, studio, admin, search | Tests green |
| 03–04/11 | Web: all pages and the player; Playwright E2E | Build and E2E green on staging |
| 05/11 | Prod environment, seed, DNS cutover (owner approval) | Production checks |
| 05–06/11 | Measurements (owner approval per batch) | Results JSON → report tables |
| 06–07/11 | Report chapters, one stop per chapter | Sent to the advisor on 07/11 |

## 12. References

- AWS Well-Architected Framework, Serverless Applications Lens — Event-driven architectures.
  https://docs.aws.amazon.com/wellarchitected/latest/serverless-applications-lens/event-driven-architectures.html
- Video on Demand on AWS — Architecture overview.
  https://docs.aws.amazon.com/solutions/latest/video-on-demand-on-aws/architecture-overview.html
- AWS Step Functions — Run AWS Batch workloads; fan out batch jobs with Map.
  https://docs.aws.amazon.com/step-functions/latest/dg/connect-batch.html ,
  https://docs.aws.amazon.com/step-functions/latest/dg/sample-batch-fan-out.html
- AWS Prescriptive Guidance — Partial batch responses for SQS.
  https://docs.aws.amazon.com/prescriptive-guidance/latest/lambda-event-filtering-partial-batch-responses-for-sqs/best-practices-partial-batch-responses.html
- MongoDB Atlas — Free cluster limitations (100 operations/s, 500 connections, 0.5 GB,
  10 GB transfer each way per 7 days, 3 search indexes).
  https://www.mongodb.com/docs/atlas/reference/free-shared-limitations/
- MongoDB Atlas — Flex costs. https://www.mongodb.com/docs/atlas/billing/atlas-flex-costs/
- MongoDB Atlas Search — Token filters (`icuFolding`, `asciiFolding`) and diacritic-insensitive
  search. https://www.mongodb.com/docs/atlas/atlas-search/analyzers/token-filters/ ,
  https://www.mongodb.com/docs/atlas/atlas-search/tutorial/diacritic-insensitive/
- Apple — HLS Authoring Specification for Apple Devices.
  https://developer.apple.com/documentation/http-live-streaming/hls-authoring-specification-for-apple-devices
- FFmpeg — HLS muxer. https://ffmpeg.org/ffmpeg-formats.html#hls-2 ; H.264 encoding guide
  (CRF, VBV). https://trac.ffmpeg.org/wiki/Encode/H.264
- Amazon CloudFront — Signed URLs with a custom policy.
  https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-creating-signed-url-custom-policy.html
- Amazon EventBridge Scheduler — One-time schedules.
  https://docs.aws.amazon.com/scheduler/latest/UserGuide/schedule-types.html
- hls.js — API (`xhrSetup`, ABR configuration). https://github.com/video-dev/hls.js/blob/master/docs/API.md
- RFC 8216 — HTTP Live Streaming. https://datatracker.ietf.org/doc/html/rfc8216
- YouTube Data API v3 resources. https://developers.google.com/youtube/v3/docs

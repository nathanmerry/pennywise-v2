# Pennywise Curriculum

The lesson slugs remain the authoritative coverage map for the 30 Educative modules.
Read `TEACHING.md` before teaching. The scenarios below are starting points, not verified
bugs, deployed infrastructure, or mandatory feature work. Inspect current code first. When
there is no natural fit, invent an explicitly hypothetical Pennywise scenario and still
teach the full lesson coverage. Consider Nathan's ongoing AWS integration for related topics.

Active state: `learning/progress.json` (paths here are relative to the Pennywise root).
Session artifacts: `learning/modules/NN-slug/`. Historical work: `learning/history/lumo/`.
Prefer the current in-progress module, then the first todo; skipped modules stay skipped.

Legend: 🧱 hands-on · 🗺️ design discussion · 🧠 concepts/interview · ⭐ especially relevant.

## Phase 1 — Foundations

### M01 · Interview Reality 🧠
What system-design interviews actually test; how to run one; mock-interview mechanics.
- **Scenario:** Design Pennywise bank sync and budgeting in a 45-minute interview; establish requirements first.
- **Practice:** Discuss the opening and record a reusable interview checklist.
- **Lessons:** `getting-ready-for-the-system-design-interview`, `the-dos-and-donts-of-the-system-design-interview`, `system-design-interview-trap-why-engineers-fail-and-succeed`, `how-long-does-it-take-to-prepare-for-a-system-design-interview`, `system-design-mock-interviews`, `introduction-to-modern-system-design`, `why-every-developer-should-learn-system-design`, `course-structure-for-modern-system-design`

### M02 · RPC, Consistency & Failure 🧱
Network abstractions, the consistency spectrum, failure models.
- **Scenario:** Trace MCP-to-backend or backend-to-bank calls; investigate slow responses, uncertain writes and overlapping syncs.
- **Practice:** Use the real client/sync tests to reproduce a failure and let Nathan design the handling.
- **Lessons:** `abstractions-in-system-design`, `network-abstractions-remote-procedure-calls`, `spectrum-of-consistency-models`, `the-spectrum-of-failure-models`

### M03 · Non-Functional Characteristics 🧱
Availability, reliability, scalability, maintainability, fault tolerance; NFRs in interviews.
- **Scenario:** Decide what reliable and responsive budget views and bank sync mean, including stale data and partial failure.
- **Practice:** Measure an existing endpoint locally; inject a dependency failure and define success criteria. Relate to verified AWS hosting plans.
- **Lessons:** `availability`, `reliability`, `scalability`, `maintainability`, `fault-tolerance`, `non-functional-requirements-for-system-design-interviews`

### M04 · Back-of-the-Envelope Estimation 🧱
BOTEC: servers, storage, bandwidth, QPS.
- **Scenario:** Estimate storage and request volume for transaction histories, syncs, exports and notifications.
- **Practice:** Derive estimates from the schema and measured payloads; label growth assumptions and relate them to AWS capacity/cost.
- **Lessons:** `put-back-of-the-envelope-numbers-in-perspective`, `examples-of-resource-estimation`

---

## Phase 2 — Building Blocks

### M05 · Building Blocks Intro + DNS 🧠
The bottom-up approach; DNS as the first block.
- **Scenario:** Trace a Pennywise browser/API request through DNS and its actual or proposed AWS entry point.
- **Practice:** Inspect deployment/DNS configuration and diagram the request path; use a local experiment if helpful.
- **Lessons:** `introduction-to-building-blocks-for-modern-system-design`, `introduction-to-domain-name-system-dns`, `how-the-domain-name-system-works`

### M06 · Load Balancers 🧱
Placement, algorithms (RR, weighted, least-conn, least-response), health checks, L4 vs L7.
- **Scenario:** Explore serving Pennywise from multiple backend instances and what happens to an in-flight sync when one dies.
- **Practice:** Inspect process-local assumptions and health checks; compare appropriate AWS load-balancing options with a focused experiment.
- **Lessons:** `introduction-to-load-balancers`, `global-and-local-load-balancing`, `advanced-details-of-load-balancers`

### M07 · Databases 🧱
Types, replication, partitioning/sharding, trade-offs.
- **Scenario:** Investigate transaction queries, concurrent updates and reporting freshness as bank history grows.
- **Practice:** Use the existing schema and query plans; explore replication/partitioning with Pennywise data shapes and relate to AWS database choices.
- **Lessons:** `introduction-to-databases`, `types-of-databases`, `data-replication`, `data-partitioning`, `trade-offs-in-databases`

### M08 · Key-Value Store 🧱⭐
Consistent hashing, virtual nodes, replication, vector clocks, quorums, hinted handoff, Merkle trees, gossip (Dynamo).
- **Scenario:** Hypothetical: coordinate sync status or store short-lived categorisation results across instances.
- **Practice:** Build a focused Pennywise-shaped key-value experiment for hashing, replication and conflicts; compare managed options.
- **Lessons:** `system-design-the-key-value-store`, `design-of-a-key-value-store`, `ensure-scalability-and-replication`, `versioning-data-and-achieving-configurability`, `enable-fault-tolerance-and-failure-detection`

### M09 · CDN & Edge Caching 🧱
Push vs pull, TTL/leases, consistency, edge placement.
- **Scenario:** Examine delivery of the Pennywise frontend and hypothetical downloadable report assets.
- **Practice:** Inspect cache headers and invalidation; compare origin and edge behaviour, including CloudFront if relevant to the AWS plan.
- **Lessons:** `system-design-the-content-delivery-network-cdn`, `introduction-to-a-cdn`, `design-of-a-cdn`, `in-depth-investigation-of-cdn-part-1`, `in-depth-investigation-of-cdn-part-2`, `evaluation-of-cdns-design`, `quiz-on-cdns-design`

### M10 · Sequencer / Unique IDs 🧱
UUID vs DB vs range-handler; time-sortable IDs, causality (Snowflake).
- **Scenario:** Investigate identifiers for imported/manual transactions and retrying imports across workers.
- **Practice:** Inspect current IDs and constraints; experiment with distributed ID generation only where it teaches a missing concept.
- **Lessons:** `system-design-sequencer`, `design-of-a-unique-id-generator`, `unique-ids-with-causality`

### M11 · Observability 🧱⭐ (merged: monitoring + server errors + client errors + logging)
Metrics, alerting, dashboards/heatmaps, server- vs client-side errors, distributed logging.
- **Scenario:** Trace a failed or delayed sync/notification from request to user-visible outcome.
- **Practice:** Extend existing logging/metrics where justified; connect signals and alerts to the actual AWS observability plan.
- **Lessons:** `system-design-distributed-monitoring`, `introduction-to-distributed-monitoring`, `prerequisites-of-a-monitoring-system`, `design-of-a-monitoring-system`, `detailed-design-of-a-monitoring-system`, `visualize-data-in-a-monitoring-system`, `focus-on-client-side-errors-in-a-monitoring-system`, `design-of-a-client-side-monitoring-system`, `system-design-distributed-logging`, `introduction-to-distributed-logging`, `design-of-a-distributed-logging-service`

### M12 · Distributed Cache 🧱
Write policies, eviction (LRU/TTL), invalidation, cache-aside, thundering herd, Memcached vs Redis.
- **Scenario:** Explore repeated spending-analysis requests and freshness after transaction edits.
- **Practice:** Measure the real query path, then exercise caching/invalidation and a hot-key scenario using Pennywise inputs.
- **Lessons:** `system-design-the-distributed-cache`, `background-of-distributed-cache`, `high-level-design-of-a-distributed-cache`, `detailed-design-of-a-distributed-cache`, `evaluation-of-a-distributed-caches-design`, `memcached-versus-redis`

### M13 · Messaging Queue + Pub/Sub 🧱⭐ (merged)
Queues vs pub/sub, ordering, delivery guarantees, idempotency, dead-letter queues, backpressure.
- **Scenario:** Explore decoupling bank sync, categorisation and notifications while preserving ordering and retry safety.
- **Practice:** Use current flows to test delivery semantics; compare queue/pub-sub options such as SQS/SNS when relevant.
- **Lessons:** `system-design-the-distributed-messaging-queue`, `requirements-of-a-distributed-messaging-queues-design`, `considerations-of-a-distributed-messaging-queues-design`, `design-of-a-distributed-messaging-queue-part-1`, `design-of-a-distributed-messaging-queue-part-2`, `evaluation-of-a-distributed-messaging-queues-design`, `quiz-on-the-distributed-messaging-queues-design`, `system-design-the-pub-sub-abstraction`, `introduction-to-pub-sub`, `design-of-a-pub-sub-system`

### M14 · Rate Limiter 🧱
Token bucket, leaky bucket, fixed/sliding window; placement.
- **Scenario:** Protect sync and AI-categorisation entry points from bursts and provider limits.
- **Practice:** Inspect existing controls; implement or experiment with rate-limiting algorithms on a Pennywise request path.
- **Lessons:** `system-design-the-rate-limiter`, `requirements-of-a-rate-limiters-design`, `design-of-a-rate-limiter`, `rate-limiter-algorithms`, `quiz-on-the-rate-limiters-design`

### M15 · Blob Store 🧱
WORM, chunking, metadata, partitioning, replication, GC, streaming (S3-lite).
- **Scenario:** Hypothetical: store statement imports, receipts or downloadable exports in Pennywise.
- **Practice:** Explore blob metadata, access and lifecycle with Pennywise artifacts; relate to S3 and demonstrate underlying mechanics locally.
- **Lessons:** `system-design-a-blob-store`, `requirements-of-a-blob-stores-design`, `design-of-a-blob-store`, `design-considerations-of-a-blob-store`, `evaluation-of-a-blob-stores-design`, `quiz-on-the-blob-stores-design`

### M16 · Distributed Search 🧱
Inverted index, doc vs term partitioning, decoupling index/serve, scaling.
- **Scenario:** Search a growing transaction history by merchant, description and notes.
- **Practice:** Inspect existing queries; build a focused index experiment and evaluate whether a separate search system is warranted.
- **Lessons:** `system-design-the-distributed-search`, `requirements-of-a-distributed-search-systems-design`, `indexing-in-a-distributed-search`, `design-of-a-distributed-search`, `scaling-search-and-indexing`, `evaluation-of-a-distributed-searchs-design`

### M17 · Task Scheduler 🧱⭐
Priority tiers, head-of-line blocking, idempotency, retries, resource matching.
- **Scenario:** Schedule bank refreshes and daily budget notifications despite retries, overlap and worker failure.
- **Practice:** Build on current notification/sync scheduling; compare verified AWS scheduling plans with local coordination experiments.
- **Lessons:** `system-design-the-distributed-task-scheduler`, `requirements-of-a-distributed-task-schedulers-design`, `design-of-a-distributed-task-scheduler`, `design-considerations-of-a-distributed-task-scheduler`, `evaluation-of-a-distributed-task-schedulers-design`

### M18 · Sharded Counters 🧱
Heavy-hitter / hot-key problem, shard count trade-offs, read amplification.
- **Scenario:** Hypothetical: high-volume import progress or usage counters become a hot key.
- **Practice:** Experiment with sharded counters for non-financial progress; distinguish approximate counters from exact budget amounts.
- **Lessons:** `system-design-the-sharded-counters`, `high-level-design-of-sharded-counters`, `detailed-design-of-sharded-counters`, `quiz-on-the-sharded-counters-design`

### M19 · RESHADED + Wrap-up 🧠
The design framework you'll use for all of Phase 3; self-evaluation.
- **Scenario:** Apply RESHADED to a Pennywise feature or scaling decision.
- **Practice:** Record requirements and architecture decisions with links to existing code and experiments.
- **Lessons:** `the-reshaded-approach-for-system-design`, `wrapping-up-the-building-blocks-discussion`, `ai-evaluation-of-building-blocks-in-e-commerce-platform`, `ai-evaluation-of-building-blocks-in-online-education-system`

---

## Phase 3 — Design Problems

### M20 · Design YouTube — media/streaming 🗺️
- **Scenario:** Hypothetical: Pennywise adds financial-education videos; use this to cover media streaming design.
- **Practice:** Whiteboard storage, processing and delivery; relate to AWS candidates and existing app boundaries without assuming the feature exists.
- **Lessons:** `system-design-youtube`, `requirements-of-youtubes-design`, `design-of-youtube`, `evaluation-of-youtubes-design`, `the-reality-is-more-complicated`, `quiz-on-youtubes-design`

### M21 · Design Quora — read-heavy Q&A 🗺️
- **Scenario:** Hypothetical: Pennywise adds a budgeting Q&A community.
- **Practice:** Whiteboard read-heavy content, indexing and moderation using Pennywise users and domain.
- **Lessons:** `system-design-quora`, `requirements-of-quoras-design`, `initial-design-of-quora`, `final-design-of-quora`, `evaluation-of-quoras-design`

### M22 · Geospatial — Maps + Yelp + Uber 🗺️ (merged; may span sessions)
Quadtrees/geohashes, segments, ETA, matching.
- **Scenario:** Hypothetical: map spending by merchant location, then explore nearby services and routing requirements.
- **Practice:** Use these extensions to cover geospatial indexing, ETA and matching; distinguish them from current features.
- **Lessons:** `system-design-google-maps`, `requirements-of-google-maps-design`, `design-of-google-maps`, `challenges-of-google-maps-design`, `detailed-design-of-google-maps`, `evaluation-of-google-maps-design`, `system-design-yelp`, `requirements-of-yelps-design`, `design-of-yelp`, `design-considerations-of-yelp`, `quiz-on-yelps-design`, `system-design-uber`, `requirements-of-ubers-design`, `high-level-design-of-uber`, `detailed-design-of-uber`, `payment-service-and-fraud-detection-in-uber-design`, `evaluation-of-ubers-design`, `quiz-on-ubers-design`
- Then the **Uber Eats** mock interview.

### M23 · Feeds & Fan-out — Twitter + Newsfeed + Instagram 🗺️ (merged)
Fan-out-on-write vs read, ranking, timelines.
- **Scenario:** Hypothetical: a personalised financial-activity/insights feed combines account events and recommendations.
- **Practice:** Whiteboard fan-out, ranking and timelines grounded in transaction and notification flows.
- **Lessons:** `system-design-twitter`, `requirements-of-twitters-design`, `high-level-design-of-twitter`, `detailed-design-of-twitter`, `client-side-load-balancer-for-twitter`, `quiz-on-twitters-design`, `system-design-newsfeed-system`, `system-design-instagram`, `requirements-of-instagrams-design`, `design-of-instagram`, `detailed-design-of-instagram`, `quiz-on-instagrams-design`
- Then the **NewsFeed** mock interview.

### M24 · Mini-designs — TinyURL + Web Crawler + Typeahead 🗺️
Encoding/base-58, crawling/dedup, tries.
- **Scenario:** Hypothetical: share report links, enrich merchant metadata and autocomplete transaction searches.
- **Practice:** Design each feature to cover URL encoding, crawling/deduplication and prefix indexes.
- **Lessons:** `system-design-tinyurl`, `system-design-web-crawler`, `system-design-the-typeahead-suggestion-system`, `requirements-of-the-typeahead-suggestion-systems-design`, `high-level-design-of-the-typeahead-suggestion-system`, `data-structure-for-storing-prefixes`, `detailed-design-of-the-typeahead-suggestion-system`, `evaluation-of-the-typeahead-suggestion-systems-design`, `quiz-on-the-typeahead-suggestion-systems-design`

### M25 · Messaging — WhatsApp 🗺️
WebSockets, delivery/read receipts, offline storage, E2E encryption.
- **Scenario:** Hypothetical: household members discuss transactions in Pennywise.
- **Practice:** Whiteboard offline delivery, receipts and encryption; distinguish chat delivery from existing notifications.
- **Lessons:** `system-design-whatsapp`, `requirements-of-whatsapps-design`, `high-level-design-of-whatsapp`, `detailed-design-of-whatsapp`, `evaluation-of-whatsapps-design`, `quiz-on-whatsapps-design`
- Then the **Facebook Messenger** mock interview.

### M26 · Collaboration — Google Docs 🗺️
OT/CRDT, concurrency in collaborative editing.
- **Scenario:** Hypothetical: household members simultaneously edit a shared budget or notes.
- **Practice:** Explore concurrent edits using existing budget entities, then compare OT/CRDT approaches.
- **Lessons:** `system-design-google-docs`, `requirements-of-google-docs-design`, `design-of-google-docs`, `concurrency-in-collaborative-editing`, `evaluation-of-google-docs-design`

### M27 · Infra & Payments — Deployment + Payments 🗺️⭐
Blue-green/canary/rolling; card auth/settlement, idempotency, fraud, reconciliation.
- **Scenario:** Plan Pennywise AWS deployments; separately hypothesise a paid subscription or payment-initiation feature.
- **Practice:** Design rollout/rollback against actual infrastructure; cover payment auth, settlement and reconciliation without confusing bank-data sync with moving money.
- **Lessons:** `introduction-to-code-deployment-system`, `design-of-a-code-deployment-system`, `introduction-to-the-payment-system`, `design-of-a-payment-system`

### M28 · AI Systems — ChatGPT + Data Infra + LLM bot + Code assistant 🗺️⭐
LLM inference at scale, RAG, feature stores, training-serving skew.
- **Scenario:** Explore Pennywise AI categorisation, budget recommendations and MCP-assisted analysis.
- **Practice:** Trace existing data/model boundaries; cover inference, RAG and data infrastructure with clearly labelled extensions where needed.
- **Lessons:** `system-design-chatgpt-system`, `design-of-a-chatgpt-system`, `system-design-data-infrastructure-for-ai-ml-systems`, `high-level-design-of-scalable-data-infrastructure-for-ai-ml`, `detailed-design-of-scalable-data-infrastructure-for-ai-ml`, `system-design-llm-powered-customer-support-bot`, `design-of-an-llm-powered-customer-support-bot`, `system-design-ai-powered-code-assistant`, `system-design-of-an-ai-powered-code-assistant`
- Then the **ChatGPT** mock interview.

---

## Phase 4 — Mastery

### M29 · Lessons from Failures 🧱 (chaos)
Real outages; failure domains, blast radius, graceful degradation.
- **Scenario:** Simulate a bank-provider failure, incomplete sync or duplicate notification in a local Pennywise environment.
- **Practice:** Run an incident exercise grounded in current code and compare failure domains with the AWS integration.
- **Lessons:** `lessons-from-system-failures`, `facebook-whatsapp-instagram-oculus-outage`, `aws-kinesis-outage-affecting-many-organizations`, `aws-wide-spread-outage`

### M30 · Case Studies + Interview Drills 🧠
Real-world scale stories + spaced repetition across everything built.
- **Scenario:** Compare Pennywise decisions with the course case studies and revisit weak topics.
- **Practice:** Use /recap and /drill with real code references and hypothetical growth scenarios.
- **Lessons:** `how-spotify-wrapped-scales-for-7m-users`, `how-amazon-scales-for-prime-day`, `6-tips-from-a-system-design-expert-how-twilio-builds-for-scale`, `dropbox-system-design`, `ticketmaster-system-design`, `conclusions`, `resources-to-prepare-for-a-system-design-interview`

---

## Reference shelf (pull in when relevant, not standalone modules)

Free supplementary lessons — cite them when a module touches these topics:
`system-design-primer`, `scalable-systems-101`, `distributed-systems-considerations-and-trade-offs`,
`best-practices-for-achieving-low-latency-in-system-design`, `distributed-system-design-patterns`,
`key-concepts-to-prepare-for-the-system-design-interview`, `the-all-in-one-system-design-master-template`,
`system-analysis-vs-system-design`, `api-design-interview-vs-system-design-interview`,
`5-system-design-fundamentals-for-technical-product-managers`,
`neetcode-pro-does-it-hold-up-for-system-design-interviews`,
`does-google-ask-system-design-interview-questions-for-l4`,
`design-interview-guide-low-level-ood-to-advanced-system-design`, `system-design-interview-pdf`,
`let-ai-evaluate-your-system-design-interview-preparation`,
`let-ai-evaluate-your-understanding-of-non-functional-requirements`.


What is the thing they're actually asking me to build?
Where does it start?
Where does it end?
What assumptions am I already making?

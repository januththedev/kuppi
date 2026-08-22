# Kuppi Production Scalability Plan

## Current implementation

Kuppi is intentionally **stateless at the application layer**. Student accounts, resources, reactions, comments, and saved items are persisted in the database; uploaded bytes are stored outside the database; and the resource tables include indexes for author, subject, study level, comments, and unique reactions. The dashboard also aggregates the total number of ranked contributors in the database rather than loading every student into the application process.

The current version is suitable as a robust product foundation, but it must **not** be represented as already proven to serve 100,000 simultaneous users. Capacity can only be established through load testing on the final production infrastructure.

## What a 100,000-concurrent-user target requires

The managed Autoscale environment is intentionally bounded to a small number of lightweight instances. It is appropriate for the current application and early traffic, but it is not a credible final target for 100,000 simultaneous active users. Reserved hosting is also not the solution because it runs as a single instance.

Kuppi should move to an independently scalable production architecture before a high-concurrency launch. The design should retain the current React/TypeScript/Drizzle domain model, while splitting the delivery and processing concerns described below.

| Area | Production requirement | Why it matters |
| --- | --- | --- |
| Edge delivery | CDN, web application firewall, rate limiting, and bot controls before requests reach the API. | Protects the platform and serves cached assets close to users. |
| Application API | Stateless API instances behind a load balancer with autoscaling based on CPU, latency, and queue depth. | Allows requests to scale horizontally without session affinity. |
| Sessions | Signed, short-lived HTTP-only session cookies with rotation and an account-recovery flow. | Keeps authentication safe without storing session state in individual API instances. |
| Database | Managed MySQL-compatible cluster with connection pooling, automated backups, query monitoring, and replicas for read-heavy discovery traffic. | Resource browsing and dashboard queries must remain fast under load. |
| File handling | Direct-to-object-storage uploads using temporary upload credentials, plus asynchronous validation, malware scanning, and preview generation. | Prevents large file traffic and scanning work from consuming API capacity. |
| Background work | Durable queue for scans, preview extraction, notifications, ranking refreshes, and moderation. | Keeps interactive requests predictable and resilient. |
| Search | Dedicated full-text search index once resource volume makes SQL text search insufficient. | Preserves fast discovery without expensive wildcard searches on the primary database. |
| Observability | Centralized logs, tracing, service-level metrics, alerts, and recurring load tests. | Makes capacity, failures, and abusive behaviour measurable before students feel them. |

## Recommended rollout gates

Kuppi should first operate with real users and monitor the existing indexed database queries. Before broad acquisition, the team should introduce edge rate limiting, phone or email verification, password recovery, moderation tooling, and a malware-scan workflow for files. Before any campaign expected to produce major spikes, the file upload path should be converted from API-carried base64 payloads to direct object-storage uploads and asynchronous processing.

The final 100,000-user readiness decision should be based on repeatable load tests for the intended mix of browsing, login, uploads, comments, saves, and downloads. Those tests must establish latency, error rate, database saturation, storage throughput, and recovery behaviour at sustained and burst traffic levels.

> **Operational standard:** Do not claim 100,000-concurrent-user readiness until the production architecture above has been deployed and independently load-tested at that target with realistic traffic and file workloads.

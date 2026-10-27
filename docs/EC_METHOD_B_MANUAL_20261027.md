# T-shirt manual count → shared server API (disabled, not deployed)

Based on Draft #41 `4f87a7d61c6acd6e496f3324474d6d4a38201548`. The actual `setFinishedInventoryAbsolute` handler now routes to the Sales-Manager #127 manual API when migration mode is required. `manual-inventory-config.mjs` ships with endpoint null; no live connection enabled. A server-marked stock document with no endpoint fails closed. Existing unmarked A1 behavior is preserved.

The adapter uses canonical SKU, observed quantity/revision, verified user's token and persistent operation payload keyed by user. It persists before sending. Lost/invalid responses keep the original operation; reload looks up `/result` using the identical payload. If still unknown, only explicit confirmation permits same-ID/same-payload retry. It never silently substitutes another ID. Receipt fields must match before success. A recovered previous action is not reported as success for a newly entered quantity.

409 inventory/floor/evidence conflict clears only the rejected request, reads server stock and requires a new explicit input. Receipt conflicts and unknown failures remain pending for reconciliation; no unconditional resend/new ID. A reservation-floor rejection cannot show saved. No direct Firestore fallback exists in the new adapter.

In migration mode, `saveMasterData` refuses old direct saves, including currently unported material/task edits. **This is not full closure**: direct init/shared synchronization, other paths, old browsers/SW and offline queues are not comprehensively migrated. Do not deploy this subset or enable purchases. Accessories UI is still unconnected. Server producer integration with real Woo/Session and source reconciliation is also outstanding.

Validation: 23 PASS / 0 FAIL / 0 SKIP (8 new tests + affected 15 A1), including extracted real input/save functions; 3 PASS / 0 FAIL / 0 SKIP through the actual new HTTP client to Auth/Firestore Emulator (lost reply/reload, 409, combined floor rejection). Browser/device visual interaction is unverified. Raw output and final source hashes: `docs/evidence/`.

Run unit tests: `node --test tests/manual-inventory-client.test.mjs tests/inventory-concurrency.test.mjs`. Run `tests/manual-emulator.test.mjs` only against fresh Sales-Manager method-b demo emulators, with METHOD_B_TEST_DIR pointing to its directory. The server runtime rejects non-loopback and real credentials. Existing server dependencies are reused; no new stock implementation is copied here.

Next: complete all T/A writers and service authorization/Rules/migration gates, then approved scoped Staging acceptance; POS/void/end/later SKU/old queues and HPOS/Stripe remain release gates. Draft only, [skip ci], CAS and force=false; no merge/deployment/live write.


## 2026-11-12 — first proposal

Nathan proposed a GET to check whether the write was saved, returning success if found and retrying if absent, with a maximum of 3. Next: examine how the caller identifies the attempted write when the server-generated ID was not received.

The proposal recognises that a missing response may conceal a successful write and bounds retries. Correct identification and safety of retrying after an absent read remain untested. No implementation attempted yet.

Next unanswered question: The backend generates the transaction ID, but its response never reaches you. How would your GET identify this particular attempted write rather than another legitimate £12.50 lunch entry?

## Identifying the attempted write

Nathan recognised that without a specific ID the caller cannot confidently identify its write; filtering could give a best guess, but is not reliable. Matching amount, date and description can confuse separate legitimate expenses.

Next unanswered question: If you could change the request format, where would you generate an identifier so the caller knows it even when the response is lost?

## Idempotency and progress tracking proposal

Nathan proposed an idempotency key carried on the request, plus a table tracking processing steps so a retry with the same key can resume. Next challenge: atomicity between the business write and progress tracking. This is a proposed design, not implemented infrastructure. A stable key identifies the same logical operation across attempts; safe resumption still requires reasoning about crashes and concurrent requests.

Next unanswered question: Suppose Pennywise inserts the transaction, then crashes before marking that step complete in the tracking table. On retry with the same key, how would you prevent a second transaction being created?

## Atomic business write and progress update

Nathan proposed commit/rollback so a failed step leaves no partial progress. Clarified that the expense insert and idempotency/progress update must share one database transaction: both commit or neither does. A committed transaction is not undone by losing its HTTP response. This remains a proposed design; no implementation or experiment completed.

Next unanswered question: Both the expense and the completed idempotency record commit, but the server crashes before sending the response. When the caller retries with the same key, what should Pennywise return?

## Completed results and unfinished work

Nathan said to return the previously created expense if all business work has committed; if work remains, resume from the recorded point. Clarified that a checkpoint must represent committed work and any repeated remaining step must be safe. Next: concurrent attempts sharing a key. No implementation attempted.

Next unanswered question: The first request is still running when a retry with the same key arrives. Both check the tracking table before either has inserted a record, and both find nothing. How would you ensure only one creates the expense?

## Concurrent attempts and atomic insertion

Nathan asked why requests might overlap: a broken connection or client timeout does not necessarily stop server execution. After a uniqueness hint, After a hint about a unique database constraint, Nathan proposed an atomic conditional insert on the expense using a predetermined key shared by both attempts. Clarification: insert only if no row with that key exists, not if the key is NULL; the database must enforce uniqueness atomically rather than a separate application check followed by insert. Retries reuse the key; separate intended expenses need different keys. This remains design discussion, without an implementation or test.

Next unanswered question: If the first request commits and the retry loses the race to insert the same key, what should the retry handler do instead of returning a generic database error?

## Replaying results and rejecting changed input

Nathan concluded that a retry finding an existing expense should return that expense. For the same key with different input, he proposed storing core properties against the key and rejecting mismatches. Clarified that comparison should cover all inputs affecting the operation, using consistent normalisation. Ready to specify a focused lost-response regression test; implementation has not started.

Next unanswered question: For a test where the first expense is saved but its response is lost, then the caller retries with the same key and input, what would you assert about the database and the retry response?

## Safe retries without a preliminary GET

Nathan confirmed the lost-response retry should leave one saved expense (clarified: two requests, one expense). Test expectations discussed: one database expense and the retry returning its ID. Nathan concluded that a preliminary GET is unnecessary because the idempotent POST can be retried safely with the same key and input. This is a proposed design, not implemented or verified. Retry safety prevents duplicate effects; it does not guarantee receiving confirmation within a bounded number of attempts.

Next unanswered question: If all three attempts end without a response, what should Pennywise tell the user about whether the expense was saved?

## Exhausted retries

Nathan proposed returning an error after all attempts receive no response, without choosing a specific error. Explained that this is an unconfirmed outcome, not proof that the expense was not saved. Suggested user-facing wording: We could not confirm whether your expense was saved. Later retries must preserve the original key and input. No implementation or experiment has run; next step is Nathan’s handler pseudocode.

Next unanswered question: Can you sketch the server handler in pseudocode, covering a new key, an existing key with matching input, and an existing key with different input, and showing the database transaction boundary?

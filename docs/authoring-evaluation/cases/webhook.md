# Webhook acknowledgment and retry

This is an unversioned, fictional proposed design. It is not a production observation. The intended audience is application developers. Explain why a missing acknowledgment does not prove an operation failed, and how the retry avoids a second application.

The components are Sender, Receiver, and Ledger. Sender posts an event to Receiver using HTTPS. Receiver writes to Ledger using SQL and sends an HTTPS acknowledgment to Sender. Sender is configured to retry at most once with the same idempotency key. The actual key value is unspecified.

Initially the receiver has not applied the event and the sender has no acknowledgment. All outcomes share the send and the first successful ledger write. That write records the idempotency key and applies the operation exactly once.

- Happy path: the acknowledgment reaches Sender; Sender finishes without a retry.
- Lost acknowledgment and recovery: Receiver sends the acknowledgment, but the signal is confirmed lost before reaching Sender. Sender times out, then retries once using the same key. Receiver queries Ledger using SQL, finds the existing key, and returns an HTTPS acknowledgment without writing/applying again. Sender receives it and finishes. The number of applications remains one throughout the retry.
- Lost acknowledgment and paused recovery: Receiver sends the acknowledgment, but the signal is confirmed lost before reaching Sender. Sender times out. An operator pauses Sender before its retry, so the retry is not sent. The operation remains applied once in Ledger. Sender has no successful acknowledgment and this path ends there.

The lost-acknowledgment beat and timeout are identical in both recovery outcomes. Every attempted delivery, confirmed loss, prevented retry, and successful acknowledgment should be understandable. Timeouts and animation timing have no supplied duration. There are no backlog measurements, API links, or code references.

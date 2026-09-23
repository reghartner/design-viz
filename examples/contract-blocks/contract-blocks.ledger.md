# Contract block layout example

Source: synthetic doorbell story authored to demonstrate contract layout.
No external system behavior or real API is asserted.

| Step | Story | Visible contract | Evidence |
|---|---|---|---|
| press | Doorbell submits a stable event ID | Request at half width | Synthetic fixture |
| ack | Ingestion acknowledges durable acceptance | Response at half width | Synthetic fixture |

The full-width failure card documents a hypothetical 503; it is not an alternate
step or evidence that the successful sequence failed. All three contracts remain
visible for side-by-side review. The distinction between acceptance and recording
completion is explicit. Validate the spec and capture its wide and narrow layouts.

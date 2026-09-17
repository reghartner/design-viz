# Checkout with partial incident evidence

This is an unversioned, fictional design plus a separately identified incident observation. The design is a reference behavior, not an assertion that the observed incident achieved it. No company service catalog, code reference, API URL, span duration, or queue measurement is provided.

The audience is on-call engineers. Show where an observed failure differs from the intended checkout, including what the trace cannot tell us.

The components are Browser, Checkout API, Inventory, Payments, and Orders. Browser sends an HTTPS checkout request to Checkout API. Checkout API makes HTTPS requests to Inventory and Payments concurrently: neither request depends on the other completing. Inventory reserves stock; Payments authorizes payment. Checkout API writes an order to Orders using SQL only after both operations succeed, then returns HTTPS success to Browser.

The reference path shows both concurrent calls start, both succeed, the order is written, and Browser receives success. The source establishes no relative completion order between inventory and payment. The drawing may group their completions into one beat.

Incident observation: the checkout request arrives and both calls begin. Payments returns HTTP 500 to Checkout API. The Inventory span has no recorded completion, so whether stock was reserved is unknown. No order-write span appears; this partial trace does not establish whether an order was written. Browser eventually displays a generic error. No compensation, reservation release, retry, queue growth, or database slowness is established by this evidence. The incident outcome should end at the observed browser error, with those unknowns still explicit.

Keep the intended and observed outcomes on the same topology. Do not resolve missing spans into absent actions. A received HTTP 500 is a delivered response, not a broken communication edge. In the intended flow there is a dependency between both successes and the order write; in the incident, the observations do not justify a complete reconstruction of internal behavior.

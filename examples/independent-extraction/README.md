# Independent domain extraction

Open [before.spec.json](before.spec.json) in the workbench. This fictional
doorbell flow has two alternate paths, panel patches, a custom layout and lane
routing. Shift-click **Push worker** and **Delivery audit**, then choose
**Create domain from selected nodes**.

Choose **Local zoom**, call the domain “Notification delivery”, and review the
preview. Two event-bus connections would otherwise collapse into one edge;
boundary interface nodes keep the queue job and audit event distinct. Apply
once, then open the new domain. It has the selected internals and **no steps**.
Add its own sequence using the ordinary step editor. Returning restores the
parent's reading position; parent failures never select child outcomes.

Alternatively, choose **Separate document**, enter a real destination URL or
approved spec ID, download the complete JSON, then Apply. Save and publish the
download separately. A spec-only reference needs the host's diagram-link
resolver. Undo restores the original selection's graph and story in one action.

The source describes an illustrative system, not an actual doorbell product.
See [the extraction contract](../../docs/drilldowns.md#extract-an-independent-diagram).

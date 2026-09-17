# Doorbell recording and upload

This is an unversioned, fictional proposed design for a training example. It is not an observed trace or a canonical company service. All named components below are fictional. There are no API URLs or source-code references.

The audience is engineers and support staff. The question is: does a failed cloud interaction necessarily mean the camera stopped recording?

The physical setting is a front door with a camera. The camera is on, with no livestream and no recording initially. The porch is empty. A local trigger begins recording while the porch is still empty. A person then walks through the door while recording continues. Scene motion is an illustration, not measured elapsed time.

Camera, Upload API, Clip Store, and Resident Phone are the components. Camera sends an upload request to Upload API over HTTPS. Upload API writes the clip to Clip Store over HTTPS. Upload API sends the resident's notification to Resident Phone over HTTPS. These are the only inter-component communications in this example.

All outcomes share: camera ready; quiet recording starts; person enters; upload request is sent. There are then three outcomes:

- Happy path: the Clip Store write completes; Upload API delivers a “Clip available” notification to Resident Phone. Local recording remains on at the end shown here. No recording-stop event is included.
- Confirmed storage-link loss: the Upload API's attempted write never reaches Clip Store. No clip is stored and no notification is sent. Local recording continues. This outcome ends at the failed write.
- Response timeout: the camera observes a timeout waiting for the upload request to complete. The evidence does not establish whether Upload API reached Clip Store. Cloud persistence and notification delivery are unknown. Local recording continues. This outcome ends at the timeout; it does not retry.

No delivery is confirmed on the timeout branch. Unknown delivery must not be described as “no notification.” No durations, queue depths, retry limits, payload identifiers, storage capacities, or field-of-view measurements are supplied.

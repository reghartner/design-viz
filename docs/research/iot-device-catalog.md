# IoT camera / doorbell / sensor device catalog

This catalog describes established device families and common implementation patterns rather than attempting to track every regional SKU or model revision. “Local” can mean processing on the device, on a LAN hub, or on an NVR; it does not necessarily mean that every feature works without a vendor account.

## 1. Devices by vendor

### Ring

| device | category (doorbell / outdoor cam / indoor cam / floodlight cam / PTZ / sensor / hub / lock / chime) | power (battery / wired / solar / PoE) | connectivity (wifi / ethernet / thread / zigbee / z-wave / cellular / proprietary sub-GHz) | local vs cloud processing | notable hardware (radar, mmWave, dual lens, IR array, privacy shutter, dual-chip low-power designs) |
|---|---|---|---|---|---|
| Video Doorbell battery family | doorbell | battery / wired trickle charge / solar accessory | wifi | Motion filtering can start on-device; video, history, and most recognition are cloud-centered | PIR motion; IR night vision; some versions add radar-assisted 3D motion |
| Video Doorbell wired family | doorbell | wired; some versions support PoE | wifi / ethernet on PoE versions | Cloud-centered; eligible installations can use local Ring Edge storage through Alarm Pro | Pre-roll on some versions; radar on higher-tier versions |
| Stick Up Cam family | indoor cam / outdoor cam | battery / wired / solar / PoE depending version | wifi / ethernet on PoE version | Cloud-centered; Ring Edge is an optional local path for supported cameras | PIR; IR LEDs; removable battery on battery versions |
| Spotlight Cam family | outdoor cam | battery / wired / solar | wifi | Cloud-centered with some on-device motion filtering | Spotlights, siren, PIR; radar-assisted motion on some versions |
| Floodlight Cam family | floodlight cam | wired | wifi | Cloud-centered with on-device motion sensing | Dual floodlights, siren, PIR; radar-assisted motion on some versions |
| Pan-Tilt Indoor Cam | PTZ / indoor cam | wired | wifi | Cloud-centered | Motorized pan/tilt; privacy cover |
| Alarm contact, motion, glass-break, flood/freeze, smoke/CO-listener sensors | sensor | battery | z-wave to Alarm base station | Rules and alarm state at the base; monitoring and remote notifications use cloud/cellular | Reed switch, PIR, acoustic classification, water/temperature probes, or alarm-sound microphone by sensor type |
| Alarm base station / Alarm Pro | hub | wired with backup battery | ethernet / wifi / z-wave / cellular | Local alarm orchestration; cloud management; Alarm Pro can store supported camera video locally | Battery backup, cellular modem; Alarm Pro adds local microSD and router functions |
| Chime / Chime Pro | chime | wired | wifi | Local alert output coordinated through account services; Pro also extends network reach | Speaker; some versions include a night-light and wifi extender |

### Google Nest

| device | category (doorbell / outdoor cam / indoor cam / floodlight cam / PTZ / sensor / hub / lock / chime) | power (battery / wired / solar / PoE) | connectivity (wifi / ethernet / thread / zigbee / z-wave / cellular / proprietary sub-GHz) | local vs cloud processing | notable hardware (radar, mmWave, dual lens, IR array, privacy shutter, dual-chip low-power designs) |
|---|---|---|---|---|---|
| Nest Doorbell, battery | doorbell | battery / wired trickle charge | wifi | On-device object classification and short outage buffer; event history is normally cloud | Camera, microphone/speaker, IR LEDs, PIR; aspect ratio favors head-to-toe view |
| Nest Doorbell, wired | doorbell | wired | wifi | On-device classification; cloud event history and eligible 24/7 recording | IR LEDs; continuous power enables richer pre-event capture |
| Nest Cam, battery | indoor cam / outdoor cam | battery / wired accessory | wifi | On-device person/animal/vehicle classification and local outage buffering; cloud history | Magnetic mount, PIR, IR LEDs |
| Nest Cam, indoor wired | indoor cam | wired | wifi | On-device classification with cloud history; eligible for cloud 24/7 recording | Status LED, IR LEDs |
| Nest Cam with floodlight | floodlight cam | wired | wifi | On-device classification with cloud history | Two floodlights, PIR and camera-based detection |
| Nest Protect | sensor | battery / wired | wifi / proprietary low-power mesh | Smoke/CO decisions and siren are local; app notifications and fleet status use cloud | Split-spectrum smoke sensor, CO sensor, occupancy sensor, speaker, light ring |
| Nest Hub / Google Home speaker-display family | hub / chime | wired | wifi / thread on selected hubs | Voice/display routines combine local device control with cloud services; can announce doorbells | Speaker/display; some hubs include Thread border-router capability |

### Arlo

| device | category (doorbell / outdoor cam / indoor cam / floodlight cam / PTZ / sensor / hub / lock / chime) | power (battery / wired / solar / PoE) | connectivity (wifi / ethernet / thread / zigbee / z-wave / cellular / proprietary sub-GHz) | local vs cloud processing | notable hardware (radar, mmWave, dual lens, IR array, privacy shutter, dual-chip low-power designs) |
|---|---|---|---|---|---|
| Video Doorbell family | doorbell | battery / wired depending version | wifi | Live view and basic motion operate through the service; cloud plans add retained clips and classified alerts | Wide vertical field of view, PIR, IR LEDs, siren |
| Essential camera family | indoor cam / outdoor cam | battery / wired / solar accessory | wifi | Cloud-oriented; some models accept local microSD and some can use a SmartHub (model-dependent) | PIR, IR or color night lighting; privacy shutter on indoor versions |
| Pro / Ultra camera families | outdoor cam | battery / wired charging / solar accessory | wifi / hub radio | On-device triggering plus cloud analytics/history; compatible SmartHubs can record locally | High-resolution sensor, spotlight, siren; wide field of view |
| Floodlight camera | floodlight cam | battery / wired charging / solar accessory | wifi | Cloud-oriented with local motion triggering | Broad LED floodlight, PIR, siren |
| Go cellular camera family | outdoor cam | battery / solar accessory | cellular / wifi on some versions | Cloud service for remote video and events; local microSD on some versions | Cellular modem, weatherproof body, PIR |
| SmartHub / Base Station | hub | wired | ethernet / proprietary camera radio | LAN hub can provide local USB or microSD recording on compatible versions; cloud remains optional or feature-bearing | Siren on some versions; dedicated camera radio |
| All-in-one home security sensor | sensor | battery | proprietary radio to keypad hub | Local sensing and alarm flow; cloud/monitoring for remote actions | Multi-function contact, motion, tilt, water, light, and smoke/CO-alarm listening modes |

### Wyze

| device | category (doorbell / outdoor cam / indoor cam / floodlight cam / PTZ / sensor / hub / lock / chime) | power (battery / wired / solar / PoE) | connectivity (wifi / ethernet / thread / zigbee / z-wave / cellular / proprietary sub-GHz) | local vs cloud processing | notable hardware (radar, mmWave, dual lens, IR array, privacy shutter, dual-chip low-power designs) |
|---|---|---|---|---|---|
| Video Doorbell family | doorbell | battery / wired depending version | wifi | Basic events and live view use device plus service; longer clips and recognition are subscription/cloud features | Head-to-toe view on some versions, IR LEDs, chime controller |
| Cam indoor/outdoor wired family | indoor cam / outdoor cam | wired | wifi | Local microSD continuous/event recording on supported models; optional cloud clips and analytics | IR array; some versions add spotlight or starlight color sensor |
| Battery Cam family | outdoor cam | battery / solar accessory | wifi | Local microSD on selected versions plus optional cloud; wake/record logic starts on device | PIR, removable battery, spotlight on some versions |
| Cam Pan family | PTZ / indoor cam | wired | wifi | Local microSD plus optional cloud; on-device motor tracking works with detection pipeline | Motorized pan/tilt, IR LEDs |
| Floodlight Cam family | floodlight cam | wired | wifi | Local microSD on supported versions plus optional cloud | Floodlights, PIR, siren; some versions have dual cameras |
| Sense contact, motion, leak, climate, and keypad devices | sensor | battery | proprietary sub-GHz to Sense Hub | Sensor state and alarm coordination through hub; remote history/monitoring uses cloud | Reed switch, PIR, water electrodes, temperature/humidity sensors |
| Sense Hub | hub | wired with backup battery | ethernet / wifi / proprietary sub-GHz | Local sensor receiver with cloud-managed rules and optional monitoring | Battery backup, siren, sensor radio |
| Lock / Lock Bolt family | lock | battery | wifi through gateway or Bluetooth; model-dependent | Access logic is local; remote control, codes, and history are app/cloud-mediated | Motorized deadbolt actuator, keypad or fingerprint reader depending version |

### Eufy / Anker

| device | category (doorbell / outdoor cam / indoor cam / floodlight cam / PTZ / sensor / hub / lock / chime) | power (battery / wired / solar / PoE) | connectivity (wifi / ethernet / thread / zigbee / z-wave / cellular / proprietary sub-GHz) | local vs cloud processing | notable hardware (radar, mmWave, dual lens, IR array, privacy shutter, dual-chip low-power designs) |
|---|---|---|---|---|---|
| Video Doorbell family | doorbell | battery / wired | wifi / proprietary radio to HomeBase on compatible versions | On-device or HomeBase classification and local storage are central; cloud storage is optional | Some versions use dual lenses for visitor and package views; radar on selected versions |
| SoloCam / eufyCam battery family | outdoor cam | battery / solar integrated or accessory | wifi / proprietary radio to HomeBase depending version | On-device/HomeBase recognition and local storage; optional cloud | PIR, spotlight, siren; solar panel on solar versions; low-power wake architecture |
| Indoor Cam family | indoor cam / PTZ | wired | wifi | On-device classification and local microSD/HomeBase storage; optional cloud | IR LEDs; motorized pan/tilt and privacy position on selected versions |
| Floodlight Cam family | floodlight cam / PTZ | wired | wifi | On-device classification and local/HomeBase storage; optional cloud | Floodlights, siren; some versions add 360-degree pan/tilt or dual lenses |
| S-series multi-view camera systems | outdoor cam | battery / solar | proprietary radio to HomeBase / wifi for system access | HomeBase fuses tracks and stores video locally; remote access uses cloud relay | Multiple cameras or dual lenses, solar charging, cross-camera tracking |
| HomeBase family | hub | wired | ethernet / wifi / proprietary camera and sensor radio | Local video storage, indexing, recognition, and alarm rules; cloud relay/backup optional | Internal storage or expandable drive support depending generation; on-hub AI accelerator on some versions |
| Entry, motion, water, and smoke/CO-listener sensors | sensor | battery | proprietary sub-GHz to HomeBase | Local hub events and rules; remote notification through cloud | Reed switch, PIR, water contacts, or microphone by type |
| Smart Lock family | lock | battery | wifi / proprietary link through HomeBase / Bluetooth depending version | Lock control and biometrics are local; remote access/history can use cloud | Keypad, fingerprint reader, door-position sensor on selected versions |

### Blink

| device | category (doorbell / outdoor cam / indoor cam / floodlight cam / PTZ / sensor / hub / lock / chime) | power (battery / wired / solar / PoE) | connectivity (wifi / ethernet / thread / zigbee / z-wave / cellular / proprietary sub-GHz) | local vs cloud processing | notable hardware (radar, mmWave, dual lens, IR array, privacy shutter, dual-chip low-power designs) |
|---|---|---|---|---|---|
| Video Doorbell | doorbell | battery / wired for existing chime | wifi / proprietary low-power link to Sync Module | Cloud clips or local USB through compatible Sync Module; battery mode relies on wake-on-motion | PIR, IR LEDs, long-life battery design |
| Outdoor battery camera family | outdoor cam | battery / solar accessory | wifi / proprietary low-power link to Sync Module | Cloud clips or hub-attached local USB; event-triggered rather than continuous | PIR, IR LEDs, low-power wake design |
| Indoor battery camera | indoor cam | battery | wifi / proprietary low-power link to Sync Module | Cloud clips or hub-attached local USB | PIR, IR LEDs, low-power wake design |
| Mini wired camera family | indoor cam / PTZ on pan-tilt mount | wired | wifi | Cloud clips; local storage through compatible Sync Module; motor control when docked to pan-tilt mount | IR LEDs; optional motorized pan-tilt base |
| Wired Floodlight Camera | floodlight cam | wired | wifi | Cloud or compatible local storage path | Floodlights, PIR, siren |
| Sync Module family | hub | wired | wifi / proprietary low-power radio; USB on local-storage version | Coordinates sleep/wake and can record clips to local USB on compatible systems | Low-power control radio; USB storage on selected version |

### Reolink

| device | category (doorbell / outdoor cam / indoor cam / floodlight cam / PTZ / sensor / hub / lock / chime) | power (battery / wired / solar / PoE) | connectivity (wifi / ethernet / thread / zigbee / z-wave / cellular / proprietary sub-GHz) | local vs cloud processing | notable hardware (radar, mmWave, dual lens, IR array, privacy shutter, dual-chip low-power designs) |
|---|---|---|---|---|---|
| Video Doorbell WiFi / PoE families | doorbell | wired / PoE | wifi / ethernet | On-device classification with local microSD, NVR, FTP, RTSP/ONVIF on supported versions; cloud optional in supported regions | IR LEDs, chime, large sensor |
| Wired bullet, turret, and dome cameras | outdoor cam / indoor cam | wired / PoE | wifi / ethernet | On-device detection and local microSD/NVR; cloud optional on supported models | IR array or spotlights; optical zoom on selected models |
| Battery camera family | outdoor cam / PTZ | battery / solar | wifi / cellular on cellular versions | On-device triggering and microSD; cloud optional; RTSP/ONVIF often unavailable while sleeping | PIR, low-power wake design, solar input; pan/tilt on selected models |
| Duo family | outdoor cam | wired / PoE | wifi / ethernet | On-device detection and local SD/NVR; optional cloud | Dual lenses stitched into an ultra-wide view; dual IR/spotlight arrays |
| TrackMix family | PTZ / outdoor cam | wired / PoE / battery / solar depending version | wifi / ethernet / cellular depending version | On-device tracking with local SD/NVR where supported; optional cloud | Wide and telephoto dual lenses with pan/tilt and auto-zoom tracking |
| Floodlight camera / standalone network floodlight | floodlight cam | wired / PoE depending device | wifi / ethernet | Local rules can link compatible cameras and lights through app/NVR | High-output lights, PIR on camera versions |
| Home Hub / NVR family | hub | wired | ethernet / wifi on Home Hub | Local recording, search, retention, and display; remote access may use vendor relay | HDD, microSD, or encrypted hub storage depending system; multi-camera outputs on NVRs |

### Ubiquiti UniFi Protect

| device | category (doorbell / outdoor cam / indoor cam / floodlight cam / PTZ / sensor / hub / lock / chime) | power (battery / wired / solar / PoE) | connectivity (wifi / ethernet / thread / zigbee / z-wave / cellular / proprietary sub-GHz) | local vs cloud processing | notable hardware (radar, mmWave, dual lens, IR array, privacy shutter, dual-chip low-power designs) |
|---|---|---|---|---|---|
| G4 Doorbell family | doorbell | wired / PoE through compatible kit | wifi / ethernet | Recording and analytics run on the local Protect console; vendor account can broker remote access | Package-facing second camera on Pro version, display, IR LEDs, optional PoE chime kit |
| G-series fixed cameras | indoor cam / outdoor cam | PoE; some compact versions wired over USB | ethernet / wifi on selected compact versions | Local console recording and on-camera or console analytics | IR arrays; optical zoom and long-range IR on selected Pro models |
| AI camera family | indoor cam / outdoor cam | PoE | ethernet | Local Protect recording with advanced on-camera detection | Dedicated AI hardware; some variants use 360-degree or long-range optics |
| PTZ camera family | PTZ / outdoor cam | PoE | ethernet | Local recording, presets, tracking, and operator control | Motorized pan/tilt, optical zoom, long-range IR |
| Floodlight | floodlight cam (light paired with cameras) | PoE | ethernet | Local Protect rules link motion/cameras to light state | PoE lighting, ambient and motion sensing |
| Protect Sensor | sensor | battery | proprietary short-range radio/Bluetooth to compatible Protect console (uncertain) | Local console events and rules; remote alerts through account relay | Motion, open/close, temperature, humidity, light, and water sensing |
| CloudKey, Dream Machine, and UNVR Protect consoles | hub | wired with optional UPS external to device | ethernet | Fully local ingest, indexing, retention, and playback; cloud is primarily remote access and identity | Internal or replaceable HDD/SSD arrays depending console; hardware video/AI support by generation |
| Protect Chime | chime | wired / PoE depending version | wifi / ethernet | Local Protect doorbell routing | Speaker; PoE version for managed wiring |

### SimpliSafe

| device | category (doorbell / outdoor cam / indoor cam / floodlight cam / PTZ / sensor / hub / lock / chime) | power (battery / wired / solar / PoE) | connectivity (wifi / ethernet / thread / zigbee / z-wave / cellular / proprietary sub-GHz) | local vs cloud processing | notable hardware (radar, mmWave, dual lens, IR array, privacy shutter, dual-chip low-power designs) |
|---|---|---|---|---|---|
| Video Doorbell Pro | doorbell | wired | wifi | Video and recordings are cloud-centered; local motion initiates events | PIR, IR LEDs, existing-chime interface |
| Wireless Outdoor Camera | outdoor cam | battery / solar accessory | wifi with base-station coordination | Cloud recording/verification; local wake and motion sensing | Removable battery, PIR, spotlight, siren |
| Indoor Camera family | indoor cam / PTZ on selected version | wired | wifi | Cloud-centered video verification and recordings | Physical privacy shutter; newer versions can pan/tilt and support live guard interaction |
| Entry, motion, glass-break, water, temperature, smoke, and CO sensors | sensor | battery | proprietary sub-GHz to base station | Local alarm decisions at base; cellular/cloud path to monitoring and app | Reed switch, PIR, acoustic microphone, water contacts, thermistor, photoelectric smoke or CO sensor |
| Base Station / Keypad | hub | wired with backup battery / battery for keypad | wifi / cellular / proprietary sub-GHz | Local alarm state machine; cloud/cellular monitoring and remote control | Siren, battery backup, cellular modem, separate battery keypad |
| Smart Lock | lock | battery | proprietary link through system / Bluetooth during setup (uncertain) | Local lock actuation linked to alarm state; remote app control via cloud | Retrofit deadbolt actuator, PIN keypad |

### Aqara

| device | category (doorbell / outdoor cam / indoor cam / floodlight cam / PTZ / sensor / hub / lock / chime) | power (battery / wired / solar / PoE) | connectivity (wifi / ethernet / thread / zigbee / z-wave / cellular / proprietary sub-GHz) | local vs cloud processing | notable hardware (radar, mmWave, dual lens, IR array, privacy shutter, dual-chip low-power designs) |
|---|---|---|---|---|---|
| Video Doorbell G4 | doorbell | battery / wired | wifi | On-device face recognition; local microSD in indoor chime-repeater; optional vendor cloud and HomeKit Secure Video | Face-processing hardware, IR LEDs, chime/repeater with microSD |
| Camera Hub indoor family | indoor cam / PTZ / hub | wired | wifi / zigbee | Local microSD and on-device recognition on selected models; bridges Zigbee devices; optional cloud/HKSV | Motorized pan/tilt, IR LEDs, privacy position on selected models |
| Outdoor Camera Hub family | outdoor cam / hub | wired / PoE on selected versions | wifi / ethernet / zigbee on hub-capable models | On-device detection and local storage; optional cloud/HKSV on supported versions | IR or spotlights; hub radio; some versions have dual lenses (uncertain) |
| Door/window, motion, vibration, water, temperature, smoke, gas, and light sensors | sensor | battery | zigbee / thread on newer variants | Local automation through hub; cloud and ecosystem bridges for remote use | Reed switch, PIR, accelerometer, water contacts, climate sensors, smoke/gas sensors |
| Presence Sensor family | sensor | wired / battery on selected versions | zigbee / thread (model-dependent) | Presence zones processed locally, usually through hub automations | mmWave radar, sometimes combined with PIR and light sensing |
| Hub family | hub / chime | wired | wifi / ethernet depending model / zigbee / thread on newer hubs | Local automation and protocol bridging; cloud for account/remote access | Zigbee coordinator; newer hubs may be Matter controller and Thread border router |
| Smart Lock family | lock | battery | zigbee / thread / wifi through hub depending version | Credentials and actuation local; remote management and ecosystem integrations through hub/cloud | Keypad, fingerprint, NFC or Apple home-key support depending version |

### TP-Link Tapo / Kasa

| device | category (doorbell / outdoor cam / indoor cam / floodlight cam / PTZ / sensor / hub / lock / chime) | power (battery / wired / solar / PoE) | connectivity (wifi / ethernet / thread / zigbee / z-wave / cellular / proprietary sub-GHz) | local vs cloud processing | notable hardware (radar, mmWave, dual lens, IR array, privacy shutter, dual-chip low-power designs) |
|---|---|---|---|---|---|
| Tapo doorbell family | doorbell | battery / wired depending version | wifi | Local microSD through chime/hub on selected versions; optional cloud and on-device classifications | Head-to-toe optics; ring-button light; some versions use radar or dual lenses (model-dependent) |
| Tapo indoor camera family | indoor cam / PTZ | wired | wifi | On-device detection with local microSD; optional cloud | IR LEDs; motorized pan/tilt and physical privacy mode on selected versions |
| Tapo outdoor camera family | outdoor cam / PTZ | wired / battery / solar accessory | wifi / ethernet/PoE on selected versions | Local microSD or hub recording and on-device detection; optional cloud | IR array or spotlights; pan/tilt and dual lenses on selected models |
| Tapo floodlight camera | floodlight cam | wired | wifi | Local microSD and on-device detection; optional cloud | Floodlights, siren, PIR/camera motion |
| Kasa camera family | indoor cam / outdoor cam | wired | wifi | Model-dependent local microSD and optional cloud | IR LEDs; pan/tilt on selected indoor versions |
| Tapo door/window, motion, water, temperature, and button sensors | sensor | battery | proprietary sub-GHz to Tapo Hub | Hub-local triggers with app/cloud remote control | Reed switch, PIR, water probe, temperature/humidity sensor, button |
| Tapo Hub / chime-hub family | hub / chime | wired | wifi / ethernet on selected versions / proprietary sub-GHz | Local sensor automations and local camera storage on storage-capable versions; cloud remote access | Siren/chime; microSD on selected versions |

### Netatmo

| device | category (doorbell / outdoor cam / indoor cam / floodlight cam / PTZ / sensor / hub / lock / chime) | power (battery / wired / solar / PoE) | connectivity (wifi / ethernet / thread / zigbee / z-wave / cellular / proprietary sub-GHz) | local vs cloud processing | notable hardware (radar, mmWave, dual lens, IR array, privacy shutter, dual-chip low-power designs) |
|---|---|---|---|---|---|
| Smart Video Doorbell | doorbell | wired | wifi | On-device person detection and local microSD; optional FTP/Dropbox export; HomeKit support | IR LEDs, local flash storage design, existing-chime interface |
| Smart Outdoor Camera with Siren | floodlight cam / outdoor cam | wired | wifi | On-device person/animal/vehicle classification; local microSD with optional FTP/Dropbox backup | Floodlight, siren, IR LEDs |
| Smart Indoor Camera | indoor cam | wired | wifi / ethernet | On-device face recognition and local microSD; optional FTP/Dropbox backup | IR LEDs; face-recognition processing |
| Smart Door and Window Sensors | sensor | battery | proprietary radio to indoor camera | Local contact/vibration event forwarded by camera; app notification uses internet | Open/close and vibration sensing |
| Smart Smoke Alarm / CO Alarm | sensor | battery | wifi | Alarm and self-test are local; remote status and notification use cloud | Smoke or CO sensor, siren, long-life battery |
| Smart Indoor Air Quality / Weather modules | sensor / hub | battery / wired depending module | wifi / proprietary radio between modules | Measurements sampled locally and synchronized to cloud dashboards | Temperature, humidity, CO2, noise, pressure, or rain/wind sensing by module |

### Logitech Circle

| device | category (doorbell / outdoor cam / indoor cam / floodlight cam / PTZ / sensor / hub / lock / chime) | power (battery / wired / solar / PoE) | connectivity (wifi / ethernet / thread / zigbee / z-wave / cellular / proprietary sub-GHz) | local vs cloud processing | notable hardware (radar, mmWave, dual lens, IR array, privacy shutter, dual-chip low-power designs) |
|---|---|---|---|---|---|
| Circle View Camera | indoor cam / outdoor cam | wired | wifi | HomeKit Secure Video sends encrypted video through the Apple home hub/iCloud path; no Logitech video cloud | IR LEDs, hardware privacy tilt/disable position |
| Circle View Doorbell | doorbell | wired | wifi | HomeKit Secure Video processing/recording through Apple home hub and iCloud | Portrait field of view, IR LEDs, existing-chime interface |
| Earlier Circle cameras | indoor cam / outdoor cam | wired / battery on selected legacy version | wifi | Logitech cloud service support and availability vary for legacy devices (uncertain) | Wide-angle lens, IR LEDs; rechargeable battery on one legacy version |

### Ecobee

| device | category (doorbell / outdoor cam / indoor cam / floodlight cam / PTZ / sensor / hub / lock / chime) | power (battery / wired / solar / PoE) | connectivity (wifi / ethernet / thread / zigbee / z-wave / cellular / proprietary sub-GHz) | local vs cloud processing | notable hardware (radar, mmWave, dual lens, IR array, privacy shutter, dual-chip low-power designs) |
|---|---|---|---|---|---|
| Smart Doorbell Camera | doorbell | wired | wifi | On-device detection with cloud video history and subscription security features | Radar plus computer vision, portrait framing, IR LEDs |
| SmartCamera with voice control | indoor cam | wired | wifi | On-device person framing; cloud recording and monitoring features | Physical privacy shutter, digital pan/zoom, voice assistant microphones |
| SmartSensor for doors/windows | sensor | battery | proprietary sub-GHz to thermostat/camera (uncertain) | Local occupancy/contact input; cloud security state and alerts | Reed switch and occupancy sensing |
| SmartSensor room/occupancy | sensor | battery | proprietary sub-GHz to thermostat | Local temperature and occupancy input with cloud history/automation | Temperature sensor and PIR |
| Smart Thermostat family | hub / sensor | wired | wifi / proprietary sub-GHz; some versions include Bluetooth | Local HVAC control with cloud app, security arming, and remote sensor aggregation | Occupancy, temperature, humidity; speaker/microphones on selected versions |

### ADT

| device | category (doorbell / outdoor cam / indoor cam / floodlight cam / PTZ / sensor / hub / lock / chime) | power (battery / wired / solar / PoE) | connectivity (wifi / ethernet / thread / zigbee / z-wave / cellular / proprietary sub-GHz) | local vs cloud processing | notable hardware (radar, mmWave, dual lens, IR array, privacy shutter, dual-chip low-power designs) |
|---|---|---|---|---|---|
| ADT-branded doorbell and legacy partner doorbells | doorbell | battery / wired depending generation | wifi | Cloud recording and monitored-event workflows; exact feature set depends on ADT platform generation | PIR and IR LEDs; existing-chime support on wired versions |
| ADT indoor/outdoor cameras | indoor cam / outdoor cam | wired / battery depending generation | wifi | Cloud-centered recording, analytics, and monitoring; platform-dependent | PIR, IR LEDs, spotlight on selected outdoor versions |
| Google Nest cameras sold/integrated with ADT | doorbell / indoor cam / outdoor cam / floodlight cam | battery / wired | wifi | Nest on-device classifications and cloud video feed into ADT app/monitoring workflows | Hardware follows the relevant Nest device |
| Door/window, motion, glass-break, smoke/CO, water, and temperature sensors | sensor | battery | proprietary sub-GHz / z-wave depending ADT platform | Local panel alarm logic with cellular/cloud monitoring | Reed switch, PIR, acoustic sensor, life-safety sensors, water/temperature probes |
| ADT hub / command panel | hub / chime | wired with backup battery | wifi / ethernet on selected systems / cellular / z-wave / proprietary sub-GHz | Local alarm state and siren; dual-path connection to monitoring and account services | Touch display on panel versions, siren, battery backup, cellular modem |
| Compatible smart locks | lock | battery | z-wave | Local panel automation; remote access and codes through ADT cloud | Keypad or touchscreen depends on partner lock |

### Lorex

| device | category (doorbell / outdoor cam / indoor cam / floodlight cam / PTZ / sensor / hub / lock / chime) | power (battery / wired / solar / PoE) | connectivity (wifi / ethernet / thread / zigbee / z-wave / cellular / proprietary sub-GHz) | local vs cloud processing | notable hardware (radar, mmWave, dual lens, IR array, privacy shutter, dual-chip low-power designs) |
|---|---|---|---|---|---|
| Video Doorbell family | doorbell | battery / wired depending version | wifi | On-device classification and local microSD; optional cloud features vary | IR LEDs, person/package detection; head-to-toe view on newer versions |
| WiFi indoor/outdoor camera family | indoor cam / outdoor cam / PTZ | wired | wifi | On-device detection with local microSD; optional recorder/cloud integrations depend on model | IR array or spotlights; pan/tilt on selected models |
| PoE camera family | indoor cam / outdoor cam / PTZ | PoE | ethernet | On-camera detection with local NVR recording; remote viewing through app relay | IR array, spotlights, optical zoom, siren, or two-way audio by model |
| Dual-lens panoramic cameras | outdoor cam | PoE / wired | ethernet / wifi depending version | Local NVR or microSD recording with on-device analytics | Two lenses stitched for panoramic coverage |
| Floodlight camera | floodlight cam | wired | wifi | On-device detection and local microSD; remote app access | Floodlights, siren, PIR/camera detection |
| Fusion-capable DVR/NVR family | hub | wired | ethernet; local coax inputs on DVR variants | Local continuous/event recording and search; cloud relay for remote access | Multi-drive or single-drive storage, display output; combines wired and compatible wifi channels |

### Abode

| device | category (doorbell / outdoor cam / indoor cam / floodlight cam / PTZ / sensor / hub / lock / chime) | power (battery / wired / solar / PoE) | connectivity (wifi / ethernet / thread / zigbee / z-wave / cellular / proprietary sub-GHz) | local vs cloud processing | notable hardware (radar, mmWave, dual lens, IR array, privacy shutter, dual-chip low-power designs) |
|---|---|---|---|---|---|
| Wireless Video Doorbell | doorbell | battery | wifi / proprietary link to chime (uncertain) | Cloud-oriented clips and app access | PIR, IR LEDs, indoor chime |
| Indoor/outdoor camera family | indoor cam / outdoor cam | wired | wifi | Cloud recording and alarm verification; basic local detection | IR LEDs, PIR on selected versions |
| Door/window, motion, acoustic glass-break, water, smoke-listener, and occupancy sensors | sensor | battery | proprietary sub-GHz / zigbee / z-wave depending device | Hub-local automations and alarm state; cloud/cellular for remote and monitoring | Reed switch, PIR, microphone, water contacts, multisensor packages |
| Iota / Security Hub family | hub / chime | wired with backup battery | ethernet / wifi / cellular / zigbee / z-wave / proprietary sub-GHz | Local automations and alarm decisions; cloud account and monitoring | Battery backup, siren, cellular modem; Iota includes camera and motion sensor |

### Vivint

| device | category (doorbell / outdoor cam / indoor cam / floodlight cam / PTZ / sensor / hub / lock / chime) | power (battery / wired / solar / PoE) | connectivity (wifi / ethernet / thread / zigbee / z-wave / cellular / proprietary sub-GHz) | local vs cloud processing | notable hardware (radar, mmWave, dual lens, IR array, privacy shutter, dual-chip low-power designs) |
|---|---|---|---|---|---|
| Doorbell Camera family | doorbell | wired | wifi | Cloud/managed-service recording and detection with local event triggering | Wide vertical view, IR LEDs, siren or deter tone on selected versions |
| Outdoor Camera family | outdoor cam | wired | wifi / proprietary bridge | Cloud/managed-service recording; on-device deterrence and detection on newer versions | IR LEDs, spotlight/siren or illuminated ring on selected versions |
| Indoor Camera family | indoor cam | wired | wifi | Cloud/managed-service recording and alarm verification | IR LEDs, callout button, physical privacy shutter on selected versions |
| Door/window, motion, glass-break, smoke/CO, water, and vehicle sensors | sensor | battery / wired for vehicle sensor base (uncertain) | proprietary sub-GHz / wifi depending device | Local panel alarm decisions; cellular/cloud monitoring and notifications | Standard alarm sensors; vehicle-protection hardware includes local detection (exact sensing method varies) |
| Smart Hub panel | hub / chime | wired with backup battery | wifi / cellular / z-wave / proprietary sub-GHz | Local alarm and automation state; cloud monitoring and video services | Touchscreen, microphone/speaker, siren, battery backup, cellular modem |
| Partner smart locks | lock | battery | z-wave | Local panel control with cloud-mediated remote access | Keypad deadbolt |

### Eve

| device | category (doorbell / outdoor cam / indoor cam / floodlight cam / PTZ / sensor / hub / lock / chime) | power (battery / wired / solar / PoE) | connectivity (wifi / ethernet / thread / zigbee / z-wave / cellular / proprietary sub-GHz) | local vs cloud processing | notable hardware (radar, mmWave, dual lens, IR array, privacy shutter, dual-chip low-power designs) |
|---|---|---|---|---|---|
| Eve Cam | indoor cam | wired | wifi | HomeKit Secure Video processing via Apple home hub and encrypted iCloud storage; no general vendor video cloud | IR LEDs, status LED |
| Eve Outdoor Cam | floodlight cam / outdoor cam | wired | wifi | HomeKit Secure Video path through Apple home hub/iCloud | Floodlight, IR LEDs, motion sensor |
| Door & Window | sensor | battery | thread | Local Matter/HomeKit state routed through a Thread border router; remote access through home hub | Reed switch |
| Motion | sensor | battery | thread | Local motion/lux event routed through border router; automation can stay on home LAN | PIR and ambient light sensor |
| Weather / Room / Water Guard devices | sensor | battery / wired depending device | thread | Local measurements/alarms; optional home-hub remote history and automation | Temperature, humidity, pressure, air-quality, or leak cable by device |

### Philips Hue

| device | category (doorbell / outdoor cam / indoor cam / floodlight cam / PTZ / sensor / hub / lock / chime) | power (battery / wired / solar / PoE) | connectivity (wifi / ethernet / thread / zigbee / z-wave / cellular / proprietary sub-GHz) | local vs cloud processing | notable hardware (radar, mmWave, dual lens, IR array, privacy shutter, dual-chip low-power designs) |
|---|---|---|---|---|---|
| Hue Secure wired camera | indoor cam / outdoor cam | wired | wifi / zigbee link to Bridge for lighting actions (uncertain) | Encrypted cloud video with on-device triggering; Bridge enables local light/alarm automation | IR LEDs, siren, encrypted-video design |
| Hue Secure battery camera | outdoor cam | battery | wifi | Encrypted cloud video with low-power local triggering | PIR, IR LEDs, siren, low-power wake design |
| Hue Secure floodlight camera | floodlight cam | wired | wifi / zigbee for light integration (uncertain) | Camera video uses encrypted cloud path; lighting automations can run through Bridge | Hue floodlight, camera, siren |
| Hue Secure contact sensor | sensor | battery | zigbee | Local Bridge state and lighting/security automations; remote alerts through cloud | Reed switch |
| Hue motion sensors | sensor | battery | zigbee | Local Bridge occupancy/light rules; remote app path through cloud | PIR, ambient light, temperature |
| Hue Bridge | hub | wired | ethernet / zigbee | Local lighting and sensor automation; cloud remote access and camera-plan integration | Zigbee coordinator and local rule engine |

### Swann

| device | category (doorbell / outdoor cam / indoor cam / floodlight cam / PTZ / sensor / hub / lock / chime) | power (battery / wired / solar / PoE) | connectivity (wifi / ethernet / thread / zigbee / z-wave / cellular / proprietary sub-GHz) | local vs cloud processing | notable hardware (radar, mmWave, dual lens, IR array, privacy shutter, dual-chip low-power designs) |
|---|---|---|---|---|---|
| Video Doorbell family | doorbell | battery / wired depending version | wifi | Local memory or recorder support varies; app/cloud services provide remote clips | PIR/heat-assisted detection on selected versions, IR LEDs, chime |
| WiFi camera family | indoor cam / outdoor cam / PTZ | wired / battery / solar depending version | wifi | Local microSD on selected devices plus optional cloud/app path | PIR/heat sensing on selected devices, IR or spotlights, pan/tilt on selected versions |
| Wired IP and coax camera family | indoor cam / outdoor cam / PTZ | PoE / wired | ethernet or coax to recorder | Local DVR/NVR continuous/event recording and on-device/recorder analytics | IR arrays, spotlights, microphones; thermal/heat-assisted PIR branding on selected devices |
| Floodlight camera | floodlight cam | wired | wifi | Local/app recording capabilities vary by version | Floodlights, PIR, siren |
| DVR/NVR family | hub | wired | ethernet; local coax inputs on DVR models | Local multi-camera recording, retention, display, and export; remote access through app relay | HDD, display outputs, alarm I/O on selected models |

### Amcrest

| device | category (doorbell / outdoor cam / indoor cam / floodlight cam / PTZ / sensor / hub / lock / chime) | power (battery / wired / solar / PoE) | connectivity (wifi / ethernet / thread / zigbee / z-wave / cellular / proprietary sub-GHz) | local vs cloud processing | notable hardware (radar, mmWave, dual lens, IR array, privacy shutter, dual-chip low-power designs) |
|---|---|---|---|---|---|
| Video Doorbell family | doorbell | wired | wifi | Local microSD and RTSP/ONVIF paths on supported firmware; optional cloud | IR LEDs, wide-angle lens, existing-chime interface |
| Indoor WiFi camera family | indoor cam / PTZ | wired | wifi / ethernet on selected versions | Local microSD/NVR/NAS via RTSP or ONVIF; optional cloud | IR LEDs, motorized pan/tilt, privacy mode on selected versions |
| PoE bullet, turret, dome, and PTZ cameras | indoor cam / outdoor cam / PTZ | PoE | ethernet | On-device analytics with local microSD/NVR/NAS; optional vendor cloud | IR arrays, optical zoom, motorized pan/tilt, alarm I/O on selected models |
| NVR family | hub | wired | ethernet | Local continuous/event ingest, retention, search, display, and export | HDD bays, PoE switch on selected recorders, display outputs |

### Axis Communications

| device | category (doorbell / outdoor cam / indoor cam / floodlight cam / PTZ / sensor / hub / lock / chime) | power (battery / wired / solar / PoE) | connectivity (wifi / ethernet / thread / zigbee / z-wave / cellular / proprietary sub-GHz) | local vs cloud processing | notable hardware (radar, mmWave, dual lens, IR array, privacy shutter, dual-chip low-power designs) |
|---|---|---|---|---|---|
| Network video door stations | doorbell | PoE | ethernet | On-device analytics and SIP/ONVIF integration with local VMS/NVR; cloud optional through partners | Camera, call button, speaker/microphone, relay/I/O, tamper sensing |
| Fixed network cameras | indoor cam / outdoor cam | PoE | ethernet | On-device analytics and edge SD recording with VMS/NVR export | IR arrays, multi-sensor or dual-lens designs, hardware secure element on many models |
| PTZ network cameras | PTZ / outdoor cam | PoE | ethernet | Edge analytics plus local VMS recording and control | Optical zoom, motorized pan/tilt, long-range IR on selected models |
| Radar and thermal detectors | sensor | PoE | ethernet | Edge tracking/classification with events sent to camera/VMS rules | Radar or thermal sensor; precise coordinates and speed on radar models |
| Network speakers, sirens, and I/O modules | chime / hub | PoE | ethernet | Local/VMS rule endpoints for audio and physical inputs/outputs | Speaker, microphone, strobe, relay, supervised I/O depending device |

### Bosch / Resideo / Honeywell Home

| device | category (doorbell / outdoor cam / indoor cam / floodlight cam / PTZ / sensor / hub / lock / chime) | power (battery / wired / solar / PoE) | connectivity (wifi / ethernet / thread / zigbee / z-wave / cellular / proprietary sub-GHz) | local vs cloud processing | notable hardware (radar, mmWave, dual lens, IR array, privacy shutter, dual-chip low-power designs) |
|---|---|---|---|---|---|
| Security-system indoor/outdoor cameras | indoor cam / outdoor cam | wired / battery depending ecosystem | wifi | Usually cloud/monitoring-platform centered; exact local storage differs by dealer platform | PIR, IR LEDs, privacy shutter on selected indoor models |
| Door/window, motion, glass-break, smoke/CO, heat, water, and freeze sensors | sensor | battery / wired | proprietary sub-GHz | Local panel alarm logic and supervised sensor status; cellular/cloud monitoring | Reed switch, PIR/microwave dual-tech on some motion sensors, acoustic glass-break, life-safety elements |
| Alarm panels and smart-home controllers | hub / chime | wired with backup battery | ethernet / wifi / cellular / z-wave / proprietary sub-GHz | Local certified alarm state machine; monitoring link uses IP and/or cellular | Supervised zones, siren outputs, backup battery, cellular communicator |
| Compatible smart locks | lock | battery | z-wave | Panel-local rules and cloud/dealer remote access | Keypad/touchscreen deadbolt from partner vendors |

### Samsung SmartThings / Aeotec

| device | category (doorbell / outdoor cam / indoor cam / floodlight cam / PTZ / sensor / hub / lock / chime) | power (battery / wired / solar / PoE) | connectivity (wifi / ethernet / thread / zigbee / z-wave / cellular / proprietary sub-GHz) | local vs cloud processing | notable hardware (radar, mmWave, dual lens, IR array, privacy shutter, dual-chip low-power designs) |
|---|---|---|---|---|---|
| SmartThings-compatible multipurpose, motion, water, button, and climate sensors | sensor | battery | zigbee / z-wave / thread depending vendor | Many automations can execute on the hub; device history and remote access use cloud | Reed switch plus accelerometer, PIR, water contacts, temperature/humidity sensing |
| SmartThings Station / Aeotec Smart Home Hub | hub | wired | wifi / ethernet on Aeotec hub / thread / zigbee / z-wave | Local execution for supported drivers and automations; account, history, and remote access use cloud | Multi-protocol radios; Thread border router/Matter controller support varies by hub |
| Compatible cameras and doorbells | doorbell / indoor cam / outdoor cam | battery / wired | wifi | Video remains in the camera vendor’s local/cloud path while SmartThings receives events or controls | Hardware depends on partner camera |
| Compatible smart locks | lock | battery | z-wave / zigbee / thread depending vendor | Lock state and routines can execute through hub; remote credentials/history may use partner cloud | Keypad, fingerprint, or NFC depending partner lock |

### Yale / August

| device | category (doorbell / outdoor cam / indoor cam / floodlight cam / PTZ / sensor / hub / lock / chime) | power (battery / wired / solar / PoE) | connectivity (wifi / ethernet / thread / zigbee / z-wave / cellular / proprietary sub-GHz) | local vs cloud processing | notable hardware (radar, mmWave, dual lens, IR array, privacy shutter, dual-chip low-power designs) |
|---|---|---|---|---|---|
| Yale Assure / Linus smart-lock families | lock | battery | wifi / thread / z-wave / Bluetooth depending module and region | Credential checks and actuation are local; remote control/history use hub or cloud | Keypad/touchscreen, optional keyway, door-position sensor on selected versions |
| August Wi-Fi Smart Lock / retrofit family | lock | battery | wifi / Bluetooth | Local actuator and auto-unlock proximity path; cloud for remote control and sharing | Retrofit thumb-turn motor, DoorSense position sensor |
| Connect Wi-Fi Bridge | hub | wired | wifi / Bluetooth | Relays local Bluetooth lock commands to cloud/app | Dual-radio bridge |
| Yale Smart Alarm sensors and hub | sensor / hub | battery / wired for hub | wifi / cellular on selected hub / proprietary sub-GHz (uncertain) | Local alarm coordination with cloud/app remote path | Contact, motion, keypad, siren, and backup connectivity vary by region |

### Roku Smart Home

| device | category (doorbell / outdoor cam / indoor cam / floodlight cam / PTZ / sensor / hub / lock / chime) | power (battery / wired / solar / PoE) | connectivity (wifi / ethernet / thread / zigbee / z-wave / cellular / proprietary sub-GHz) | local vs cloud processing | notable hardware (radar, mmWave, dual lens, IR array, privacy shutter, dual-chip low-power designs) |
|---|---|---|---|---|---|
| Video Doorbell family | doorbell | battery / wired depending version | wifi | Cloud-oriented events and streaming with some local triggering/storage options by model | PIR, IR LEDs, chime |
| Indoor Camera family | indoor cam / PTZ | wired | wifi | Local microSD on supported versions and optional cloud history | IR LEDs; motorized pan/tilt on selected version |
| Outdoor Camera family | outdoor cam | battery / solar accessory | wifi / proprietary low-power link to base | Event-triggered local operation with cloud recording/service options | PIR, IR LEDs, low-power wake design |
| Floodlight Camera | floodlight cam | wired | wifi | Local triggering with optional cloud recording | Floodlights, PIR, siren |
| Home Monitoring sensors and hub | sensor / hub | battery / wired for hub | wifi / proprietary sub-GHz | Hub-local sensor reception with app/cloud notifications and optional monitoring | Contact, motion, climate/leak sensor hardware varies by kit |

## 2. Use cases

### Detection

- **Generic motion:** Detect pixel changes, PIR heat movement, radar returns, or a fused signal and create an event without yet identifying the subject.
- **Person:** Classify a human to reduce alerts from shadows, foliage, insects, and precipitation.
- **Package delivery:** Recognize a parcel, usually in a doorbell’s lower field of view, and track delivered, present, picked-up, or removed states.
- **Vehicle:** Classify a car, truck, motorcycle, or bicycle and optionally distinguish arrival, departure, parking, or driveway crossing.
- **Animal and pet:** Identify animals, suppress pet-caused security alarms, or notify owners about pets at doors, yards, food bowls, or restricted areas.
- **Face recognition:** Match a face to a household library and label a familiar or unfamiliar person; quality, consent rules, and regional availability vary.
- **License plate recognition:** Capture or classify plate text for driveway/access logging; reliable recognition normally needs appropriate optics, angle, shutter, and illumination.
- **Glass break:** Recognize the acoustic pattern of breaking glass or use a shock sensor attached to a pane or frame.
- **Smoke/CO listening:** Recognize the temporal alarm patterns emitted by a separate smoke or CO alarm; this is not equivalent to directly sensing smoke or carbon monoxide.
- **Direct smoke, heat, and CO detection:** Use dedicated life-safety sensing elements to trigger a local siren even if the network is down.
- **Door/window/gate state:** Detect open, closed, left-open, or tamper state with a reed switch, tilt sensor, or position sensor.
- **Lock state:** Report locked, unlocked, jammed, manual-turn, keypad, auto-lock, or door-open conditions and correlate them with camera events.
- **Occupancy and presence:** Use PIR for motion or mmWave/radar for stationary presence; drive room automation, alarm occupancy, elder-care check-ins, or energy control.
- **Line crossing and intrusion zone:** Trigger when a tracked object crosses a directed boundary, enters a polygon, exits it, or remains inside it.
- **Loitering and dwell:** Trigger only after a person or vehicle remains in a region for a threshold, reducing transient alerts.
- **Approach and trajectory:** Use radar, optical tracking, or sequential cameras to infer direction, distance, speed, and likely arrival at a door or perimeter.
- **Tailgating and occupancy count:** Compare entries and exits or overlapping tracks to estimate how many people entered an area.
- **Audio events:** Detect alarms, crying, barking, shouting, gunshot-like impulses, or unusual sound levels; availability and reliability vary.
- **Baby, elder, and dependent monitoring:** Detect crying, room entry, getting out of bed, prolonged inactivity, or a fall-like event; consumer cameras are generally not certified medical devices.
- **Water leak and freeze:** Detect water at contacts or a probe and warn when ambient temperature could freeze plumbing.
- **Temperature, humidity, air quality, CO2, and particulate conditions:** Track comfort, mold risk, ventilation needs, equipment rooms, nurseries, and storage conditions.
- **Vibration, tilt, and tamper:** Detect window impact, garage-door angle, object movement, camera masking, enclosure opening, or device removal.
- **Light-level and day/night state:** Switch imaging modes, illumination, or automations based on ambient lux and IR-cut filter state.
- **Doorbell press and call intent:** Treat a physical button press as a high-confidence call distinct from passive motion.
- **Camera obstruction or image degradation:** Detect lens covering, defocus, moved viewpoint, glare, darkness, or accumulated dirt (capability varies).
- **Cross-device verification:** Require or enrich one detector’s event with another sensor, camera, radar, lock, or alarm state before escalating.

### Recording

- **Event clips:** Record around a detection, button press, sensor trip, or manually created bookmark; clip length and cooldown may be subscription-gated.
- **Continuous 24/7 recording:** Persist all video from continuously powered cameras to an NVR, hub, SD card, NAS, or cloud plan.
- **Scheduled recording:** Record continuously or by event only during selected hours, alarm modes, or business/home schedules.
- **Pre-roll ring buffer:** Continuously retain a short volatile buffer and prepend frames from before the trigger; low-power devices may use a lower-resolution or monochrome pre-roll stream.
- **Post-roll and event extension:** Continue recording while motion persists and for a cooldown interval after the last observation.
- **Local microSD:** Store clips or continuous segments in the camera; overwrite oldest data, expose health/endurance status, and handle theft risk.
- **Hub/base storage:** Send encrypted or plain local streams to a proprietary base station, chime, or smart-home hub, isolating storage from camera theft.
- **NVR/DVR/NAS/VMS storage:** Ingest multiple streams through proprietary protocols, RTSP, ONVIF, or file transfer, with centralized retention and export.
- **Cloud clip storage:** Upload event media to vendor infrastructure for remote access, redundant retention, and server-side analytics.
- **Cloud continuous recording:** Upload the full timeline; it requires continuous power, stable upstream bandwidth, and usually a higher subscription tier.
- **Hybrid/local-plus-cloud:** Keep the primary copy locally while uploading thumbnails, metadata, selected events, or an off-site backup.
- **Network-outage recording:** Buffer on-device or continue to local hub/NVR, then index or upload recovered segments after connectivity returns.
- **Power-outage recording:** Continue only where camera, network, hub, and storage have battery/UPS support; otherwise create a recording gap.
- **Manual recording and snapshot:** Let an authorized viewer save a live segment or still, often with separate audit and retention rules.
- **Alarm verification:** Attach pre-event and live video to a burglary, fire, panic, or duress incident for a resident, guard, or monitoring agent.
- **Multi-camera incident timeline:** Align clips, sensor events, doorbell presses, lock actions, and alarm-state changes on one clock.
- **Event deduplication and stitching:** Merge repeated triggers from one or more cameras into a single incident while preserving source clips.
- **Evidence export:** Produce a downloadable clip, snapshot, event report, watermark/signature, and chain-of-custody metadata where supported.
- **Privacy-preserving thumbnail/metadata history:** Store event labels or redacted previews without retaining full video.

### Power management

- **Battery preservation:** Reduce frame rate, detection duty cycle, radio use, illumination, and clip length to meet a target service interval.
- **Wake-on-motion:** Keep the main application processor and image sensor asleep until PIR, radar, button press, or hub command wakes them.
- **Dual-chip sleep architecture:** Leave a low-power microcontroller or vision chip active while the high-power camera system sleeps, then hand off a qualified event.
- **Adaptive wake filtering:** Reject heat motion or low-confidence classifier results before opening a costly radio/video session.
- **Cold-weather battery handling:** Limit charging, illumination, or recording when cell temperature/voltage is unsafe and report reduced capacity.
- **Solar charging:** Balance panel input, battery state of charge, event volume, temperature, and shading; expose whether the daily energy budget is sustainable.
- **Wired trickle charging:** Use existing doorbell wiring to recharge or supplement a battery while respecting transformer and chime constraints.
- **Mains-powered operation:** Support continuous analytics, stronger lighting, and 24/7 recording but define reboot behavior after an outage.
- **PoE:** Carry data and centrally backed-up power on one cable, negotiate the power budget, and expose switch-port health.
- **Hub/panel backup battery:** Maintain sensor reception, siren, alarm logic, and cellular reporting during a local power outage.
- **UPS-backed camera network:** Keep PoE switch, router, recorder, and cameras alive as a power domain and shed noncritical loads when runtime falls.
- **Low-battery maintenance:** Forecast depletion, suppress repeated warnings, identify abnormal drain, and preserve enough energy for critical alerts.
- **Thermal management:** Reduce charging, processor load, illumination, or radio power when enclosure temperature is high.

### Connectivity

- **Direct wifi:** Camera connects to the LAN/access point; setup, roaming, band steering, weak RSSI, DHCP/DNS, captive networks, and credential changes affect availability.
- **Wifi offline behavior:** Continue local sensing/recording where possible, queue metadata, distinguish LAN loss from internet loss, and reconcile after recovery.
- **Ethernet/PoE LAN:** Use stable wired transport, VLANs, switch monitoring, and multicast/unicast discovery while handling link or switch failure.
- **Proprietary camera-to-base radio:** Keep battery cameras on a managed low-power link and use the base as gateway, storage target, and time source.
- **Low-power sensor-to-hub:** Route tiny messages over Zigbee, Z-Wave, Thread, or proprietary sub-GHz with supervision, retries, mesh health, and battery-aware reporting.
- **Thread mesh routing:** Use sleepy end devices, mains-powered routers, and one or more border routers; recover from parent, partition, credential, and border-router changes.
- **Zigbee mesh routing:** Join through a coordinator, select parent/router paths, report attributes, and re-form routes around failed powered devices.
- **Z-Wave routing and security:** Include/exclude devices, negotiate security keys, use repeaters, supervise commands, and heal/update routes.
- **Cellular camera connection:** Send events and video where fixed broadband is unavailable, with signal, data-cap, sleep, and carrier-state constraints.
- **Cellular alarm backup:** Fail from broadband to a supervised cellular path while preserving alarm sequence numbers and monitoring-station acknowledgments.
- **Bluetooth commissioning/proximity:** Provision wifi/Thread credentials, establish ownership, or perform nearby unlock/diagnostics without making Bluetooth the video path.
- **Cloud relay remote viewing:** Authenticate both endpoints and broker or relay a connection when inbound LAN access is unavailable.
- **LAN-only viewing:** Keep live/playback traffic local and usable without vendor internet, while defining how identity and certificates are maintained.
- **RTSP export:** Publish one or more video streams to a player, NAS, or NVR; document authentication, codecs, substreams, and sleep limitations.
- **ONVIF integration:** Discover devices and exchange profiles, stream URIs, events, PTZ commands, time, and capabilities with a third-party VMS/NVR.
- **FTP/SMB/NAS export:** Push clips or mount storage to keep a vendor-independent local/off-device copy.
- **SIP/intercom integration:** Route a door-station call to phones, panels, or PBX endpoints and coordinate audio, video, door release, busy, and no-answer states.
- **HomeKit Secure Video:** Send encrypted camera streams to an Apple home hub for analysis and iCloud recording; surface events and live view through the Home app.
- **Matter device integration:** Expose supported sensor, lock, light, or bridge endpoints to one or more Matter fabrics; camera support depends on the deployed Matter version and vendor implementation.
- **Bridge translation:** Convert a proprietary/Zigbee/Z-Wave sensor event into HomeKit, Matter, voice-assistant, or security-platform state while preserving identity and semantics.
- **Multi-home and multi-site routing:** Keep devices, users, subscriptions, notifications, and retention policies isolated by home/site while allowing authorized switching.
- **Clock synchronization:** Use NTP, hub time, or recorder time so clips and sensor events correlate after reboots and offline intervals.
- **Jamming/interference response:** Detect missing supervision, rising noise, repeated retries, or coordinated radio loss and distinguish it from ordinary coverage failure.

### Interaction

- **Live view:** Request a fresh stream, wake a sleeping camera if necessary, negotiate quality, and show stale/offline/relay state.
- **Two-way talk:** Establish low-latency full- or half-duplex audio with echo cancellation, permission indicators, and contention rules for multiple viewers.
- **Doorbell call:** Ring local chime(s), send household notifications, offer live video/talk, and record the answered, declined, missed, or timed-out outcome.
- **Quick replies:** Play a predefined message and optionally prompt the visitor to leave a recorded response.
- **Visitor message:** Record an audio/video response after no answer or a selected quick reply, then notify authorized users.
- **Siren:** Start locally, from a rule, from a monitoring agent, or manually; enforce duration, volume, cancellation, and audit behavior.
- **Chime triggering:** Drive a mechanical chime, digital chime, plug-in speaker, smart speaker, display, or panel and respect quiet modes.
- **Light activation:** Turn floodlights/path lights on from PIR, camera classification, alarm state, schedule, ambient light, or manual control and turn them off after a timer.
- **PTZ control:** Move to an operator-selected direction/preset, patrol route, privacy position, or detected target and resolve competing commands.
- **Auto-tracking:** Keep a classified subject framed, switch between wide/tele lenses, stop at physical/privacy boundaries, and return home after loss.
- **Digital tracking/auto-zoom:** Crop a fixed high-resolution image around a subject without moving the camera and preserve access to the full frame where available.
- **Lock/unlock from a video event:** Let an authorized user unlock for a visible visitor, then verify door position and relock on a timer or close event.
- **Delivery access:** Issue a temporary code or remote unlock, observe the drop-off, restrict access scope/time, and confirm closure/relock.
- **Alarm arm/disarm:** Change home/away/night states from app, panel, schedule, geofence, keypad, lock, or presence and apply entry/exit delays.
- **Emergency dispatch/monitoring:** Send a verified alarm to a monitoring agent, exchange audio/video or sensor evidence, contact the household, and dispatch according to policy.
- **Panic/duress:** Trigger a silent or audible alarm from a button, keypad code, or app while limiting local disclosure of a silent event.
- **Voice assistant and smart display:** Announce events, show a live feed, control lights/locks where authorized, and enforce voice/PIN policy for sensitive actions.
- **Automations and scenes:** Combine time, presence, contact, camera, light, lock, HVAC, and alarm states into conditional actions with cooldowns and overrides.
- **Intercom/call transfer:** Route a door call among household members, indoor stations, phones, or a guard desk with answer ownership and handoff.
- **Shared viewing and talk contention:** Choose who can open live video, speak, control PTZ, sound a siren, or unlock when several authorized users are active.

### Privacy and security

- **End-to-end encrypted video:** Encrypt media so storage/relay operators cannot decrypt it; manage device enrollment, trusted viewers, recovery, and revocation.
- **Encryption in transit and at rest:** Protect device-cloud, app-cloud, and local-recorder links plus stored clips, keys, thumbnails, and backups.
- **Privacy zones/masking:** Exclude regions from detection, notification, display, or recording; a true sensor-side mask offers stronger protection than playback-only masking.
- **Physical privacy shutter:** Visibly block the lens and often disable microphone/streaming; expose shutter state and fault handling.
- **Software camera/microphone disable:** Stop capture by mode, schedule, local control, or account command while making residual buffers and admin overrides explicit.
- **Geofenced arming:** Use household phone presence to request arm/disarm or camera on/off, accounting for permissions, stale location, multiple residents, and manual overrides.
- **Occupancy-based privacy:** Close an indoor camera or suppress recording when trusted presence is detected, then restore monitoring after vacancy/exit delay.
- **Role-based shared access:** Separate owner, admin, resident, child, guest, installer, guard, and monitoring-agent permissions.
- **Temporary access:** Grant time-bounded live view, lock code, clip link, or responder access and revoke it automatically.
- **Neighborhood/public sharing:** Let a user deliberately share an event with selected neighbors, community feeds, or authorities without exposing unrelated footage.
- **Law-enforcement/evidence requests:** Require an explicit legal/account workflow, scope the time/cameras, preserve audit records, and distinguish voluntary sharing from compelled disclosure.
- **Authentication and recovery:** Support MFA/passkeys where offered, device-bound sessions, recovery, login alerts, session revocation, and ownership transfer.
- **Secure commissioning and ownership transfer:** Prove physical possession, bind a device to an account/home, prevent unauthorized re-pairing, wipe secrets, and release prior ownership.
- **Secure boot, signed firmware, and rollback protection:** Verify software before execution, stage safe updates, and prevent installation of older vulnerable firmware where supported.
- **Local-network hardening:** Isolate camera VLANs, minimize outbound destinations, close unused services, rotate credentials/certificates, and retain required discovery paths.
- **Jamming detection:** Infer deliberate or accidental RF denial from coordinated device loss/noise and raise a distinct tamper event over any surviving path.
- **Camera tamper/obstruction:** Alert on enclosure opening, power cut, viewpoint movement, lens covering, defocus, or spray/paint occlusion.
- **Audit trail:** Record viewers, downloads, shares, configuration changes, arm/disarm, unlocks, deleted clips, and monitoring actions.
- **Retention and deletion:** Apply per-camera/event expiry, legal hold where applicable, user deletion, account closure, and backup/cloud propagation rules.
- **Bystander indicators and consent:** Use status LEDs, audible prompts, signage, privacy masks, and microphone controls to support local legal and social expectations.
- **Biometric/face-library governance:** Require enrollment/consent, label confidence, correction, deletion, sharing limits, and regional feature controls.

### Fleet and multi-device

- **Single-home multi-camera dashboard:** Show live thumbnails, recording state, health, privacy state, and alarm relevance without starting every stream at full rate.
- **Multi-camera timeline:** Align recordings and events across cameras, sensors, locks, lights, and alarms and jump among correlated evidence.
- **Cross-camera tracking:** Hand a person or vehicle track from one field of view to another and preserve one incident identity.
- **Floorplan/map view:** Place cameras, sensors, doors, zones, signal paths, and current states on a spatial model.
- **Zone and perimeter model:** Name driveway, porch, yard, room, door, and restricted polygons once and reuse them across detection and automation rules.
- **Shared access:** Invite household members, guests, installers, employees, guards, or property managers with site/device/feature-specific permissions.
- **Multiple homes/sites:** Operate a primary home, vacation property, rental, shop, or small business with separate alarm, notification, retention, and subscription state.
- **Neighborhood sharing:** Share a selected event or request with an opt-in geographic group without merging private device fleets.
- **Central monitoring:** Present prioritized alarms and live/recorded evidence from many customer sites to an operator with strict access logging.
- **Property-management fleet:** Bulk-enroll, name, configure, update, rotate credentials, assign tenants, and transfer or wipe devices between occupancies.
- **Health and coverage overview:** Aggregate online state, battery, storage, firmware, signal, event rate, field-of-view gaps, and blind periods.
- **Coordinated modes/scenes:** Apply home/away/night/privacy/storm/vacation modes atomically or report partial application.
- **Linked alarms and deterrence:** When one device verifies a threat, record nearby cameras and activate selected lights, sirens, locks, or announcements.
- **Bandwidth and storage budgeting:** Allocate stream resolution, frame rate, cloud upload, NVR capacity, and retention across a fleet.
- **Event triage and deduplication:** Cluster simultaneous sensor/camera reports, suppress cascades, score severity, and assign one incident for action.
- **Search across devices:** Query by time, zone, person, face, package, vehicle, plate, color, or event type, subject to available metadata.
- **Integrations/API/webhooks:** Publish states/events and accept controlled commands through smart-home platforms, automation servers, VMS products, or custom software.

### Maintenance

- **Firmware OTA:** Discover, download, verify, stage, install, reboot, health-check, retry, and possibly roll back firmware while preserving safety-critical service.
- **Staged fleet rollout:** Update a canary group, observe faults and resource use, then expand or halt the rollout.
- **Health monitoring:** Track heartbeat, last event, radio signal, latency, temperature, reboots, storage errors, sensor supervision, and camera image quality.
- **Battery and charging health:** Report charge, voltage, temperature, solar yield, estimated days remaining, and abnormal drain.
- **Storage health and rotation:** Detect missing/failing SD/HDD/SSD media, format/encrypt it, rotate oldest segments, protect marked events, and forecast retention.
- **Camera aim and coverage check:** Compare current view with a reference, find occlusion/blur/glare, validate detection zones, and guide physical realignment.
- **Sensor test/walk test:** Put the alarm in a non-dispatching test mode, exercise each sensor/siren/path, record results, and restore normal state.
- **Smoke/CO self-test and end-of-life:** Exercise sensor, speaker, battery, network, and expiration timers while keeping a local life-safety path.
- **Connectivity diagnostics:** Test device-to-hub, LAN, DNS, internet, cloud, cellular, time sync, ports, and throughput without conflating their failures.
- **Device replacement and migration:** Transfer name, zone, rules, retention, permissions, and history references to replacement hardware without transferring secret material incorrectly.
- **Factory reset and decommissioning:** Remove credentials and media, release account ownership, revoke integrations, and record that the device is no longer supervised.
- **Time and certificate maintenance:** Renew certificates/keys, rotate credentials, correct clock drift, and handle expired trust while offline.
- **Configuration backup/restore:** Preserve recorder, camera, zone, rule, and user settings with version-aware restore and secret handling.
- **Subscription gating:** Clearly distinguish hardware capability from plan-entitled detection, history length, continuous recording, rich notifications, emergency dispatch, and cellular backup.
- **Entitlement loss or billing failure:** Degrade predictably, preserve local safety functions and user-owned recordings, communicate deadlines, and restore features after renewal.
- **Service outage handling:** Preserve local functions, expose vendor-status versus device failure, queue safe operations, and reconcile cloud state without duplicate alerts.
- **Data-cap and quota management:** Measure cellular/cloud upload and storage quotas, adjust quality, and prevent surprise exhaustion during high event volume.
- **False-alert tuning:** Review examples, adjust zones/sensitivity/object filters/schedules, measure effect, and retain a route to undo over-suppression.
- **Cleaning and physical inspection:** Prompt for lens, solar-panel, detector, siren, mount, seal, cable, and battery inspection based on health signals or elapsed time.
- **Support bundle and diagnostics export:** Collect privacy-scoped logs, configuration, radio/storage health, and timestamps with user consent and automatic expiry.

## 3. Interaction patterns worth diagramming

- **Generic motion qualification:** Show scene/PIR/radar inputs → low-power detector → classifier/rule engine → suppressed or qualified event → notification/recording state.
- **Person, vehicle, animal, face, plate, or package recognition:** Show camera frames → on-device/hub/cloud inference link → confidence/policy gate → labeled track/event → search and notification consumers, including unknown and corrected states.
- **Package lifecycle:** Show doorbell/package zone, courier/person track, delivered/present/removed states, user acknowledgment, and the links that carry clips and alerts.
- **Glass-break or alarm-sound listening:** Show microphone/impact sensor → local pattern detector → verification window → alarm hub → siren/monitoring/app, including false-pattern rejection.
- **Direct smoke/CO/heat alarm:** Show sensing element → local alarm latch/siren → hub supervision → IP/cellular monitoring acknowledgment → silence/reset/end-of-life states.
- **Contact, lock, and door-position correlation:** Show contact sensor, lock actuator, keypad/app actor, hub, and camera, with closed/open and locked/unlocked/jammed combinations.
- **PIR versus mmWave presence:** Show sensor sampling, occupancy confidence/timers, occupied/vacant transitions, hub automation, and privacy/HVAC/alarm consumers.
- **Line-crossing, intrusion, loitering, and count:** Show track creation → zone/line evaluation → dwell/direction/count state → cooldown/reset → recording/alert rule.
- **Approach trajectory and cross-device verification:** Show radar/camera/sensor observations, time correlation link, confidence fusion, pre-alert/confirmed/dismissed states, and downstream devices.
- **Dependent-care or inactivity monitoring:** Show observations → activity timer/baseline → check-in notification → acknowledgment/escalation, with privacy boundary and offline/unknown state.
- **Water/freeze/environment alert:** Show sensor thresholds/hysteresis → hub → local valve/HVAC/siren action → household/monitoring acknowledgment → cleared state.
- **Tamper, obstruction, or image-quality detection:** Show physical/image/heartbeat signals → fault classifier → degraded/tampered state → alternate-path alert → inspection/restoration.
- **Doorbell press/call:** Show button → doorbell → local chime/hub/cloud → user endpoints, plus ringing/answered/declined/missed/timed-out and recording states.
- **Event recording:** Show detector/button/manual trigger → pre-roll buffer → active clip extension → finalize/encrypt/index → local/cloud retention and playback links.
- **Continuous recording:** Show camera encoder → LAN/uplink → SD/hub/NVR/cloud writer → segment rotation/index, including bandwidth/storage-full/failure states.
- **Scheduled recording and modes:** Show clock/arm mode/occupancy inputs → policy engine → off/event/continuous transitions → exceptions and manual override.
- **Pre-roll on a battery camera:** Show always-on low-power sensor/buffer, sleeping main processor, wake trigger, buffer handoff, radio connection, full stream, and return-to-sleep state.
- **Local microSD recording:** Show camera writer, rolling segments, protected events, health/endurance checks, oldest-first deletion, removal/theft, and export actor.
- **Hub/NVR/NAS recording:** Show cameras → LAN or proprietary radio → recorder ingest/index/storage → local client/cloud relay, with per-link outage and recovery states.
- **Cloud recording:** Show camera/hub → encrypted uplink → ingest/analytics/object storage → notification/index → authorized viewer, including upload backlog and expiry.
- **Hybrid recording and outage reconciliation:** Show local primary/buffer plus cloud metadata/backup, connectivity state, queued segments, deduplication, time correction, and resynchronization.
- **Power-outage continuity:** Show utility power → battery/UPS domains → camera/network/hub/recorder loads → load shedding/runtime thresholds → shutdown/recovery gaps.
- **Alarm verification/evidence export:** Show alarm sensor → incident record → pre/live camera evidence → resident/agent decision → dispatch/no-dispatch → signed export/audit trail.
- **Multi-camera incident stitching:** Show device clocks and event streams → time normalization/correlation → incident cluster → timeline/search/export, with split/merge corrections.
- **Battery preservation controller:** Show state of charge/temperature/event rate/signal → energy policy → detection/radio/lighting/clip settings → predicted runtime and critical-low mode.
- **Solar charging:** Show panel input/weather/shading → charge controller → battery state → load budget → normal/constrained/shutdown state and maintenance warning.
- **Wired trickle-charge doorbell:** Show transformer/chime/doorbell/battery circuit, charge and ring pulses, power sufficiency state, and bypass/chime compatibility.
- **PoE power and data:** Show switch PSE → cable → camera PD negotiation, VLAN/data flow, power budget/port cycle, UPS domain, and link/power fault states.
- **Low-battery maintenance:** Show telemetry → drain forecast/anomaly detector → warning cadence → user battery/charge action → verified recovery or device-offline state.
- **Direct wifi and internet loss:** Show camera → access point → router/DNS/internet → vendor service, and distinguish joining/LAN-only/internet-offline/cloud-connected/recovered states.
- **Proprietary camera-to-base link:** Show sleeping camera ↔ base radio, wake/control versus video paths, retries/signal state, base storage, and WAN relay.
- **Zigbee/Z-Wave/Thread sensor mesh:** Show end device → parent/repeaters/routers → coordinator/border router → hub rule engine, including join, supervised, reroute, partition, and leave states.
- **Cellular camera:** Show detector/camera → modem/carrier → vendor cloud/app with sleep, attach, quota, weak-signal, roaming, and upload-retry states.
- **Cellular alarm failover:** Show panel → broadband and cellular paths → monitoring receiver, health supervision, path failover, sequence/acknowledgment, and restoration.
- **Bluetooth commissioning:** Show installer phone ↔ unowned device proximity proof → credential transfer → LAN/fabric join → account/home binding → Bluetooth teardown or maintenance state.
- **Cloud-relay remote view:** Show viewer authentication → service authorization → camera wake → peer-to-peer attempt/relay fallback → stream → timeout/teardown and audit.
- **LAN-only live/playback:** Show viewer identity → local discovery/trust → camera/recorder authorization → media path, with vendor-cloud unavailable and certificate/key-renewal cases.
- **RTSP/ONVIF/VMS export:** Show device discovery/authentication, capability negotiation, stream and event channels, PTZ/control path, recorder state, and reconnect after address/credential changes.
- **FTP/SMB/NAS export:** Show finalized clip → transfer queue → authenticated storage → checksum/acknowledgment → retry/retention state.
- **SIP/intercom call:** Show door station → SIP registrar/PBX → indoor/phone endpoints, media channels, answer/busy/no-answer/transfer, relay unlock, and hangup.
- **HomeKit Secure Video:** Show camera → LAN → Apple home hub analysis/encryption → iCloud storage → authorized Home clients, with home-hub and internet outage modes.
- **Matter sensor/lock integration:** Show device/bridge endpoints, fabric commissioner, Thread/Wi-Fi network, multiple ecosystem controllers, subscriptions/commands, access control, and fabric removal.
- **Protocol bridge translation:** Show source device identity/state → hub translation/mapping → target ecosystem event, command return path, unreachable/stale state, and loop prevention.
- **Clock synchronization:** Show time sources → device/hub/recorder clocks → offset correction → event ordering, including reboot, offline drift, daylight-display conversion, and uncertain timestamps.
- **RF jamming/interference:** Show radio noise/supervision evidence from devices/hub → correlation → suspected-jam state → alternate wired/cellular alert → clear/manual review.
- **Live view:** Show user → identity/authorization → service or LAN → camera wake/stream negotiation → viewing/quality degradation → idle timeout.
- **Two-way talk:** Show viewer microphone ↔ relay/LAN ↔ camera speaker and camera microphone return, with permission, echo control, push-to-talk/duplex, contention, and teardown.
- **Quick reply and visitor message:** Show user/timeout selection → canned audio playback → visitor recording → clip finalization → notification/acknowledgment.
- **Siren and chime:** Show triggering actor/rule → authorization/safety policy → local output device → active timer → cancellation/timeout/fault plus audit link.
- **Light activation:** Show motion/classification/lux/schedule/manual inputs → rule priority → off/on/timed-on/override states → bulb/floodlight acknowledgment.
- **PTZ and auto-tracking:** Show manual/patrol/detection command arbitration → motor/zoom controller → position feedback and privacy limits → target-lost/home/fault states.
- **Video-assisted unlock/delivery access:** Show visitor event → authorized viewer/temporary credential → lock command → actuator/door-position feedback → delivery window → close/relock/escalation.
- **Arm/disarm:** Show app/keypad/lock/geofence/schedule actors → authorization → exit delay → armed modes → entry delay/alarm/disarmed, including conflicting presence and manual override.
- **Monitoring and dispatch:** Show sensor/camera → hub → IP/cellular receiver → monitoring agent → household contacts/emergency service, with acknowledgment, verification, escalation, cancellation, and audit states.
- **Panic/duress:** Show button/code/app → local panel policy → silent or audible path → cellular/IP monitoring → responder state while hiding silent-alarm feedback locally.
- **Voice assistant/display:** Show utterance/event → local speaker/display → ecosystem cloud/home hub → camera/lock/light, with identity/PIN gate, stream timeout, and sensitive-command denial.
- **Automation/scene:** Show triggers and current facts → local/cloud rule evaluator → ordered or parallel device commands → acknowledgments → partial failure/rollback/manual override.
- **Shared-session contention:** Show multiple viewers/roles → authorization and control lease → live/talk/PTZ/siren/unlock resources → preemption, denial, release, and audit.
- **End-to-end encrypted video:** Show camera key enrollment → encryption → untrusted relay/storage → authorized viewer key path, plus add/revoke/recover/reset states.
- **Privacy mask/shutter/disable:** Show mode/geofence/manual control → policy arbitration → sensor-side mask or physical shutter/mic disable → visible state → attempt denial and fault override.
- **Geofenced/occupancy privacy:** Show household devices/presence sensors → freshness and multi-user policy → pending home/away transition → arm/camera state → exception and manual override.
- **Shared and temporary access:** Show owner invitation → role/scope/time policy → recipient acceptance → permitted sessions/actions → expiry/revocation and audit.
- **Neighborhood or authority sharing:** Show owner-selected incident/media → redaction/scope/consent → recipient channel → link access/download/expiry, excluding unrelated cameras and times.
- **Account security and recovery:** Show sign-in/MFA or passkey → session/token issuance → device access → login alert/revocation; separately show recovery proof without bypassing device ownership.
- **Commissioning and ownership transfer:** Show factory/unowned device → physical proof → network/account binding → active ownership → wipe/release → new owner, with stolen/already-bound failure.
- **Secure boot and OTA:** Show signed release → download/stage → signature/version checks → reboot/new slot → health confirmation or rollback, with power/network interruption handling.
- **Retention/deletion/legal hold:** Show recording/index/backup copies → policy clock or user request → hold check → delete/tombstone propagation → completion/audit.
- **Face-library governance:** Show consent/enrollment images → template creation/local or cloud store → match/unknown/correction → share/revoke/delete propagation.
- **Multi-camera dashboard:** Show cameras/hubs → low-rate health/thumbnail feeds → dashboard → selected full stream, with stale, private, recording, alarm, and offline states.
- **Floorplan/zone model:** Show physical device placement and detection polygons → shared spatial model → event overlays/rules → calibration or relocation/version changes.
- **Cross-camera tracking:** Show per-camera tracks → temporal/spatial handoff service → one subject/incident identity → confidence break or manual merge/split.
- **Multi-home/property fleet:** Show organization → sites → homes/zones/devices/users/policies, plus enrollment, tenant turnover, site isolation, cross-site operator view, and bulk-action results.
- **Coordinated modes and linked deterrence:** Show mode or verified threat → orchestration hub → camera record/light/siren/lock/announcement commands → acknowledgments → partial application and restore.
- **Fleet health and budgeting:** Show telemetry/event volume/retention targets → aggregator → capacity/coverage dashboard → policy adjustment → device rollout and exception states.
- **Event triage/deduplication:** Show raw device events → time/space/entity clustering → severity and incident lifecycle → assigned/acknowledged/resolved/false states.
- **API/webhook integration:** Show device/vendor event → authenticated broker/webhook → automation consumer → idempotency/retry/dead-letter behavior and controlled command callback.
- **Firmware fleet rollout:** Show release → canary cohort → downloading/updating/healthy or failed states → metrics gate → expand/pause/rollback cohorts.
- **Storage rotation and failure:** Show writers → media/array → segment index → protected/unprotected retention queues → capacity threshold/overwrite/degraded/rebuild/replaced states.
- **Walk test:** Show installer/test-mode request → panel suppresses dispatch → each sensor/siren/path exercise → pass/fail inventory → explicit exit to armed-capable normal state.
- **Connectivity diagnostics:** Show device, hub/AP, router/DNS, internet, vendor cloud, cellular, and client as distinct hops, with per-hop tests and the resulting fault classification.
- **Replacement/migration:** Show old device configuration/history references → verified replacement enrollment → zone/rules/access transfer → old credential/media wipe → supervision restored.
- **Subscription or entitlement loss:** Show billing/plan service → grace/expired/restored state → feature gates in camera/hub/cloud/app while local alarm, ownership, and retained-data policies remain explicit.
- **Vendor-service outage:** Show device-local functions, LAN hub/recorder, cloud APIs, notification providers, and clients, with queueing, stale state, retry backoff, reconciliation, and duplicate suppression.
- **False-alert tuning:** Show reviewed events/labels → zone/sensitivity/class filters → trial policy version → precision/miss observations → accept or revert state.
- **Support diagnostics:** Show user consent/scope → device/hub/app log collection → redaction → expiring upload → support access/audit → deletion.

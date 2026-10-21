# Official New York Islanders artwork

Downloaded 2026-10-19 from the team's [official logo page](https://www.nhl.com/islanders/info/logos).

| File | Official source | SHA-256 |
| --- | --- | --- |
| `primary-light.png` | [Primary logo for light backgrounds](https://media.d3.nhle.com/image/private/t_q-best/prd/l8e45tdcdiz1ffs8q6js.png) | `b72124b9b6334fa715ccf8b648db48b6d64a55e2cd6ad0b9d1b18a692642fbb7` |
| `primary-dark.png` | [Primary logo for dark backgrounds](https://media.d3.nhle.com/image/private/t_q-best/prd/qhnnoj4obbwmx7oeqjyc.png) | `1b6052536d9ca33957e8e11cbcd77d7c9637cc7f05e3dcd6264856ec9bb4289f` |

These are the original, unmodified 2000 × 2000 transparent PNGs (about 73 KiB each), including the registered trademark indicators. The official page states that the marks require prior written consent. These assets are included for the Friends branding proposal to the team's marketing manager; inclusion is not a grant of rights or authorization to deploy publicly.

`tools/source-loader.cjs` embeds each image once in the selected Friends theme runtime. The shared header uses the dark-background variant; the sports cards and UBS Arena center ice use the light-background variant. Runtime instances reuse those constants, so spec JSON contains no duplicated image bytes, offline HTML needs no companion assets, and the Cloudflare bundle never fetches the NHL CDN. CSS gates display on the Islanders theme; generic venues and the science story have no team marks. Immutable library thumbnails omit the crest so it cannot remain baked into their pixels after a live theme change; each sports card has its own theme-gated mark. The ordinary graph-only SVG export does not include panels. A rink SVG's image uses embedded PNG data, with no external URL or executable SVG image.

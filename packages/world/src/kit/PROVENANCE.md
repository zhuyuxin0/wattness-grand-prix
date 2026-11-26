# Provenance

Everything in this folder is carried from the Wattness Terminal's landing intro and Hedging walkthrough
(`wattness-site`, commit `c5c182dc`, where both last changed on 23 Nov 2026). The code is unchanged except for the
lines in the Edits column; each file keeps its untyped header (`// @ts-nocheck`), its structure and its comments.
Sources are under `apps/mms/src/` in that repository. Blobs are `git hash-object` of the source file, equal to the
blob at that commit.

| Here | Source | Git blob | Edits |
|---|---|---|---|
| `stage.ts` | `ui/intro/stage.ts` | `4b5bdefe17870b31a05fe4353eddac8827d7d9f3` | `exactColor` from `./tone` (was `./kit/tone`) |
| `program-preparation.ts` | `ui/intro/program-preparation.ts` | `faa722ebb2af2124a2b38ba80326918fe72b3776` | none |
| `scene-types.ts` | `ui/intro/scene-types.ts` | `c56c0c5e2c3b6d642e228ad28e213f903ce524b4` | none |
| `scene-extras.ts` | `ui/intro/scene-extras.ts` | `f7aedf88a283e52c5fc043f6106d326cc980a5cb` | `CopyFacts` typed `unknown` (it came from the intro's copy table) |
| `labels.ts` | `ui/intro/labels.ts` | `3c09a20b4866eb639af8516689b79c904e2a7e5b` | none |
| `timeline.ts` | `ui/intro/timeline.ts` | `55ab4ae85cacc3d79a3ebf454631f325aafd1ddf` | none |
| `tone.ts` | `ui/intro/kit/tone.ts` | `eaca8332a5189f45f97ccf95a35355d24361da6d` | none |
| `textures.ts` | `ui/intro/kit/textures.ts` | `c5802ecf6a796fa29fb61fd3ab8ca573ff582ee7` | none |
| `materials.ts` | `ui/intro/kit/materials.ts` | `f33afc547ee6b362b55d54fccd2ded76976b8b9c` | none |
| `geo.ts` | `ui/intro/kit/geo.ts` | `db6626709255dc6ca52ffdec4c3e67ec76ee2c6c` | none |
| `enclosure.ts` | `ui/intro/kit/enclosure.ts` | `7730e5af1ee77c09fd2b6e80aba9313a3216ec9e` | none |
| `pcs.ts` | `ui/intro/kit/pcs.ts` | `68d86ca556be4c87a9a5e8fc8c5335e35c907c13` | none |
| `substation.ts` | `ui/intro/kit/substation.ts` | `ef0f6d330d0290f0b0589ef3f464506181527d92` | none |
| `fence.ts` | `ui/intro/kit/fence.ts` | `0c1dc8832d74a3101def16559bdbe525df7fa408` | none |
| `props.ts` | `ui/intro/kit/props.ts` | `ec03254db279f7f0a156371503bcdaaa4537f34c` | none |
| `flow.ts` | `ui/intro/kit/flow.ts` | `438f483ba8b2afd8f0039c57f7921224c1c1d8a3` | none |
| `pricebars.ts` | `ui/intro/kit/pricebars.ts` | `d9d7d077bcb86d9f9880223d92ceb05d18bf536b` | none |
| `chartwall.ts` | `ui/intro/kit/chartwall.ts` | `0037dc7c6768549fd80b71e55c799c03ea14ab47` | none |
| `sun.ts` | `ui/intro/kit/sun.ts` | `b2a21aa4a0c6f5e15da863e55eb2d7d0b12b9a01` | none |
| `site.ts` | `ui/intro/kit/site.ts` | `3ef88ede234b459c5f83ce0944b0520e1c5e06dc` | none (its `LAYOUT` is the intro's featured site, not a Grand Prix battery) |
| `region/geo.ts` | `ui/intro/region/geo.ts` | `22b10ed4fb75bd2520dcea681a2be06eeb2c0088` | `exactColor` from `../tone` (was `../map/kit`, which re-exports the same function) |
| `region/glass.ts` | `ui/intro/region/glass.ts` | `35acf76ce11c87db73add694a84a6a11aab42a8f` | none |
| `region/flows.ts` | `ui/intro/region/flows.ts` | `72bdce2dea2da32f0ec0e6a77cfe423f1400f5df` | none |
| `region/palette.ts` | `ui/intro/region/palette.ts` | `55b945e11f91023c3cf979a38c77d120f325684a` | none |
| `hedge/fields.ts` | `tabs/hedge/walkthrough/fields.ts` | `f7d4ec277aba6d169377cf03c594d79abfadb54a` | `OVERLAY` from `../stage` (was the region stage's, the same constant, 1); `lin` from `../region/geo`; `PATH_HE` inlined from the walkthrough's `data.ts` (`{ fromHe: 17, toHe: 24, smooth: 10 }`) |
| `css/glass.css` | `ui/glass.css`, lines 1-71 | `215db68fdba20319ed100c29a6c46380f9cbf312` | extracted; a header comment |
| `css/plates.css` | `ui/intro/intro.css`, lines 132-165; `tabs/hedge/walkthrough/walkthrough.css`, lines 7-26, 33-46, 64-125 | `6d97e7af443fb529b237eb2f8e9b9a40f35a2c92`; `16e9e42f5d9f497a76dc9c0ba3cd3d60bbe03904` | extracted; a header comment |
| `css/fonts.css` | `skins/wattness.css`, lines 23-29 | `0b94b8c796570f577f3c85139f9a124c9ffc8699` | the font's URL; a header comment |
| `fonts/librefranklin-100-900-latin.woff2` | `assets/fonts/librefranklin-100-900-latin.woff2` | `3dcdb6f183e39b0cc9dc1a31973ec5764aff2404` | none |
| `fonts/OFL.txt` | the SIL Open Font License 1.1 as distributed with Libre Franklin | | none |

What the world adds sits outside this folder: `src/lib/stage.ts` creates the stage with a preserved drawing buffer, a
4200 m ground disc and shader checks on, without editing `stage.ts`; `src/lib/tokens.css` defines the theme tokens the
stylesheets here read.

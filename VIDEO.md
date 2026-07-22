# ScanProof — video script and shot list

**Target 4:35–4:45.** Word counts assume ~150 wpm narration. Timings below are cumulative and
have ~10 s of slack built in.

**Before recording:** `make preflight` (warms inference, verifies every case, confirms the
narrative beats), then `make serve`. Browser at **1920×1080**, zoom 100%, tab bar hidden if
possible. The whole demo is local — no network calls.

> **Disclaimer must be legible in the first shot and stated aloud once.** It is fixed to the top
> of every screen: *research prototype — not for diagnosis.*

---

## Shot list

| # | Time | Duration | Screen | Action |
|---|---|---|---|---|
| 1 | 0:00 | 0:20 | Analyze · *Stable pneumonia call* | Static. Cursor still. |
| 2 | 0:20 | 0:35 | Same, scrolled to stability sweep | Slow scroll down, pause on sweep |
| 3 | 0:55 | 0:45 | Analyze · *Confident but fragile* | Click case 2; scroll to sweep; hover a crossing point |
| 4 | 1:40 | 0:55 | Analyze · *Adult film* | Click case 3; hold on the four checks |
| 5 | 2:35 | 0:50 | Audit · deployment test | Click Audit; hold on divergence chart |
| 6 | 3:25 | 0:25 | Audit · confound control | Scroll to control panel |
| 7 | 3:50 | 0:30 | Audit · two-regime scatter | Scroll to scatter |
| 8 | 4:20 | 0:20 | Analyze · *Confidently wrong — missed* | Click last case in deck |
| 9 | 4:40 | 0:05 | Audit top / repo | Hold on disclaimer |

---

## Script

### Shot 1 — 0:00–0:20 · The premise (48 words)

> "This is a chest X-ray classifier. It says pneumonia, 99.9% confident.
>
> On the right is ScanProof. It's a deployment guardrail — four independent checks that decide
> whether this prediction should be relied on. All four clear, so: PASS.
>
> Research prototype, not for diagnosis. That banner stays up the whole time."

**Direction:** do not move the cursor. Let the two-panel contrast — *the classifier says* versus
*ScanProof says* — sit on screen. This is the 20 seconds that has to land.

### Shot 2 — 0:20–0:55 · What a check looks like (52 words)

> "Each check names its own measurement. Typicality: 11th percentile of the training
> distribution. Stability: zero of twenty-one perturbations changed the label.
>
> That's the stability check — brightness, contrast, blur, rotation. Twenty-one variants, none of
> which change what's on the film. The dashed line is the decision boundary. Nothing moves."

**Direction:** slow scroll to the sweep. Pause 3 s on the seven flat traces.

### Shot 3 — 0:55–1:40 · Confidence is not reliability (72 words)

> "Second case. The classifier says normal, ninety percent confident.
>
> ScanProof blocks it. Two of four checks failed, and stability is the one at the top: five of
> twenty-one perturbations flipped the label.
>
> Here's what that means. A gamma change — a windowing difference no radiologist would report
> differently — and the trace crosses the decision boundary. The model changes its answer about
> an image whose findings did not change.
>
> Ninety percent confident. Not reliable."

**Direction:** click *Confident but fragile*. Scroll to sweep. Hover one crossing point so the
tooltip shows the flip.

### Shot 4 — 1:40–2:35 · The deployment test, on one case (85 words)

> "Third case, and this is the one that matters.
>
> This is an adult chest X-ray from the NIH Clinical Center. Our model was fine-tuned on
> pediatric films — ages one to five — from a hospital in Guangzhou. Same modality, same
> projection, completely different patients.
>
> Ninety-nine point nine percent confident.
>
> Look at the checks. Confidence: full marks. Stability: full marks. Agreement: full marks.
> Typicality: one point nine out of fifteen. Ninety-eight point eight percentile of the training
> distribution.
>
> One check noticed. That's the whole argument for running four."

**Direction:** click *Adult film — confident, and off-distribution*. Do not scroll — the four
checks, worst-first, are already in frame. Hold 4 s on the red typicality row.

### Shot 5 — 2:35–3:25 · At scale (80 words)

> "That's one image. Here it is across four populations, ordered by distance from the training
> data.
>
> Red is the model's confidence. It's flat — ninety-four percent on pediatric films, eighty-six
> on adult films, and it goes back *up* to ninety-six on breast ultrasound, which isn't a chest
> X-ray at all.
>
> Green is ScanProof's pass rate. Sixty-two percent, down to four point eight, down to zero point
> six.
>
> All three of those numbers are label-free. No ground truth required."

**Direction:** click Audit. The divergence chart is the hero — hold on it. Do not rush.

### Shot 6 — 3:25–3:50 · The confound (48 words)

> "The obvious objection: the adult images are resampled differently, so maybe you're measuring
> JPEG artifacts.
>
> So there's a control arm. The pediatric films go through the adult set's exact resampling path.
> Pass rate moves by one point. Accuracy by one point. It's the population, not the pixels."

**Direction:** scroll to the confound-control panel. Point at the four delta values.

### Shot 7 — 3:50–4:20 · What we're not claiming (56 words)

> "And the result that went against us. On in-distribution data, plain confidence is a *better*
> error ranker than our composite score. We print that.
>
> Under margins we fixed before running the study, no signal clears both regimes — including
> ours. Confidence wins one axis. Embedding distance wins the other. Neither is safe alone."

**Direction:** scroll to the two-regime scatter. Let the "Reported as found" amber panel be
readable.

### Shot 8 — 4:20–4:40 · Honest limits (44 words)

> "Last case. The model is wrong, and ScanProof passes it anyway. It's in the shipped deck on
> purpose.
>
> PASS means no check found a reason to withhold. It does not mean correct. Eight of three
> hundred eighty-one passed cases are still wrong."

**Direction:** click *Confidently wrong — missed* in the deck.

### Shot 9 — 4:40–4:45 · Close (18 words)

> "Everything you saw is generated by two scripts over held-out data, and committed to the repo.
> Thanks."

---

## Recording notes

- **Do not** narrate the reliability score. The verdict and the four checks are the product; the
  0–100 number is a ranking convenience and drawing attention to it invites the wrong question.
- **Do** say "guardrail," not "reliability score."
- If a case is slow, you did not run `make preflight` — the first inference warms the kernels.
- Median live analysis is 83 ms; the slowest observed is under 0.5 s. No loading spinners should
  appear.

## Fallback if something breaks mid-record

The header shows `cached only` if weights fail to load. Every demo case still renders from its
committed result. Say: *"that's the offline fallback — the deck ships with cached results so the
demo can't depend on a GPU."* Then continue; nothing else changes.

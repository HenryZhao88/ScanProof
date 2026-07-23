# ScanProof — voiceover script

**Runtime 4:30.** ~560 words at ~140 wpm, plus deliberate pauses where the visuals carry.
Timecodes match the Remotion composition in `src/`.

The disclosure appears on the end card only; it is not burned into every frame. Say the
closing line over it.

Delivery notes: flat, factual, unhurried. This is an engineering result, not an ad — the numbers
are the persuasion. Land hard on the three bolded figures and let the frame sit after each.
Never rush the pause at 2:12.

---

### 0:00 — 0:22 · Cold open

> This is a chest X-ray classifier. It is ninety-nine point nine percent confident this patient
> has pneumonia.
>
> *(beat)*
>
> It has also never seen a patient like this before — and it has no way to tell you that. A
> softmax over two classes is normalised over those two classes. There is no output that means
> "I don't recognise this input."

### 0:22 — 0:52 · What ScanProof is

> ScanProof is a deployment guardrail. It sits in front of the model and runs four independent
> checks on every prediction.
>
> Typicality — has the model seen inputs like this. Stability — does the answer survive harmless
> changes. Agreement — do independently trained models concur. And confidence.
>
> The output is a decision — pass, review, or block — and the measurement behind it.

### 0:52 — 1:38 · Confidence is not reliability

> Here is why one number is not enough.
>
> This film is called normal, at ninety percent confidence. We change the gamma — a windowing
> difference no radiologist would report differently.
>
> The model changes its answer. **Five of twenty-one** label-preserving perturbations flip the
> label. Nothing about the finding on the film changed.
>
> Ninety percent confident. Not reliable. ScanProof blocks it and names the exact test that
> broke.

### 1:38 — 2:45 · The deployment test

> Now the failure that actually ends deployments.
>
> This model was fine-tuned on pediatric chest films from one hospital in Guangzhou. Here it is
> running on adult films from the NIH Clinical Center — same modality, same projection,
> completely different patients.
>
> Watch the model first. Confidence goes from ninety-three point six percent to eighty-six.
> It barely moves. On breast ultrasound — not a chest X-ray at all — it climbs back to ninety-six.
>
> *(pause — let the divergence land)*
>
> Now the guardrail. The typicality check goes from the fiftieth percentile of the training
> distribution to the **ninety-eighth**. Our pass rate falls from sixty-two percent to
> **four point eight**.
>
> Neither of those numbers needs a ground-truth label. They are properties of the input and the
> model.

### 2:45 — 3:08 · The confound control

> The obvious objection is resolution — the adult set ships at a different size.
>
> So there is a control arm: the pediatric films, put through the adult set's exact resampling
> path. Pass rate moves by one point. Accuracy by one point.
>
> It is the population, not the pixels.

### 3:08 — 3:52 · Why four checks

> One more, because a good judge will ask it.
>
> Confidence is the best in-distribution error ranker we measured. Embedding distance is the best
> shift detector. Neither is good at both — and we publish that, including the regime where our
> own composite loses.
>
> That is the case for four checks rather than a favourite. Different failures trip different
> wires. Here, typicality caught it alone. On the fragile film a moment ago, stability did.

### 3:52 — 4:16 · How it was built

> Every number you have seen was produced by two scripts over held-out data and committed to the
> repository.
>
> Thresholds were frozen on a validation split before the test split or any shift arm was scored.
> Public benchmark data throughout, CC BY 4.0.
>
> Ninety tests. Thirty-two preflight checks that re-run every demo case live and diff it against
> the committed result.

### 4:16 — 4:30 · Close

> ScanProof. Four checks, one decision, and the evidence behind it.
>
> *(beat — the three stamps land, then the disclosure line appears)*
>
> Research prototype — not for diagnosis.

---

## Numbers spoken aloud — verify against `artifacts/` before recording

| Spoken | Value | Source |
|---|---|---|
| classifier confidence, adult film | 99.9% | `demo_cases/manifest.json` → `shift-adult-confident` |
| fragile case confidence | 90% | `confident-but-fragile` |
| perturbation flips | 5 of 21 | same |
| pediatric → adult confidence | 93.6% → 86.0% | `shift_study.json` arms |
| ultrasound confidence | 95.8% | `wrong_modality` arm |
| embedding percentile | 50.1 → 98.4 | `shift_study.json` arms |
| pass rate | 62.0% → 4.8% | `shift_study.json` arms |
| control deltas | ~1 point each | `resolution_control` |
| tests / preflight | 90 / 32 | `pytest`, `scanproof.preflight` |

`pytest tests/test_claims.py` fails if the repo documentation drifts from these.

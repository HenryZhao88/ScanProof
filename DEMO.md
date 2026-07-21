# ScanProof — five-minute demo script

> Run `make preflight` first. It verifies every asset, re-analyses all demo cases live and
> checks them against the committed cache, and refuses to pass if the narrative beats have
> changed. Then `make serve` and open `http://127.0.0.1:8000`.
>
> **Nothing in this demo touches the network.** Fonts are bundled, the API and the UI are one
> process, and every model and dataset asset is local.

---

## The one-sentence pitch

> A chest X-ray classifier tells you *how confident* it is. It cannot tell you whether it has
> ever seen anything like the image you just gave it. ScanProof measures the second thing.

---

## 0:00 — 0:30 · The problem, on one case

**Analyze tab, first case in the deck: "Stable pneumonia call".**

- Point at the two panels side by side: **"the classifier says"** and **"ScanProof says"**.
- "Same image, two different questions. The model is 99.9% confident. ScanProof scores it
  100 out of 100 and passes it — and it will show you why."
- Scroll to the **stability sweep**. Seven perturbation families, three severities, the dashed
  line is the decision boundary. Every trace is flat and high.

> "This is what earned confidence looks like. Now watch one that isn't."

## 0:30 — 1:30 · Confidence is not reliability

**Case 2: "Confident but fragile".**

- The classifier says **NORMAL at 90.1%**. ScanProof says **BLOCK, 46.5 / 100**.
- Scroll to the sweep. Traces cross the boundary. "A 90% gamma change is not a different
  X-ray — no radiologist would report it differently. The model changes its answer anyway."
- Scroll to the **evidence ledger**. Read one line aloud verbatim, e.g.
  *"Prediction flips under Gamma / windowing γ 1.90."*

> "Every point deducted is attributable to a named measurement. Nothing here is a vibe."

## 1:30 — 3:00 · The deployment test (the core of the submission)

**Case 3: "Adult film — confident, and off-distribution".**

- "This is an adult chest X-ray from the NIH Clinical Center. Our model was fine-tuned on
  *pediatric* films from a hospital in Guangzhou. Same modality, same view, same question."
- The classifier gives it a confident answer. ScanProof withholds it, and the evidence ledger
  names the reason: the embedding sits at an extreme percentile of the training distribution.

**Switch to the Audit tab. Headline panel: "the deployment test".**

This is the moment to slow down. Point at the divergence chart:

- **Red line — model confidence — is flat** across all four populations.
- **Green line — ScanProof PASS rate — falls off a cliff.**
- "Left to right is distance from the training data. The model's confidence does not move.
  Its accuracy does. That gap is the entire problem."

Then the **confound control** panel directly below:

> "The obvious objection is that the adult images are resampled differently. So the pediatric
> films are run through the *identical* resampling path as a control arm. The two pediatric
> rows agree. This measures population, not image processing."

## 3:00 — 4:00 · Why a composite score, not just one signal

**Scroll to "No single signal is acceptable in both regimes".**

The scatter is the argument:

- **Model confidence** — top-left. Best in-distribution error ranker. At chance for shift.
- **Embedding percentile** — bottom-right. Excellent at shift. Poor in-distribution.
- **ScanProof composite** — the only point in the shaded corner.

> "A deployed system gets one number. Two different things can go wrong. Confidence handles
> one of them and is blind to the other. That is the argument for a composite, and it is the
> reason we didn't just ship the best single signal."

Mention the honest negative result on the way past:

> "On in-distribution data alone, confidence beats our composite at ranking errors — 0.0126
> against 0.0175 AURC. That's in the audit, labelled as a negative result. We're not claiming
> to beat confidence at the thing confidence is already good at."

## 4:00 — 4:40 · It is honest about its own limits

**Back to Analyze. Last two cases in the deck.**

- **"Confidently wrong — missed"** — the model is wrong, and ScanProof passes it anyway.
- **"Adult film — passed anyway"** — a shifted input that clears every check.

> "ScanProof narrows exposure. It does not eliminate it. Both of these are in the shipped deck
> on purpose, and the audit prints how many errors still reach PASS."

## 4:40 — 5:00 · Close

- "Everything on the audit page was computed by `python -m scanproof.evaluate` and
  `python -m scanproof.shift` over held-out data. Thresholds were frozen on a validation split
  before the test split was touched. The artifacts are in the repo."
- "Research prototype, not a diagnostic tool — that banner is on every screen and never
  dismissible."

---

## If something goes wrong

| Symptom | Fix |
|---|---|
| Header shows `cached only` | Weights missing. Demo still works — every case serves its committed result. Say so; it's a designed fallback. |
| A case is slow the first time | First inference warms the MPS/CUDA kernels. `make preflight` pre-warms it; run it before recording. |
| Audit tab shows a skeleton | `artifacts/shift_study.json` missing — run `make shift`. |
| Upload button is disabled | Same as `cached only`. Use the deck. |

## Questions judges are likely to ask

**"Isn't the ultrasound result trivial?"**
Yes, and that's why it's the fourth arm, not the headline. The headline is adult-vs-pediatric
chest films — same modality, the shift that actually happens in deployment.

**"Did you tune anything on the test set?"**
No. Thresholds are selected on the pediatric validation split by `scanproof.evaluate` and
written to `artifacts/reliability_config.json` before `scanproof.shift` runs. The shift study
re-tunes nothing.

**"How good are the adult labels?"**
ChestX-ray14 labels are NLP-mined from radiology reports and are known to be noisy, so the
accuracy figure on that arm is indicative rather than a clean benchmark. The headline claims
don't depend on it: the confidence-stays-flat and PASS-rate-collapses results need no labels
at all.

**"Why not just use the embedding distance alone?"**
That's the two-regime scatter. It's the best shift detector and it's poor at ranking ordinary
hard cases. Neither signal is safe alone.

**"Is this a medical device?"**
No. No clinical validation, no regulatory claim, no patient data — all inputs are public,
de-identified benchmark images under CC BY 4.0.

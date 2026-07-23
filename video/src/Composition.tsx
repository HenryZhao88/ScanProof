import React from "react";
import { AbsoluteFill, Composition, Sequence, useVideoConfig } from "remotion";
import { C, SCENES, TOTAL_SECONDS } from "./theme";
import { Open } from "./scenes/Open";
import { Checks } from "./scenes/Checks";
import { Fragile } from "./scenes/Fragile";
import { Deployment } from "./scenes/Deployment";
import { Close, Control, FourChecks, Rigor } from "./scenes/Rest";

const FPS = 30;

/**
 * The demo. Scene boundaries live in theme.ts and the voiceover script in
 * SCRIPT.md is written against those same timecodes, so a change in one place
 * is visible in the other.
 */
export const ScanProofDemo: React.FC = () => {
  const { fps } = useVideoConfig();
  const s = (n: number) => Math.round(n * fps);

  return (
    <AbsoluteFill style={{ backgroundColor: C.ground }}>
      <Sequence name="01 · Cold open" from={s(SCENES.open.from)} durationInFrames={s(SCENES.open.dur)}>
        <Open />
      </Sequence>
      <Sequence name="02 · Four checks" from={s(SCENES.what.from)} durationInFrames={s(SCENES.what.dur)}>
        <Checks />
      </Sequence>
      <Sequence name="03 · Confidence is not reliability" from={s(SCENES.fragile.from)} durationInFrames={s(SCENES.fragile.dur)}>
        <Fragile />
      </Sequence>
      <Sequence name="04 · The deployment test" from={s(SCENES.deployment.from)} durationInFrames={s(SCENES.deployment.dur)}>
        <Deployment />
      </Sequence>
      <Sequence name="05 · Confound control" from={s(SCENES.control.from)} durationInFrames={s(SCENES.control.dur)}>
        <Control />
      </Sequence>
      <Sequence name="06 · Why four checks" from={s(SCENES.fourChecks.from)} durationInFrames={s(SCENES.fourChecks.dur)}>
        <FourChecks />
      </Sequence>
      <Sequence name="07 · How it was built" from={s(SCENES.rigor.from)} durationInFrames={s(SCENES.rigor.dur)}>
        <Rigor />
      </Sequence>
      <Sequence name="08 · Close" from={s(SCENES.close.from)} durationInFrames={s(SCENES.close.dur)}>
        <Close />
      </Sequence>
    </AbsoluteFill>
  );
};

export const MyComposition = () => (
  <Composition
    id="ScanProofDemo"
    component={ScanProofDemo}
    durationInFrames={TOTAL_SECONDS * FPS}
    fps={FPS}
    width={1920}
    height={1080}
  />
);

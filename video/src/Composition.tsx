import React from "react";
import { AbsoluteFill, Composition, Sequence } from "remotion";
import { Audio } from "@remotion/media";
import { staticFile } from "remotion";
import { C } from "./theme";
import { FPS, SCENES, TOTAL_FRAMES, type Scene } from "./timeline";
import { Hook, LabelFree, Problem, Stake } from "./scenes/Beats";
import { Checks } from "./scenes/Checks";
import { Fragile } from "./scenes/Fragile";
import { Deployment } from "./scenes/Deployment";
import { Close, Control, FourChecks, Rigor } from "./scenes/Rest";

const BODY: Record<string, React.FC> = {
  stake: Stake,
  hook: Hook,
  problem: Problem,
  checks: Checks,
  fragile: Fragile,
  deployment: Deployment,
  labelFree: LabelFree,
  control: Control,
  whyFour: FourChecks,
  rigor: Rigor,
  close: Close,
};

/**
 * Eleven beats, laid out from the measured narration in src/vo.json. Each scene
 * carries its own audio so a re-recorded line moves its scene and nothing else.
 */
const Act: React.FC<{ scene: Scene }> = ({ scene }) => {
  const Body = BODY[scene.key];
  return (
    <Sequence
      name={`${scene.key}`}
      from={scene.from}
      durationInFrames={scene.durationInFrames}
    >
      <Body />
      {scene.audio.map((a, i) => (
        <Sequence key={i} from={a.at} durationInFrames={a.durationInFrames}>
          <Audio src={staticFile(a.file)} />
        </Sequence>
      ))}
    </Sequence>
  );
};

export const ScanProofDemo: React.FC = () => (
  <AbsoluteFill style={{ backgroundColor: C.ground }}>
    {SCENES.map((s) => (
      <Act key={s.key} scene={s} />
    ))}
  </AbsoluteFill>
);

export const MyComposition = () => (
  <Composition
    id="ScanProofDemo"
    component={ScanProofDemo}
    durationInFrames={TOTAL_FRAMES}
    fps={FPS}
    width={1920}
    height={1080}
  />
);

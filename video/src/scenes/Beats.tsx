import React from "react";
import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame } from "remotion";
import { C, F, SAFE } from "../theme";
import { Counter, Dark, EASE, SNAP, enter, Headline, Sheet } from "../parts";
import data from "../data.json";

/**
 * The three assertion beats. Each is one line of narration over near-black —
 * they punctuate the evidence scenes and give the edit somewhere to breathe
 * without going static.
 */

/** 01 · Hook. The film, and a number that has no business being that high. */
export const Hook: React.FC = () => {
  const frame = useCurrentFrame();
  const adult = data.adult;

  return (
    <AbsoluteFill style={{ backgroundColor: C.plate, overflow: "hidden" }}>
      <Img
        src={staticFile("plates/shift-adult-confident.png")}
        style={{
          position: "absolute",
          width: 1500,
          height: 1500,
          left: "50%",
          top: "50%",
          translate: "-50% -50%",
          opacity: interpolate(frame, [0, 10], [0, 0.78], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
          // never fully still
          scale: interpolate(frame, [0, 150], [1, 1.07], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }) as unknown as string,
        }}
      />
      <AbsoluteFill
        style={{
          justifyContent: "center",
          alignItems: "center",
          padding: SAFE,
          background:
            "radial-gradient(ellipse at center, rgba(11,14,17,0.30) 0%, rgba(11,14,17,0.88) 72%)",
        }}
      >
        <div style={{ textAlign: "center" }}>
          <div
            style={{
              fontFamily: F.mono,
              fontSize: 26,
              letterSpacing: "0.24em",
              textTransform: "uppercase",
              color: "rgba(255,255,255,0.5)",
              opacity: enter(frame, 4),
            }}
          >
            Chest X-ray classifier
          </div>

          <div style={{ marginTop: 30 }}>
            <Counter
              from={0}
              to={adult.confidence * 100}
              at={12}
              dur={16}
              suffix="%"
              size={230}
              color="#ffffff"
            />
          </div>

          <div
            style={{
              marginTop: 6,
              fontFamily: F.display,
              fontSize: 54,
              fontWeight: 600,
              color: "rgba(255,255,255,0.86)",
              letterSpacing: "-0.02em",
              opacity: enter(frame, 34),
            }}
          >
            confident this patient has pneumonia
          </div>

          <div
            style={{
              marginTop: 52,
              fontFamily: F.display,
              fontSize: 46,
              fontWeight: 700,
              color: "#ff6b6b",
              letterSpacing: "-0.02em",
              opacity: enter(frame, 74),
              translate: `0px ${interpolate(frame, [74, 84], [16, 0], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
                easing: EASE,
              })}px`,
            }}
          >
            It has never seen a patient like this.
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/** 02 · Why confidence cannot help. Two boxes, and the missing third. */
export const Problem: React.FC = () => {
  const frame = useCurrentFrame();
  const boxes = [
    { label: "PNEUMONIA", v: "0.999" },
    { label: "NORMAL", v: "0.001" },
  ];

  return (
    <Sheet slug="Why confidence cannot help">
      <AbsoluteFill style={{ padding: "150px 120px", justifyContent: "center" }}>
        <Headline size={72} style={{ maxWidth: 1500, opacity: enter(frame, 0) }}>
          A softmax has two outputs.
        </Headline>

        <div style={{ display: "flex", gap: 28, marginTop: 54 }}>
          {boxes.map((b, i) => (
            <div
              key={b.label}
              style={{
                border: `2px solid ${C.ink}`,
                backgroundColor: C.sheet,
                padding: "30px 54px",
                minWidth: 380,
                opacity: enter(frame, 26 + i * 8),
                scale: interpolate(frame, [26 + i * 8, 34 + i * 8], [0.92, 1], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                  easing: SNAP,
                }) as unknown as string,
              }}
            >
              <div
                style={{
                  fontFamily: F.display,
                  fontSize: 22,
                  fontWeight: 600,
                  letterSpacing: "0.1em",
                  color: C.faint,
                }}
              >
                {b.label}
              </div>
              <div style={{ fontFamily: F.mono, fontSize: 62, marginTop: 8, color: C.ink }}>
                {b.v}
              </div>
            </div>
          ))}

          {/* the one it does not have */}
          <div
            style={{
              border: `2px dashed ${C.blockInk}`,
              padding: "30px 54px",
              minWidth: 520,
              opacity: enter(frame, 92),
              scale: interpolate(frame, [92, 101], [0.9, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
                easing: SNAP,
              }) as unknown as string,
            }}
          >
            <div
              style={{
                fontFamily: F.display,
                fontSize: 22,
                fontWeight: 600,
                letterSpacing: "0.1em",
                color: C.blockInk,
              }}
            >
              NO SUCH OUTPUT
            </div>
            <div
              style={{
                fontFamily: F.display,
                fontSize: 34,
                marginTop: 10,
                color: C.blockInk,
                fontStyle: "italic",
              }}
            >
              “I don’t recognise this input.”
            </div>
          </div>
        </div>

        <div
          style={{
            marginTop: 56,
            fontFamily: F.display,
            fontSize: 34,
            color: C.graphite,
            maxWidth: 1400,
            opacity: enter(frame, 120),
          }}
        >
          The two probabilities are normalised to sum to one — no matter what you feed it.
        </div>
      </AbsoluteFill>
    </Sheet>
  );
};

/** 03 · Title. */
export const Title: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <Dark>
      <div style={{ textAlign: "center" }}>
        <div
          style={{
            fontFamily: F.display,
            fontSize: 168,
            fontWeight: 700,
            letterSpacing: "-0.045em",
            color: "#ffffff",
            opacity: enter(frame, 2, 6),
            scale: interpolate(frame, [2, 12], [0.94, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: SNAP,
            }) as unknown as string,
          }}
        >
          ScanProof
        </div>
        <div
          style={{
            marginTop: 20,
            height: 3,
            backgroundColor: "#ffffff",
            opacity: 0.35,
            width: interpolate(frame, [14, 32], [0, 760], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: EASE,
            }),
            marginLeft: "auto",
            marginRight: "auto",
          }}
        />
        <div
          style={{
            marginTop: 26,
            fontFamily: F.display,
            fontSize: 42,
            fontWeight: 500,
            color: "rgba(255,255,255,0.8)",
            opacity: enter(frame, 30),
          }}
        >
          A deployment guardrail for medical imaging models
        </div>
      </div>
    </Dark>
  );
};

/** 07 · The label-free assertion, mid-roll. */
export const LabelFree: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <Dark>
      <div style={{ textAlign: "center", maxWidth: 1500 }}>
        <div
          style={{
            fontFamily: F.display,
            fontSize: 86,
            fontWeight: 700,
            letterSpacing: "-0.035em",
            lineHeight: 1.12,
            color: "#ffffff",
            opacity: enter(frame, 2, 6),
            translate: `0px ${interpolate(frame, [2, 12], [18, 0], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: EASE,
            })}px`,
          }}
        >
          Neither number needs a label.
        </div>
        <div
          style={{
            marginTop: 26,
            fontFamily: F.display,
            fontSize: 40,
            color: "rgba(255,255,255,0.7)",
            opacity: enter(frame, 26),
          }}
        >
          Both are properties of the input and the model.
        </div>
      </div>
    </Dark>
  );
};

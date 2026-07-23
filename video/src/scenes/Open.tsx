import React from "react";
import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from "remotion";
import { C, F, SAFE } from "../theme";
import { Counter, EASE, Headline, Plate, Sheet } from "../parts";
import data from "../data.json";

/**
 * Cold open. The film fills the frame and the confidence lands on it — then the
 * frame pulls back to reveal what the model was actually looking at.
 *
 * The reveal is the whole point of the scene, so nothing else moves during it.
 */
export const Open: React.FC = () => {
  const frame = useCurrentFrame();
  const adult = data.adult;

  // The plate starts large and settles left as the copy arrives.
  const plateX = interpolate(frame, [290, 340], [430, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE,
  });
  const plateSize = interpolate(frame, [290, 340], [620, 430], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE,
  });

  return (
    <Sheet>
      <AbsoluteFill
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 90,
          padding: `0 ${SAFE}px`,
        }}
      >
        <div style={{ translate: `${plateX}px 0px` }}>
          <Plate src="shift-adult-confident.png" size={plateSize} />
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          {/* the classifier's claim */}
          <div
            style={{
              opacity: interpolate(frame, [18, 34], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
                easing: EASE,
              }),
            }}
          >
            <div
              style={{
                fontFamily: F.display,
                fontSize: 22,
                fontWeight: 600,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: C.faint,
              }}
            >
              Chest X-ray classifier
            </div>
            <Headline size={104} style={{ marginTop: 14 }}>
              PNEUMONIA
            </Headline>
            <div style={{ marginTop: 18 }}>
              <Counter
                from={0}
                to={adult.confidence * 100}
                at={30}
                dur={26}
                suffix="% confident"
                size={92}
                color={C.ink}
              />
            </div>
          </div>

          {/* the reveal */}
          <div
            style={{
              marginTop: 46,
              maxWidth: 900,
              opacity: interpolate(frame, [345, 380], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
                easing: EASE,
              }),
              translate: `0px ${interpolate(frame, [345, 380], [22, 0], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
                easing: EASE,
              })}px`,
            }}
          >
            <div
              style={{
                borderLeft: `4px solid ${C.blockInk}`,
                paddingLeft: 26,
              }}
            >
              <div
                style={{
                  fontFamily: F.display,
                  fontSize: 46,
                  fontWeight: 600,
                  lineHeight: 1.28,
                  color: C.ink,
                  letterSpacing: "-0.015em",
                }}
              >
                It has never seen a patient like this before.
              </div>
              <div
                style={{
                  marginTop: 20,
                  fontFamily: F.display,
                  fontSize: 32,
                  lineHeight: 1.45,
                  color: C.graphite,
                }}
              >
                A softmax over two classes is normalised over those two classes. There is no
                output that means <em>“I don’t recognise this input.”</em>
              </div>
            </div>
          </div>
        </div>
      </AbsoluteFill>

      {/* a hairline wipes across as the reveal lands */}
      <div
        style={{
          position: "absolute",
          left: SAFE,
          bottom: 172,
          height: 2,
          backgroundColor: C.ink,
          width: interpolate(frame, [350, 420], [0, 1680], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.22, 1, 0.3, 1),
          }),
        }}
      />
    </Sheet>
  );
};

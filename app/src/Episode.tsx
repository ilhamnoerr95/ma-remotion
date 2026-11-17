import React from "react";
import {
  AbsoluteFill,
  Html5Audio,
  Img,
  Sequence,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

export type Scene = {
  id: string;
  text: string;
  image: string | null; // path relative to public/. null = draft text card
  audio: string | null; // path relative to public/. null = silent (not generated yet)
  duration: number; // seconds of narration
};

export type EpisodeProps = {
  scenes: Scene[];
  padding: number; // seconds of silence after each narration
  music: { src: string; volume: number } | null;
};

export const CROSSFADE_FRAMES = 10;

export const sceneFrames = (scene: Scene, padding: number, fps: number) =>
  Math.max(1, Math.ceil((scene.duration + padding) * fps));

export const totalFrames = (props: EpisodeProps, fps: number) =>
  props.scenes.reduce((sum, s) => sum + sceneFrames(s, props.padding, fps), 0);

const SceneVisual: React.FC<{ scene: Scene; index: number; frames: number }> = ({ scene, index, frames }) => {
  const frame = useCurrentFrame();
  const opacity = index === 0 ? 1 : interpolate(frame, [0, CROSSFADE_FRAMES], [0, 1], { extrapolateRight: "clamp" });
  const zoomIn = index % 2 === 0;
  const scale = interpolate(frame, [0, frames], zoomIn ? [1, 1.08] : [1.08, 1], { extrapolateRight: "clamp" });

  if (!scene.image) {
    return (
      <AbsoluteFill style={{ backgroundColor: "#1c1916", justifyContent: "center", alignItems: "center", opacity }}>
        <div style={{ color: "#e9dfc8", fontFamily: "serif", fontSize: 54, maxWidth: 1400, textAlign: "center", lineHeight: 1.4 }}>
          {scene.text}
        </div>
      </AbsoluteFill>
    );
  }
  return (
    <AbsoluteFill style={{ opacity, overflow: "hidden", backgroundColor: "#000" }}>
      <Img src={staticFile(scene.image)} style={{ width: "100%", height: "100%", objectFit: "cover", transform: `scale(${scale})` }} />
    </AbsoluteFill>
  );
};

export const Episode: React.FC<EpisodeProps> = ({ scenes, padding, music }) => {
  const { fps, durationInFrames } = useVideoConfig();
  let start = 0;
  const items = scenes.map((scene, index) => {
    const frames = sceneFrames(scene, padding, fps);
    const item = { scene, index, frames, start };
    start += frames;
    return item;
  });

  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      {items.map(({ scene, index, frames, start: from }) => (
        <React.Fragment key={scene.id}>
          {/* Visual runs CROSSFADE_FRAMES past its slot so the next scene fades in on top of it. */}
          <Sequence from={from} durationInFrames={frames + CROSSFADE_FRAMES} layout="none">
            <SceneVisual scene={scene} index={index} frames={frames + CROSSFADE_FRAMES} />
          </Sequence>
          {scene.audio ? (
            <Sequence from={from} durationInFrames={frames} layout="none">
              <Html5Audio src={staticFile(scene.audio)} />
            </Sequence>
          ) : null}
        </React.Fragment>
      ))}
      {music ? (
        <Html5Audio
          src={staticFile(music.src)}
          loop
          volume={(f) =>
            music.volume *
            interpolate(f, [0, 60, durationInFrames - 90, durationInFrames], [0, 1, 1, 0], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            })
          }
        />
      ) : null}
    </AbsoluteFill>
  );
};

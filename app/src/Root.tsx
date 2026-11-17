import React from "react";
import { Composition } from "remotion";
import { Episode, EpisodeProps, totalFrames } from "./Episode";
import ep1 from "./episodes/ep1.json";

type EpisodeFile = EpisodeProps & { fps: number; width: number; height: number };

const registerEpisode = (id: string, file: EpisodeFile) => (
  <Composition
    id={id}
    component={Episode}
    durationInFrames={Math.max(1, totalFrames(file, file.fps))}
    fps={file.fps}
    width={file.width}
    height={file.height}
    defaultProps={{ scenes: file.scenes, padding: file.padding, music: file.music }}
    calculateMetadata={({ props }) => ({ durationInFrames: Math.max(1, totalFrames(props, file.fps)) })}
  />
);

export const RemotionRoot: React.FC = () => {
  return <>{registerEpisode("Episode1", ep1 as EpisodeFile)}</>;
};

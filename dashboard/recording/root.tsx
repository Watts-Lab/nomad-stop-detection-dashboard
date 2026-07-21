import { Composition } from "remotion"
import { HomePreview, calculateHomePreviewMetadata } from "./home-preview"

export function RecordingRoot() {
  return (
    <Composition
      id="HomePreview"
      component={HomePreview}
      durationInFrames={1}
      fps={30}
      width={640}
      height={360}
      calculateMetadata={calculateHomePreviewMetadata}
    />
  )
}

import { staticFile } from "remotion"

export function publicPath(path: string) {
  return staticFile(path)
}

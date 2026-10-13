/*
BUILD CORRECT PATH TO FILES IN public DIRECTORY
*/

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? ""

export function publicPath(path: string) {
  return `${basePath}${path}`
}

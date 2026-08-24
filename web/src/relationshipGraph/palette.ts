export type RgbTuple = [number, number, number]

export type ScenePalette = {
  clearColor: [number, number, number, number]
  fogColor: RgbTuple
  nodeColors: Record<string, RgbTuple>
  edgeColors: Record<string, RgbTuple>
}

export const SCENE_PALETTE: Record<'dark' | 'light', ScenePalette> = {
  dark: {
    clearColor: [0.089, 0.107, 0.13, 1],
    fogColor: [0.089, 0.107, 0.13],
    nodeColors: {
      center: [232, 198, 126],
      verse: [241, 212, 146],
      person: [188, 172, 136],
      place: [170, 151, 110],
      theme: [220, 193, 134],
      originalWord: [199, 184, 126],
      topic: [210, 174, 108],
      doctrine: [232, 204, 150],
      related: [220, 191, 127],
      echo: [188, 172, 136],
      ambient: [170, 151, 110],
      userWaypoint: [199, 184, 126],
      event: [188, 172, 136],
      book: [241, 212, 146],
      chapter: [199, 184, 126],
      strong: [220, 191, 127],
      medium: [195, 162, 101],
      soft: [167, 132, 74],
    },
    edgeColors: {
      crossReference: [232, 204, 150],
      theme: [210, 174, 108],
      bridge: [232, 204, 150],
      spoke: [158, 126, 74],
    },
  },
  light: {
    clearColor: [0.993, 0.973, 0.938, 1],
    fogColor: [0.993, 0.973, 0.938],
    nodeColors: {
      center: [72, 43, 8],
      verse: [94, 56, 10],
      person: [58, 47, 28],
      place: [84, 63, 31],
      theme: [78, 54, 18],
      originalWord: [62, 46, 22],
      topic: [112, 78, 30],
      doctrine: [144, 104, 46],
      related: [92, 65, 27],
      echo: [58, 47, 28],
      ambient: [84, 63, 31],
      userWaypoint: [62, 46, 22],
      event: [58, 47, 28],
      book: [94, 56, 10],
      chapter: [62, 46, 22],
      strong: [92, 65, 27],
      medium: [77, 56, 24],
      soft: [58, 41, 18],
    },
    edgeColors: {
      crossReference: [144, 104, 46],
      theme: [112, 78, 30],
      bridge: [144, 104, 46],
      spoke: [84, 62, 28],
    },
  },
}

export const LYRIC_CONCEPTS = {
  heart: {
    body: ["heart", "hearts", "pulse", "heartbeats", "hands"],
    feeling: ["love", "grace", "sweet", "glow"],
    motion: ["pull", "rise", "drift"],
  },
  jellyfish: {
    creature: ["jellyfish"],
    sea: ["sea", "ocean", "tides", "waves", "breeze"],
    image: ["glimmer", "glow", "blue", "moonlight", "drift"],
    texture: ["soft", "glass"],
  },
  sea: {
    water: ["sea", "ocean", "tides", "waves", "breeze", "deep"],
    motion: ["drift", "swell", "surge", "rise"],
    light: ["glimmer", "moonlight", "blue"],
  },
  love: {
    body: ["heart", "hearts", "hands", "heartbeats"],
    feeling: ["sweet", "grace", "glow"],
    season: ["june", "summer"],
  },
  city: {
    sight: ["city", "lights", "streets", "screens", "neon"],
    energy: ["glow", "shine", "crowds", "clubs"],
  },
  summer: {
    season: ["summer", "june", "sweet", "breeze"],
    coast: ["sea", "tides", "waves"],
    light: ["golden", "sunlight", "glimmer"],
  },
};

export function conceptMembers(root) {
  const concept = LYRIC_CONCEPTS[root];
  if (!concept) {
    return [];
  }

  return [...new Set(Object.values(concept).flat())];
}

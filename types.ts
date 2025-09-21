export enum AppState {
  INITIAL,
  IMAGE_UPLOADED,
  ANALYZING,
  ANALYZED,
  GENERATING,
  COMPLETE,
  ERROR
}

export type FaceShape = "Oval" | "Round" | "Square" | "Heart" | "Diamond" | "Unknown";

export interface HairstyleSuggestion {
  name: string;
  description: string;
}

export interface AnalysisResult {
  faceShape: FaceShape;
  originalHairLength: string;
  hairstyles: HairstyleSuggestion[];
}

export type HaircutPreference = "Rapikan" | "Sedang" | "Pendek";

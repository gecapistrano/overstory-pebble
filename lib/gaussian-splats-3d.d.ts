/** Minimal typings for the parts of @mkkellogg/gaussian-splats-3d that ExteriorView uses (the package ships none). */
declare module "@mkkellogg/gaussian-splats-3d" {
  export const SceneFormat: { Splat: number; KSplat: number; Ply: number; Spz: number };
  export const SceneRevealMode: { Default: number; Gradual: number; Instant: number };
  export const LogLevel: { None: number; Error: number; Warning: number; Info: number; Debug: number };
  export class Viewer {
    constructor(options: Record<string, unknown>);
    addSplatScene(path: string, options?: { format?: number; showLoadingUI?: boolean; progressiveLoad?: boolean; onProgress?: (percent: number, label?: string, stage?: number) => void }): Promise<void>;
    start(): void;
    dispose(): Promise<void>;
  }
}

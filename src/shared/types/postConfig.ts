export type Vector3<T = number> = {
  x: T;
  y: T;
  z: T;
};

export type RGB = {
  r: number;
  g: number;
  b: number;
};

/**
 * Block configuration =====================================================================
 */
export type BlockBaseConfig = {
  /** Hex‑style color string, e.g. "0x333344" */
  color: string;
  scale: Vector3;
};

export type BlockColorsConfig = {
  /** Base color (RGB channel values 0‑255) */
  base: RGB;
  /** Random range added to base (RGB channel values 0‑255) */
  range: RGB;
  /** Per‑channel intensity multiplier (0‑1 floats)
   *  NOTE: The key is spelt ‘intensity’ in the source JSON and is preserved here.
   */
  intensity: RGB;
};

export type BlockConfig = {
  /** Uniform block dimensions & color */
  base: BlockBaseConfig;
  /** Per‑instance color variation */
  colors: BlockColorsConfig;
};

/**
 * Gameplay configuration =================================================================
 */
export type SpeedConfig = {
  min: number;
  max: number;
  multiplier: number;
};

export type GameplayConfig = {
  distance: number;
  speed: SpeedConfig;
  accuracy: number;
};

/**
 * Instructions configuration ===============================================================
 */
export type InstructionsConfig = {
  height: number;
};

/**
 * Camera configuration ====================================================================
 */
export type CameraConfig = {
  near: number;
  far: number;
  viewSize: number;
  position: Vector3;
  lookAt: Vector3;
  offset: number;
};

/**
 * Background configuration =================================================================
 */
export type BackgroundConfig = {
  color: string;
};

/**
 * Light configuration ======================================================================
 */
export type DirectionalLightConfig = {
  color: string;
  intensity: number;
  position: Vector3;
};

export type AmbientLightConfig = {
  color: string;
  intensity: number;
  position: Vector3;
};

export type LightConfig = {
  directional: DirectionalLightConfig;
  ambient: AmbientLightConfig;
};

/**
 * Root config object =======================================================================
 */
export type PostConfig = {
  block: BlockConfig;
  gameplay: GameplayConfig;
  instructions: InstructionsConfig;
  camera: CameraConfig;
  background: BackgroundConfig;
  light: LightConfig;
};

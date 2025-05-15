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
  gameplay: GameplayConfig;
  instructions: InstructionsConfig;
  camera: CameraConfig;
  background: BackgroundConfig;
  light: LightConfig;
};

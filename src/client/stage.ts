import { Easing, Tween } from '@tweenjs/tween.js';
import type { PostConfig } from '../shared/types/postConfig';

export class Stage {
  private container: HTMLElement;
  private scene: any; // THREE.Scene
  private renderer!: any; // THREE.WebGLRenderer
  public camera!: any; // THREE.OrthographicCamera

  private config: PostConfig;
  private THREE: any;

  constructor(config: PostConfig, devicePixelRatio: number, THREE: any) {
    this.config = config;
    this.THREE = THREE;
    this.container = document.getElementById('game') as HTMLElement;
    this.scene = new this.THREE.Scene();

    this.setupRenderer(devicePixelRatio);
    this.setupCamera();
    this.setupDirectionalLight();
    this.setupAmbientLight();
  }

  public render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  public resize(width: number, height: number): void {
    const aspect = width / height;
    const { viewSize } = this.config.camera;
    this.camera.left = -viewSize * aspect;
    this.camera.right = viewSize * aspect;
    this.camera.top = viewSize;
    this.camera.bottom = -viewSize;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  public add(object: any /* THREE.Object3D */): void {
    this.scene.add(object);
  }

  public remove(object: any /* THREE.Object3D */): void {
    this.scene.remove(object);
  }

  public removeMeshesByType(type: string): void {
    const meshesToRemove = this.scene.children.filter(
      (child: any) => child.userData.type === type && child instanceof this.THREE.Object3D
    );
    meshesToRemove.forEach((mesh: any) => this.scene.remove(mesh));
  }

  private setupRenderer(devicePixelRatio: number): void {
    this.renderer = new this.THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
    });
    this.renderer.setPixelRatio(devicePixelRatio);
    this.renderer.setClearColor(parseInt(this.config.background.color, 16), 1);
    this.container.appendChild(this.renderer.domElement);
  }

  private setupCamera(): void {
    const { near, far, position, lookAt, offset } = this.config.camera;
    this.camera = new this.THREE.OrthographicCamera();
    this.camera.near = near;
    this.camera.far = far;
    this.camera.position.set(position.x, position.y, position.z);
    this.camera.lookAt(lookAt.x, lookAt.y, lookAt.z);
    this.camera.position.y += offset;
  }

  private setupDirectionalLight(): void {
    const { color, intensity, position } = this.config.light.directional;
    const directionalLight = new this.THREE.DirectionalLight(parseInt(color, 16), intensity);
    directionalLight.position.set(position.x, position.y, position.z);
    this.add(directionalLight);
  }

  private setupAmbientLight(): void {
    const { color, intensity, position } = this.config.light.ambient;
    const ambientLight = new this.THREE.AmbientLight(parseInt(color, 16), intensity);
    ambientLight.position.set(position.x, position.y, position.z);
    this.add(ambientLight);
  }

  public setCamera(y: number): void {
    new Tween(this.camera.position)
      .to({ y: y + this.config.camera.offset }, 300)
      .easing(Easing.Cubic.Out)
      .start();
  }

  public resetCamera(duration: number): void {
    const { position, offset } = this.config.camera;
    new Tween(this.camera.position)
      .to({ y: position.y + offset }, duration)
      .easing(Easing.Cubic.Out)
      .start();
  }

  public getCamera(): any /* THREE.OrthographicCamera */ {
    return this.camera;
  }
}

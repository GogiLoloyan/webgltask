import { FC, createContext, PropsWithChildren, useState, useContext, useEffect } from "react";
import { makeObservable, observable } from "mobx";
import * as THREE from 'three';

import { OrbitControls } from "../utils/OrbitControls";
import { OBJLoader } from "../utils/OBJLoader";
import { MTLLoader } from "../utils/MTLLoader";

const RESOURCES = {
    bottom: {
        OBJ: 'model/couch-bottom.obj',
        MTL: 'model/couch-bottom.mtl'
    },
    sideLeft: {
        OBJ: 'model/couch-side-left.obj',
        MTL: 'model/couch-side-left.mtl'
    },
    sideRight: {
        OBJ: 'model/couch-side-right.obj',
        MTL: 'model/couch-side-right.mtl'
    },
    back: {
        OBJ: 'model/couch-back.obj',
        MTL: 'model/couch-back.mtl'
    },
    seatLeft: {
        OBJ: 'model/couch-seat-left.obj',
        MTL: 'model/couch-seat-left.mtl'
    },
    seatRight: {
        OBJ: 'model/couch-seat-right.obj',
        MTL: 'model/couch-seat-right.mtl'
    },
    pillowLeft: {
        OBJ: 'model/couch-pillow-left.obj',
        MTL: 'model/couch-pillow-left.mtl'
    },
    pillowRight: {
        OBJ: 'model/couch-pillow-right.obj',
        MTL: 'model/couch-pillow-right.mtl'
    },
    base: {
        OBJ: 'model/base.obj',
        MTL: 'model/base.mtl'
    }
}

type CouchStoreConfigs = {
    CANVAS_WIDTH: number;
    CANVAS_HEIGHT: number;
    materialTextureURL: string;
    woodTextureURL: string;
}

class CouchStore {
    scene!: THREE.Scene;
    camera!: THREE.PerspectiveCamera;
    controls!: OrbitControls;
    renderer!: THREE.WebGLRenderer;

    configs: CouchStoreConfigs;
    defaultConfigs: CouchStoreConfigs = {
        CANVAS_WIDTH: 800,
        CANVAS_HEIGHT: 800,
        materialTextureURL: "img/dana@2x.jpg",
        woodTextureURL: "img/blonde@2x.jpg",
    }

    isMounted = false;
    @observable isCouchActive = false;

    constructor(_configs: Partial<CouchStoreConfigs> = {}) {
        this.configs = Object.assign(this.defaultConfigs, _configs);

        makeObservable(this);

        this.animate = this.animate.bind(this)
    }

    mount(containerId: string) {
        if (this.isMounted) {
            return;
        }
        this.isMounted = true;
        this.init(containerId);
        this.animate();
        window.addEventListener('resize', this.onWindowResize, false);
        this.onWindowResize()
    }

    init(containerId: string) {
        this.scene = new THREE.Scene();
        this.scene.fog = new THREE.FogExp2(0xFFFFFF, 0);

        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setClearColor(this.scene.fog.color);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.setSize(this.configs.CANVAS_WIDTH, this.configs.CANVAS_HEIGHT);

        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.BasicShadowMap;

        const container = document.getElementById(containerId) as Element;
        container.appendChild(this.renderer.domElement);

        this.camera = new THREE.PerspectiveCamera(50, this.configs.CANVAS_WIDTH / this.configs.CANVAS_HEIGHT, 1, 1000);
        this.camera.position.z = 50;
        this.camera.position.y = 20;
        this.camera.position.x = -20;

        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        // controls.addEventListener( 'change', render ); // remove when using animation loop
        // enable animation loop when using damping or autorotation
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.25;
        this.controls.autoRotate = true;
        this.controls.enableZoom = true;
        this.controls.minDistance = 100;
        this.controls.maxDistance = 1000;
        this.controls.minPolarAngle = 0; // radians
        this.controls.maxPolarAngle = Math.PI; // radians
        this.controls.maxPolarAngle = Math.PI / 2;


        this.#initLight();
        this.#initFloorObject();
    }

    #initLight() {
        this.scene.add(new THREE.AmbientLight(0xffffff, .7));

        const light = new THREE.DirectionalLight(0xffffff, .7);
        light.position.set(50, 50, 0);
        light.position.multiplyScalar(1);
        light.castShadow = true;
        light.shadow.mapSize.width = 200;
        light.shadow.mapSize.height = 200;
        this.scene.add(light);
    }

    #initFloorObject() {
        const geometryPlane = new THREE.PlaneGeometry(100, 100, 100, 100);
        const geo = new THREE.EdgesGeometry(geometryPlane);
        const planeMaterial = new THREE.MeshPhongMaterial({
            color: 0xa0adaf,
            shininess: 1,
            specular: 0x111111,
            side: THREE.DoubleSide,
        });

        const planeMesh = new THREE.Mesh(geometryPlane, planeMaterial);
        planeMesh.rotation.x = -90 * Math.PI / 180;
        planeMesh.position.y = 0;
        planeMesh.receiveShadow = true;
        this.scene.add(planeMesh);
    }

    showCouch() {
        if (this.isCouchActive) {
            return
        }
        this.isCouchActive = true;
        this.loadCouch();
        this.loadCouchBase()
    }

    setMaterialTexture(url: string) {
        if (url === this.configs.materialTextureURL) { return false }
        this.configs.materialTextureURL = url;
        this.loadCouch()
        return true
    }

    setWoodTexture(url: string) {
        if (url === this.configs.woodTextureURL) { return false }
        this.configs.woodTextureURL = url;
        this.loadCouchBase()
        return true
    }

    toggleAutoRotate(flag?: boolean) {
        this.controls.autoRotate = flag ?? !this.controls.autoRotate;
    }

    loadCouch() {
        // --- model bottom
        const bottomTexture = new THREE.Texture();

        const bottomLoader = new OBJLoader();
        bottomLoader.load(RESOURCES.bottom.OBJ, (object: any) => {
            object.traverse((child: any) => {
                if (child instanceof THREE.Mesh) {
                    child.material.map = bottomTexture;
                }
            });
            object.position.set(0, 0, 0);
            object.scale.set(10, 10, 10);
            object.receiveShadow = true;
            object.castShadow = true;
            this.scene.add(object);
        });

        const bottomTextureLoader = new THREE.ImageLoader();
        bottomTextureLoader.load(this.configs.materialTextureURL, (image: any) => {
            bottomTexture.image = image;
            bottomTexture.needsUpdate = true;
            bottomTexture.repeat.set(1, 1);
            bottomTexture.wrapS = THREE.RepeatWrapping;
            bottomTexture.wrapT = THREE.RepeatWrapping;
            bottomTexture.offset.x = 0.7;
        });

        this.#loadCouchPartMTL(RESOURCES.bottom.MTL)

        // --- model side left
        const sideLeftTexture = new THREE.Texture();

        const sideLeftLoader = new OBJLoader();
        sideLeftLoader.load(RESOURCES.sideLeft.OBJ, (object: any) => {
            object.traverse(function (child: any) {
                if (child instanceof THREE.Mesh) {
                    child.material.map = sideLeftTexture;
                }
            });
            object.position.set(0, 0, 0);
            object.scale.set(10, 10, 10);
            object.castShadow = true;
            object.receiveShadow = true;
            this.scene.add(object);
        });

        const sideLeftTextureLoader = new THREE.ImageLoader();
        sideLeftTextureLoader.load(this.configs.materialTextureURL, function (image: any) {
            sideLeftTexture.image = image;
            sideLeftTexture.needsUpdate = true;
            sideLeftTexture.repeat.set(1, 1);
            sideLeftTexture.wrapS = THREE.RepeatWrapping;
            sideLeftTexture.wrapT = THREE.RepeatWrapping;
            sideLeftTexture.offset.x = 0.7;
        });

        this.#loadCouchPartMTL(RESOURCES.sideLeft.MTL)

        // --- model side right
        const sideRightTexture = new THREE.Texture();

        const sideRightLoader = new OBJLoader();
        sideRightLoader.load(RESOURCES.sideRight.OBJ, (object: any) => {
            object.traverse(function (child: any) {
                if (child instanceof THREE.Mesh) {
                    child.material.map = sideRightTexture;
                }
            });
            object.position.set(0, 0, 0);
            object.scale.set(10, 10, 10);
            object.castShadow = true;
            object.receiveShadow = true;
            this.scene.add(object);
        });

        const sideRightTextureLoader = new THREE.ImageLoader();
        sideRightTextureLoader.load(this.configs.materialTextureURL, function (image: any) {
            sideRightTexture.image = image;
            sideRightTexture.needsUpdate = true;
            sideRightTexture.repeat.set(1, 1);
            sideRightTexture.wrapS = THREE.RepeatWrapping;
            sideRightTexture.wrapT = THREE.RepeatWrapping;
        });

        this.#loadCouchPartMTL(RESOURCES.sideRight.MTL)

        // --- model back
        const backTexture = new THREE.Texture();

        const backLoader = new OBJLoader();
        backLoader.load(RESOURCES.back.OBJ, (object: any) => {
            object.traverse(function (child: any) {
                if (child instanceof THREE.Mesh) {
                    child.material.map = backTexture;
                }
            });
            object.position.set(0, 0, 0);
            object.scale.set(10, 10, 10);
            object.castShadow = true;
            object.receiveShadow = true;
            this.scene.add(object);
        });

        const backTextureLoader = new THREE.ImageLoader();
        backTextureLoader.load(this.configs.materialTextureURL, function (image: any) {
            backTexture.image = image;
            backTexture.needsUpdate = true;
            backTexture.repeat.set(1, 1);
            backTexture.wrapS = THREE.RepeatWrapping;
            backTexture.wrapT = THREE.RepeatWrapping;
        });

        this.#loadCouchPartMTL(RESOURCES.back.MTL)

        // --- model seat left
        const seatLeftTexture = new THREE.Texture();

        const seatLeftLoader = new OBJLoader();
        seatLeftLoader.load(RESOURCES.seatLeft.OBJ, (object: any) => {
            object.traverse(function (child: any) {
                if (child instanceof THREE.Mesh) {
                    child.material.map = seatLeftTexture;
                }
            });
            object.position.set(0, 0, 0);
            object.scale.set(10, 10, 10);
            object.castShadow = true;
            object.receiveShadow = true;
            this.scene.add(object);
        });


        const seatLeftTextureLoader = new THREE.ImageLoader();
        seatLeftTextureLoader.load(this.configs.materialTextureURL, function (image: any) {
            seatLeftTexture.image = image;
            seatLeftTexture.needsUpdate = true;
            seatLeftTexture.repeat.set(1, 1);
            seatLeftTexture.wrapS = THREE.RepeatWrapping;
            seatLeftTexture.wrapT = THREE.RepeatWrapping;
        });

        this.#loadCouchPartMTL(RESOURCES.seatLeft.MTL)

        // --- model seat right
        const seatRightTexture = new THREE.Texture();

        const seatRightLoader = new OBJLoader();
        seatRightLoader.load(RESOURCES.seatRight.OBJ, (object: any) => {
            object.traverse(function (child: any) {
                if (child instanceof THREE.Mesh) {
                    child.material.map = seatRightTexture;
                }
            });
            object.position.set(0, 0, 0);
            object.scale.set(10, 10, 10);
            object.castShadow = true;
            object.receiveShadow = true;
            this.scene.add(object);
        });

        const seatRightTextureLoader = new THREE.ImageLoader();
        seatRightTextureLoader.load(this.configs.materialTextureURL, function (image: any) {
            seatRightTexture.image = image;
            seatRightTexture.needsUpdate = true;
            seatRightTexture.repeat.set(1, 1);
            seatRightTexture.wrapS = THREE.RepeatWrapping;
            seatRightTexture.wrapT = THREE.RepeatWrapping;
            seatRightTexture.offset.y = 0.7;
        });

        this.#loadCouchPartMTL(RESOURCES.seatRight.MTL)

        // --- model pillow right
        const pillowRightTexture = new THREE.Texture();

        const pillowRightLoader = new OBJLoader();
        pillowRightLoader.load(RESOURCES.pillowRight.OBJ, (object: any) => {
            object.traverse(function (child: any) {
                if (child instanceof THREE.Mesh) {
                    child.material.map = pillowRightTexture;
                }
            });
            object.position.set(0, 0, 0);
            object.scale.set(10, 10, 10);
            object.castShadow = true;
            object.receiveShadow = true;
            this.scene.add(object);
        });


        const pillowRightTextureLoader = new THREE.ImageLoader();
        pillowRightTextureLoader.load(this.configs.materialTextureURL, function (image: any) {
            pillowRightTexture.image = image;
            pillowRightTexture.needsUpdate = true;
            pillowRightTexture.repeat.set(1, 1);
            pillowRightTexture.wrapS = THREE.RepeatWrapping;
            pillowRightTexture.wrapT = THREE.RepeatWrapping;
            pillowRightTexture.offset.y = 0.7;
        });

        this.#loadCouchPartMTL(RESOURCES.pillowRight.MTL)

        // --- model pillow left
        const pillowLeftTexture = new THREE.Texture();

        const pillowLeftLoader = new OBJLoader();
        pillowLeftLoader.load(RESOURCES.pillowLeft.OBJ, (object: any) => {
            object.traverse(function (child: any) {
                if (child instanceof THREE.Mesh) {
                    child.material.map = pillowLeftTexture;
                }
            });
            object.position.set(0, 0, 0);
            object.scale.set(10, 10, 10);
            object.castShadow = true;
            object.receiveShadow = true;
            this.scene.add(object);
        });

        const pillowLeftTextureLoader = new THREE.ImageLoader();
        pillowLeftTextureLoader.load(this.configs.materialTextureURL, function (image: any) {
            pillowLeftTexture.image = image;
            pillowLeftTexture.needsUpdate = true;
            pillowLeftTexture.repeat.set(1, 1);
            pillowLeftTexture.wrapS = THREE.RepeatWrapping;
            pillowLeftTexture.wrapT = THREE.RepeatWrapping;
        });

        this.#loadCouchPartMTL(RESOURCES.pillowLeft.MTL);
    }

    loadCouchBase() {
        // model base
        const baseTexture = new THREE.Texture();

        const baseObjectLoader = new OBJLoader();
        baseObjectLoader.load(RESOURCES.base.OBJ, (object: any) => {
            object.traverse(function (child: any) {
                if (child instanceof THREE.Mesh) {
                    child.material.map = baseTexture;
                }
            });
            object.position.set(0, 0, -1);
            object.scale.set(10, 10, 10);
            this.scene.add(object);
        });

        const baseTextureLoader = new THREE.ImageLoader();
        baseTextureLoader.load(this.configs.woodTextureURL, function (image: any) {
            baseTexture.image = image;
            baseTexture.needsUpdate = true;
            baseTexture.repeat.set(.02, .08);
            // baseTexture.scale.set(.05, .05);
            baseTexture.wrapS = THREE.RepeatWrapping;
            baseTexture.wrapT = THREE.RepeatWrapping;
        });

        this.#loadCouchPartMTL(RESOURCES.base.MTL)
    }

    #loadCouchPartMTL(url: string) {
        const mtlLoader = new MTLLoader();
        mtlLoader.setPath('/');
        mtlLoader.load(url);
    }

    onWindowResize = () => {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    animate() {
        requestAnimationFrame(this.animate);
        // @ts-ignore
        // if (this.controls.AutoRotate) {
        //     this.controls.autoRotate = true;
        // }
        this.controls.update();
        this.render();
    }

    render() {
        this.renderer.render(this.scene, this.camera);
    }
}

const CouchContext = createContext(null as unknown as CouchStore);

export const CouchContextProvider: FC<PropsWithChildren & { containerId: string }> = ({ children, containerId }) => {
    const [store] = useState(() => new CouchStore());

    useEffect(() => {
        store.mount(containerId);
    }, [containerId])

    return <CouchContext.Provider value={store}>{children}</CouchContext.Provider>
}

export const useCouchStore = () => useContext(CouchContext);

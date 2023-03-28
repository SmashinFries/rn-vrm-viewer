import React, { useEffect, useState } from 'react';
import { CheckBox } from 'react-native-web';
import { VRM, VRMExpressionPresetName, VRMLoaderPlugin, VRMMeta, VRMUtils } from '@pixiv/three-vrm';
import { ExpoWebGLRenderingContext, GLView } from 'expo-gl';
import { Renderer } from 'expo-three';
import { Button, Platform, View, Text } from 'react-native';
import {
    AnimationAction,
    AnimationMixer,
    Clock,
    LoopOnce,
    Mesh,
    MeshLambertMaterial,
    Object3D,
    PerspectiveCamera,
    Scene,
    Vector3,
} from 'three';
import {
    createText,
    setupCamera,
    setupLighting,
    setupLookAtTarget,
    setupSkybox,
} from '../utils/vrm';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { loadMixamoAnimation } from '../utils/animation';
import { Asset, useAssets } from 'expo-asset';
import { Heading } from './components/heading';
import { LoadingModel } from './components/loading';
import { Font, FontLoader } from 'three/examples/jsm/loaders/FontLoader';
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry';
import HelvBold from 'three/examples/fonts/helvetiker_bold.typeface.json';

// declare global stuff
let currentVrm: VRM;
let currentMixer: AnimationMixer;
let font: Font;

type ExpressionsObj = {
    name: VRMExpressionPresetName;
    duration: number; // in milliseconds
};
const expressions: ExpressionsObj[] = [
    {
        name: 'angry',
        duration: 3000,
    },
    {
        name: 'happy',
        duration: 2000,
    },
    {
        name: 'sad',
        duration: 1000,
    },
    {
        name: 'surprised',
        duration: 10000,
    },
    {
        name: 'relaxed',
        duration: 1000,
    },
    {
        name: 'blink',
        duration: 500,
    },
    {
        name: 'blinkLeft',
        duration: 500,
    },
    {
        name: 'blinkRight',
        duration: 500,
    },
];
const animation_list = [
    {
        anim_id: 1,
        anim: 'angry',
        emote: expressions[0].name,
        time: expressions[0].duration,
    },
    {
        anim_id: 2,
        anim: 'Happy',
        emote: expressions[1].name,
        time: expressions[1].duration,
    },
    {
        anim_id: 4,
        anim: 'Surprised',
        emote: expressions[3].name,
        time: expressions[3].duration,
    },
];

export const VRMAvatar = () => {
    // GL State
    const [gl, setGl] = useState<ExpoWebGLRenderingContext>(null);

    // Loading States
    const [loading, setLoading] = useState<boolean>(true);

    // Three.js States
    const [gltfLoader, setGltfLoader] = useState<GLTFLoader>(null);
    const [scene, setScene] = useState<Scene>(null);
    const [camera, setCamera] = useState<PerspectiveCamera>(null);
    const [text3d, setText3d] = useState<Mesh<TextGeometry, MeshLambertMaterial>>();

    // VRM States
    const [lookAtTarget, setLookAtTarget] = useState<Object3D>();
    const [activeLookAt, setActiveLookAt] = useState<boolean>(true);
    const [meta, setMeta] = useState<VRMMeta>();

    // Model State
    const [currentModel, setCurrentModel] = useState<string>();
    const [additionalModels, setAdditionalModels] = useState<Asset[]>([]);

    // Animation States
    const [idleAction, setIdleAction] = useState<AnimationAction>();
    const [happyAction, setHappyAction] = useState<AnimationAction>();
    const [surprisedAction, setSurprisedAction] = useState<AnimationAction>();
    const [angryAction, setAngryAction] = useState<AnimationAction>();

    const animemotes: object = {
        neutral: idleAction,
        happy: happyAction,
        surprised: surprisedAction,
        angry: angryAction,
    };

    // Local Assets
    const [models] = useAssets([
        require('../../assets/vrm/default.vrm'),
        require('../../assets/vrm/default2.vrm'),
    ]);

    const [animations] = useAssets([
        require('../../assets/animations/Idle.fbx'),
        require('../../assets/animations/Happy.fbx'),
        require('../../assets/animations/Surprised.fbx'),
        require('../../assets/animations/Angry.fbx'),
    ]);

    const [daylightSkybox] = useAssets([
        require('../../assets/skybox/daylight/Front.png'),
        require('../../assets/skybox/daylight/Back.png'),
        require('../../assets/skybox/daylight/Top.png'),
        require('../../assets/skybox/daylight/Bottom.png'),
        require('../../assets/skybox/daylight/Left.png'),
        require('../../assets/skybox/daylight/Right.png'),
    ]);

    // useEffect Hell... I must be missing something. Theres gotta be a better way

    // updates state of currentModel when models are loaded
    useEffect(() => {
        if (models) {
            setCurrentModel(models[0].localUri);
        }
    }, [models]);

    // updates 3D text when meta is updated
    useEffect(() => {
        if (currentModel && scene) {
            // let displayText = currentModel?.split('/').pop().split('.')[0];
            let displayText = Asset.fromURI(currentModel).name;
            console.log('currentModel', currentModel);
            // add text mesh to scene
            if (text3d) {
                scene.remove(text3d);
            }
            if (meta?.metaVersion === '0' && meta?.title) {
                displayText = meta?.title;
            } else if (meta?.metaVersion === '1' && meta?.name) {
                displayText = meta?.name;
            }

            const textMesh = createText(font, displayText, 'silver');
            setText3d(textMesh);
            scene.add(textMesh);
            textMesh.position.set(0, 4, -16);
        }
    }, [meta, scene]);

    // adds web events: mousemovements and file drops
    useEffect(() => {
        if (Platform.OS === 'web' && gltfLoader) {
            if (lookAtTarget) {
                window.addEventListener('mousemove', (event) => {
                    lookAtTarget.position.x =
                        10.0 * ((event.clientX - 0.5 * window.innerWidth) / window.innerHeight);
                    lookAtTarget.position.y =
                        -10.0 * ((event.clientY - 0.5 * window.innerHeight) / window.innerHeight);
                });
            }

            window.addEventListener('dragover', function (event) {
                event.preventDefault();
            });

            // Causes the file to load many times for some reason
            window.addEventListener('drop', function (event) {
                event.preventDefault();

                // read given file then convert it to blob url
                const files = event.dataTransfer.files;
                if (!files) return;

                const file = files[0];
                if (!file) return;

                const fileType = file.name.split('.').pop();
                const blob = new Blob([file], { type: 'application/octet-stream' });
                const url = URL.createObjectURL(blob);

                if (fileType === 'fbx') {
                    console.log('Loading FBX file...');
                    console.log('URL: ', url);
                    // Load animation
                    loadMixamoAnimation(url, currentVrm).then((clip) => {
                        // Apply the loaded animation to mixer and play
                        currentMixer.clipAction(clip).loop = LoopOnce;
                        currentMixer.clipAction(clip).play();
                        this.setTimeout(() => {
                            currentMixer.stopAllAction();
                            idleAction.play();
                        }, clip.duration);
                    });
                } else if (fileType === 'vrm') {
                    console.log('Loading VRM file...');
                    console.log('URL: ', url.replace('blob:', ''));
                    const asset = Asset.fromModule(url);
                    asset.downloadAsync().then((asset) => {
                        setAdditionalModels((prev) => !prev.includes(asset) && [...prev, asset]);
                    });
                    console.log(asset);
                    loadModel(url, gltfLoader, scene, camera);
                }
            });
        }
    }, [gltfLoader]);

    // Functions

    /**
     * Called when GL context is built. This is the heart of the 3D magic.
     * @param gl ExpoWebGLRenderingContext
     */
    const onContextCreate = async (gl: ExpoWebGLRenderingContext) => {
        // let currentVrm:VRM;
        // let currentMixer:AnimationMixer;

        // three.js scene
        const scene = new Scene();
        setScene(scene);

        // three.js skybox
        setupSkybox(scene, daylightSkybox);

        // three.js render
        const renderer = new Renderer({ gl });
        renderer.setSize(gl.drawingBufferWidth, gl.drawingBufferHeight);

        // three.js camera
        const camera = setupCamera(gl, scene);
        setCamera(camera);

        // three.js lighting
        setupLighting(gl, scene);

        // lookat target
        const lookAtTarget = setupLookAtTarget(camera);
        setLookAtTarget(lookAtTarget);

        font = new FontLoader().parse(HelvBold);

        // gltf and vrm
        // load vrm model
        const loader = new GLTFLoader();
        setGltfLoader(loader);
        loader.crossOrigin = 'anonymous';

        loader.register((parser) => {
            return new VRMLoaderPlugin(parser, { autoUpdateHumanBones: true });
        });

        loadModel(currentModel, loader, scene, camera, lookAtTarget);

        // create render function
        const clock = new Clock();
        clock.start();

        const render = () => {
            requestAnimationFrame(render);
            const delta = clock.getDelta();
            if (currentVrm) {
                currentVrm.update(delta);
            }
            if (currentMixer) {
                // アニメーションが読み込まれていれば
                currentMixer.update(delta); // アニメーションをアップデート
            }
            renderer.render(scene, camera);
            gl.endFrameEXP();
        };

        // call render
        render();
        setGl(gl);
    };

    /**
     * Triggers a specified expression
     * @param emote the emote to trigger
     * @param time the duration of the emote
     */
    const makeEmote = async (emote: VRMExpressionPresetName, time = 2000) => {
        // const s = Math.sin(Math.PI * clock.elapsedTime);
        // expression && currentVrm.expressionManager.setValue( expression, 0.5 + 0.5 * s );
        currentVrm.expressionManager.setValue(emote, 0.5 + 0.5 * (Math.PI * 3));
        setTimeout(() => {
            // After time, cancel expression
            currentVrm.expressionManager.setValue(emote, 0);
        }, time); // 1000 milliseconds = 1 seconds
    };

    /**
     * Toggles the cursor follow mode. Might creep you out so I made this for you :)
     * @param gl ExpoWebGLRenderingContext
     */
    const toggleLookAtTarget = () => {
        if (currentVrm.lookAt.target === null) {
            currentVrm.lookAt.target = lookAtTarget;
            setActiveLookAt(true);
        } else {
            currentVrm.lookAt.target = null;
            currentVrm.lookAt.reset(); // need to reset eye position or she will look down till reenabled
            setActiveLookAt(false);
        }
    };

    /**
     * Just a dumb test to demonstrate emote sequences \0-0/
     * No idea how to sync mouth movements with audio(TTS) yet.
     */
    const speakTest = async () => {
        currentVrm.expressionManager.setValue('aa', 0.5);
        setTimeout(() => {
            currentVrm.expressionManager.setValue('aa', 0);
            currentVrm.expressionManager.setValue('ee', 0.5);
            setTimeout(() => {
                currentVrm.expressionManager.setValue('ee', 0);
                currentVrm.expressionManager.setValue('ii', 0.5);
                setTimeout(() => {
                    currentVrm.expressionManager.setValue('ii', 0);
                    currentVrm.expressionManager.setValue('oh', 0.5);
                    setTimeout(() => {
                        currentVrm.expressionManager.setValue('oh', 0);
                        currentVrm.expressionManager.setValue('ou', 0.5);
                        setTimeout(() => {
                            currentVrm.expressionManager.setValue('ou', 0);
                        }, 300);
                    }, 500);
                }, 300);
            }, 500);
        }, 500);
    };

    /**
     * Loads animations from Mixamo and stores them in a state. This is just to lower code repetition.
     */
    const loadAnimations = () => {
        loadMixamoAnimation(animations[0].localUri, currentVrm).then((clip) => {
            // Apply the loaded animation to mixer and play
            setIdleAction(currentMixer.clipAction(clip));
            currentMixer.clipAction(clip).play();
        });
        // Happy
        loadMixamoAnimation(animations[1].localUri, currentVrm).then((clip) => {
            // Apply the loaded animation to mixer and play
            setHappyAction(currentMixer.clipAction(clip));
        });
        // Surprised
        loadMixamoAnimation(animations[2].localUri, currentVrm).then((clip) => {
            // Apply the loaded animation to mixer and play
            setSurprisedAction(currentMixer.clipAction(clip));
        });
        // Angry
        loadMixamoAnimation(animations[3].localUri, currentVrm).then((clip) => {
            // Apply the loaded animation to mixer and play
            setAngryAction(currentMixer.clipAction(clip));
        });
    };

    /**
     * Switches the model to the specified uri.
     * @param model_uri the uri of the model
     */
    const loadModel = (
        model_uri: string,
        gltfloader: GLTFLoader = gltfLoader,
        scene_alt: Scene = scene,
        camera_alt: PerspectiveCamera = camera,
        lookAtTarget_alt: Object3D = lookAtTarget,
    ) => {
        setCurrentModel(model_uri);
        console.log('switching model to', model_uri);
        if (gltfloader) {
            setLoading(true);
            // Shamelessly stole some code from the examples in the three-vrm repo :)
            gltfloader.load(
                model_uri,
                (gltf) => {
                    const vrm: VRM = gltf.userData.vrm;
                    const meta: VRMMeta = gltf.userData.vrmMeta;
                    setMeta(meta);
                    // calling these functions greatly improves the performance
                    VRMUtils.removeUnnecessaryVertices(gltf.scene);
                    VRMUtils.removeUnnecessaryJoints(gltf.scene);

                    if (currentVrm) {
                        console.log('removing current vrm');
                        scene_alt.remove(currentVrm.scene);
                        VRMUtils.deepDispose(currentVrm.scene);
                    }

                    // vrm.scene.rotateY(Math.PI);
                    // camera.lookAt( vrm.humanoid.humanBones.head.node.position );
                    currentVrm = vrm;
                    scene_alt.add(vrm.scene);

                    // Disable frustum culling
                    vrm.scene.traverse((obj) => {
                        // obj.rotateY(90);
                        obj.frustumCulled = false;
                    });

                    currentMixer = new AnimationMixer(currentVrm.scene);
                    // Load animation
                    loadAnimations();

                    VRMUtils.rotateVRM0(vrm);
                    const head = vrm.humanoid.getNormalizedBoneNode('head'); // vrmの頭を参照する
                    camera_alt.position.set(0.0, head.getWorldPosition(new Vector3()).y, 1.3); // カメラを頭が中心に来るように動かす
                    setLoading(false);
                    console.log(vrm);
                    if (lookAtTarget_alt) {
                        vrm.lookAt.target = lookAtTarget_alt;
                    }
                },
                (xhr) => {
                    console.log((xhr.loaded / xhr.total) * 100 + '% loaded');
                },
                (error) => {
                    console.log('An error happened', error);
                },
            );
        } else {
            console.log('gltfLoader not loaded');
        }
    };

    /**
     * Plays the emote with its corresponding animation.
     * Not sure how to blend the animation like: idle -> emote -> idle
     *
     * *Note*: emoteTime might be useless unless theres an input that can be used.
     * @param emote the emote to play
     * @param emoteTime the duration the emote should play for
     */
    const playAnim = (emote: VRMExpressionPresetName = null, emoteTime = null) => {
        const newAnim: AnimationAction = animemotes[emote];
        console.log('Before New Anim:', idleAction.isRunning());
        makeEmote(emote, emoteTime);
        newAnim.play();
        idleAction.crossFadeTo(newAnim, 0.25, false);
        setTimeout(() => {
            currentMixer.stopAllAction();
            idleAction.play();
            newAnim.crossFadeTo(idleAction, 0.25, false);
            console.log('After New Anim:', idleAction.isRunning());
        }, emoteTime);
    };

    // Dont render if the current model or skybox isnt loaded
    if (!currentModel || !daylightSkybox) {
        return null;
    }

    return (
        <View style={{ flex: 1, width: '100%' }}>
            <View style={{ justifyContent: 'flex-start', width: '100%', height: 800 }}>
                <GLView
                    onContextCreate={onContextCreate}
                    style={{
                        width: '100%',
                        height: 800,
                        alignSelf: 'center',
                    }}
                />
                <View style={{ position: 'absolute', bottom: 30, left: 20 }}>
                    {meta &&
                        Object.keys(meta).map((key, index) => (
                            <Text key={index}>
                                {key}: {JSON.stringify(meta[key])}
                            </Text>
                        ))}
                </View>
                {loading ? <LoadingModel height={800} /> : null}
            </View>
            <Heading title="Models" styles={{ margin: 10 }} />
            <View style={{ padding: 15, flexDirection: 'row', justifyContent: 'center' }}>
                {models &&
                    models.map((asset, idx) => (
                        <View key={idx} style={{ paddingHorizontal: 15 }}>
                            <Button
                                title={`${asset.name.split('.')[0]}`}
                                onPress={() => loadModel(models[idx].localUri)}
                            />
                        </View>
                    ))}
                {additionalModels &&
                    additionalModels.map((asset, idx) => (
                        <View key={idx} style={{ paddingHorizontal: 15 }}>
                            <Button
                                title={`${asset.name.split('.')[0]}`}
                                onPress={() => loadModel(asset.uri)}
                            />
                        </View>
                    ))}
            </View>
            <Heading title="Emotes" styles={{ margin: 10 }} />
            <View style={{ padding: 15, flexDirection: 'row', justifyContent: 'center' }}>
                {expressions.map((expression, idx) => (
                    <View key={idx} style={{ paddingHorizontal: 15 }}>
                        <Button
                            title={expression.name}
                            onPress={() => makeEmote(expression.name, expression.duration)}
                        />
                    </View>
                ))}
                <Button title="Emote: Speak" onPress={() => speakTest()} />
            </View>
            <Heading title="Animations" styles={{ margin: 10 }} />
            <View style={{ padding: 15, flexDirection: 'row', justifyContent: 'center' }}>
                {animations
                    ? animation_list.map((anim, idx) => (
                          <View key={idx} style={{ paddingHorizontal: 15 }}>
                              <Button
                                  title={anim.anim}
                                  onPress={() => playAnim(anim.emote, anim.time)}
                              />
                          </View>
                      ))
                    : null}
            </View>
            <Heading title="Toggle Cursor Follow" styles={{ margin: 10 }} />
            <View style={{ padding: 15, flexDirection: 'row', justifyContent: 'center' }}>
                <View style={{ paddingHorizontal: 15 }}>
                    <Button
                        title={activeLookAt ? 'Enabled' : 'Disabled'}
                        onPress={() => toggleLookAtTarget()}
                        color={activeLookAt ? 'green' : 'red'}
                    />
                    {/* <CheckBox style={{ height: 32, width: 32 }} value={activeLookAt} /> */}
                </View>
            </View>
        </View>
    );
};

 // ==================== 工具函数 ====================
        
// 从Math对象解构常用数学函数
const { PI, sin, cos } = Math;
// 完整圆周角（2π）
const TAU = 2 * PI;

/**
 * 数值映射函数：将值从一个范围映射到另一个范围
 * @param {number} value - 输入值
 * @param {number} sMin - 源范围最小值
 * @param {number} sMax - 源范围最大值
 * @param {number} dMin - 目标范围最小值
 * @param {number} dMax - 目标范围最大值
 * @returns {number} 映射后的值
 */
const map = (value, sMin, sMax, dMin, dMax) => {
    return dMin + (value - sMin) / (sMax - sMin) * (dMax - dMin);
};

/**
 * 生成随机浮点数
 * @param {number} max - 最大值
 * @param {number} min - 最小值，默认为0
 * @returns {number} 随机浮点数
 */
const rand = (max, min = 0) => min + Math.random() * (max - min);

/**
 * 生成随机整数
 * @param {number} max - 最大值
 * @param {number} min - 最小值，默认为0
 * @returns {number} 随机整数
 */
const randInt = (max, min = 0) => Math.floor(min + Math.random() * (max - min));

/**
 * 从数组中随机选择一个元素
 * @param {Array} arr - 数组
 * @returns {*} 随机选择的元素
 */
const randChoise = arr => arr[randInt(arr.length)];

/**
 * 极坐标转直角坐标
 * @param {number} ang - 角度（弧度）
 * @param {number} r - 半径，默认为1
 * @returns {Array} [x, y] 坐标数组
 */
const polar = (ang, r = 1) => [r * cos(ang), r * sin(ang)];

// ==================== 全局变量 ====================

// Three.js核心对象
let scene,          // 主场景对象（包含圣诞树、雪花、烟花等，需要泛光）
    sceneNoBloom,   // 无泛光场景对象（只包含图片，不应用泛光）
    camera,         // 相机对象
    renderer,       // 渲染器对象
    analyser;       // 音频分析器对象

// 动画步数计数器，用于雪花循环动画
let step = 0;

// 着色器统一变量：传递给GPU的全局变量
const uniforms = {
    time: { type: "f", value: 0.0 },  // 时间（浮点数）
    step: { type: "f", value: 0.0 }   // 步数（浮点数）
};

// 泛光效果参数配置
const params = {
    exposure: 1,           // 曝光度
    bloomStrength: 0.9,    // 泛光强度
    bloomThreshold: 0,     // 泛光阈值
    bloomRadius: 0.5       // 泛光半径
};

// 后处理效果合成器
let composer;           // 主合成器（渲染主场景+泛光）
let composerNoBloom;    // 无泛光合成器（渲染图片）

// 音频分析配置
const fftSize = 2048;      // FFT大小，决定频率分析的精度
const totalPoints = 6000;  // 每棵圣诞树的粒子数量（增加密度）

// 音频监听器和音频对象
const listener = new THREE.AudioListener();
const audio = new THREE.Audio(listener);

// 烟花效果相关变量
const fireworks = [];     // 存储所有烟花对象的数组
let fireworkTimer = 0;     // 烟花触发计时器
const fireworkInterval = 3000; // 烟花触发间隔（毫秒）

// 图片相关变量
let uploadedImages = [];   // 存储上传的图片
let imagePlanes = [];      // 存储3D图片平面对象（用于清理旧资源）

// 新的单张渐显/停留/渐隐循环效果
let imageCyclePlane = null;      // 当前展示的平面
let imageCycleIndex = 0;         // 当前图片索引
let imageCyclePhase = "idle";    // idle | fadeIn | hold | fadeOut
let imageCyclePhaseStart = 0;    // 当前阶段开始时间
const imageCycleConfig = {       // 时长配置（毫秒）
    fadeIn: 1400,
    hold: 2500,
    fadeOut: 1400
};

// 圣诞树尺寸配置（供图片随机定位使用）
const treeBaseY = -8;             // 树底部y坐标
const treeHeight = 35;            // 树总高度
const treeBottomRadius = 18;      // 树底半径
const treeTopRadius = 0;          // 树顶半径
const treeCenterX = 0;
const treeCenterZ = -30;

/**
 * 计算指定高度处的树半径（线性收尖）
 * @param {number} y - y坐标
 * @returns {number} 半径
 */
function getTreeRadiusAtHeightGlobal(y) {
    const normalizedY = (y - treeBaseY) / treeHeight;
    return treeBottomRadius * (1 - normalizedY) + treeTopRadius * normalizedY;
}


/**
 * 自动加载assets目录下的资源并开始体验
 */
async function autoLoadAssetsAndStart() {
    // 隐藏overlay界面
    const overlay = document.getElementById("overlay");
    if (overlay) {
        overlay.style.display = 'none';
    }
    
    // 显示加载提示
    const loadingDiv = document.createElement('div');
    loadingDiv.className = 'text-loading';
    loadingDiv.style.position = 'fixed';
    loadingDiv.style.top = '50%';
    loadingDiv.style.left = '50%';
    loadingDiv.style.transform = 'translate(-50%, -50%)';
    loadingDiv.style.zIndex = '1000';
    loadingDiv.textContent = '正在加载资源，请稍等...';
    document.body.appendChild(loadingDiv);
    
    try {
        // 1. 加载音频文件
        const audioPath = 'assets/audio/M800000DOpDe2GfLaq.mp3';
        const audioLoader = new THREE.AudioLoader();
        
        await new Promise((resolve, reject) => {
            audioLoader.load(
                audioPath,
                function(buffer) {
                    selectedMusicBuffer = buffer;
                    selectedMusicIndex = -1; // 标记为自定义音频
                    console.log('音频加载成功:', audioPath);
                    resolve();
                },
                undefined,
                function(error) {
                    console.error('音频加载失败:', error);
                    reject(error);
                }
            );
        });
        
        // 2. 加载图片文件
        const imagePaths = [
            'assets/images/1.gif',
            'assets/images/2.gif',
            'assets/images/3.gif',
            'assets/images/4.gif'
        ];
        
        uploadedImages = [];
        let loadedImageCount = 0;
        
        await Promise.all(imagePaths.map(async (imagePath, index) => {
            try {
                // 使用fetch加载图片
                const response = await fetch(imagePath);
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                const blob = await response.blob();
                
                // 将blob转换为data URL
                const reader = new FileReader();
                return new Promise((resolve, reject) => {
                    reader.onload = function(e) {
                        uploadedImages.push({
                            src: e.target.result,
                            name: imagePath.split('/').pop(),
                            id: Date.now() + index
                        });
                        loadedImageCount++;
                        console.log(`图片加载成功: ${imagePath} (${loadedImageCount}/${imagePaths.length})`);
                        resolve();
                    };
                    reader.onerror = function(error) {
                        console.error('图片读取失败:', imagePath, error);
                        resolve(); // 即使失败也继续
                    };
                    reader.readAsDataURL(blob);
                });
            } catch (error) {
                console.error('图片加载失败:', imagePath, error);
                return Promise.resolve(); // 即使失败也继续
            }
        }));
        
        console.log(`总共加载了 ${uploadedImages.length} 张图片`);
        
        // 3. 移除加载提示
        loadingDiv.remove();
        
        // 4. 开始体验
        startExperience();
        
        // 5. 延迟检查音频状态（等待场景初始化完成）
        setTimeout(() => {
            checkAndStartAudio();
        }, 1000);
        
    } catch (error) {
        console.error('资源加载失败:', error);
        loadingDiv.textContent = '资源加载失败，请刷新页面重试';
    }
}

/**
 * 等待Three.js及其依赖加载完成后自动加载资源并开始体验
 */
function waitForThreeAndStart() {
    // 检查Three.js是否已加载
    if (typeof THREE === 'undefined') {
        setTimeout(waitForThreeAndStart, 100);
        return;
    }
    
    // 检查Three.js的依赖是否已加载（EffectComposer等）
    if (typeof THREE.EffectComposer === 'undefined' || 
        typeof THREE.RenderPass === 'undefined' ||
        typeof THREE.UnrealBloomPass === 'undefined') {
        setTimeout(waitForThreeAndStart, 100);
        return;
    }
    
    // 所有依赖都已加载，开始自动加载资源
    autoLoadAssetsAndStart();
}

// 等待所有资源加载完成后再开始
window.addEventListener('load', () => {
    // 给一点时间让所有script标签加载完成
    setTimeout(waitForThreeAndStart, 500);
});


/**
 * 初始化单张图片的渐显/停留/渐隐循环效果
 * 在树范围内随机位置和大小展示，避免过小，同时不超出树体
 */
function initImageCycleOnTree() {
    if (!sceneNoBloom || uploadedImages.length === 0) return;

    // 清理旧的平面和资源
    if (imageCyclePlane) {
        sceneNoBloom.remove(imageCyclePlane);
        if (imageCyclePlane.geometry) imageCyclePlane.geometry.dispose();
        if (imageCyclePlane.material) imageCyclePlane.material.dispose();
        imageCyclePlane = null;
    }

    // 如果旧的静态图片还在，清除掉，避免遮挡
    if (imagePlanes.length > 0) {
        imagePlanes.forEach(plane => {
            sceneNoBloom.remove(plane);
            plane.geometry.dispose();
            plane.material.dispose();
        });
        imagePlanes = [];
    }

    // 创建一个可复用的平面
    const geometry = new THREE.PlaneGeometry(1, 1);
    // 图片不参与泛光效果，所以可以使用正常亮度（白色）
    const baseColor = new THREE.Color(0xffffff); // 白色，100%亮度（图片不参与泛光，所以不会过度发光）
    const material = new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        color: baseColor, // 使用正常亮度，因为图片不参与泛光效果
        toneMapped: false // 禁用色调映射
    });
    imageCyclePlane = new THREE.Mesh(geometry, material);
    // 将图片添加到无泛光场景，这样图片就不会参与泛光效果
    sceneNoBloom.add(imageCyclePlane);

    imageCyclePhase = "idle";
    imageCyclePhaseStart = performance.now();

    // 立即启动第一张
    startNextImageCycle();
}

/**
 * 启动下一张图片的展示（随机位置、大小）
 */
function startNextImageCycle() {
    if (!imageCyclePlane || uploadedImages.length === 0) return;

    const image = uploadedImages[imageCycleIndex % uploadedImages.length];
    imageCycleIndex = (imageCycleIndex + 1) % uploadedImages.length;

    // 随机大小（增大范围，保证清晰可见）
    const size = rand(14, 10); // 7-11
    const aspectRatio = 1.0;
    imageCyclePlane.scale.set(size, size * aspectRatio, 1);

    // 随机位置：y在底部到80%高度之间；半径内随机，略微向外以免被遮挡
    const y = rand(treeBaseY + 2, treeBaseY + treeHeight * 0.8);
    const radiusAtY = getTreeRadiusAtHeightGlobal(y);
    const angle = rand(TAU);
    const distance = radiusAtY * rand(0.85, 1.05);
    const x = treeCenterX + cos(angle) * distance;
    const z = treeCenterZ + sin(angle) * distance;
    imageCyclePlane.position.set(x, y, z);

    // 朝向相机，略微倾斜
    if (camera) {
        const angleToCamera = Math.atan2(camera.position.x - x, camera.position.z - z);
        imageCyclePlane.rotation.set(
            rand(0.08, -0.08),
            angleToCamera,
            rand(0.12, -0.12)
        );
    }

    // 更新纹理
    const textureLoader = new THREE.TextureLoader();
    const texture = textureLoader.load(
        image.src,
        (loaded) => {
            loaded.minFilter = THREE.LinearFilter;
            loaded.magFilter = THREE.LinearFilter;
            loaded.needsUpdate = true;
            if (imageCyclePlane.material) {
                imageCyclePlane.material.needsUpdate = true;
            }
        },
        undefined,
        (error) => console.error(`循环图片加载失败: ${image.name}`, error)
    );
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    imageCyclePlane.material.map = texture;
    imageCyclePlane.material.opacity = 0;
    imageCyclePlane.material.needsUpdate = true;

    // 进入渐显阶段
    imageCyclePhase = "fadeIn";
    imageCyclePhaseStart = performance.now();
}

/**
 * 更新单张图片的渐显/停留/渐隐阶段
 * @param {number} time - 当前时间戳
 */
function updateImageCycle(time) {
    if (!imageCyclePlane || uploadedImages.length === 0) return;
    const now = time || performance.now();
    const phaseTime = now - imageCyclePhaseStart;

    if (imageCyclePhase === "fadeIn") {
        const t = Math.min(1, phaseTime / imageCycleConfig.fadeIn);
        imageCyclePlane.material.opacity = t;
        if (phaseTime >= imageCycleConfig.fadeIn) {
            imageCyclePhase = "hold";
            imageCyclePhaseStart = now;
            imageCyclePlane.material.opacity = 1;
        }
    } else if (imageCyclePhase === "hold") {
        imageCyclePlane.material.opacity = 1;
        if (phaseTime >= imageCycleConfig.hold) {
            imageCyclePhase = "fadeOut";
            imageCyclePhaseStart = now;
        }
    } else if (imageCyclePhase === "fadeOut") {
        const t = Math.min(1, phaseTime / imageCycleConfig.fadeOut);
        imageCyclePlane.material.opacity = 1 - t;
        if (phaseTime >= imageCycleConfig.fadeOut) {
            imageCyclePhase = "idle";
            imageCyclePhaseStart = now;
            imageCyclePlane.material.opacity = 0;
            startNextImageCycle();
        }
    } else if (imageCyclePhase === "idle") {
        startNextImageCycle();
    }
}


/**
 * 初始化3D场景
 * 创建场景、相机、渲染器，添加3D对象和后处理效果
 */
function init() {
    // 隐藏音乐选择覆盖层（如果还存在）
    const overlay = document.getElementById("overlay");
    if (overlay) {
        overlay.style.display = 'none';
    }

    // 创建主场景（包含需要泛光的对象）
    scene = new THREE.Scene();
    
    // 创建无泛光场景（只包含图片）
    sceneNoBloom = new THREE.Scene();
    
    // 创建WebGL渲染器，启用抗锯齿
    renderer = new THREE.WebGLRenderer({ antialias: true });
    // 设置像素比，适配高DPI屏幕
    renderer.setPixelRatio(window.devicePixelRatio);
    // 设置渲染器尺寸为窗口大小
    renderer.setSize(window.innerWidth, window.innerHeight);
    // 将渲染器的canvas元素添加到页面
    document.body.appendChild(renderer.domElement);

    // 创建透视相机
    // 参数：视野角度、宽高比、近裁剪面、远裁剪面
    camera = new THREE.PerspectiveCamera(
        60,
        window.innerWidth / window.innerHeight,
        1,
        1000);

    // 设置相机位置（预设的最佳视角）
    camera.position.set(-2.09397456774197047, -2.5597086635726947, 24.420789670889008);
    // 设置相机旋转角度
    camera.rotation.set(0.10443543723052419, -0.003827152981119352, 0.0004011488708739715);
    
    // 将音频监听器添加到相机（重要：这样才能听到3D空间音频）
    camera.add(listener);

    // 根据WebGL版本选择纹理格式
    // WebGL2使用RedFormat，WebGL1使用LuminanceFormat
    const format = renderer.capabilities.isWebGL2 ?
        THREE.RedFormat :
        THREE.LuminanceFormat;

    // 创建音频数据纹理，用于在着色器中读取音频频谱数据
    // fftSize/2 是因为FFT结果是对称的，只需要一半
    uniforms.tAudioData = {
        value: new THREE.DataTexture(analyser.data, fftSize / 2, 1, format)
    };

    // 添加地面粒子层（3000个粒子）
    addPlane(scene, uniforms, 3000);
    // 添加雪花效果
    addSnow(scene, uniforms);

    // 只创建一棵放大的圣诞树（在中心位置）
    // 粒子数量增加3倍，树更大更壮观
    addTree(scene, uniforms, totalPoints * 3, [0, 0, -30]);

    // 创建主场景的渲染通道（包含需要泛光的对象）
    const renderScene = new THREE.RenderPass(scene, camera);
    
    // 创建无泛光场景的渲染通道（只包含图片）
    const renderSceneNoBloom = new THREE.RenderPass(sceneNoBloom, camera);
    renderSceneNoBloom.clear = false; // 不清空，叠加在主场景上
    renderSceneNoBloom.clearColor = false; // 不清空颜色
    renderSceneNoBloom.clearDepth = false; // 不清空深度

    // 创建泛光效果通道（只对主场景应用）
    // 参数：分辨率、强度、半径、阈值
    const bloomPass = new THREE.UnrealBloomPass(
        new THREE.Vector2(window.innerWidth, window.innerHeight),
        1.5,    // 强度
        0.4,    // 半径
        0.85);  // 阈值

    // 配置泛光参数
    bloomPass.threshold = params.bloomThreshold;
    bloomPass.strength = params.bloomStrength;
    bloomPass.radius = params.bloomRadius;

    // 创建主合成器：渲染主场景并应用泛光
    composer = new THREE.EffectComposer(renderer);
    composer.addPass(renderScene);
    composer.addPass(bloomPass);
    
    // 创建无泛光合成器：只渲染图片场景
    composerNoBloom = new THREE.EffectComposer(renderer);
    composerNoBloom.addPass(renderSceneNoBloom);

    // 添加事件监听器（窗口大小调整、键盘事件等）
    addListners(camera, renderer, composer);
    
    // 启动烟花效果定时器：在树两旁放烟花
    // 左侧烟花
    setInterval(() => {
        createFirework(scene, uniforms, -25); // 左侧
    }, 3000);
    // 右侧烟花
    setTimeout(() => {
        setInterval(() => {
            createFirework(scene, uniforms, 25); // 右侧
        }, 3000);
    }, 1500); // 错开时间，让左右交替
    
    // 如果已上传图片，创建单张循环展示（渐显/停留/渐隐）
    if (uploadedImages.length > 0) {
        initImageCycleOnTree();
    }
    
    // 注意：音频播放将在checkAndStartAudio()中处理
    // 这里不直接播放，因为浏览器可能阻止自动播放
    
    // 开始动画循环
    animate();
}

/**
 * 动画循环函数
 * 每帧更新音频数据、时间、步数，并渲染场景
 * @param {number} time - 当前时间戳（毫秒）
 */
function animate(time) {
    // 获取音频频谱数据
    analyser.getFrequencyData();
    // 标记音频纹理需要更新
    uniforms.tAudioData.value.needsUpdate = true;
    // 更新步数（0-999循环），用于雪花动画
    step = (step + 1) % 1000;
    // 更新着色器中的时间统一变量
    uniforms.time.value = time;
    // 更新着色器中的步数统一变量
    uniforms.step.value = step;
    
    // 更新所有烟花动画
    updateFireworks(time);
    
    // 更新单张渐显/渐隐循环动画
    updateImageCycle(time);
    
    // 先渲染主场景（包含泛光效果）到屏幕
    composer.render();
    
    // 然后渲染无泛光场景（图片），叠加在主场景上
    // 设置渲染状态，不清空缓冲区，直接叠加
    const currentAutoClear = renderer.autoClear;
    renderer.autoClear = false; // 不清空，保留主场景的内容
    renderer.clearDepth(); // 只清除深度缓冲区，保留颜色缓冲区
    composerNoBloom.render();
    renderer.autoClear = currentAutoClear; // 恢复原来的设置
    
    // 请求下一帧动画
    requestAnimationFrame(animate);
}

// 存储选中的音乐
let selectedMusicIndex = -1;
let selectedMusicBuffer = null;

/**
 * 检查并启动音频播放
 */
function checkAndStartAudio() {
    const context = listener.context;
    
    if (!context) {
        console.warn('音频上下文不存在');
        showAudioPlayPrompt();
        return;
    }
    
    // 检查音频上下文状态
    if (context.state === 'suspended') {
        console.log('音频上下文被暂停，显示播放提示');
        showAudioPlayPrompt();
    } else {
        // 上下文已激活，尝试播放
        console.log('音频上下文已激活，尝试播放');
        if (!playAudio()) {
            // 如果播放失败，显示提示
            showAudioPlayPrompt();
        }
    }
}

/**
 * 播放音频（处理浏览器自动播放限制）
 */
function playAudio() {
    if (!audio) {
        console.warn('音频对象不存在');
        return false;
    }
    
    if (!audio.buffer) {
        console.warn('音频缓冲区未设置，无法播放');
        return false;
    }
    
    // 确保音频已设置缓冲区
    if (!audio.source) {
        audio.setBuffer(selectedMusicBuffer);
    }
    
    // 检查音频上下文状态
    const context = listener.context;
    if (!context) {
        console.warn('音频上下文不存在');
        return false;
    }
    
    // 如果上下文被暂停，需要先恢复
    if (context.state === 'suspended') {
        console.log('音频上下文被暂停，尝试恢复...');
        context.resume().then(() => {
            console.log('音频上下文已恢复，开始播放');
            try {
                audio.play();
                console.log('音频播放成功');
                return true;
            } catch (error) {
                console.error('播放音频时出错:', error);
                return false;
            }
        }).catch((error) => {
            console.error('恢复音频上下文失败:', error);
            return false;
        });
        return false;
    }
    
    // 尝试播放音频
    try {
        audio.play();
        console.log('音频播放命令已发送');
        return true;
    } catch (error) {
        console.error('播放音频时出错:', error);
        return false;
    }
}

/**
 * 显示音频播放提示
 */
function showAudioPlayPrompt() {
    // 如果提示已存在，不重复创建
    if (document.getElementById('audioPlayPrompt')) {
        return;
    }
    
    // 创建简单的按钮提示
    const prompt = document.createElement('button');
    prompt.id = 'audioPlayPrompt';
    prompt.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: rgba(22, 22, 22, 0.9);
        color: #c5a880;
        padding: 12px 24px;
        border-radius: 6px;
        border: 1px solid #c5a880;
        text-align: center;
        z-index: 10000;
        cursor: pointer;
        font-size: 14px;
        font-family: sans-serif;
        outline: none;
        transition: all 0.3s ease;
    `;
    prompt.textContent = '点亮圣诞树';
    
    // 鼠标悬停效果
    prompt.addEventListener('mouseenter', () => {
        prompt.style.background = 'rgba(197, 168, 128, 0.2)';
        prompt.style.borderColor = '#c5a880';
    });
    prompt.addEventListener('mouseleave', () => {
        prompt.style.background = 'rgba(22, 22, 22, 0.9)';
        prompt.style.borderColor = '#c5a880';
    });
    
    // 点击按钮后播放音频并移除提示
    prompt.addEventListener('click', () => {
        if (playAudio()) {
            prompt.remove();
        }
    });
    
    document.body.appendChild(prompt);
}

/**
 * 开始体验（点击开始按钮后调用，或自动调用）
 */
function startExperience() {
    if (!selectedMusicBuffer) {
        console.error('音频未加载，无法开始体验');
        return;
    }
    
    // 隐藏overlay界面（如果还存在）
    const overlay = document.getElementById("overlay");
    if (overlay) {
        overlay.style.display = 'none';
    }
    
    // 设置音频缓冲区
    audio.setBuffer(selectedMusicBuffer);
    // 创建音频分析器
    analyser = new THREE.AudioAnalyser(audio, fftSize);
    // 初始化3D场景
    init();
}

/**
 * 添加圣诞树粒子系统
 * 创建由粒子组成的圣诞树，粒子大小随音频频谱变化
 * @param {THREE.Scene} scene - Three.js场景对象
 * @param {Object} uniforms - 着色器统一变量对象
 * @param {number} totalPoints - 粒子总数
 * @param {Array<number>} treePosition - 树的位置 [x, y, z]
 */
function addTree(scene, uniforms, totalPoints, treePosition) {
    // 顶点着色器：控制粒子的位置、大小和颜色
    const vertexShader = `
attribute float mIndex;        // 音频索引属性，用于从音频纹理中采样
varying vec3 vColor;            // 传递给片段着色器的颜色
varying float opacity;          // 传递给片段着色器的透明度
uniform sampler2D tAudioData;    // 音频数据纹理

// 归一化函数：将值映射到0-1范围
float norm(float value, float min, float max ){
return (value - min) / (max - min);
}

// 线性插值函数
float lerp(float norm, float min, float max){
return (max - min) * norm + min;
}

// 映射函数：将值从一个范围映射到另一个范围
float map(float value, float sourceMin, float sourceMax, float destMin, float destMax){
return lerp(norm(value, sourceMin, sourceMax), destMin, destMax);
}

void main() {
vColor = color;                                    // 传递顶点颜色
vec3 p = position;                                 // 获取顶点位置
vec4 mvPosition = modelViewMatrix * vec4( p, 1.0 ); // 转换到视图空间

// 从音频纹理中采样振幅值（根据粒子的mIndex）
float amplitude = texture2D( tAudioData, vec2( mIndex, 0.1 ) ).r;
// 限制振幅范围，减去0.4作为阈值，限制在0-0.6之间
float amplitudeClamped = clamp(amplitude-0.4,0.0, 0.6 );
// 将振幅映射到粒子大小范围（1.5-25.0）- 增加基础大小让亮点更明显
float sizeMapped = map(amplitudeClamped, 0.0, 0.6, 1.5, 25.0);

// 根据深度计算透明度（远处的粒子更透明）
opacity = map(mvPosition.z , -200.0, 15.0, 0.0, 1.0);

// 计算粒子大小：基础大小 * 透视缩放
gl_PointSize = sizeMapped * ( 100.0 / -mvPosition.z );
// 计算最终屏幕位置
gl_Position = projectionMatrix * mvPosition;
}
`;
    
    // 片段着色器：控制粒子的最终颜色和纹理（增强亮度）
    const fragmentShader = `
varying vec3 vColor;            // 从顶点着色器传递的颜色
varying float opacity;          // 从顶点着色器传递的透明度
uniform sampler2D pointTexture;  // 粒子纹理（星形光点）

void main() {
// 设置片段颜色和透明度
gl_FragColor = vec4( vColor, opacity );
// 应用纹理，gl_PointCoord是点在纹理中的坐标
gl_FragColor = gl_FragColor * texture2D( pointTexture, gl_PointCoord );
// 增强亮度：将RGB值乘以2.0，让亮点更亮
gl_FragColor.rgb = gl_FragColor.rgb * 2.0;
}
`;
    // 创建着色器材质
    const shaderMaterial = new THREE.ShaderMaterial({
        uniforms: {
            ...uniforms,  // 展开全局统一变量
            pointTexture: {
                // 加载粒子纹理（星形光点）
                value: new THREE.TextureLoader().load(`https://assets.codepen.io/3685267/spark1.png`)
            }
        },
        vertexShader,     // 顶点着色器代码
        fragmentShader,  // 片段着色器代码
        blending: THREE.AdditiveBlending,  // 加法混合模式（发光效果）
        depthTest: false,                  // 禁用深度测试
        transparent: true,                 // 启用透明度
        vertexColors: true                 // 使用顶点颜色
    });

    // 创建几何体
    const geometry = new THREE.BufferGeometry();
    const positions = [];  // 顶点位置数组
    const colors = [];     // 顶点颜色数组
    const sizes = [];      // 顶点大小数组（未使用）
    const phases = [];     // 相位数组（未使用）
    const mIndexs = [];    // 音频索引数组，用于从音频纹理采样

    const color = new THREE.Color();

    // 生成粒子数据：创建螺旋形圣诞树结构（进一步放大版）
    for (let i = 0; i < totalPoints; i++) {
        // 随机参数t，用于控制粒子在树中的位置（从底部到顶部）
        const t = Math.random();
        // y坐标：从-8（底部）到35（顶部）- 进一步放大树的高度
        const y = map(t, 0, 1, -8, 35);
        // 角度：创建螺旋效果，每两个粒子交替方向
        const ang = map(t, 0, 1, 0, 6 * TAU) + TAU / 2 * (i % 2);
        // 极坐标转直角坐标，半径从18（底部）到0（顶部）- 进一步放大树的宽度
        // 上尖下圆：半径随高度线性减小
        const baseRadius = map(t, 0, 1, 18, 0);
        const [z, x] = polar(ang, baseRadius);

        // 修饰因子：顶部粒子随机性更大
        const modifier = map(t, 0, 1, 1, 0);
        // 添加随机偏移，创建自然的树形
        positions.push(x + rand(-0.3 * modifier, 0.3 * modifier));
        positions.push(y + rand(-0.3 * modifier, 0.3 * modifier));
        positions.push(z + rand(-0.3 * modifier, 0.3 * modifier));

        // 设置HSL颜色：从红色(1.0)渐变到红色(0.0)，保持饱和度和亮度
        color.setHSL(map(i, 0, totalPoints, 1.0, 0.0), 1.0, 0.5);

        colors.push(color.r, color.g, color.b);
        phases.push(rand(1000));  // 未使用的相位值
        sizes.push(1);            // 未使用的大小值
        // 音频索引：从1.0到0.0，用于在音频纹理中采样不同频率
        const mIndex = map(i, 0, totalPoints, 1.0, 0.0);
        mIndexs.push(mIndex);
    }

    // 设置几何体属性
    geometry.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(positions, 3).setUsage(
            THREE.DynamicDrawUsage));  // 标记为动态使用

    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    geometry.setAttribute("size", new THREE.Float32BufferAttribute(sizes, 1));
    geometry.setAttribute("phase", new THREE.Float32BufferAttribute(phases, 1));
    geometry.setAttribute("mIndex", new THREE.Float32BufferAttribute(mIndexs, 1));

    // 创建点云对象（粒子系统）
    const tree = new THREE.Points(geometry, shaderMaterial);

    // 设置树的位置
    const [px, py, pz] = treePosition;
    tree.position.x = px;
    tree.position.y = py;
    tree.position.z = pz;

    // 将树添加到场景
    scene.add(tree);
}

/**
 * 添加雪花粒子系统
 * 创建多个雪花粒子组，每个组使用不同的雪花纹理
 * @param {THREE.Scene} scene - Three.js场景对象
 * @param {Object} uniforms - 着色器统一变量对象
 */
function addSnow(scene, uniforms) {
    // 顶点着色器：控制雪花的运动动画
    const vertexShader = `
attribute float size;           // 雪花大小属性
attribute float phase;          // 主相位（控制垂直运动）
attribute float phaseSecondary; // 次相位（控制水平摆动）
varying vec3 vColor;            // 传递给片段着色器的颜色
varying float opacity;          // 传递给片段着色器的透明度
uniform float time;             // 时间统一变量
uniform float step;             // 步数统一变量（用于循环动画）

// 归一化函数
float norm(float value, float min, float max ){
return (value - min) / (max - min);
}

// 线性插值函数
float lerp(float norm, float min, float max){
return (max - min) * norm + min;
}

// 映射函数
float map(float value, float sourceMin, float sourceMax, float destMin, float destMax){
return lerp(norm(value, sourceMin, sourceMax), destMin, destMax);
}

void main() {
float t = time* 0.0006;  // 时间缩放因子
vColor = color;          // 传递顶点颜色
vec3 p = position;       // 获取顶点位置

// 垂直运动：使用相位和步数创建循环下落效果
// mod(phase+step, 1000.0) 创建0-1000的循环
p.y = map(mod(phase+step, 1000.0), 0.0, 1000.0, 25.0, -8.0);

// 水平摆动：使用正弦波创建左右摆动效果
p.x += sin(t+phase);
// 前后摆动：使用不同的相位创建更自然的运动
p.z += sin(t+phaseSecondary);

// 根据深度计算透明度
opacity = map(p.z, -150.0, 15.0, 0.0, 1.0);

// 转换到视图空间
vec4 mvPosition = modelViewMatrix * vec4( p, 1.0 );
// 计算粒子大小（透视缩放）
gl_PointSize = size * ( 100.0 / -mvPosition.z );
// 计算最终屏幕位置
gl_Position = projectionMatrix * mvPosition;
}
`;

    // 片段着色器：控制雪花的最终外观
    const fragmentShader = `
uniform sampler2D pointTexture;  // 雪花纹理
varying vec3 vColor;             // 从顶点着色器传递的颜色
varying float opacity;           // 从顶点着色器传递的透明度

void main() {
// 设置片段颜色和透明度
gl_FragColor = vec4( vColor, opacity );
// 应用雪花纹理
gl_FragColor = gl_FragColor * texture2D( pointTexture, gl_PointCoord ); 
}
`;
    
    /**
     * 创建一组雪花粒子
     * @param {string} sprite - 雪花纹理图片URL
     */
    function createSnowSet(sprite) {
        // 每组雪花粒子数量
        const totalPoints = 300;
        
        // 创建着色器材质
        const shaderMaterial = new THREE.ShaderMaterial({
            uniforms: {
                ...uniforms,  // 展开全局统一变量
                pointTexture: {
                    // 加载指定的雪花纹理
                    value: new THREE.TextureLoader().load(sprite)
                }
            },
            vertexShader,     // 顶点着色器
            fragmentShader,  // 片段着色器
            blending: THREE.AdditiveBlending,  // 加法混合（发光效果）
            depthTest: false,                  // 禁用深度测试
            transparent: true,                 // 启用透明度
            vertexColors: true                 // 使用顶点颜色
        });

        // 创建几何体
        const geometry = new THREE.BufferGeometry();
        const positions = [];      // 位置数组
        const colors = [];         // 颜色数组
        const sizes = [];          // 大小数组
        const phases = [];         // 主相位数组
        const phaseSecondaries = []; // 次相位数组

        const color = new THREE.Color();

        // 生成雪花粒子数据
        for (let i = 0; i < totalPoints; i++) {
            // 随机位置：x范围-25到25，y初始为0，z范围-150到15
            const [x, y, z] = [rand(25, -25), 0, rand(15, -150)];
            positions.push(x);
            positions.push(y);
            positions.push(z);

            // 随机选择雪花颜色（浅色调）
            color.set(randChoise(["#f1d4d4", "#f1f6f9", "#eeeeee", "#f1f1e8"]));

            colors.push(color.r, color.g, color.b);
            // 随机相位值，用于创建不同的运动模式
            phases.push(rand(1000));
            phaseSecondaries.push(rand(1000));
            // 随机大小：2到4
            sizes.push(rand(4, 2));
        }

        // 设置几何体属性
        geometry.setAttribute(
            "position",
            new THREE.Float32BufferAttribute(positions, 3));

        geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
        geometry.setAttribute("size", new THREE.Float32BufferAttribute(sizes, 1));
        geometry.setAttribute("phase", new THREE.Float32BufferAttribute(phases, 1));
        geometry.setAttribute(
            "phaseSecondary",
            new THREE.Float32BufferAttribute(phaseSecondaries, 1));

        // 创建点云对象
        const mesh = new THREE.Points(geometry, shaderMaterial);

        // 添加到场景
        scene.add(mesh);
    }
    
    // 雪花纹理URL列表（5种不同的雪花样式）
    const sprites = [
        "https://assets.codepen.io/3685267/snowflake1.png",
        "https://assets.codepen.io/3685267/snowflake2.png",
        "https://assets.codepen.io/3685267/snowflake3.png",
        "https://assets.codepen.io/3685267/snowflake4.png",
        "https://assets.codepen.io/3685267/snowflake5.png"];

    // 为每种雪花纹理创建一组粒子
    sprites.forEach(sprite => {
        createSnowSet(sprite);
    });
}

/**
 * 添加地面粒子层
 * 创建地面上的装饰粒子，模拟地面光点效果
 * @param {THREE.Scene} scene - Three.js场景对象
 * @param {Object} uniforms - 着色器统一变量对象
 * @param {number} totalPoints - 粒子总数
 */
function addPlane(scene, uniforms, totalPoints) {
    // 顶点着色器：简单的粒子位置和大小计算
    const vertexShader = `
attribute float size;        // 粒子大小属性
attribute vec3 customColor; // 自定义颜色属性
varying vec3 vColor;         // 传递给片段着色器的颜色

void main() {
vColor = customColor;                              // 传递自定义颜色
vec4 mvPosition = modelViewMatrix * vec4( position, 1.0 ); // 转换到视图空间
gl_PointSize = size * ( 300.0 / -mvPosition.z );   // 计算粒子大小（透视缩放）
gl_Position = projectionMatrix * mvPosition;      // 计算最终屏幕位置
}
`;
    
    // 片段着色器：应用纹理和颜色
    const fragmentShader = `
uniform vec3 color;          // 颜色统一变量（未使用）
uniform sampler2D pointTexture; // 粒子纹理
varying vec3 vColor;          // 从顶点着色器传递的颜色

void main() {
// 设置片段颜色（不透明）
gl_FragColor = vec4( vColor, 1.0 );
// 应用纹理
gl_FragColor = gl_FragColor * texture2D( pointTexture, gl_PointCoord );
}
`;
    
    // 创建着色器材质
    const shaderMaterial = new THREE.ShaderMaterial({
        uniforms: {
            ...uniforms,  // 展开全局统一变量
            pointTexture: {
                // 加载粒子纹理（星形光点）
                value: new THREE.TextureLoader().load(`https://assets.codepen.io/3685267/spark1.png`)
            }
        },
        vertexShader,     // 顶点着色器
        fragmentShader,  // 片段着色器
        blending: THREE.AdditiveBlending,  // 加法混合（发光效果）
        depthTest: false,                  // 禁用深度测试
        transparent: true,                 // 启用透明度
        vertexColors: true                 // 使用顶点颜色
    });

    // 创建几何体
    const geometry = new THREE.BufferGeometry();
    const positions = [];  // 位置数组
    const colors = [];     // 颜色数组
    const sizes = [];      // 大小数组

    const color = new THREE.Color();

    // 生成地面粒子数据
    for (let i = 0; i < totalPoints; i++) {
        // 随机位置：x范围-25到25，y为0（地面），z范围-150到15
        const [x, y, z] = [rand(-25, 25), 0, rand(-150, 15)];
        positions.push(x);
        positions.push(y);
        positions.push(z);

        // 随机选择地面颜色（蓝绿色调）
        color.set(randChoise(["#93abd3", "#f2f4c0", "#9ddfd3"]));

        colors.push(color.r, color.g, color.b);
        sizes.push(1);  // 固定大小
    }

    // 设置几何体属性
    geometry.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(positions, 3).setUsage(
            THREE.DynamicDrawUsage));  // 标记为动态使用

    geometry.setAttribute(
        "customColor",
        new THREE.Float32BufferAttribute(colors, 3));

    geometry.setAttribute("size", new THREE.Float32BufferAttribute(sizes, 1));

    // 创建点云对象
    const plane = new THREE.Points(geometry, shaderMaterial);

    // 设置地面位置（y = -8）
    plane.position.y = -8;
    // 添加到场景
    scene.add(plane);
}

/**
 * 创建发射体（炮弹）效果
 * 从地面螺旋上升，到达目标位置后触发爆炸
 * @param {THREE.Scene} scene - Three.js场景对象
 * @param {Object} uniforms - 着色器统一变量对象
 * @param {number} sideX - 烟花位置（左侧负数，右侧正数，0为随机）
 */
function createFirework(scene, uniforms, sideX = 0) {
    // 目标爆炸位置：根据sideX决定左右，y范围8到18，z范围-40到-20（在树附近）
    const targetX = sideX !== 0 ? sideX + rand(5, -5) : rand(15, -15);
    const targetY = rand(18, 8);
    const targetZ = rand(-20, -40);
    
    // 发射起始位置：地面附近，根据sideX决定起始位置
    const startX = sideX !== 0 ? sideX * 0.3 + rand(3, -3) : rand(10, -10);
    const startY = -8;  // 地面
    const startZ = rand(5, -20);
    
    // 计算发射距离和时间
    const distance = Math.sqrt(
        Math.pow(targetX - startX, 2) + 
        Math.pow(targetY - startY, 2) + 
        Math.pow(targetZ - startZ, 2)
    );
    const flightTime = distance / 15.0;  // 飞行时间（秒）
    
    // 更丰富的烟花颜色主题（更鲜艳、更多样）
    const colorThemes = [
        ["#ff0000", "#ff3300", "#ff6600", "#ff9900", "#ffcc00", "#ffff00"],  // 红橙黄渐变
        ["#00ff00", "#33ff66", "#66ff99", "#00ffff", "#0099ff", "#0066ff"],  // 绿青蓝渐变
        ["#ff00ff", "#ff33cc", "#ff6699", "#ff99cc", "#ffccff"],  // 紫粉渐变
        ["#ffff00", "#ffcc00", "#ff9900", "#ff6600", "#ff3300", "#ff0000"],  // 黄橙红渐变
        ["#00ffff", "#33ccff", "#6699ff", "#9966ff", "#cc33ff", "#ff00ff"],  // 青蓝紫渐变
        ["#ff0066", "#ff3366", "#ff6699", "#ff99cc", "#ffccff"],  // 粉红渐变
        ["#00ff66", "#33ff99", "#66ffcc", "#99ffff"],  // 绿青渐变
        ["#ff6600", "#ff9900", "#ffcc00", "#ffff00", "#ccff00"],  // 橙黄绿渐变
    ];
    const colorTheme = randChoise(colorThemes);  // 当前烟花的颜色主题
    
    // 创建发射体（炮弹）
    createRocket(scene, uniforms, startX, startY, startZ, targetX, targetY, targetZ, flightTime, colorTheme);
}

/**
 * 创建发射体（炮弹）效果
 * @param {THREE.Scene} scene - Three.js场景对象
 * @param {Object} uniforms - 着色器统一变量对象
 * @param {number} startX - 起始x坐标
 * @param {number} startY - 起始y坐标
 * @param {number} startZ - 起始z坐标
 * @param {number} targetX - 目标x坐标
 * @param {number} targetY - 目标y坐标
 * @param {number} targetZ - 目标z坐标
 * @param {number} flightTime - 飞行时间
 * @param {Array} colorTheme - 颜色主题
 */
function createRocket(scene, uniforms, startX, startY, startZ, targetX, targetY, targetZ, flightTime, colorTheme) {
    // 发射体顶点着色器：螺旋上升轨迹
    const rocketVertexShader = `
attribute float phase;
varying vec3 vColor;
varying float vOpacity;
uniform float time;
uniform float startTime;
uniform vec3 startPosition;
uniform vec3 targetPosition;
uniform float flightTime;

void main() {
float elapsed = (time - startTime) * 0.001;
float progress = elapsed / flightTime;
float PI = 3.14159265359;
float TAU = 6.28318530718;

// 拖尾效果：每个粒子根据phase显示不同位置
float tailProgress = progress - phase * 0.2;

// 检查粒子是否应该显示
if (tailProgress < 0.0) {
  tailProgress = -1.0;
}
if (tailProgress > 1.0) {
  tailProgress = 2.0;
}

if (tailProgress < 0.0 || tailProgress > 1.0 || progress > 1.0) {
  // 隐藏粒子
  gl_Position = vec4(0.0, 0.0, -1000.0, 1.0);
  vOpacity = 0.0;
  vColor = vec3(0.0, 0.0, 0.0);
} else {
  // 计算拖尾粒子的位置
  float tailSpiralAngle = tailProgress * TAU * 4.0 + phase * TAU;
  float tailSpiralRadius = 0.5 * (1.0 - tailProgress * 0.3);
  float tailSpiralX = cos(tailSpiralAngle) * tailSpiralRadius;
  float tailSpiralZ = sin(tailSpiralAngle) * tailSpiralRadius;
  
  vec3 tailPosition = mix(startPosition, targetPosition, tailProgress);
  tailPosition.x = tailPosition.x + tailSpiralX;
  tailPosition.z = tailPosition.z + tailSpiralZ;
  
  // 拖尾透明度
  float tailAlpha = 1.0 - phase * 0.5;
  vOpacity = tailAlpha;
  float brightness = 1.5 + tailAlpha * 0.5;
  vColor = color * brightness;
  
  vec4 mvPosition = modelViewMatrix * vec4(tailPosition, 1.0);
  gl_PointSize = 8.0 * (100.0 / -mvPosition.z);
  gl_Position = projectionMatrix * mvPosition;
}
}
`;
    
    // 发射体片段着色器
    const rocketFragmentShader = `
uniform sampler2D pointTexture;
varying vec3 vColor;
varying float vOpacity;

void main() {
vec4 texColor = texture2D(pointTexture, gl_PointCoord);
// 简单的发光效果（不使用smoothstep以提高兼容性）
vec2 center = vec2(0.5, 0.5);
vec2 coord = gl_PointCoord;
float dist = distance(coord, center);
float glow = 1.0;
if (dist > 0.5) {
  glow = 0.0;
} else {
  glow = 1.0 - dist * 2.0;
}
float glowFactor = 1.0 + glow * 0.8;
vec3 finalColor = vColor * glowFactor;
gl_FragColor = vec4(finalColor, vOpacity);
gl_FragColor = gl_FragColor * texColor;
gl_FragColor.rgb = gl_FragColor.rgb * 2.5;
}
`;
    
    // 创建发射体材质
    const rocketMaterial = new THREE.ShaderMaterial({
        uniforms: {
            ...uniforms,
            startPosition: { type: "v3", value: new THREE.Vector3(startX, startY, startZ) },
            targetPosition: { type: "v3", value: new THREE.Vector3(targetX, targetY, targetZ) },
            flightTime: { type: "f", value: flightTime },
            pointTexture: {
                value: new THREE.TextureLoader().load(`https://assets.codepen.io/3685267/spark1.png`)
            }
        },
        vertexShader: rocketVertexShader,
        fragmentShader: rocketFragmentShader,
        blending: THREE.AdditiveBlending,
        depthTest: false,
        transparent: true,
        vertexColors: true
    });
    
    // 创建发射体几何体（拖尾粒子）
    const rocketGeometry = new THREE.BufferGeometry();
    const rocketPositions = [];
    const rocketColors = [];
    const rocketPhases = [];
    
    const rocketColor = new THREE.Color();
    // 使用更亮的颜色，让发射体更明显
    rocketColor.set(colorTheme[0]);
    // 增强亮度
    rocketColor.r = Math.min(1.0, rocketColor.r * 1.5);
    rocketColor.g = Math.min(1.0, rocketColor.g * 1.5);
    rocketColor.b = Math.min(1.0, rocketColor.b * 1.5);
    
    // 创建50个粒子形成更明显的拖尾
    for (let i = 0; i < 50; i++) {
        rocketPositions.push(startX, startY, startZ);
        // 拖尾颜色渐变：前面的粒子更亮
        const brightness = 0.7 + (i / 50.0) * 0.3;
        rocketColors.push(
            rocketColor.r * brightness, 
            rocketColor.g * brightness, 
            rocketColor.b * brightness
        );
        rocketPhases.push(i / 50.0);  // 相位用于控制拖尾位置
    }
    
    // 设置几何体属性，position标记为动态使用
    rocketGeometry.setAttribute("position", new THREE.Float32BufferAttribute(rocketPositions, 3).setUsage(THREE.DynamicDrawUsage));
    rocketGeometry.setAttribute("color", new THREE.Float32BufferAttribute(rocketColors, 3));
    rocketGeometry.setAttribute("phase", new THREE.Float32BufferAttribute(rocketPhases, 1));
    
    const rocket = new THREE.Points(rocketGeometry, rocketMaterial);
    
    // 存储发射体信息
    rocket.userData = {
        startTime: uniforms.time.value,
        flightTime: flightTime,
        targetX: targetX,
        targetY: targetY,
        targetZ: targetZ,
        colorTheme: colorTheme,
        geometry: rocketGeometry,
        material: rocketMaterial,
        type: 'rocket'
    };
    
    scene.add(rocket);
    fireworks.push(rocket);
    
    // 在飞行时间后创建爆炸效果
    setTimeout(() => {
        createExplosion(scene, uniforms, targetX, targetY, targetZ, colorTheme);
    }, flightTime * 1000);
}

/**
 * 创建爆炸效果
 * @param {THREE.Scene} scene - Three.js场景对象
 * @param {Object} uniforms - 着色器统一变量对象
 * @param {number} x - 爆炸x坐标
 * @param {number} y - 爆炸y坐标
 * @param {number} z - 爆炸z坐标
 * @param {Array} colorTheme - 颜色主题
 */
function createExplosion(scene, uniforms, x, y, z, colorTheme) {
    // 增加粒子数量，让烟花更密集
    const particleCount = randInt(600, 400);
    
    // 随机决定是否创建多层烟花（30%概率）
    const createMultiLayer = Math.random() < 0.3;
    const layerCount = createMultiLayer ? randInt(3, 2) : 1;
    
    // 顶点着色器：控制烟花粒子的爆炸运动（改进版，添加闪烁和拖尾效果）
    const vertexShader = `
attribute float life;
attribute float speed;
attribute vec3 direction;
attribute float size;
varying vec3 vColor;
varying float vOpacity;
uniform float time;
uniform float startTime;
uniform vec3 startPosition;

void main() {
float elapsed = (time - startTime) * 0.001;
float gravity = -9.8;
float elapsedSquared = elapsed * elapsed;
vec3 velocity = direction * speed * elapsed;
vec3 gravityVec = vec3(0.0, 0.5 * gravity * elapsedSquared, 0.0);
vec3 newPosition = startPosition + velocity + gravityVec;

// 改进的生命周期：更平滑的衰减曲线，添加拖尾效果
float elapsedNorm = elapsed / 3.0;  // 延长到3秒
float lifeRemaining = 1.0;
if (elapsedNorm > 1.0) {
  lifeRemaining = 0.0;
} else if (elapsedNorm > 0.0) {
  // 使用平滑的衰减曲线，开始衰减慢，后面衰减快
  float t = elapsedNorm;
  lifeRemaining = (1.0 - t) * (1.0 - t * t);
}

// 添加闪烁效果（基于时间的正弦波）
float twinkle = 0.8 + 0.2 * sin(time * 0.01 + life * 10.0);

// 颜色增强：让颜色更亮
vColor = color * lifeRemaining * twinkle * 1.5;
vOpacity = lifeRemaining * life * twinkle;

vec4 mvPosition = modelViewMatrix * vec4(newPosition, 1.0);

// 改进的粒子大小：随生命周期变化，添加闪烁
float baseSize = size * (1.0 + 0.5 * sin(time * 0.02 + life * 5.0));
gl_PointSize = baseSize * lifeRemaining * (120.0 / -mvPosition.z);
gl_Position = projectionMatrix * mvPosition;
}
`;
    
    // 片段着色器：控制烟花粒子的最终外观（增强发光效果）
    const fragmentShader = `
uniform sampler2D pointTexture;
varying vec3 vColor;
varying float vOpacity;

void main() {
vec4 texColor = texture2D(pointTexture, gl_PointCoord);
// 增强发光效果：让中心更亮
float dist = length(gl_PointCoord - vec2(0.5));
float glow = 1.0 - smoothstep(0.0, 0.5, dist);
gl_FragColor = vec4(vColor * (1.0 + glow * 0.5), vOpacity);
gl_FragColor = gl_FragColor * texColor;
// 增强亮度
gl_FragColor.rgb *= 1.2;
}
`;
    
    // 创建着色器材质
    const shaderMaterial = new THREE.ShaderMaterial({
        uniforms: {
            ...uniforms,  // 展开全局统一变量（包含time）
            startTime: { type: "f", value: uniforms.time.value },  // 烟花开始时间
            startPosition: { type: "v3", value: new THREE.Vector3(x, y, z) },  // 起始位置
            pointTexture: {
                // 加载粒子纹理（星形光点）
                value: new THREE.TextureLoader().load(`https://assets.codepen.io/3685267/spark1.png`)
            }
        },
        vertexShader,
        fragmentShader,
        blending: THREE.AdditiveBlending,  // 加法混合（发光效果）
        depthTest: false,                  // 禁用深度测试
        transparent: true,                 // 启用透明度
        vertexColors: true                 // 使用顶点颜色
    });
    
    // 创建几何体
    const geometry = new THREE.BufferGeometry();
    const positions = [];  // 位置数组（初始位置都是起点）
    const colors = [];     // 颜色数组
    const lifes = [];       // 生命周期数组
    const speeds = [];     // 速度数组
    const directions = []; // 方向数组
    const sizes = [];      // 大小数组
    
    const color = new THREE.Color();
    
    // 生成烟花粒子数据（改进版）
    for (let layer = 0; layer < layerCount; layer++) {
        const layerDelay = layer * 0.1;  // 每层延迟0.1秒
        const layerParticleCount = Math.floor(particleCount / layerCount);
        
        for (let i = 0; i < layerParticleCount; i++) {
            // 所有粒子从同一起点开始
            positions.push(x, y, z);
            
            // 更智能的颜色选择：让颜色分布更均匀
            const colorIndex = Math.floor((i / layerParticleCount) * colorTheme.length);
            color.set(colorTheme[colorIndex % colorTheme.length]);
            // 添加一些随机变化，让颜色更丰富
            color.r += rand(0.2, -0.1);
            color.g += rand(0.2, -0.1);
            color.b += rand(0.2, -0.1);
            color.r = Math.min(1.0, Math.max(0.0, color.r));
            color.g = Math.min(1.0, Math.max(0.0, color.g));
            color.b = Math.min(1.0, Math.max(0.0, color.b));
            colors.push(color.r, color.g, color.b);
            
            // 改进的生命周期：让粒子持续时间更长
            lifes.push(rand(1.0, 0.7));
            
            // 改进的速度：更快的爆炸速度，让烟花更壮观
            speeds.push(rand(20, 8));
            
            // 改进的爆炸方向：可以创建不同形状
            let dirX, dirY, dirZ;
            const shapeType = Math.random();
            
            if (shapeType < 0.7) {
                // 70%概率：标准球面分布
                const theta = rand(TAU);
                const phi = rand(PI);
                dirX = sin(phi) * cos(theta);
                dirY = sin(phi) * sin(theta);
                dirZ = cos(phi);
            } else if (shapeType < 0.85) {
                // 15%概率：星形（更集中在某些方向）
                const theta = rand(TAU);
                const phi = rand(PI * 0.3) + PI * 0.35;  // 更集中在中间
                dirX = sin(phi) * cos(theta);
                dirY = sin(phi) * sin(theta);
                dirZ = cos(phi);
            } else {
                // 15%概率：环形（主要在水平方向）
                const theta = rand(TAU);
                const phi = PI / 2 + rand(PI * 0.2) - PI * 0.1;  // 主要在水平面
                dirX = sin(phi) * cos(theta);
                dirY = sin(phi) * sin(theta);
                dirZ = cos(phi);
            }
            directions.push(dirX, dirY, dirZ);
            
            // 随机粒子大小（2-6）
            sizes.push(rand(6, 2));
        }
    }
    
    // 设置几何体属性
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    geometry.setAttribute("life", new THREE.Float32BufferAttribute(lifes, 1));
    geometry.setAttribute("speed", new THREE.Float32BufferAttribute(speeds, 1));
    geometry.setAttribute("direction", new THREE.Float32BufferAttribute(directions, 3));
    geometry.setAttribute("size", new THREE.Float32BufferAttribute(sizes, 1));
    
    // 创建点云对象
    const firework = new THREE.Points(geometry, shaderMaterial);
    
    // 存储烟花信息
    firework.userData = {
        startTime: uniforms.time.value,
        geometry: geometry,
        material: shaderMaterial,
        type: 'explosion'
    };
    
    // 添加到场景和烟花数组
    scene.add(firework);
    fireworks.push(firework);
}

/**
 * 更新所有烟花动画
 * 更新烟花粒子的位置，并清理过期的烟花
 * @param {number} time - 当前时间戳
 */
function updateFireworks(time) {
    // 从后往前遍历，方便删除元素
    for (let i = fireworks.length - 1; i >= 0; i--) {
        const firework = fireworks[i];
        const elapsed = (time - firework.userData.startTime) * 0.001;
        
        // 根据类型处理不同的烟花
        if (firework.userData.type === 'rocket') {
            // 发射体：飞行时间 + 0.5秒缓冲后移除
            if (elapsed > firework.userData.flightTime + 0.5) {
                scene.remove(firework);
                firework.geometry.dispose();
                firework.material.dispose();
                fireworks.splice(i, 1);
            }
        } else if (firework.userData.type === 'explosion') {
            // 爆炸效果：3秒后移除
            if (elapsed > 3.0) {
                scene.remove(firework);
                firework.geometry.dispose();
                firework.material.dispose();
                fireworks.splice(i, 1);
            }
        }
    }
}

/**
 * 添加事件监听器
 * 处理键盘事件（用于调试相机位置）和窗口大小调整事件
 * @param {THREE.PerspectiveCamera} camera - 相机对象
 * @param {THREE.WebGLRenderer} renderer - 渲染器对象
 * @param {THREE.EffectComposer} composer - 效果合成器对象
 */
function addListners(camera, renderer, composer) {
    // 键盘事件监听：按下任意键时输出当前相机位置和旋转信息（用于调试）
    document.addEventListener("keydown", e => {
        const { x, y, z } = camera.position;
        // 输出相机位置，方便复制到代码中
        console.log(`camera.position.set(${x},${y},${z})`);
        const { x: a, y: b, z: c } = camera.rotation;
        // 输出相机旋转，方便复制到代码中
        console.log(`camera.rotation.set(${a},${b},${c})`);
    });

    // 窗口大小调整事件监听：当窗口大小改变时，更新相机和渲染器
    window.addEventListener(
        "resize",
        () => {
            const width = window.innerWidth;
            const height = window.innerHeight;

            // 更新相机宽高比
            camera.aspect = width / height;
            // 更新相机投影矩阵（必须调用）
            camera.updateProjectionMatrix();

            // 更新渲染器尺寸
            renderer.setSize(width, height);
            // 更新效果合成器尺寸
            composer.setSize(width, height);
        },
        false);
}

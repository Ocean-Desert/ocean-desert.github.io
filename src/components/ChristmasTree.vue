<template>
  <div class="christmas-tree-container">
    <div ref="containerRef"></div>
    <Loading :visible="loading" :message="loadingMessage" />
    <AudioPrompt :visible="showPrompt" @play="handlePlayAudio" />
    <ImagePreview :visible="showImagePreview" :image-src="previewImageSrc" :image-alt="previewImageAlt"
      :start-position="previewStartPosition" @close="handleClosePreview" />
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue'
import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { useWindowSize, useMediaQuery, useDeviceOrientation } from '@vueuse/core'
import Loading from '@/components/Loading.vue'
import AudioPrompt from '@/components/AudioPrompt.vue'
import ImagePreview from '@/components/ImagePreview.vue'
import { map, rand, randInt, randChoise, polar, TAU } from '@/utils/math.js'
import { getTreeRadiusAtHeightGlobal, treeBaseY, treeHeight, treeCenterX, treeCenterZ } from '@/utils/treeConfig.js'
import { getAssetUrl, getAssetUrls } from '@/utils/assets.js'

// 导入 Math 函数
const { PI, sin, cos } = Math

// 容器引用
const containerRef = ref(null)

// 状态管理
const loading = ref(true)
const loadingMessage = ref('正在加载资源，请稍等...')
const showPrompt = ref(false)
const showImagePreview = ref(false)
const previewImageSrc = ref('')
const previewImageAlt = ref('图片预览')
const previewStartPosition = ref({ x: 0, y: 0, width: 0, height: 0 }) // 预览动画起始位置

// 使用 VueUse 的响应式工具
const { width, height } = useWindowSize()
const isMobile = useMediaQuery('(max-width: 768px)')
const isSmallScreen = useMediaQuery('(max-width: 480px)')
const orientation = useDeviceOrientation()

// Three.js 核心对象
let scene = null
let sceneNoBloom = null
let camera = null
let renderer = null
let analyser = null
let controls = null  // 轨道控制器

// 动画相关
let step = 0
let animationId = null

// 着色器统一变量
const uniforms = {
  time: { type: "f", value: 0.0 },
  step: { type: "f", value: 0.0 }
}

// 泛光效果参数
const params = {
  exposure: 1,
  bloomStrength: 0.5,  // 降低泛光强度，让圣诞树更暗
  bloomThreshold: 0,
  bloomRadius: 0.5
}

// 后处理效果合成器
let composer = null
let composerNoBloom = null

// 配置常量
const fftSize = 2048
const totalPoints = 6000

// 音频相关
const listener = new THREE.AudioListener()
const audio = new THREE.Audio(listener)
let selectedMusicBuffer = null
let selectedMusicIndex = -1

// 烟花相关
const fireworks = []
const fireworkInterval = 3000

// 图片相关
let uploadedImages = []
let fallingImages = [] // 飘落的图片数组
let raycaster = null // 射线检测器，用于检测点击
let mouse = new THREE.Vector2() // 鼠标位置
const imageFallConfig = {
  spawnInterval: 1000, // 每1秒生成一张新图片
  fallSpeed: 0.03, // 飘落速度（减慢，方便点击）
  rotationSpeed: 0.008, // 旋转速度
  minSize: 3, // 最小尺寸
  maxSize: 5 // 最大尺寸
}
let lastSpawnTime = 0 // 上次生成图片的时间

// 图片纹理缓存与共用资源，减少生成卡顿
const textureCache = new Map()
const sharedTextureLoader = new THREE.TextureLoader()
const sharedImageGeometry = new THREE.PlaneGeometry(1, 1)
const sharedMatGeometry = new THREE.BoxGeometry(1, 1, 1)
const sharedFrameGeometry = new THREE.BoxGeometry(1, 1, 1)

// 相机动画相关（根据设备类型调整）
const getCameraAnimationConfig = () => {
  if (isMobile.value) {
    // 移动端：更大的旋转半径和视野角度，确保能看到整棵树
    return {
      rotationRadius: 40,      // 移动端增大旋转半径（拉远镜头）
      rotationSpeed: 0.0003,   // 旋转速度（弧度/毫秒）
      verticalAmplitude: 1.5,  // 移动端减小垂直摆动
      verticalSpeed: 0.0005,  // 垂直摆动速度
      initialAngle: Math.PI * 0.25 // 初始角度
    }
  } else {
    // 桌面端：也拉远镜头
    return {
      rotationRadius: 45,      // 相机围绕树的旋转半径（拉远镜头）
      rotationSpeed: 0.0003,   // 旋转速度（弧度/毫秒）
      verticalAmplitude: 2,    // 垂直摆动幅度
      verticalSpeed: 0.0005,  // 垂直摆动速度
      initialAngle: Math.PI * 0.25 // 初始角度
    }
  }
}
let cameraAnimationTime = 0 // 相机动画时间

// 定时器引用（用于清理）
let fireworkIntervals = []


/**
 * 处理音频播放
 */
function handlePlayAudio () {
  // TODO: 实现音频播放逻辑
  playAudio(() => {
    showPrompt.value = false
  })
}

/**
 * 播放音频
 */
function playAudio (onSuccess) {
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

        // 设置音频结束事件监听
        setupAudioEndListener();

        // 调用成功回调
        if (onSuccess) {
          onSuccess();
        }
      } catch (error) {
        console.error('播放音频时出错:', error);
      }
    }).catch((error) => {
      console.error('恢复音频上下文失败:', error);
    });
    return false; // 异步播放，返回false
  }

  // 尝试播放音频
  try {
    audio.play();
    console.log('音频播放命令已发送');

    // 设置音频结束事件监听
    setupAudioEndListener();

    // 调用成功回调
    if (onSuccess) {
      onSuccess();
    }

    return true;
  } catch (error) {
    console.error('播放音频时出错:', error);
    return false;
  }
}

/**
 * 设置音频结束监听
 */
function setupAudioEndListener () {
  // 移除旧的监听器（如果存在）
  if (audio.source && audio.source._endedHandler) {
    audio.source.removeEventListener('ended', audio.source._endedHandler);
  }

  // 等待source创建后添加监听器
  const checkSource = () => {
    if (audio.source) {
      // 创建结束事件处理函数
      const endedHandler = () => {
        console.log('音频播放完成，重新显示按钮');
        // 清除source引用，下次播放时会重新创建
        audio.source = null;
        // 重新显示按钮
        showPrompt.value = true;
      };

      // 保存引用以便后续移除
      audio.source._endedHandler = endedHandler;
      audio.source.addEventListener('ended', endedHandler);
    } else {
      // 如果source还未创建，延迟检查
      setTimeout(checkSource, 50);
    }
  };

  checkSource();
}

/**
 * 检查并启动音频播放
 */
function checkAndStartAudio () {
  const context = listener.context;

  if (!context) {
    console.warn('音频上下文不存在');
    showPrompt.value = true;
    return;
  }

  // 检查音频上下文状态
  if (context.state === 'suspended') {
    console.log('音频上下文被暂停，显示播放提示');
    showPrompt.value = true;
  } else {
    // 上下文已激活，尝试播放
    console.log('音频上下文已激活，尝试播放');
    playAudio(() => {
      // 播放成功后，隐藏提示
      showPrompt.value = false;
    });
  }
}

/**
 * 自动加载资源并开始体验
 */
async function autoLoadAssetsAndStart () {
  // 显示加载提示（使用 Vue 响应式状态）
  loading.value = true;
  loadingMessage.value = '正在加载资源，请稍等...';

  try {
    // 1. 加载音频文件
    const audioPath = getAssetUrl('@/assets/audio/music.mp3');
    const audioLoader = new THREE.AudioLoader();

    await new Promise((resolve, reject) => {
      audioLoader.load(
        audioPath,
        function (buffer) {
          selectedMusicBuffer = buffer;
          selectedMusicIndex = -1; // 标记为自定义音频
          console.log('音频加载成功:', audioPath);
          resolve();
        },
        undefined,
        function (error) {
          console.error('音频加载失败:', error);
          reject(error);
        }
      );
    });

    // 2. 加载图片文件
    const imagePaths = getAssetUrls([
      '@/assets/images/1.jpg',
      '@/assets/images/2.jpg',
      '@/assets/images/3.jpg',
      '@/assets/images/4.jpg',
      '@/assets/images/5.jpg',
      '@/assets/images/6.jpg',
      '@/assets/images/7.jpg',
      '@/assets/images/8.jpg',
      '@/assets/images/9.jpg',
    ]);

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
          reader.onload = function (e) {
            uploadedImages.push({
              src: e.target.result,
              name: imagePath.split('/').pop(),
              id: Date.now() + index
            });
            loadedImageCount++;
            console.log(`图片加载成功: ${imagePath} (${loadedImageCount}/${imagePaths.length})`);
            resolve();
          };
          reader.onerror = function (error) {
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

    // 2.5 预加载图片纹理，避免运行时卡顿
    await preloadImageTextures();

    // 3. 隐藏加载提示
    loading.value = false;

    // 4. 开始体验
    startExperience();

    // 5. 延迟检查音频状态（等待场景初始化完成）
    setTimeout(() => {
      checkAndStartAudio();
    }, 1000);

  } catch (error) {
    console.error('资源加载失败:', error);
    loadingMessage.value = '资源加载失败，请刷新页面重试';
  }
}

/**
 * 开始体验
 */
function startExperience () {
  if (!selectedMusicBuffer) {
    console.error('音频未加载，无法开始体验');
    return;
  }

  // 设置音频缓冲区
  audio.setBuffer(selectedMusicBuffer);
  // 创建音频分析器
  analyser = new THREE.AudioAnalyser(audio, fftSize);
  // 初始化3D场景
  init();
}

/**
 * 初始化3D场景
 */
function init () {
  // 创建主场景（包含需要泛光的对象）
  scene = new THREE.Scene();

  // 创建无泛光场景（只包含图片）
  sceneNoBloom = new THREE.Scene();

  // 为无泛光场景添加光源（用于相框的3D效果）
  // 环境光（整体照明）
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
  sceneNoBloom.add(ambientLight);

  // 方向光（模拟太阳光，产生阴影和高光）
  const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
  directionalLight.position.set(5, 10, 5);
  sceneNoBloom.add(directionalLight);

  // 补充光源（从另一侧，减少阴影）
  const fillLight = new THREE.DirectionalLight(0xffffff, 0.3);
  fillLight.position.set(-5, 5, -5);
  sceneNoBloom.add(fillLight);

  // 创建WebGL渲染器，移动端禁用抗锯齿以提升性能
  renderer = new THREE.WebGLRenderer({
    antialias: !isMobile.value,
    powerPreference: "high-performance"
  });
  // 设置像素比，移动端限制像素比以提升性能
  const pixelRatio = isMobile.value ? Math.min(window.devicePixelRatio, 2) : window.devicePixelRatio;
  renderer.setPixelRatio(pixelRatio);
  // 设置渲染器尺寸为窗口大小
  renderer.setSize(width.value, height.value);
  // 将渲染器的canvas元素添加到 Vue 组件的容器中
  if (containerRef.value) {
    containerRef.value.appendChild(renderer.domElement);
  }

  // 创建透视相机
  // 参数：视野角度、宽高比、近裁剪面、远裁剪面
  // 使用更大的视野角度，确保能看到整棵树
  const fov = isMobile.value ? 80 : 70  // 增大视野角度
  camera = new THREE.PerspectiveCamera(
    fov,
    width.value / height.value,
    1,
    1000);

  // 设置相机位置（预设的最佳视角）
  camera.position.set(-2.09397456774197047, -2.5597086635726947, 24.420789670889008);
  // 设置相机旋转角度
  camera.rotation.set(0.10443543723052419, -0.003827152981119352, 0.0004011488708739715);

  // 将音频监听器添加到相机（重要：这样才能听到3D空间音频）
  camera.add(listener);

  // 创建轨道控制器（支持鼠标和触摸控制）
  controls = new OrbitControls(camera, renderer.domElement);

  // 设置控制目标为圣诞树中心
  controls.target.set(treeCenterX, treeBaseY + treeHeight * 0.5, treeCenterZ);

  // 启用自动旋转
  controls.autoRotate = true;
  controls.autoRotateSpeed = 0.8; // 旋转速度

  // 设置旋转限制（防止相机翻转）
  controls.minPolarAngle = 0; // 最小垂直角度（0度，从上往下看）
  controls.maxPolarAngle = Math.PI; // 最大垂直角度（180度，从下往上看）

  // 设置距离限制（可选，保持相机距离）
  const config = getCameraAnimationConfig();
  controls.minDistance = config.rotationRadius * 0.7; // 最小距离
  controls.maxDistance = config.rotationRadius * 1.5; // 最大距离

  // 启用阻尼（让控制更平滑）
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;

  // 启用缩放
  controls.enableZoom = true;
  controls.zoomSpeed = 1.0;

  // 启用平移（可选，让用户可以平移视角）
  controls.enablePan = true;
  controls.panSpeed = 0.8;

  // 更新控制器（初始化）
  controls.update();

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

  // 根据设备类型调整粒子数量（移动端减少以提升性能）
  // 增加粒子数量，让地面星星更密集
  const planeParticleCount = isMobile.value ? 10000 : 12000;
  const treeParticleMultiplier = isMobile.value ? 5 : 6;

  // 添加地面粒子层
  addPlane(scene, uniforms, planeParticleCount);
  // 添加雪花效果
  addSnow(scene, uniforms);

  // 只创建一棵放大的圣诞树（在中心位置）
  // 移动端减少粒子数量以提升性能
  addTree(scene, uniforms, totalPoints * treeParticleMultiplier, [0, 0, -30]);

  // 创建主场景的渲染通道（包含需要泛光的对象）
  const renderScene = new RenderPass(scene, camera);

  // 创建无泛光场景的渲染通道（只包含图片）
  const renderSceneNoBloom = new RenderPass(sceneNoBloom, camera);
  renderSceneNoBloom.clear = false; // 不清空，叠加在主场景上
  renderSceneNoBloom.clearColor = false; // 不清空颜色
  renderSceneNoBloom.clearDepth = false; // 不清空深度

  // 创建泛光效果通道（只对主场景应用）
  // 参数：分辨率、强度、半径、阈值
  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    1.5,    // 强度
    0.4,    // 半径
    0.85);  // 阈值

  // 配置泛光参数
  bloomPass.threshold = params.bloomThreshold;
  bloomPass.strength = params.bloomStrength;
  bloomPass.radius = params.bloomRadius;

  // 创建主合成器：渲染主场景并应用泛光
  composer = new EffectComposer(renderer);
  composer.addPass(renderScene);
  composer.addPass(bloomPass);

  // 创建无泛光合成器：只渲染图片场景
  composerNoBloom = new EffectComposer(renderer);
  composerNoBloom.addPass(renderSceneNoBloom);

  // 添加事件监听器（窗口大小调整、键盘事件等）
  addListners(camera, renderer, composer);

  // 启动烟花效果定时器：在树两旁放烟花
  // 左侧烟花
  const leftInterval = setInterval(() => {
    createFirework(scene, uniforms, -25); // 左侧
  }, 3000);
  fireworkIntervals.push(leftInterval);

  // 右侧烟花
  setTimeout(() => {
    const rightInterval = setInterval(() => {
      createFirework(scene, uniforms, 25); // 右侧
    }, 3000);
    fireworkIntervals.push(rightInterval);
  }, 1500); // 错开时间，让左右交替

  // 如果已上传图片，初始化图片飘落系统
  if (uploadedImages.length > 0) {
    initImageFallingSystem();
  }

  // 初始化射线检测器（用于点击检测）
  raycaster = new THREE.Raycaster();

  // 添加点击事件监听（在渲染器的canvas上监听）
  if (renderer && renderer.domElement) {
    renderer.domElement.addEventListener('click', onImageClick);
  }


  // 注意：音频播放将在checkAndStartAudio()中处理
  // 这里不直接播放，因为浏览器可能阻止自动播放

  // 开始动画循环
  animate();
}

/**
 * 动画循环
 */
function animate (time) {
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

  // 更新图片飘落动画
  updateFallingImages(time);

  // 更新相机控制器（处理自动旋转和用户交互）
  updateCameraAnimation(time);

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
  animationId = requestAnimationFrame(animate)
}

/**
 * 添加圣诞树
 */
function addTree (scene, uniforms, totalPoints, treePosition) {
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
// 降低亮度：将RGB值乘以1.2，让圣诞树更暗
gl_FragColor.rgb = gl_FragColor.rgb * 1.2;
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

    // 设置HSL颜色：从红色(1.0)渐变到红色(0.0)，保持饱和度，降低亮度
    color.setHSL(map(i, 0, totalPoints, 1.0, 0.0), 1.0, 0.35);  // 亮度从0.5降低到0.35

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
 * 添加雪花
 */
function addSnow (scene, uniforms) {
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
  function createSnowSet (sprite) {
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
 */
function addPlane (scene, uniforms, totalPoints) {
  // 顶点着色器：简单的粒子位置和大小计算，添加闪烁效果
  const vertexShader = `
attribute float size;        // 粒子大小属性
attribute vec3 customColor; // 自定义颜色属性
attribute float phase;       // 闪烁相位（每个星星不同的闪烁时间）
uniform float time;          // 时间统一变量
varying vec3 vColor;         // 传递给片段着色器的颜色
varying float vOpacity;      // 传递给片段着色器的透明度（用于闪烁）

void main() {
  // 计算闪烁效果：使用正弦波，每个星星有不同的相位
  // phase是0-1000的随机值，转换为0-2π的相位
  float phaseOffset = phase * 0.00628; // 将0-1000映射到0-2π (6.28 ≈ 2π)
  // 闪烁周期约1.5秒，使用相位偏移让每个星星闪烁时间不同
  // time是毫秒数，所以乘以0.004意味着每250毫秒一个周期（约4Hz，更快更明显）
  float twinkle = sin(time * 0.004 + phaseOffset) * 0.5 + 0.5; // 0到1之间
  // 让闪烁更明显：最小值0.1，最大值1.0（增大对比度，让闪烁更明显）
  twinkle = twinkle * 0.9 + 0.1;
  
  vColor = customColor;                              // 传递自定义颜色
  vOpacity = twinkle;                                // 传递闪烁透明度
  vec4 mvPosition = modelViewMatrix * vec4( position, 1.0 ); // 转换到视图空间
  gl_PointSize = size * ( 300.0 / -mvPosition.z );   // 计算粒子大小（透视缩放）
  gl_Position = projectionMatrix * mvPosition;      // 计算最终屏幕位置
}
`;

  // 片段着色器：应用纹理和颜色，添加闪烁透明度
  const fragmentShader = `
uniform vec3 color;          // 颜色统一变量（未使用）
uniform sampler2D pointTexture; // 粒子纹理
varying vec3 vColor;          // 从顶点着色器传递的颜色
varying float vOpacity;       // 从顶点着色器传递的透明度（用于闪烁）

void main() {
  // 应用纹理
  vec4 textureColor = texture2D( pointTexture, gl_PointCoord );
  // 设置片段颜色，应用闪烁效果
  // 闪烁效果：同时影响颜色亮度和透明度（在AdditiveBlending模式下，亮度变化更明显）
  gl_FragColor = vec4( vColor * vOpacity, vOpacity ) * textureColor;
}
`;

  // 创建着色器材质
  const shaderMaterial = new THREE.ShaderMaterial({
    uniforms: {
      ...uniforms,  // 展开全局统一变量（包含time）
      pointTexture: {
        // 加载粒子纹理（星形光点）
        value: new THREE.TextureLoader().load(`https://assets.codepen.io/3685267/spark1.png`)
      }
    },
    vertexShader,     // 顶点着色器
    fragmentShader,  // 片段着色器
    blending: THREE.AdditiveBlending,  // 加法混合（发光效果）
    depthTest: false,                  // 禁用深度测试
    transparent: true,                 // 启用透明度（支持闪烁）
    vertexColors: true,                // 使用顶点颜色
    depthWrite: false                  // 禁用深度写入，确保透明度正确显示
  });

  // 创建几何体
  const geometry = new THREE.BufferGeometry();
  const positions = [];  // 位置数组
  const colors = [];     // 颜色数组
  const sizes = [];      // 大小数组
  const phases = [];     // 闪烁相位数组（每个星星不同的闪烁时间）

  const color = new THREE.Color();

  // 生成地面粒子数据
  // 扩大覆盖范围，让星星铺满整个可见地面
  // x范围扩大到-80到80（宽度160），z范围扩大到-200到50（深度250）
  const xRange = 80
  const zRangeMin = -200
  const zRangeMax = 50

  for (let i = 0; i < totalPoints; i++) {
    // 随机位置：扩大范围，确保铺满整个可见地面
    const [x, y, z] = [rand(-xRange, xRange), 0, rand(zRangeMin, zRangeMax)];
    positions.push(x);
    positions.push(y);
    positions.push(z);

    // 随机选择地面颜色（蓝绿色调）
    color.set(randChoise(["#93abd3", "#f2f4c0", "#9ddfd3"]));

    colors.push(color.r, color.g, color.b);
    sizes.push(1);  // 固定大小
    phases.push(rand(1000));  // 随机相位，让每个星星闪烁时间不同
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
  geometry.setAttribute("phase", new THREE.Float32BufferAttribute(phases, 1));  // 闪烁相位

  // 创建点云对象
  const plane = new THREE.Points(geometry, shaderMaterial);

  // 设置地面位置（y = -8）
  plane.position.y = -8;
  // 添加到场景
  scene.add(plane);
}

/**
 * 创建烟花
 */
function createFirework (scene, uniforms, sideX = 0) {
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
 * 创建发射体
 */
function createRocket (scene, uniforms, startX, startY, startZ, targetX, targetY, targetZ, flightTime, colorTheme) {
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
 */
function createExplosion (scene, uniforms, x, y, z, colorTheme) {
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
 * 更新烟花动画
 */
function updateFireworks (time) {
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
 * 初始化图片飘落系统
 */
function initImageFallingSystem () {
  if (!sceneNoBloom || uploadedImages.length === 0) return;

  // 清理旧的图片
  fallingImages.forEach(imageObj => {
    sceneNoBloom.remove(imageObj.mesh);
    // 清理组合对象中的所有子对象
    imageObj.mesh.traverse((child) => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        if (child.material.map) child.material.map.dispose();
        child.material.dispose();
      }
    });
  });
  fallingImages = [];

  lastSpawnTime = performance.now();
}

/**
 * 预加载所有图片纹理，避免生成时解码卡顿
 */
async function preloadImageTextures () {
  if (!uploadedImages || uploadedImages.length === 0) return;

  const tasks = uploadedImages.map((image) => {
    return new Promise((resolve) => {
      if (textureCache.has(image.src)) {
        resolve();
        return;
      }

      sharedTextureLoader.load(
        image.src,
        (tex) => {
          tex.minFilter = THREE.LinearFilter;
          tex.magFilter = THREE.LinearFilter;
          tex.needsUpdate = true;
          textureCache.set(image.src, tex);
          resolve();
        },
        undefined,
        () => resolve() // 失败也不阻塞
      );
    });
  });

  await Promise.all(tasks);
}

/**
 * 创建一张飘落的图片
 */
function createFallingImage () {
  if (!sceneNoBloom || uploadedImages.length === 0) return null;

  // 随机选择一张图片
  const image = randChoise(uploadedImages);

  // 随机尺寸（较小）
  const baseSize = rand(imageFallConfig.minSize, imageFallConfig.maxSize);

  // 创建组合对象（包含相框和图片）
  const imageGroup = new THREE.Group();

  // 相框配置
  const frameConfig = {
    borderWidth: 0.15,  // 相框边框宽度（相对于图片尺寸的比例）
    borderColor: 0x8b7355,  // 相框颜色（深棕色，更真实）
    matColor: 0xf5f5dc,  // 相框内衬颜色（米白色，像相框的mat）
    frameThickness: 0.08  // 相框厚度（3D立体效果）
  };

  // 创建图片材质（先不设置纹理，等加载完成后再设置）
  const imageMaterial = new THREE.MeshBasicMaterial({
    transparent: true,
    side: THREE.DoubleSide,
    toneMapped: false,
    depthWrite: false
  });

  // 创建图片网格
  const imageMesh = new THREE.Mesh(sharedImageGeometry, imageMaterial);
  const frameThickness = frameConfig.frameThickness; // 相框厚度
  imageMesh.position.z = frameThickness / 2 + 0.01; // 在相框前面

  // 相框内衬（mat，在图片和边框之间，使用薄盒子）
  const matSize = 1 + frameConfig.borderWidth * 0.3;
  const matThickness = 0.01;
  const matGeometry = sharedMatGeometry;
  const matMaterial = new THREE.MeshStandardMaterial({
    color: frameConfig.matColor,
    metalness: 0.1,
    roughness: 0.9
  });
  const matMesh = new THREE.Mesh(matGeometry, matMaterial);
  matMesh.position.z = frameThickness / 2 - matThickness / 2; // 在边框前面，图片后面

  // 相框边框（使用BoxGeometry创建有厚度的3D边框）
  const frameSize = 1 + frameConfig.borderWidth * 2;

  // 创建相框边框（使用BoxGeometry，有厚度）
  const frameGeometry = sharedFrameGeometry;
  const frameMaterial = new THREE.MeshStandardMaterial({
    color: frameConfig.borderColor,
    metalness: 0.3,  // 金属感
    roughness: 0.7   // 粗糙度
  });
  const frameMesh = new THREE.Mesh(frameGeometry, frameMaterial);
  frameMesh.position.z = 0; // 居中放置

  // 将相框、内衬和图片添加到组合对象
  imageGroup.add(frameMesh);
  imageGroup.add(matMesh);
  imageGroup.add(imageMesh);

  // 使用组合对象作为主网格
  const mesh = imageGroup;

  // 初始位置：在屏幕上方随机X位置
  const startX = rand(-15, 15);
  const startY = 20; // 在屏幕上方
  const startZ = rand(-10, 10);
  mesh.position.set(startX, startY, startZ);

  // 随机初始旋转
  mesh.rotation.set(
    rand(TAU),
    rand(TAU),
    rand(TAU)
  );

  // 添加到场景
  sceneNoBloom.add(mesh);

  // 创建图片对象（添加动画曲线相关属性）
  const imageObj = {
    mesh: mesh,  // 组合对象
    imageMesh: imageMesh,  // 图片网格（用于后续操作）
    image: image,
    velocity: {
      x: rand(-0.15, 0.15), // 水平飘动（增大范围，更自然）
      y: -imageFallConfig.fallSpeed, // 初始下落速度
      z: rand(-0.15, 0.15) // 前后飘动（增大范围，更自然）
    },
    // 添加重力加速度和空气阻力
    gravity: 0.00005, // 重力加速度（减小，让下落更慢）
    airResistance: 0.999, // 空气阻力系数（增大，让水平飘动减弱更慢）
    // 添加摆动效果（正弦波）
    swingAmplitude: {
      x: rand(0.05, 0.15), // X轴摆动幅度
      z: rand(0.05, 0.15)  // Z轴摆动幅度
    },
    swingFrequency: rand(0.5, 1.5), // 摆动频率
    swingPhase: rand(0, TAU), // 摆动相位
    // 旋转相关
    rotationSpeed: {
      x: rand(-imageFallConfig.rotationSpeed, imageFallConfig.rotationSpeed),
      y: rand(-imageFallConfig.rotationSpeed, imageFallConfig.rotationSpeed),
      z: rand(-imageFallConfig.rotationSpeed, imageFallConfig.rotationSpeed)
    },
    rotationAcceleration: {
      x: rand(-0.00001, 0.00001), // 旋转加速度，让旋转更自然
      y: rand(-0.00001, 0.00001),
      z: rand(-0.00001, 0.00001)
    },
    // 时间相关
    startTime: performance.now(), // 创建时间，用于计算动画
    baseSize: baseSize, // 保存基础尺寸
    aspectRatio: 1 // 宽高比，稍后更新
  };

  const applyTextureSize = (tex) => {
    if (!tex || !tex.image || !tex.image.width || !tex.image.height) return;

    const aspectRatio = tex.image.width / tex.image.height;
    imageObj.aspectRatio = aspectRatio;

    const width = baseSize;
    const height = baseSize / aspectRatio;

    // 设置图片尺寸
    imageMesh.scale.set(width, height, 1);

    // 设置相框内衬尺寸（比图片稍大）
    const matWidth = width * (1 + frameConfig.borderWidth * 0.3);
    const matHeight = height * (1 + frameConfig.borderWidth * 0.3);
    matMesh.scale.set(matWidth, matHeight, matThickness); // 保持内衬厚度

    // 设置相框尺寸（最大，作为边框）
    const frameWidth = width * (1 + frameConfig.borderWidth * 2);
    const frameHeight = height * (1 + frameConfig.borderWidth * 2);
    frameMesh.scale.set(frameWidth, frameHeight, frameConfig.frameThickness); // 使用相框厚度

    // 保存原始尺寸（用于点击后恢复）
    imageObj.originalScale = new THREE.Vector3(width, height, 1);
  };

  // 复用缓存纹理，避免重复解码导致卡顿
  let texture = textureCache.get(image.src);

  if (texture) {
    applyTextureSize(texture);
  } else {
    texture = sharedTextureLoader.load(
      image.src,
      (loaded) => {
        loaded.minFilter = THREE.LinearFilter;
        loaded.magFilter = THREE.LinearFilter;
        loaded.needsUpdate = true;
        textureCache.set(image.src, loaded);
        applyTextureSize(loaded);
        imageMaterial.needsUpdate = true;
      },
      undefined,
      (error) => console.error(`图片加载失败: ${image.name}`, error)
    );
  }

  // 设置纹理到图片材质
  imageMaterial.map = texture;
  imageMaterial.needsUpdate = true;

  fallingImages.push(imageObj);

  return imageObj;
}

/**
 * 更新飘落的图片
 */
function updateFallingImages (time) {
  if (!sceneNoBloom || uploadedImages.length === 0) return;

  const now = time || performance.now();

  // 定期生成新图片
  if (now - lastSpawnTime >= imageFallConfig.spawnInterval) {
    createFallingImage();
    lastSpawnTime = now;
  }

  // 更新每张图片的位置和旋转（使用优化的动画曲线）
  for (let i = fallingImages.length - 1; i >= 0; i--) {
    const imageObj = fallingImages[i];
    const mesh = imageObj.mesh;

    // 如果图片的移动速度不为0，说明正在飘落，需要更新位置
    if (imageObj.velocity.y !== 0 || imageObj.velocity.x !== 0 || imageObj.velocity.z !== 0) {
      // 计算经过的时间（用于摆动效果）
      const elapsed = (now - imageObj.startTime) / 1000; // 转换为秒

      // 应用重力加速度（让下落逐渐加快）
      imageObj.velocity.y -= imageObj.gravity;

      // 应用空气阻力（让水平飘动逐渐减弱）
      imageObj.velocity.x *= imageObj.airResistance;
      imageObj.velocity.z *= imageObj.airResistance;

      // 添加摆动效果（正弦波，让飘落更自然）
      const swingX = sin(elapsed * imageObj.swingFrequency + imageObj.swingPhase) * imageObj.swingAmplitude.x;
      const swingZ = cos(elapsed * imageObj.swingFrequency + imageObj.swingPhase) * imageObj.swingAmplitude.z;

      // 更新位置（基础速度 + 摆动效果）
      mesh.position.x += imageObj.velocity.x + swingX;
      mesh.position.y += imageObj.velocity.y;
      mesh.position.z += imageObj.velocity.z + swingZ;

      // 更新旋转速度（添加旋转加速度，让旋转更自然）
      imageObj.rotationSpeed.x += imageObj.rotationAcceleration.x;
      imageObj.rotationSpeed.y += imageObj.rotationAcceleration.y;
      imageObj.rotationSpeed.z += imageObj.rotationAcceleration.z;

      // 限制旋转速度，避免过快
      const maxRotationSpeed = imageFallConfig.rotationSpeed * 2;
      imageObj.rotationSpeed.x = Math.max(-maxRotationSpeed, Math.min(maxRotationSpeed, imageObj.rotationSpeed.x));
      imageObj.rotationSpeed.y = Math.max(-maxRotationSpeed, Math.min(maxRotationSpeed, imageObj.rotationSpeed.y));
      imageObj.rotationSpeed.z = Math.max(-maxRotationSpeed, Math.min(maxRotationSpeed, imageObj.rotationSpeed.z));

      // 更新旋转
      mesh.rotation.x += imageObj.rotationSpeed.x;
      mesh.rotation.y += imageObj.rotationSpeed.y;
      mesh.rotation.z += imageObj.rotationSpeed.z;

      // 如果图片飘出屏幕底部，移除它
      if (mesh.position.y < -20) {
        sceneNoBloom.remove(mesh);
        // 清理组合对象中的所有子对象
        mesh.traverse((child) => {
          if (child.geometry) child.geometry.dispose();
          if (child.material) {
            if (child.material.map) child.material.map.dispose();
            child.material.dispose();
          }
        });
        fallingImages.splice(i, 1);
      }
    }
  }
}

/**
 * 更新相机控制器（OrbitControls会自动处理旋转和用户交互）
 */
function updateCameraAnimation (time) {
  if (!controls) return

  // 更新控制器（必须每帧调用，用于阻尼和自动旋转）
  controls.update();

  // 可选：添加轻微的垂直摆动（如果用户没有在交互）
  if (!controls.enabled || !controls.isUserInteracting) {
    // 如果用户没有在交互，可以添加轻微的垂直摆动
    // 但为了更好的用户体验，我们让OrbitControls完全控制
  }
}

/**
 * 处理图片点击事件
 */
function onImageClick (event) {
  if (!raycaster || !camera || !sceneNoBloom || !renderer) return;

  // 获取鼠标在屏幕上的归一化坐标
  const rect = renderer.domElement.getBoundingClientRect();
  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

  // 更新射线
  raycaster.setFromCamera(mouse, camera);

  // 检测与图片的交集（检测组合对象中的所有子对象）
  const objectsToTest = []
  fallingImages.forEach(obj => {
    obj.mesh.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        objectsToTest.push(child)
      }
    })
  })
  const intersects = raycaster.intersectObjects(objectsToTest, false)

  if (intersects.length > 0) {
    const clickedMesh = intersects[0].object;

    // 找到对应的图片对象（通过检查点击的网格是否属于某个图片组合对象）
    const imageObj = fallingImages.find(obj => {
      let found = false
      obj.mesh.traverse((child) => {
        if (child === clickedMesh) {
          found = true
        }
      })
      return found
    })

    if (imageObj) {
      // 获取图片在屏幕上的位置（用于动画起始位置）
      const mesh = imageObj.mesh
      const vector = new THREE.Vector3()
      mesh.getWorldPosition(vector)
      vector.project(camera)

      const rect = renderer.domElement.getBoundingClientRect()
      const x = (vector.x * 0.5 + 0.5) * rect.width + rect.left
      const y = (vector.y * -0.5 + 0.5) * rect.height + rect.top

      // 计算图片在屏幕上的尺寸（近似值）
      const distance = camera.position.distanceTo(mesh.position)
      const fov = camera.fov * (Math.PI / 180)
      const imageHeight = (mesh.scale.y * 2) / Math.tan(fov / 2) / distance
      const imageWidth = (mesh.scale.x * 2) / Math.tan(fov / 2) / distance
      const screenHeight = imageHeight * rect.height
      const screenWidth = imageWidth * rect.width

      // 设置预览动画起始位置
      previewStartPosition.value = {
        x: x,
        y: y,
        width: Math.max(screenWidth, 50), // 最小宽度50px
        height: Math.max(screenHeight, 50) // 最小高度50px
      }

      // 显示图片预览
      previewImageSrc.value = imageObj.image.src
      previewImageAlt.value = imageObj.image.name || '图片预览'
      showImagePreview.value = true

      // 暂停图片的飘落和旋转（但不移除，保持可见）
      imageObj.velocity.y = 0
      imageObj.velocity.x = 0
      imageObj.velocity.z = 0
      imageObj.rotationSpeed.x = 0
      imageObj.rotationSpeed.y = 0
      imageObj.rotationSpeed.z = 0
    }
  }
}

/**
 * 关闭图片预览
 */
function handleClosePreview () {
  showImagePreview.value = false

  // 恢复所有图片的飘落（如果之前被暂停了）
  fallingImages.forEach(imageObj => {
    if (imageObj.velocity.y === 0 && imageObj.velocity.x === 0 && imageObj.velocity.z === 0) {
      // 恢复基础速度
      imageObj.velocity.y = -imageFallConfig.fallSpeed
      imageObj.velocity.x = rand(-0.15, 0.15)
      imageObj.velocity.z = rand(-0.15, 0.15)
      // 恢复旋转速度
      imageObj.rotationSpeed.x = rand(-imageFallConfig.rotationSpeed, imageFallConfig.rotationSpeed)
      imageObj.rotationSpeed.y = rand(-imageFallConfig.rotationSpeed, imageFallConfig.rotationSpeed)
      imageObj.rotationSpeed.z = rand(-imageFallConfig.rotationSpeed, imageFallConfig.rotationSpeed)
      // 重置时间，确保摆动效果正常
      imageObj.startTime = performance.now()
    }
  })
}

// 保存事件监听器引用以便清理
let keydownHandler = null

/**
 * 更新渲染器尺寸（使用 VueUse 的响应式尺寸）
 */
function updateRendererSize () {
  if (!camera || !renderer || !composer) return;

  // 更新相机宽高比
  camera.aspect = width.value / height.value;
  // 使用更大的视野角度，确保能看到整棵树
  if (isMobile.value) {
    camera.fov = 80  // 移动端更大的视野角度
  } else {
    camera.fov = 70  // PC端也增大视野角度
  }
  // 更新相机投影矩阵（必须调用）
  camera.updateProjectionMatrix();

  // 更新控制器（如果存在）
  if (controls) {
    controls.update();
  }

  // 更新渲染器尺寸
  renderer.setSize(width.value, height.value);
  // 更新效果合成器尺寸
  composer.setSize(width.value, height.value);
  if (composerNoBloom) {
    composerNoBloom.setSize(width.value, height.value);
  }

  // 移动端横竖屏切换时，可能需要调整像素比
  if (isMobile.value) {
    const newPixelRatio = Math.min(window.devicePixelRatio, 2);
    renderer.setPixelRatio(newPixelRatio);
  }
}


/**
 * 添加事件监听器
 */
function addListners (camera, renderer, composer) {
  // 键盘事件监听：按下任意键时输出当前相机位置和旋转信息（用于调试）
  keydownHandler = (e) => {
    const { x, y, z } = camera.position;
    // 输出相机位置，方便复制到代码中
    console.log(`camera.position.set(${x},${y},${z})`);
    const { x: a, y: b, z: c } = camera.rotation;
    // 输出相机旋转，方便复制到代码中
    console.log(`camera.rotation.set(${a},${b},${c})`);
  };
  document.addEventListener("keydown", keydownHandler);

  // 使用 VueUse 的 watch 监听窗口大小变化（自动处理）
  // 窗口大小变化会通过 watch 自动调用 updateRendererSize
}

// 监听窗口大小变化（使用 VueUse 的响应式尺寸）
watch([width, height], () => {
  updateRendererSize()
}, { immediate: false })

// 监听设备方向变化（当方向改变时更新渲染器）
watch(() => orientation.alpha, () => {
  if (orientation.isSupported.value) {
    updateRendererSize()
  }
})

// 组件挂载时初始化
onMounted(async () => {
  // 自动加载资源并开始
  await autoLoadAssetsAndStart()
})

// 组件卸载时清理
onUnmounted(() => {
  // 取消动画
  if (animationId) {
    cancelAnimationFrame(animationId)
  }

  // 清理定时器
  fireworkIntervals.forEach(interval => clearInterval(interval))
  fireworkIntervals = []

  // 清理事件监听器
  if (keydownHandler) {
    document.removeEventListener("keydown", keydownHandler)
  }

  // 清理图片点击事件监听器
  if (renderer && renderer.domElement) {
    renderer.domElement.removeEventListener('click', onImageClick)
  }

  // 清理轨道控制器
  if (controls) {
    controls.dispose();
    controls = null;
  }

  // 清理所有飘落的图片
  fallingImages.forEach(imageObj => {
    if (sceneNoBloom) {
      sceneNoBloom.remove(imageObj.mesh)
    }
    // 清理组合对象中的所有子对象
    imageObj.mesh.traverse((child) => {
      if (child.geometry) child.geometry.dispose()
      if (child.material) {
        if (child.material.map) child.material.map.dispose()
        child.material.dispose()
      }
    })
  })
  fallingImages = []

  // 清理 Three.js 资源
  if (renderer) {
    renderer.dispose()
  }


  // 清理场景
  if (scene) {
    scene.traverse((object) => {
      if (object.geometry) object.geometry.dispose()
      if (object.material) {
        if (Array.isArray(object.material)) {
          object.material.forEach(m => m.dispose())
        } else {
          object.material.dispose()
        }
      }
    })
  }

  if (sceneNoBloom) {
    sceneNoBloom.traverse((object) => {
      if (object.geometry) object.geometry.dispose()
      if (object.material) {
        if (Array.isArray(object.material)) {
          object.material.forEach(m => m.dispose())
        } else {
          object.material.dispose()
        }
      }
    })
  }
})
</script>

<style scoped>
.christmas-tree-container {
  width: 100%;
  height: 100%;
  position: relative;
  overflow: hidden;
  touch-action: none;
}

/* 确保 canvas 全屏显示 */
.christmas-tree-container canvas {
  display: block;
  width: 100%;
  height: 100%;
  touch-action: none;
}
</style>
